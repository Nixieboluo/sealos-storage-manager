package filebrowser

import "testing"

func TestLoginToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		body string
		want string
	}{
		{
			name: "json object",
			body: `{"token":"jwt-token"}`,
			want: "jwt-token",
		},
		{
			name: "json string",
			body: `"jwt-token"`,
			want: "jwt-token",
		},
		{
			name: "plain text",
			body: "jwt-token\n",
			want: "jwt-token",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := loginToken([]byte(tt.body))
			if err != nil {
				t.Fatalf("loginToken() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("loginToken() = %q, want %q", got, tt.want)
			}
		})
	}
}
