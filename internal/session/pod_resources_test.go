package session

import (
	"strings"
	"testing"
	"time"

	"github.com/nixieboluo/sealos-storage-manager/internal/domain"
	"github.com/nixieboluo/sealos-storage-manager/internal/kube"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
	"github.com/nixieboluo/sealos-storage-manager/internal/state"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func TestBuildReadOnlyPod(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	service := NewPodService(
		cfg,
		state.New(cfg.Cache),
		kube.New(fake.NewSimpleClientset()),
		observability.MustNew(cfg.Observability, nil),
	)
	pod := service.buildPod(&domain.PodSession{
		ID:             "ps_1",
		Namespace:      "default",
		PVCName:        "data",
		PVCUID:         "uid",
		RuntimeVersion: service.runtimeVersion,
		Mode:           domain.ModeReadOnly,
	}, nil)
	if !pod.Spec.Volumes[0].PersistentVolumeClaim.ReadOnly {
		t.Fatal("read-only mode did not set volume readonly")
	}
	if !pod.Spec.Containers[0].VolumeMounts[0].ReadOnly {
		t.Fatal("read-only mode did not set mount readonly")
	}
}

func TestSyncPodStatusReportsCrashLoop(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "default",
			Name:      "viewer-ps-crash",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name: "filebrowser",
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"},
					},
				},
			},
		},
	}
	service := NewPodService(
		cfg,
		store,
		kube.New(fake.NewSimpleClientset(pod)),
		observability.MustNew(cfg.Observability, nil),
	)

	updated, err := service.SyncPodStatus(t.Context(), &domain.PodSession{
		ID:        "ps_crash",
		Namespace: "default",
		PodName:   "viewer-ps-crash",
		ExpiresAt: fixedNow().Add(time.Minute),
	})
	if err != nil {
		t.Fatalf("SyncPodStatus() error = %v", err)
	}
	if updated.Status != domain.PodStatusFailed || updated.Reason != "CrashLoopBackOff" {
		t.Fatalf("updated = %#v", updated)
	}
	if _, ok := store.GetPodSession("ps_crash", fixedNow()); ok {
		t.Fatal("SyncPodStatus wrote Kubernetes-derived pod state back to store")
	}
}

func TestClosePodSessionTreatsMissingPodAsClosed(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	service := NewPodService(
		cfg,
		store,
		kube.New(fake.NewSimpleClientset()),
		observability.MustNew(cfg.Observability, nil),
	)
	service.now = fixedNow
	store.PutPodSession(&domain.PodSession{
		ID:          "ps_missing",
		Namespace:   "default",
		PodName:     "viewer-ps-missing",
		ServiceName: "viewer-ps-missing",
		ExpiresAt:   fixedNow().Add(time.Minute),
	})

	closed, err := service.ClosePodSession(t.Context(), "ps_missing")
	if err != nil {
		t.Fatalf("ClosePodSession() error = %v", err)
	}
	if closed.Status != domain.PodStatusTerminated {
		t.Fatalf("closed session = %#v", closed)
	}
	if _, ok := store.GetPodSessionIncludingExpired("ps_missing"); ok {
		t.Fatal("closed pod session remained in state")
	}
}

func TestHookConfigMapUsesConfiguredScript(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Viewer.HookScript = "#!/bin/sh\necho configured-hook\n"
	service := NewPodService(
		cfg,
		state.New(cfg.Cache),
		kube.New(fake.NewSimpleClientset()),
		observability.MustNew(cfg.Observability, nil),
	)
	configMap := service.buildHookConfigMap(&domain.PodSession{
		ID:             "ps_1",
		Namespace:      "default",
		PodName:        "viewer-ps-1",
		PVCName:        "data",
		PVCUID:         "uid",
		RuntimeVersion: service.runtimeVersion,
	}, metav1.OwnerReference{
		APIVersion: "v1",
		Kind:       "Pod",
		Name:       "viewer-ps-1",
		UID:        types.UID("pod-uid"),
	})

	if got := configMap.Data["filebrowser-auth-hook.sh"]; got != cfg.Viewer.HookScript {
		t.Fatalf("hook script = %q", got)
	}
}

