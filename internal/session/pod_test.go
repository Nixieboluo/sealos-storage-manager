package session

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/nixieboluo/sealos-storage-manager/internal/apienv"
	"github.com/nixieboluo/sealos-storage-manager/internal/config"
	"github.com/nixieboluo/sealos-storage-manager/internal/domain"
	"github.com/nixieboluo/sealos-storage-manager/internal/kube"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
	"github.com/nixieboluo/sealos-storage-manager/internal/state"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestEnsurePodSessionCreatesResources(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	clientset := fake.NewSimpleClientset()
	client := kube.New(clientset)
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
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
	if strings.Contains(podSession.PodName, "_") || strings.Contains(podSession.ViewerURL, "_") {
		t.Fatalf("kubernetes resource identifiers must be DNS-safe: pod=%q url=%q", podSession.PodName, podSession.ViewerURL)
	}

	pod, err := client.GetPod(t.Context(), "default", podSession.PodName)
	if err != nil {
		t.Fatalf("GetPod() error = %v", err)
	}
	if pod.Spec.Affinity == nil {
		t.Fatal("expected node affinity for RWO mounted PVC")
	}
	if pod.Spec.Containers[0].Image != cfg.Viewer.FileBrowser.Image {
		t.Fatalf("image = %q", pod.Spec.Containers[0].Image)
	}
	assertRuntimeVersionLabel(t, pod.Labels, service.runtimeVersion)
	assertLifecycleAnnotations(t, pod.Annotations, podSession)
	if !strings.Contains(pod.Spec.Containers[0].Args[0], "--auth.command=/hooks/filebrowser-auth-hook.sh") {
		t.Fatalf("filebrowser command did not configure hook auth: %q", pod.Spec.Containers[0].Args[0])
	}
	if !strings.Contains(pod.Spec.Containers[0].Args[0], "'/filebrowser' config init") {
		t.Fatalf("filebrowser command did not use configured binary path: %q", pod.Spec.Containers[0].Args[0])
	}
	if pod.Spec.Volumes[0].PersistentVolumeClaim.ReadOnly {
		t.Fatal("readwrite mode mounted readonly")
	}
	if pod.Spec.Volumes[1].ConfigMap == nil || pod.Spec.Volumes[1].ConfigMap.Name != podSession.PodName {
		t.Fatalf("hook configmap volume missing: %#v", pod.Spec.Volumes)
	}
	hookConfigMap, err := clientset.CoreV1().ConfigMaps("default").Get(
		t.Context(),
		podSession.PodName,
		metav1.GetOptions{},
	)
	if err != nil {
		t.Fatalf("hook configmap was not created: %v", err)
	}
	assertRuntimeVersionLabel(t, hookConfigMap.Labels, service.runtimeVersion)
	assertOwnedByPod(t, hookConfigMap.OwnerReferences, pod)
	serviceResource, err := clientset.CoreV1().Services("default").Get(
		t.Context(),
		podSession.ServiceName,
		metav1.GetOptions{},
	)
	if err != nil {
		t.Fatalf("service was not created: %v", err)
	}
	assertRuntimeVersionLabel(t, serviceResource.Labels, service.runtimeVersion)
	assertOwnedByPod(t, serviceResource.OwnerReferences, pod)
	ingress, err := clientset.NetworkingV1().Ingresses("default").Get(
		t.Context(),
		podSession.ServiceName,
		metav1.GetOptions{},
	)
	if err != nil {
		t.Fatalf("ingress was not created: %v", err)
	}
	assertRuntimeVersionLabel(t, ingress.Labels, service.runtimeVersion)
	assertOwnedByPod(t, ingress.OwnerReferences, pod)
	assertIngressPaths(t, ingress, []string{"/api/login", "/api/raw", "/api/resources", "/api/tus", "/api/usage"})
	if ingress.Annotations["nginx.ingress.kubernetes.io/enable-cors"] != "true" {
		t.Fatalf("ingress CORS annotations missing: %#v", ingress.Annotations)
	}
	if !strings.Contains(ingress.Annotations["nginx.ingress.kubernetes.io/cors-allow-headers"], "Tus-Resumable") {
		t.Fatalf("ingress CORS annotations do not allow TUS headers: %#v", ingress.Annotations)
	}
	if ingress.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"] != "0" {
		t.Fatalf("ingress does not allow large upload bodies: %#v", ingress.Annotations)
	}
}

