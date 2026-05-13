package viewer

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/nixieboluo/sealos-stroage-manager/internal/apienv"
	"github.com/nixieboluo/sealos-stroage-manager/internal/authn"
	"github.com/nixieboluo/sealos-stroage-manager/internal/domain"
	"github.com/nixieboluo/sealos-stroage-manager/internal/observability"
	"github.com/nixieboluo/sealos-stroage-manager/internal/session"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type viewerService interface {
	ListPVCs(ctx context.Context, namespace string) ([]domain.PVC, error)
	CreateViewerSession(ctx context.Context, input session.CreateViewerSessionInput) (*domain.ViewerSession, error)
	GetViewerSession(ctx context.Context, id string, userID string) (*domain.ViewerSession, error)
	IssueToken(ctx context.Context, id string, userID string) (*domain.ViewerToken, error)
	HeartbeatForUser(id string, userID string) (*domain.Heartbeat, error)
	CloseViewerSessionForUser(id string, userID string) (*domain.ViewerSession, error)
	GetPodSession(id string) (*domain.PodSession, error)
}

type podService interface {
	ClosePodSession(ctx context.Context, podSessionID string) (*domain.PodSession, error)
}

type authService interface {
	VerifyHook(input session.HookVerifyInput) domain.FileBrowserHookVerification
}

type authorizer interface {
	CanListPVCs(ctx context.Context, principal *authn.Principal, namespace string) error
	CanGetPVC(ctx context.Context, principal *authn.Principal, namespace string, name string) error
}

type Handler struct {
	viewers  viewerService
	pods     podService
	auth     authService
	recorder *observability.Recorder
	authz    authorizer
}

type createViewerSessionRequest struct {
	Namespace string `json:"namespace"`
	PVCName   string `json:"pvc_name"`
}

type hookVerifyRequest struct {
	PodSessionID  string `json:"pod_session_id"`
	ViewerPodName string `json:"viewer_pod_name"`
	Username      string `json:"username"`
	AuthRequestID string `json:"auth_request_id"`
	PasswordHash  string `json:"password_hash"`
}

func NewHandler(
	viewers viewerService,
	pods podService,
	auth authService,
	recorder *observability.Recorder,
	authz authorizer,
) *Handler {
	if authz == nil {
		authz = kubernetesAuthorizer{}
	}
	return &Handler{
		viewers:  viewers,
		pods:     pods,
		auth:     auth,
		recorder: recorder,
		authz:    authz,
	}
}

func (h *Handler) ListPVCs(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/pvcs", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		namespace := req.URL.Query().Get("namespace")
		if namespace == "" {
			namespace = principal.Namespace
		}
		if err := h.authz.CanListPVCs(req.Context(), principal, namespace); err != nil {
			return 403, apienv.NewError(403, apienv.CodePVCAccessDenied, "PVC access denied", nil)
		}
		items, err := h.viewers.ListPVCs(req.Context(), namespace)
		if err != nil {
			return 500, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "pvc_list", map[string]any{"items": items})
		return http.StatusOK, nil
	})
}

func (h *Handler) CreateViewerSession(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/viewer-sessions", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		var body createViewerSessionRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			return 400, apienv.NewError(400, apienv.CodeValidationError, "Invalid JSON request", nil)
		}
		if body.Namespace == "" {
			body.Namespace = principal.Namespace
		}
		if body.PVCName == "" {
			return 400, apienv.NewError(400, apienv.CodeValidationError, "pvc_name is required", nil)
		}
		if err := h.authz.CanGetPVC(req.Context(), principal, body.Namespace, body.PVCName); err != nil {
			return 403, apienv.NewError(403, apienv.CodePVCAccessDenied, "PVC access denied", nil)
		}
		session, err := h.viewers.CreateViewerSession(req.Context(), session.CreateViewerSessionInput{
			Namespace: body.Namespace,
			PVCName:   body.PVCName,
			UserID:    principal.ID,
		})
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusCreated, "viewer_session", session)
		return http.StatusCreated, nil
	})
}

func (h *Handler) GetViewerSession(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/viewer-sessions/:id", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		session, err := h.viewers.GetViewerSession(
			req.Context(),
			pathID(req.URL.Path, "/api/viewer-sessions/"),
			principal.ID,
		)
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "viewer_session", session)
		return http.StatusOK, nil
	})
}

func (h *Handler) IssueToken(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/viewer-sessions/:id/token", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		id := strings.TrimSuffix(pathID(req.URL.Path, "/api/viewer-sessions/"), "/token")
		token, err := h.viewers.IssueToken(req.Context(), id, principal.ID)
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")
		apienv.WriteSuccess(w, http.StatusOK, "viewer_token", token)
		return http.StatusOK, nil
	})
}

