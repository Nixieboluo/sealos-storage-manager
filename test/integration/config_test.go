//go:build integration

package integration

import (
	"context"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/nixieboluo/sealos-stroage-manager/internal/config"
	"github.com/nixieboluo/sealos-stroage-manager/internal/kube"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

var configPath = flag.String("config", config.DefaultPath, "viewer backend config path")

func TestIntegrationKubeconfigCanListPVCs(t *testing.T) {
	root := repoRoot(t)
	cfgPath := *configPath
	if !filepath.IsAbs(cfgPath) {
		cfgPath = filepath.Join(root, cfgPath)
	}
	cfg, err := config.LoadFile(cfgPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.Integration.KubeconfigPath == "" {
		t.Skip("integration.kubeconfig_path is empty")
	}
	kubeconfigPath := cfg.Integration.KubeconfigPath
	if !filepath.IsAbs(kubeconfigPath) {
		kubeconfigPath = filepath.Join(root, kubeconfigPath)
	}
	if _, err := os.Stat(kubeconfigPath); err != nil {
		t.Skipf("integration kubeconfig unavailable: %v", err)
	}
	restConfig, err := clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	if err != nil {
		t.Fatalf("build rest config: %v", err)
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		t.Fatalf("new kubernetes client: %v", err)
	}
	client := kube.New(clientset)
	if _, err := client.ListPVCs(context.Background(), cfg.Integration.Namespace); err != nil {
		t.Fatalf("list pvcs in %q: %v", cfg.Integration.Namespace, err)
	}
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not locate repo root")
		}
		dir = parent
	}
}
