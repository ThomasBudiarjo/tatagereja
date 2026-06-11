// Package auth implements email+password authentication with DB-backed
// session cookies, plus the middleware that scopes every request to the
// authenticated user's church (the multi-tenancy boundary).
package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
)

const (
	cookieName  = "tg_session"
	sessionTTL  = 30 * 24 * time.Hour
	timeLayout  = time.RFC3339
)

type User struct {
	ID       string `json:"id"`
	ChurchID string `json:"church_id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type ctxKey struct{}

// UserFrom returns the authenticated user stored by RequireAuth.
func UserFrom(r *http.Request) User {
	return r.Context().Value(ctxKey{}).(User)
}

// ChurchID is the tenant scope for the current request. Every query in every
// handler MUST filter by this value.
func ChurchID(r *http.Request) string {
	return UserFrom(r).ChurchID
}

type Handler struct {
	DB           *sql.DB
	CookieSecure bool
}

// RequireAuth validates the session cookie and injects the user into the
// request context. Requests without a valid session get a 401.
func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(cookieName)
		if err != nil || c.Value == "" {
			httpx.Error(w, http.StatusUnauthorized, "authentication required")
			return
		}
		var u User
		var expiresAt string
		err = h.DB.QueryRow(`
			SELECT u.id, u.church_id, u.name, u.email, u.role, s.expires_at
			FROM sessions s JOIN users u ON u.id = s.user_id
			WHERE s.token = ?`, c.Value).
			Scan(&u.ID, &u.ChurchID, &u.Name, &u.Email, &u.Role, &expiresAt)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "invalid session")
			return
		}
		if exp, err := time.Parse(timeLayout, expiresAt); err != nil || time.Now().After(exp) {
			h.DB.Exec(`DELETE FROM sessions WHERE token = ?`, c.Value)
			httpx.Error(w, http.StatusUnauthorized, "session expired")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	})
}

func (h *Handler) createSession(w http.ResponseWriter, userID string) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := hex.EncodeToString(raw)
	expires := time.Now().Add(sessionTTL)
	if _, err := h.DB.Exec(`INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
		token, userID, expires.UTC().Format(timeLayout), db.Now()); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   h.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

func (h *Handler) clearSession(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
		h.DB.Exec(`DELETE FROM sessions WHERE token = ?`, c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}
