package viewer

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"encore.dev/cron"
	"github.com/nixieboluo/sealos-storage-manager/internal/config"
	"github.com/nixieboluo/sealos-storage-manager/internal/filebrowser"
	"github.com/nixieboluo/sealos-storage-manager/internal/kube"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
	"github.com/nixieboluo/sealos-storage-manager/internal/session"
	"github.com/nixieboluo/sealos-storage-manager/internal/state"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var runtimeOnce sync.Once
var runtimeCleanup *session.CleanupService
var _ = cron.NewJob("viewer-cleanup", cron.JobConfig{
	Title:    "Clean up idle File Browser viewer sessions",
	Every:    1 * cron.Minute,
	Endpoint: CleanupViewerState,
})

type Runtime struct {
	Handler  *Handler
	cleanup  *session.CleanupService
	recorder *observability.Recorder
}

func NewRuntime(configPath string) (*Runtime, error) {
	cfg, err := config.LoadFile(configPath)
	if err != nil {
		return nil, err
	}
	return newRuntimeFromConfig(cfg)
}

func (r *Runtime) Cleanup(ctx context.Context) error {
	if r == nil || r.cleanup == nil {
		return nil
	}
	return r.cleanup.RunOnce(ctx)
}

func (r *Runtime) Shutdown(ctx context.Context) error {
	if r == nil || r.recorder == nil {
		return nil
	}
	return r.recorder.Shutdown(ctx)
}

func runtimeHandler() *Handler {
	runtimeOnce.Do(func() {
		runtime, err := NewRuntime("")
		if err != nil {
			slog.Error("viewer runtime unavailable", "error", err)
			return
		}
		defaultHandler = runtime.Handler
		runtimeCleanup = runtime.cleanup
	})
	if defaultHandler != nil {
		return defaultHandler
	}
	return NewHandler(
		unavailableViewerService{},
		unavailablePodService{},
		unavailableAuthService{},
		nil,
		observability.MustNew(config.Default().Observability, nil),
		denyAuthorizer{},
	)
}

func newRuntimeFromConfig(cfg config.Config) (*Runtime, error) {
	recorder, err := observability.New(
		context.Background(),
		cfg.Observability,
		os.Stdout,
		observability.WithMetrics(encoreMetricSources()),
	)
	if err != nil {
		return nil, fmt.Errorf("configuring observability: %w", err)
	}
	restConfig, err := managementRESTConfig(cfg)
	if err != nil {
		_ = recorder.Shutdown(context.Background())
		return nil, err
	}
	wrapKubernetesTransport(restConfig, recorder.OTelTracerProvider())
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		_ = recorder.Shutdown(context.Background())
		return nil, fmt.Errorf("building management kubernetes client: %w", err)
	}
	tracerProvider := recorder.OTelTracerProvider()
	store := state.New(cfg.Cache)
	kubeClient := kube.WithObservability(kube.New(clientset), recorder)
	pods := session.NewPodService(cfg, store, kubeClient, recorder)
	auth := session.NewAuthService(
		cfg,
		store,
		filebrowser.NewObservedClient(cfg.Viewer.FileBrowser.LoginTimeout, tracerProvider),
		recorder,
	)
	viewers := session.NewViewerService(cfg, store, kubeClient, pods, auth, recorder)
	cleanup := session.NewCleanupService(cfg, store, pods, recorder)
	handler := NewHandler(
		viewers,
		pods,
		auth,
		clientset,
		recorder,
		nil,
		WithDebugConfig(cfg.Debug),
	)
	return &Runtime{
		Handler:  handler,
		cleanup:  cleanup,
		recorder: recorder,
	}, nil
}

func wrapKubernetesTransport(restConfig *rest.Config, provider trace.TracerProvider) {
	if restConfig == nil || provider == nil {
		return
	}
	restConfig.Wrap(func(rt http.RoundTripper) http.RoundTripper {
		return otelhttp.NewTransport(
			rt,
			otelhttp.WithTracerProvider(provider),
			otelhttp.WithMeterProvider(noop.NewMeterProvider()),
			otelhttp.WithPropagators(propagation.NewCompositeTextMapPropagator(
				propagation.TraceContext{},
				propagation.Baggage{},
			)),
			otelhttp.WithSpanNameFormatter(func(_ string, req *http.Request) string {
				return "kubernetes.http." + req.Method
			}),
		)
	})
}

func managementRESTConfig(cfg config.Config) (*rest.Config, error) {
	path := ""
	if cfg.Debug.Enabled {
		path = cfg.Debug.ManagementKubeconfigPath
	}
	if path == "" {
		restConfig, err := rest.InClusterConfig()
		if err != nil {
			return nil, fmt.Errorf("loading in-cluster management config: %w", err)
		}
		return restConfig, nil
	}
	if !filepath.IsAbs(path) {
		path = filepath.Clean(path)
	}
	restConfig, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		return nil, fmt.Errorf("loading management kubeconfig: %w", err)
	}
	return restConfig, nil
}

//encore:api private
func CleanupViewerState(ctx context.Context) error {
	runtimeOnce.Do(func() {
		runtime, err := NewRuntime("")
		if err != nil {
			slog.Error("viewer runtime unavailable", "error", err)
			return
		}
		defaultHandler = runtime.Handler
		runtimeCleanup = runtime.cleanup
	})
	if runtimeCleanup == nil {
		return nil
	}
	return runtimeCleanup.RunOnce(ctx)
}