func TestDNSLabelSanitizesGeneratedSessionID(t *testing.T) {
	t.Parallel()

	if got := resourceName("viewer-ps_ABC123"); got != "viewer-ps-abc123" {
		t.Fatalf("resourceName() = %q", got)
	}
	service := NewPodService(
		testConfig(),
		state.New(testConfig().Cache),
		kube.New(fake.NewSimpleClientset()),
		observability.MustNew(testConfig().Observability, nil),
	)
	host, err := service.viewerHost("ps_ABC123")
	if err != nil {
		t.Fatalf("viewerHost() error = %v", err)
	}
	if strings.Contains(host, "_") {
		t.Fatalf("viewerHost() contains underscore: %q", host)
	}
}

func TestPodOwnerReferenceIncludesPodIdentity(t *testing.T) {
	t.Parallel()

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "viewer-ps-1",
			UID:  types.UID("pod-uid"),
		},
	}

	owner := podOwnerReference(pod)
	if owner.APIVersion != "v1" || owner.Kind != "Pod" || owner.Name != pod.Name || owner.UID != pod.UID {
		t.Fatalf("owner reference = %#v", owner)
	}
}

func TestRuntimeVersionChangesWhenViewerPodConfigChanges(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	same := testConfig()
	changed := testConfig()
	changed.Viewer.BackendVerifyURL = "http://backend-v2/internal/filebrowser-hook/verify"

	if runtimeVersion(cfg) != runtimeVersion(same) {
		t.Fatal("same config produced different runtime versions")
	}
	if runtimeVersion(cfg) == runtimeVersion(changed) {
		t.Fatal("viewer pod config change did not change runtime version")
	}
}

func assertOwnedByPod(t *testing.T, refs []metav1.OwnerReference, pod *corev1.Pod) {
	t.Helper()

	if len(refs) != 1 {
		t.Fatalf("owner references = %#v", refs)
	}
	owner := refs[0]
	if owner.APIVersion != "v1" || owner.Kind != "Pod" || owner.Name != pod.Name || owner.UID != pod.UID {
		t.Fatalf("owner reference = %#v, pod = %#v", owner, pod.ObjectMeta)
	}
}

func assertRuntimeVersionLabel(t *testing.T, labels map[string]string, want string) {
	t.Helper()

	if labels[labelRuntimeVersion] != want {
		t.Fatalf("runtime version label = %q, want %q", labels[labelRuntimeVersion], want)
	}
}

func assertLifecycleAnnotations(t *testing.T, annotations map[string]string, session *domain.PodSession) {
	t.Helper()

	want := lifecycleAnnotations(session)
	for key, value := range want {
		if annotations[key] != value {
			t.Fatalf("annotation %s = %q, want %q", key, annotations[key], value)
		}
	}
}

func assertIngressPaths(t *testing.T, ingress *networkingv1.Ingress, want []string) {
	t.Helper()

	if len(ingress.Spec.Rules) != 1 || ingress.Spec.Rules[0].HTTP == nil {
		t.Fatalf("ingress rules = %#v", ingress.Spec.Rules)
	}
	gotPaths := ingress.Spec.Rules[0].HTTP.Paths
	if len(gotPaths) != len(want) {
		t.Fatalf("ingress path count = %d, want %d: %#v", len(gotPaths), len(want), gotPaths)
	}
	for index, path := range want {
		got := gotPaths[index]
		if got.Path != path {
			t.Fatalf("ingress path[%d] = %q, want %q", index, got.Path, path)
		}
		if got.Path == "/" {
			t.Fatal("ingress must not expose File Browser frontend root")
		}
		if got.PathType == nil || *got.PathType != networkingv1.PathTypePrefix {
			t.Fatalf("ingress path type[%d] = %#v", index, got.PathType)
		}
		if got.Backend.Service == nil ||
			got.Backend.Service.Name == "" ||
			got.Backend.Service.Port.Number == 0 {
			t.Fatalf("ingress backend[%d] = %#v", index, got.Backend)
		}
	}
}
