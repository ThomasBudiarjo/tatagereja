package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/config"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
	"golang.org/x/crypto/bcrypt"
)

const CookieName = "tatagereja_session"
const sessionTTL = 7 * 24 * time.Hour

func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
	if err != nil {
		return "", fmt.Errorf("HashPassword: %w", err)
	}
	return string(b), nil
}

func VerifyPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("newToken: %w", err)
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func CreateSession(ctx context.Context, q *sqlc.Queries, userID int64) (string, error) {
	token, err := newToken()
	if err != nil {
		return "", err
	}
	expiresAt := time.Now().UTC().Add(sessionTTL).Format(time.RFC3339)
	_, err = q.CreateSession(ctx, sqlc.CreateSessionParams{
		Token:     token,
		UserID:    userID,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return "", fmt.Errorf("CreateSession: %w", err)
	}
	return token, nil
}

func LookupSession(ctx context.Context, q *sqlc.Queries, token string) (int64, error) {
	s, err := q.GetSession(ctx, token)
	if err != nil {
		return 0, fmt.Errorf("LookupSession: %w", err)
	}
	return s.UserID, nil
}

func DeleteSession(ctx context.Context, q *sqlc.Queries, token string) error {
	return q.DeleteSession(ctx, token)
}

func SetCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(sessionTTL.Seconds()),
	})
}

func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

type Renderer interface {
	Page(w http.ResponseWriter, r *http.Request, name string, data any)
}

func MountRoutes(r chi.Router, cfg config.Config, q *sqlc.Queries, rdr Renderer) {
	r.Get("/login", handleLoginForm(rdr))
	r.Post("/login", handleLogin(cfg, q, rdr))
	r.Post("/logout", handleLogout(q))
}

func handleLoginForm(rdr Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rdr.Page(w, r, "login", map[string]any{})
	}
}

func handleLogin(cfg config.Config, q *sqlc.Queries, rdr Renderer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		email := strings.TrimSpace(r.FormValue("email"))
		password := r.FormValue("password")

		errMsg := ""
		if email == "" || password == "" {
			errMsg = "Email dan password wajib diisi."
		}

		if errMsg == "" {
			user, err := q.GetUserByEmail(r.Context(), email)
			if errors.Is(err, sql.ErrNoRows) || !VerifyPassword(user.PasswordHash, password) {
				errMsg = "Email atau password salah."
			} else if err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			} else {
				token, err := CreateSession(r.Context(), q, user.ID)
				if err != nil {
					http.Error(w, "Internal Server Error", http.StatusInternalServerError)
					return
				}
				SetCookie(w, token, cfg.CookieSecure)
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}
		}

		w.WriteHeader(http.StatusUnprocessableEntity)
		rdr.Page(w, r, "login", map[string]any{"Error": errMsg, "Email": email})
	}
}

func handleLogout(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(CookieName)
		if err == nil && c.Value != "" {
			_ = DeleteSession(r.Context(), q, c.Value)
		}
		ClearCookie(w)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	}
}
