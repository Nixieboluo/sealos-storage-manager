package filebrowser

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	body, err := json.Marshal(LoginRequest{Username: username, Password: password})
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
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("filebrowser login returned status %d", resp.StatusCode)
	}
	var out LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decoding filebrowser login response: %w", err)
	}
	if out.Token == "" {
		return "", fmt.Errorf("filebrowser login response missing token")
	}
	return out.Token, nil
}

func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}
