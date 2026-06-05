package viewer

import (
	"net/url"
	"testing"

	"github.com/nixieboluo/sealos-storage-manager/internal/authn"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

func TestKubernetesAuthorizerRequiresSameNamespaceUID(t *testing.T) {
	clientsetFactoryMu.Lock()
	defer clientsetFactoryMu.Unlock()

	principal, err := authn.PrincipalFromAuthorization(url.QueryEscape(testKubeconfig))
	if err != nil {
		t.Fatalf("PrincipalFromAuthorization() error = %v", err)
	}
	userClient := fake.NewSimpleClientset(namespaceWithUID("ns", "user-uid"))
	authorizer := newKubernetesAuthorizer(
		fake.NewSimpleClientset(namespaceWithUID("ns", "managed-uid")),
		observability.MustNew(testObservability(), nil),
	)
	newClientset := kubernetesClientsetForConfig
	kubernetesClientsetForConfig = func(_ *rest.Config) (kubernetes.Interface, error) {
		return userClient, nil
	}
	defer func() {
		kubernetesClientsetForConfig = newClientset
	}()

	if err := authorizer.CanListPVCs(t.Context(), principal, "ns"); err == nil {
		t.Fatal("CanListPVCs() allowed namespace UID mismatch")
	}
}

func TestKubernetesAuthorizerRequiresSamePVCUID(t *testing.T) {
	clientsetFactoryMu.Lock()
	defer clientsetFactoryMu.Unlock()

	principal, err := authn.PrincipalFromAuthorization(url.QueryEscape(testKubeconfig))
	if err != nil {
		t.Fatalf("PrincipalFromAuthorization() error = %v", err)
	}
	userClient := fake.NewSimpleClientset(pvcWithUID("ns", "data", "user-uid"))
	authorizer := newKubernetesAuthorizer(
		fake.NewSimpleClientset(pvcWithUID("ns", "data", "managed-uid")),
		observability.MustNew(testObservability(), nil),
	)
	newClientset := kubernetesClientsetForConfig
	kubernetesClientsetForConfig = func(_ *rest.Config) (kubernetes.Interface, error) {
		return userClient, nil
	}
	defer func() {
		kubernetesClientsetForConfig = newClientset
	}()

	if err := authorizer.CanGetPVC(t.Context(), principal, "ns", "data"); err == nil {
		t.Fatal("CanGetPVC() allowed PVC UID mismatch")
	}
}
