package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const turnstileVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

var turnstileClient = &http.Client{Timeout: 5 * time.Second}

type turnstileResponse struct {
	Success bool `json:"success"`
}

// VerifyTurnstile checks a Cloudflare Turnstile token with the siteverify API.
// If secret is empty, verification is bypassed (intended for development).
func VerifyTurnstile(ctx context.Context, secret, token, remoteIP string) (bool, error) {
	if secret == "" {
		return true, nil
	}
	if token == "" {
		return false, nil
	}

	form := url.Values{}
	form.Set("secret", secret)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, turnstileVerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := turnstileClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	var out turnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	return out.Success, nil
}
