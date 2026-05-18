package middleware

import (
	"context"
	"net/http"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/internal/httpx"
)

// RequireAuth reads the session cookie, looks up the session in DB,
// and sets the user_id in the request context.
func RequireAuth(q sqlc.Querier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(auth.CookieName)
			if err != nil || c.Value == "" {
				httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			userID, err := auth.LookupSession(r.Context(), q, c.Value)
			if err != nil {
				httpx.WriteError(w, http.StatusUnauthorized, "invalid session")
				return
			}
			ctx := context.WithValue(r.Context(), auth.UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserID returns the authenticated user's ID from the request context.
// Returns 0 if no user is authenticated (should never happen inside an
// authenticated route).
func GetUserID(r *http.Request) int64 {
	v, _ := r.Context().Value(auth.UserIDKey).(int64)
	return v
}
