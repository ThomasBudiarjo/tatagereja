package web

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

type ctxKey int

const (
	userIDKey  ctxKey = 1
	userObjKey ctxKey = 2
)

func RequireAuth(q *sqlc.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(auth.CookieName)
			if err != nil || c.Value == "" {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			uid, err := auth.LookupSession(r.Context(), q, c.Value)
			if err != nil {
				auth.ClearCookie(w)
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			user, err := q.GetUserByID(r.Context(), uid)
			if err != nil {
				auth.ClearCookie(w)
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, uid)
			ctx = context.WithValue(ctx, userObjKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserID(r *http.Request) int64 {
	v, _ := r.Context().Value(userIDKey).(int64)
	return v
}

func userFromCtx(r *http.Request) any {
	return r.Context().Value(userObjKey)
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}
