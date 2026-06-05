package session

import (
	"context"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
)

func (s *PodService) ReconcileViewerPods(ctx context.Context, namespace string) (err error) {
	ctx, finish := s.recorder.TraceOperation(ctx,
		"pod.reconcile_viewer_pods",
		slog.String("namespace", namespace),
	)
	var scanned, deleted, skippedInvalid int
	defer func() {
		s.recorder.Logger().LogAttrs(ctx, slog.LevelDebug, "pod.reconcile_viewer_pods.result",
			slog.String("namespace", namespace),
			slog.String("runtime_version", s.runtimeVersion),
			slog.Int("scanned", scanned),
			slog.Int("deleted", deleted),
			slog.Int("skipped_invalid", skippedInvalid),
		)
		finish(err)
	}()

	pods, err := s.client.ListViewerPods(ctx, namespace, map[string]string{labelComponent: componentViewer})
	if err != nil {
		return err
	}
	now := s.now()
	for i := range pods {
		scanned++
		pod := &pods[i]
		podSessionID := pod.Labels[labelPodSessionID]
		if podSessionID == "" {
			skippedInvalid++
			continue
		}
		if pod.DeletionTimestamp != nil {
			skippedInvalid++
			continue
		}
		if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded {
			if err := s.deletePodIfExists(ctx, pod.Namespace, pod.Name); err != nil {
				return err
			}
			s.recorder.ObserveCleanupDeleted()
			deleted++
			continue
		}
		if existing, ok := s.store.GetPodSessionIncludingExpired(podSessionID); ok {
			if existing.RuntimeVersion == s.runtimeVersion {
				if synced, err := s.SyncPodStatus(ctx, existing); err == nil {
					s.store.PutPodSession(synced)
				}
				continue
			}
		}
		if pod.Labels[labelRuntimeVersion] != s.runtimeVersion {
			if now.Sub(pod.CreationTimestamp.Time) <= s.cfg.Sessions.OrphanGrace {
				skippedInvalid++
				continue
			}
			if err := s.deletePodIfExists(ctx, pod.Namespace, pod.Name); err != nil {
				return err
			}
			s.recorder.ObserveCleanupDeleted()
			deleted++
			continue
		}
		if !s.viewerPodStillValid(pod, now) {
			if err := s.deletePodIfExists(ctx, pod.Namespace, pod.Name); err != nil {
				return err
			}
			s.recorder.ObserveCleanupDeleted()
			deleted++
			continue
		}
		if err := s.deletePodIfExists(ctx, pod.Namespace, pod.Name); err != nil {
			return err
		}
		s.recorder.ObserveCleanupDeleted()
		deleted++
	}
	return nil
}

func (s *PodService) viewerPodStillValid(pod *corev1.Pod, now time.Time) bool {
	if keepaliveUntil, ok := parseAnnotationTime(pod.Annotations, annotationKeepaliveUntil); ok {
		return now.Before(keepaliveUntil)
	}
	return now.Sub(pod.CreationTimestamp.Time) <= s.cfg.Sessions.RecoveryGrace
}

func (s *PodService) DeleteViewerPodsBySessionID(
	ctx context.Context,
	namespace string,
	podSessionID string,
) error {
	pods, err := s.client.ListViewerPods(ctx, namespace, map[string]string{
		labelComponent:    componentViewer,
		labelPodSessionID: podSessionID,
	})
	if err != nil {
		return err
	}
	for i := range pods {
		if err := s.deletePodIfExists(ctx, pods[i].Namespace, pods[i].Name); err != nil {
			return err
		}
		s.recorder.ObserveCleanupDeleted()
		s.recorder.Logger().LogAttrs(ctx, slog.LevelInfo, "pod.stale_viewer_pod_deleted",
			slog.String("pod_session_id", podSessionID),
			slog.String("namespace", pods[i].Namespace),
			slog.String("pod_name", pods[i].Name),
		)
	}
	return nil
}

func (s *PodService) findExistingViewerPod(
	ctx context.Context,
	namespace string,
	pvcUID string,
) (*corev1.Pod, error) {
	pods, err := s.client.ListViewerPods(ctx, namespace, map[string]string{
		labelComponent:      componentViewer,
		labelPVCUID:         pvcUID,
		labelRuntimeVersion: s.runtimeVersion,
	})
	if err != nil {
		return nil, err
	}
	for i := range pods {
		if pods[i].DeletionTimestamp != nil {
			continue
		}
		if pods[i].Status.Phase == corev1.PodFailed || pods[i].Status.Phase == corev1.PodSucceeded {
			continue
		}
		return &pods[i], nil
	}
	return nil, nil
}
