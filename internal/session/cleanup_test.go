package session

import (
	"context"
	"testing"
	"time"

	"github.com/nixieboluo/sealos-stroage-manager/internal/domain"
	"github.com/nixieboluo/sealos-stroage-manager/internal/kube"
	"github.com/nixieboluo/sealos-stroage-manager/internal/observability"
	"github.com/nixieboluo/sealos-stroage-manager/internal/state"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestCleanupPurgesExpiredViewerSession(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	store.PutViewerSession(&domain.ViewerSession{
		ID:           "vs_1",
		PodSessionID: "ps_1",
		ExpiresAt:    fixedNow().Add(-time.Second),
	})
	recorder := observability.New(cfg.Observability, nil)
	cleanup := NewCleanupService(
		cfg,
		store,
		NewPodService(cfg, store, kube.New(fake.NewSimpleClientset()), recorder),
		recorder,
	)
	cleanup.now = fixedNow

	if err := cleanup.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce() error = %v", err)
	}
	if got := store.ListViewerSessionsByPod("ps_1", fixedNow()); len(got) != 0 {
		t.Fatalf("viewer sessions = %d", len(got))
	}
}

func TestReconcileViewerPodsRecoversRecentPod(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	store := state.New(cfg.Cache)
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:         "default",
			Name:              "viewer-ps_recent",
			CreationTimestamp: metav1.NewTime(fixedNow().Add(-time.Minute)),
			Labels: map[string]string{
				labelComponent:    componentViewer,
				labelPVCName:      "data",
				labelPVCUID:       "uid",
				labelPodSessionID: "ps_recent",
			},
		},
		Status: corev1.PodStatus{Phase: corev1.PodPending},
	}
	service := NewPodService(
		cfg,
		store,
		kube.New(fake.NewSimpleClientset(pod)),
		observability.New(cfg.Observability, nil),
	)
	service.now = fixedNow

	if err := service.ReconcileViewerPods(context.Background(), "default"); err != nil {
		t.Fatalf("ReconcileViewerPods() error = %v", err)
	}
	if _, ok := store.GetPodSession("ps_recent", fixedNow()); !ok {
		t.Fatal("recent pod was not recovered into state")
	}
}

func TestActiveViewerSessionsFiltersClosed(t *testing.T) {
	t.Parallel()

	active := activeViewerSessions([]*domain.ViewerSession{
		{ID: "open", Status: domain.ViewerStatusReady},
		{ID: "closed", Status: domain.ViewerStatusClosed},
	})
	if len(active) != 1 || active[0].ID != "open" {
		t.Fatalf("active = %#v", active)
	}
}
