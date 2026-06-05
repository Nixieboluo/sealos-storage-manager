package session

import (
	"errors"
	"testing"

	"github.com/nixieboluo/sealos-storage-manager/internal/apienv"
	"github.com/nixieboluo/sealos-storage-manager/internal/domain"
	"github.com/nixieboluo/sealos-storage-manager/internal/kube"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
	"github.com/nixieboluo/sealos-storage-manager/internal/state"
	corev1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func TestViewerServiceCreatePVC(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	clientset := fake.NewSimpleClientset(&storagev1.StorageClass{
		ObjectMeta: metav1.ObjectMeta{
			Name: "standard",
			Annotations: map[string]string{
				StorageClassVisibleAnnotation:     "true",
				StorageClassAccessModesAnnotation: "ReadWriteOnce",
			},
		},
		Provisioner: "example.test/provisioner",
	})
	client := kube.New(clientset)
	store := state.New(cfg.Cache)
	pods := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service := NewViewerService(cfg, store, client, pods, nil, observability.MustNew(cfg.Observability, nil))

	pvc, err := service.CreatePVC(t.Context(), CreatePVCInput{
		Namespace:        "default",
		Name:             "data",
		Capacity:         "2Gi",
		AccessModes:      []string{domain.AccessModeReadWriteOnce},
		StorageClassName: "standard",
	})
	if err != nil {
		t.Fatalf("CreatePVC() error = %v", err)
	}
	if pvc.Name != "data" || pvc.Capacity != "2Gi" {
		t.Fatalf("pvc = %#v", pvc)
	}
	created, err := clientset.CoreV1().PersistentVolumeClaims("default").Get(t.Context(), "data", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get() created pvc error = %v", err)
	}
	if created.Spec.StorageClassName == nil || *created.Spec.StorageClassName != "standard" {
		t.Fatalf("storage class = %#v", created.Spec.StorageClassName)
	}
}

func TestViewerServiceCreatePVCRejectsHiddenStorageClass(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	client := kube.New(fake.NewSimpleClientset(&storagev1.StorageClass{
		ObjectMeta:  metav1.ObjectMeta{Name: "hidden"},
		Provisioner: "example.test/provisioner",
	}))
	store := state.New(cfg.Cache)
	pods := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service := NewViewerService(cfg, store, client, pods, nil, observability.MustNew(cfg.Observability, nil))

	_, err := service.CreatePVC(t.Context(), CreatePVCInput{
		Namespace:        "default",
		Name:             "data",
		Capacity:         "2Gi",
		AccessModes:      []string{domain.AccessModeReadWriteOnce},
		StorageClassName: "hidden",
	})

	var apiErr *apienv.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("CreatePVC() error = %T %v, want apienv.Error", err, err)
	}
	if apiErr.Code != apienv.CodeStorageClassNotVisible {
		t.Fatalf("code = %s, want %s", apiErr.Code, apienv.CodeStorageClassNotVisible)
	}
}

func TestViewerServiceCreatePVCRejectsAccessModeOutsideStorageClassPolicy(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	client := kube.New(fake.NewSimpleClientset(&storagev1.StorageClass{
		ObjectMeta: metav1.ObjectMeta{
			Name: "standard",
			Annotations: map[string]string{
				StorageClassVisibleAnnotation:     "true",
				StorageClassAccessModesAnnotation: "ReadWriteOnce",
			},
		},
		Provisioner: "example.test/provisioner",
	}))
	store := state.New(cfg.Cache)
	pods := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service := NewViewerService(cfg, store, client, pods, nil, observability.MustNew(cfg.Observability, nil))

	_, err := service.CreatePVC(t.Context(), CreatePVCInput{
		Namespace:        "default",
		Name:             "data",
		Capacity:         "2Gi",
		AccessModes:      []string{domain.AccessModeReadWriteMany},
		StorageClassName: "standard",
	})

	var apiErr *apienv.Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("CreatePVC() error = %T %v, want apienv.Error", err, err)
	}
	if apiErr.Code != apienv.CodeUnsupportedAccessMode {
		t.Fatalf("code = %s, want %s", apiErr.Code, apienv.CodeUnsupportedAccessMode)
	}
}

func TestViewerServiceDeletePVCRejectsMountedPVC(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	client := kube.New(fake.NewSimpleClientset(
		&corev1.PersistentVolumeClaim{
			ObjectMeta: metav1.ObjectMeta{Namespace: "default", Name: "data", UID: types.UID("uid")},
			Spec: corev1.PersistentVolumeClaimSpec{
				AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
				Resources: corev1.VolumeResourceRequirements{
					Requests: corev1.ResourceList{corev1.ResourceStorage: resource.MustParse("1Gi")},
				},
			},
		},
		testMountedPod("default", "app", "node-a", "data"),
	))
	store := state.New(cfg.Cache)
	pods := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service := NewViewerService(cfg, store, client, pods, nil, observability.MustNew(cfg.Observability, nil))

	if _, err := service.DeletePVC(t.Context(), DeletePVCInput{Namespace: "default", Name: "data"}); err == nil {
		t.Fatal("DeletePVC() error = nil")
	}
}

func TestViewerServiceExpandPVC(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	clientset := fake.NewSimpleClientset(&corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Namespace: "default", Name: "data", UID: types.UID("uid")},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: resource.MustParse("1Gi")},
			},
		},
	})
	client := kube.New(clientset)
	store := state.New(cfg.Cache)
	pods := NewPodService(cfg, store, client, observability.MustNew(cfg.Observability, nil))
	service := NewViewerService(cfg, store, client, pods, nil, observability.MustNew(cfg.Observability, nil))

	pvc, err := service.ExpandPVC(t.Context(), ExpandPVCInput{
		Namespace: "default",
		Name:      "data",
		Capacity:  "3Gi",
	})
	if err != nil {
		t.Fatalf("ExpandPVC() error = %v", err)
	}
	if pvc.Capacity != "3Gi" {
		t.Fatalf("pvc = %#v", pvc)
	}
	updated, err := clientset.CoreV1().PersistentVolumeClaims("default").Get(t.Context(), "data", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Get() updated pvc error = %v", err)
	}
	if updated.Spec.Resources.Requests.Storage().String() != "3Gi" {
		t.Fatalf("storage = %s", updated.Spec.Resources.Requests.Storage().String())
	}
}
