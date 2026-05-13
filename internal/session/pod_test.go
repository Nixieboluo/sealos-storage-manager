package session

import (
	"context"
	"testing"
	"time"

	"github.com/nixieboluo/sealos-stroage-manager/internal/config"
	"github.com/nixieboluo/sealos-stroage-manager/internal/domain"
	"github.com/nixieboluo/sealos-stroage-manager/internal/kube"
	"github.com/nixieboluo/sealos-stroage-manager/internal/observability"
	"github.com/nixieboluo/sealos-stroage-manager/internal/state"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestEnsurePodSessionCreatesResources(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	client := kube.New(fake.NewSimpleClientset())
	service := NewPodService(cfg, store, client, observability.New(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(context.Background(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteOnce,
		Mode:       domain.ModeReadWrite,
		MountInfo:  &domain.PVCMountInfo{Mounted: true, Nodes: []string{"node-a"}},
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "" || podSession.Status != domain.PodStatusCreating {
		t.Fatalf("pod session = %#v", podSession)
	}

	pod, err := client.GetPod(context.Background(), "default", podSession.PodName)
	if err != nil {
		t.Fatalf("GetPod() error = %v", err)
	}
	if pod.Spec.Affinity == nil {
		t.Fatal("expected node affinity for RWO mounted PVC")
	}
	if pod.Spec.Containers[0].Image != cfg.Viewer.FileBrowser.Image {
		t.Fatalf("image = %q", pod.Spec.Containers[0].Image)
	}
	if pod.Spec.Volumes[0].PersistentVolumeClaim.ReadOnly {
		t.Fatal("readwrite mode mounted readonly")
	}
}

func TestEnsurePodSessionReusesExistingViewerPod(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	existing := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:         "default",
			Name:              "viewer-ps_existing",
			CreationTimestamp: metav1.NewTime(fixedNow()),
			Labels: map[string]string{
				labelComponent:    componentViewer,
				labelPVCUID:       "uid",
				labelPodSessionID: "ps_existing",
			},
		},
		Spec: corev1.PodSpec{NodeName: "node-a"},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			Conditions: []corev1.PodCondition{
				{Type: corev1.PodReady, Status: corev1.ConditionTrue},
			},
		},
	}
	store := state.New(cfg.Cache)
	client := kube.New(fake.NewSimpleClientset(existing))
	service := NewPodService(cfg, store, client, observability.New(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(context.Background(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteMany,
		Mode:       domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID != "ps_existing" || podSession.Status != domain.PodStatusReady {
		t.Fatalf("pod session = %#v", podSession)
	}
}

func TestBuildReadOnlyPod(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	service := NewPodService(
		cfg,
		state.New(cfg.Cache),
		kube.New(fake.NewSimpleClientset()),
		observability.New(cfg.Observability, nil),
	)
	pod := service.buildPod(&domain.PodSession{
		ID:        "ps_1",
		Namespace: "default",
		PVCName:   "data",
		PVCUID:    "uid",
		Mode:      domain.ModeReadOnly,
	}, nil)
	if !pod.Spec.Volumes[0].PersistentVolumeClaim.ReadOnly {
		t.Fatal("read-only mode did not set volume readonly")
	}
	if !pod.Spec.Containers[0].VolumeMounts[0].ReadOnly {
		t.Fatal("read-only mode did not set mount readonly")
	}
}

func testConfig() config.Config {
	cfg := config.Default()
	cfg.Viewer.HookClientToken = "hook-token"
	cfg.Viewer.BackendVerifyURL = "http://backend/internal/filebrowser-hook/verify"
	cfg.Viewer.Ingress.HostTemplate = "viewer-{{ .PodSessionID }}.example.test"
	return cfg
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 13, 10, 0, 0, 0, time.UTC)
}