func TestEnsurePodSessionMapsPodQuotaFailure(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	clientset := fake.NewSimpleClientset()
	clientset.PrependReactor("create", "pods", func(_ ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewForbidden(
			schema.GroupResource{Resource: "pods"},
			"viewer-ps-quota",
			errors.New("exceeded quota: quota-ns-admin, requested: pods=1, used: pods=8, limited: pods=8"),
		)
	})
	service := NewPodService(cfg, store, kube.New(clientset), observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	_, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		Namespace:  "ns-admin",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteOnce,
		Mode:       domain.ModeReadWrite,
		MountInfo:  &domain.PVCMountInfo{},
	})

	var apiErr *apienv.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("EnsurePodSession() error = %T %v, want apienv.Error", err, err)
	}
	if apiErr.Code != apienv.CodeViewerPodFailed || apiErr.Status != 403 {
		t.Fatalf("api error = %#v", apiErr)
	}
	if !strings.Contains(apiErr.Message, "exceeded quota") {
		t.Fatalf("api message = %q, want quota detail", apiErr.Message)
	}
}

func TestEnsurePodSessionDeletesOrphanViewerPodBeforeCreatingReplacement(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	version := runtimeVersion(cfg)
	existing := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:         "default",
			Name:              "viewer-ps_existing",
			CreationTimestamp: metav1.NewTime(fixedNow()),
			Labels: map[string]string{
				labelComponent:      componentViewer,
				labelPVCUID:         "uid",
				labelPodSessionID:   "ps_existing",
				labelRuntimeVersion: version,
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
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteMany,
		Mode:       domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "ps_existing" || podSession.Status != domain.PodStatusCreating {
		t.Fatalf("pod session = %#v", podSession)
	}
	if podSession.RuntimeVersion != version {
		t.Fatalf("runtime version = %q, want %q", podSession.RuntimeVersion, version)
	}
	if _, err := client.GetPod(t.Context(), "default", "viewer-ps_existing"); !apierrors.IsNotFound(err) {
		t.Fatalf("old viewer pod error = %v, want not found", err)
	}
	if _, err := client.GetPod(t.Context(), "default", podSession.PodName); err != nil {
		t.Fatalf("replacement viewer pod missing: %v", err)
	}
}

func TestEnsurePodSessionSkipsStoredSessionWithDifferentRuntimeVersion(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	store.PutPodSession(&domain.PodSession{
		ID:             "ps_old",
		Namespace:      "default",
		PVCName:        "data",
		PVCUID:         "uid",
		PodName:        "viewer-ps-old",
		ServiceName:    "viewer-ps-old",
		RuntimeVersion: "old-version",
		Status:         domain.PodStatusReady,
		ExpiresAt:      fixedNow().Add(time.Minute),
	})
	client := kube.New(fake.NewSimpleClientset())
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteMany,
		Mode:       domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "ps_old" {
		t.Fatal("stored pod session with different runtime version was reused")
	}
	if podSession.RuntimeVersion != service.runtimeVersion {
		t.Fatalf("runtime version = %q, want %q", podSession.RuntimeVersion, service.runtimeVersion)
	}
}

func TestEnsurePodSessionSkipsStoredSessionWithDifferentAdminContext(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	store.PutPodSession(&domain.PodSession{
		ID:             "ps_user",
		Namespace:      "default",
		PVCName:        "data",
		PVCUID:         "uid",
		PodName:        "viewer-ps-user",
		ServiceName:    "viewer-ps-user",
		RuntimeVersion: runtimeVersion(cfg),
		Status:         domain.PodStatusReady,
		ExpiresAt:      fixedNow().Add(time.Minute),
		AdminContext:   false,
	})
	client := kube.New(fake.NewSimpleClientset())
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		AdminContext: true,
		Namespace:    "default",
		PVCName:      "data",
		PVCUID:       "uid",
		AccessMode:   domain.AccessModeReadWriteMany,
		Mode:         domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "ps_user" {
		t.Fatal("stored pod session with different admin context was reused")
	}
	if !podSession.AdminContext {
		t.Fatal("replacement pod session did not preserve requested admin context")
	}
}

func TestEnsurePodSessionSkipsExistingViewerPodWithDifferentRuntimeVersion(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	existing := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:         "default",
			Name:              "viewer-ps-old",
			CreationTimestamp: metav1.NewTime(fixedNow()),
			Labels: map[string]string{
				labelComponent:      componentViewer,
				labelPVCUID:         "uid",
				labelPodSessionID:   "ps_old",
				labelRuntimeVersion: "old-version",
			},
		},
		Status: corev1.PodStatus{Phase: corev1.PodRunning},
	}
	store := state.New(cfg.Cache)
	clientset := fake.NewSimpleClientset(existing)
	client := kube.New(clientset)
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteMany,
		Mode:       domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "ps_old" {
		t.Fatal("viewer pod with different runtime version was reused")
	}
	if _, err := clientset.CoreV1().Pods("default").Get(t.Context(), podSession.PodName, metav1.GetOptions{}); err != nil {
		t.Fatalf("new viewer pod was not created: %v", err)
	}
}

