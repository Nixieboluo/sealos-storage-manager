package viewer

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/nixieboluo/sealos-storage-manager/internal/config"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"k8s.io/client-go/rest"
)

func TestManagementRESTConfigUsesConfiguredKubeconfig(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	kubeconfigPath := filepath.Join(dir, "management.kubeconfig.yaml")
	if err := os.WriteFile(kubeconfigPath, []byte(testKubeconfig), 0o600); err != nil {
		t.Fatalf("write kubeconfig: %v", err)
	}
	cfg := config.Default()
	cfg.Debug.Enabled = true
	cfg.Debug.ManagementKubeconfigPath = kubeconfigPath

	restConfig, err := managementRESTConfig(cfg)
	if err != nil {
		t.Fatalf("managementRESTConfig() error = %v", err)
	}
	if restConfig.Host != "https://127.0.0.1:6443" {
		t.Fatalf("host = %q", restConfig.Host)
	}
}

func TestWrapKubernetesTransportInjectsTraceContext(t *testing.T) {
	t.Parallel()

	exporter := tracetest.NewInMemoryExporter()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSyncer(exporter))
	cfg := &rest.Config{}
	wrapKubernetesTransport(cfg, provider)
	if cfg.WrapTransport == nil {
		t.Fatal("WrapTransport was not configured")
	}

	var traceparent string
	transport := cfg.WrapTransport(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		traceparent = req.Header.Get("traceparent")
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       http.NoBody,
			Request:    req,
		}, nil
	}))
	req, err := http.NewRequest(http.MethodGet, "https://kubernetes.example/api", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}
	ctx, span := provider.Tracer("test").Start(req.Context(), "parent")
	defer span.End()
	resp, err := transport.RoundTrip(req.WithContext(ctx))
	if err != nil {
		t.Fatalf("RoundTrip() error = %v", err)
	}
	_ = resp.Body.Close()

	if traceparent == "" {
		t.Fatal("traceparent header was not injected")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
