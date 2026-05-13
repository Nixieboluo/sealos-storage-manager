package filebrowser

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	httpClient *http.Client
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

func NewClient(timeout time.Duration) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: timeout},
	}
}

func (c *Client) Login(ctx context.Context, viewerURL string, username string, password string) (string, error) {
	body, err := json.Marshal(LoginRequest{Username: username, Password: password}) //nolint:gosec // File Browser login API requires a password field; caller supplies a one-time short-TTL secret.
	if err != nil {
		return "", fmt.Errorf("encoding filebrowser login request: %w", err)
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(viewerURL, "/")+"/api/login",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("building filebrowser login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling filebrowser login: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("filebrowser login returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("reading filebrowser login response: %w", err)
	}
	token, err := loginToken(data)
	if err != nil {
		return "", err
	}
	if token == "" {
		return "", fmt.Errorf("filebrowser login response missing token")
	}
	return token, nil
}

func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func loginToken(data []byte) (string, error) {
	var out LoginResponse
	if err := json.Unmarshal(data, &out); err == nil && out.Token != "" {
		return out.Token, nil
	}
	var token string
	if err := json.Unmarshal(data, &token); err == nil {
		return strings.TrimSpace(token), nil
	}
	return strings.TrimSpace(string(data)), nil
}