func (h *Handler) Heartbeat(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/viewer-sessions/:id/heartbeat", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		id := strings.TrimSuffix(pathID(req.URL.Path, "/api/viewer-sessions/"), "/heartbeat")
		heartbeat, err := h.viewers.HeartbeatForUser(id, principal.ID)
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "heartbeat", heartbeat)
		return http.StatusOK, nil
	})
}

func (h *Handler) CloseViewerSession(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/viewer-sessions/:id", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		session, err := h.viewers.CloseViewerSessionForUser(pathID(req.URL.Path, "/api/viewer-sessions/"), principal.ID)
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "viewer_session", session)
		return http.StatusOK, nil
	})
}

func (h *Handler) ClosePodSession(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/pod-sessions/:id", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		podSession, err := h.pods.ClosePodSession(req.Context(), pathID(req.URL.Path, "/api/pod-sessions/"))
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "pod_session", podSession)
		return http.StatusOK, nil
	})
}

func (h *Handler) GetPodSession(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/api/pod-sessions/:id", func(w http.ResponseWriter, req *http.Request) (int, error) {
		principal, err := h.authenticate(req)
		if err != nil {
			return 401, err
		}
		req = req.WithContext(authn.WithPrincipal(req.Context(), principal))
		podSession, err := h.viewers.GetPodSession(pathID(req.URL.Path, "/api/pod-sessions/"))
		if err != nil {
			return apienv.FromError(err).Status, err
		}
		apienv.WriteSuccess(w, http.StatusOK, "pod_session", podSession)
		return http.StatusOK, nil
	})
}

func (h *Handler) VerifyFileBrowserHook(w http.ResponseWriter, req *http.Request) {
	h.withObserved(w, req, "/internal/filebrowser-hook/verify", func(w http.ResponseWriter, req *http.Request) (int, error) {
		var body hookVerifyRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			return 400, apienv.NewError(400, apienv.CodeValidationError, "Invalid JSON request", nil)
		}
		result := h.auth.VerifyHook(session.HookVerifyInput{
			HookClientToken: strings.TrimPrefix(req.Header.Get("Authorization"), "Bearer "),
			PodSessionID:    body.PodSessionID,
			ViewerPodName:   body.ViewerPodName,
			Username:        body.Username,
			AuthRequestID:   body.AuthRequestID,
			PasswordHash:    body.PasswordHash,
		})
		apienv.WriteSuccess(w, http.StatusOK, "filebrowser_hook_verification", result)
		return http.StatusOK, nil
	})
}

func (h *Handler) Metrics(w http.ResponseWriter, req *http.Request) {
	if h.recorder == nil {
		http.Error(w, "metrics unavailable", http.StatusServiceUnavailable)
		return
	}
	h.recorder.WritePrometheus(w)
}

func (h *Handler) authenticate(req *http.Request) (*authn.Principal, error) {
	principal, err := authn.PrincipalFromAuthorization(req.Header.Get("Authorization"))
	if err != nil {
		return nil, apienv.NewError(401, apienv.CodeUnauthorized, "Unauthorized", nil)
	}
	return principal, nil
}

func (h *Handler) withObserved(
	w http.ResponseWriter,
	req *http.Request,
	route string,
	handle func(http.ResponseWriter, *http.Request) (int, error),
) {
	start := time.Now()
	status, err := handle(w, req)
	if err != nil {
		apiErr := apienv.FromError(err)
		if status == 0 {
			status = apiErr.Status
		}
		apienv.WriteError(w, apiErr)
	}
	if h.recorder != nil {
		h.recorder.ObserveHTTP(req.Context(), req.Method, route, status, time.Since(start))
	}
}

func pathID(path string, prefix string) string {
	return strings.Trim(strings.TrimPrefix(path, prefix), "/")
}

var errRuntimeUnavailable = errors.New("viewer runtime is not configured")

type kubernetesAuthorizer struct{}

func (kubernetesAuthorizer) CanListPVCs(
	ctx context.Context,
	principal *authn.Principal,
	namespace string,
) error {
	clientset, err := kubernetes.NewForConfig(principal.ClientConfig)
	if err != nil {
		return err
	}
	_, err = clientset.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{Limit: 1})
	return err
}

func (kubernetesAuthorizer) CanGetPVC(
	ctx context.Context,
	principal *authn.Principal,
	namespace string,
	name string,
) error {
	clientset, err := kubernetes.NewForConfig(principal.ClientConfig)
	if err != nil {
		return err
	}
	_, err = clientset.CoreV1().PersistentVolumeClaims(namespace).Get(ctx, name, metav1.GetOptions{})
	return err
}
