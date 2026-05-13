package session

import (
	"context"
	"time"

	"github.com/nixieboluo/sealos-stroage-manager/internal/config"
	"github.com/nixieboluo/sealos-stroage-manager/internal/domain"
	"github.com/nixieboluo/sealos-stroage-manager/internal/observability"
	"github.com/nixieboluo/sealos-stroage-manager/internal/state"
)

type CleanupService struct {
	cfg      config.Config
	store    *state.Store
	pods     *PodService
	recorder *observability.Recorder
	now      func() time.Time
}

func NewCleanupService(
	cfg config.Config,
	store *state.Store,
	pods *PodService,
	recorder *observability.Recorder,
) *CleanupService {
	return &CleanupService{
		cfg:      cfg,
		store:    store,
		pods:     pods,
		recorder: recorder,
		now:      time.Now,
	}
}

func (s *CleanupService) RunOnce(ctx context.Context) error {
	now := s.now()
	expired := s.store.PurgeExpired(now)
	for _, item := range expired {
		if item.Kind == "viewer_session" {
			s.recorder.Metrics().ViewerClosed.Add(1)
		}
	}
	for _, podItem := range expired {
		if podItem.Kind != "pod_session" {
			continue
		}
		s.recorder.Metrics().CleanupDeleted.Add(1)
	}
	return s.cleanupIdlePods(ctx, now)
}

func (s *CleanupService) cleanupIdlePods(ctx context.Context, now time.Time) error {
	// Idle pod cleanup is driven by pod session TTL in the in-memory store. Since
	// the cache intentionally hides iteration for safety, services close pods at
	// explicit lifecycle points and Kubernetes reconciliation handles orphaned pods.
	_ = ctx
	_ = now
	return nil
}

func activeViewerSessions(sessions []*domain.ViewerSession) []*domain.ViewerSession {
	active := make([]*domain.ViewerSession, 0, len(sessions))
	for _, viewer := range sessions {
		if viewer.Status == domain.ViewerStatusClosed || viewer.Status == domain.ViewerStatusExpired {
			continue
		}
		active = append(active, viewer)
	}
	return active
}
