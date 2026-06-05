package state

import "github.com/nixieboluo/sealos-storage-manager/internal/domain"

func clonePodSession(session *domain.PodSession) *domain.PodSession {
	if session == nil {
		return nil
	}
	return new(*session)
}

func cloneViewerSession(session *domain.ViewerSession) *domain.ViewerSession {
	if session == nil {
		return nil
	}
	return new(*session)
}

func cloneAuthRequest(req *domain.AuthRequest) *domain.AuthRequest {
	if req == nil {
		return nil
	}
	copyReq := *req
	if req.UsedAt != nil {
		copyReq.UsedAt = new(*req.UsedAt)
	}
	return &copyReq
}

func cloneTokenRecord(record *domain.TokenRecord) *domain.TokenRecord {
	if record == nil {
		return nil
	}
	return new(*record)
}
