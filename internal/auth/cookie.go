package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
)

// SessionCookieName is the name of the session cookie.
const SessionCookieName = "tg_session"

// DefaultSessionTTL is how long a session and its cookie remain valid.
const DefaultSessionTTL = 30 * 24 * time.Hour

// NewSessionID returns a cryptographically random, URL-safe session id.
func NewSessionID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("auth: cannot read random bytes: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// SignValue returns "value.signature", where signature is an HMAC-SHA256 of the
// value keyed by secret. Used to make the session cookie tamper-evident.
func SignValue(secret []byte, value string) string {
	return value + "." + sign(secret, value)
}

// VerifyValue checks a signed value and returns the original value when the
// signature is valid.
func VerifyValue(secret []byte, signed string) (string, bool) {
	i := strings.LastIndexByte(signed, '.')
	if i < 0 {
		return "", false
	}
	value, sig := signed[:i], signed[i+1:]
	want, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return "", false
	}
	got, err := base64.RawURLEncoding.DecodeString(sign(secret, value))
	if err != nil {
		return "", false
	}
	if hmac.Equal(got, want) {
		return value, true
	}
	return "", false
}

func sign(secret []byte, value string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(value))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// SessionCookie builds the signed session cookie for the given session id.
func SessionCookie(secret []byte, sessionID string, isProd bool) *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookieName,
		Value:    SignValue(secret, sessionID),
		Path:     "/",
		HttpOnly: true,
		Secure:   isProd,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(DefaultSessionTTL / time.Second),
	}
}

// ClearSessionCookie returns a cookie that expires the session cookie.
func ClearSessionCookie(isProd bool) *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   isProd,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	}
}
