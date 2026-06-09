package viewer

import (
	"testing"

	"github.com/nixieboluo/sealos-storage-manager/internal/authn"
)

func TestSealosUserNamespaceUsesAdminUserID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		user string
		want string
	}{
		{name: "admin", user: "admin", want: "ns-admin"},
		{name: "trim spaces", user: " admin ", want: "ns-admin"},
		{name: "generated user", user: "b4hw543c", want: "ns-b4hw543c"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := sealosUserNamespace(tt.user); got != tt.want {
				t.Fatalf("sealosUserNamespace(%q) = %q, want %q", tt.user, got, tt.want)
			}
		})
	}
}

func TestIsAdminInOwnNamespaceRequiresExactAllowedNamespace(t *testing.T) {
	t.Parallel()

	result := AdminAuthorizationResult{
		Allowed:          true,
		AllowedNamespace: "ns-admin",
	}
	tests := []struct {
		name      string
		principal *authn.Principal
		result    AdminAuthorizationResult
		want      bool
	}{
		{
			name:      "own namespace",
			principal: &authn.Principal{Namespace: "ns-admin"},
			result:    result,
			want:      true,
		},
		{
			name:      "other user namespace",
			principal: &authn.Principal{Namespace: "ns-rm68q0bp"},
			result:    result,
			want:      false,
		},
		{
			name:      "system namespace",
			principal: &authn.Principal{Namespace: "kube-system"},
			result:    result,
			want:      false,
		},
		{
			name:      "admin denied",
			principal: &authn.Principal{Namespace: "ns-admin"},
			result:    AdminAuthorizationResult{AllowedNamespace: "ns-admin"},
			want:      false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := isAdminInOwnNamespace(tt.principal, tt.result); got != tt.want {
				t.Fatalf("isAdminInOwnNamespace() = %v, want %v", got, tt.want)
			}
		})
	}
}