func TestEnsurePodSessionSkipsTerminatingViewerPod(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	existing := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:         "default",
			Name:              "viewer-ps-terminating",
			CreationTimestamp: metav1.NewTime(fixedNow().Add(-time.Minute)),
			DeletionTimestamp: new(metav1.NewTime(fixedNow())),
			Labels: map[string]string{
				labelComponent:    componentViewer,
				labelPVCUID:       "uid",
				labelPodSessionID: "ps_terminating",
			},
		},
		Status: corev1.PodStatus{Phase: corev1.PodRunning},
	}
	store := state.New(cfg.Cache)
	client := kube.New(fake.NewSimpleClientset(existing))
	service := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service.now = fixedNow

	podSession, err := service.EnsurePodSession(t.Context(), EnsurePodSessionInput{
		Namespace:  "default",
		PVCName:    "data",
		PVCUID:     "uid",
		AccessMode: domain.AccessModeReadWriteMany,
		Mode:       domain.ModeReadWrite,
	})
	if err != nil {
		t.Fatalf("EnsurePodSession() error = %v", err)
	}
	if podSession.ID == "ps_terminating" {
		t.Fatal("terminating pod was reused")
	}
}

func testConfig() config.Config {
	cfg := config.Default()
	cfg.Viewer.HookClientToken = "hook-token"
	cfg.Viewer.BackendVerifyURL = "http://backend/internal/filebrowser-hook/verify"
	cfg.Viewer.HookScript = "#!/bin/sh\necho hook.action=block\n"
	cfg.Viewer.FileBrowser.Image = "filebrowser/filebrowser:v2.30.0"
	cfg.Viewer.FileBrowser.BinaryPath = "/filebrowser"
	cfg.Viewer.FileBrowser.Port = 8080
	cfg.Viewer.FileBrowser.TokenTTL = 15 * time.Minute
	cfg.Viewer.FileBrowser.LoginTimeout = 2 * time.Second
	cfg.Viewer.Pod.MountPath = "/srv"
	cfg.Viewer.Pod.DatabasePath = "/tmp/filebrowser.db"
	cfg.Viewer.Pod.CPURequest = "50m"
	cfg.Viewer.Pod.MemoryRequest = "64Mi"
	cfg.Viewer.Pod.CPULimit = "500m"
	cfg.Viewer.Pod.MemoryLimit = "512Mi"
	cfg.Viewer.Service.Type = "ClusterIP"
	cfg.Viewer.Service.Port = 80
	cfg.Viewer.Ingress.ClassName = "nginx"
	cfg.Viewer.Ingress.HostTemplate = "viewer-{{ .PodSessionID }}.example.test"
	cfg.Observability.Logs.Exporter = "discard"
	cfg.Observability.Logs.Level = "error"
	return cfg
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 13, 10, 0, 0, 0, time.UTC)
}
