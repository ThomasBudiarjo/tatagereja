package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

// writeJSON writes v as a JSON response with the given status. All API
// responses are marked private/no-store so neither Cloudflare nor the browser
// caches per-user data — the SPA's query cache is the source of truth.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

// writeValidationErrors mirrors the 422 + per-field error convention used by
// the existing HTML handlers.
func writeValidationErrors(w http.ResponseWriter, errs map[string]string) {
	writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"errors": errs})
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	return dec.Decode(dst)
}

// RequireAuthAPI is the API counterpart of RequireAuth: it returns 401 JSON
// instead of redirecting to /login.
func RequireAuthAPI(q *sqlc.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(auth.CookieName)
			if err != nil || c.Value == "" {
				writeJSONError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			uid, err := auth.LookupSession(r.Context(), q, c.Value)
			if err != nil {
				auth.ClearCookie(w)
				writeJSONError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, uid)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func nullStrPtr(ns sql.NullString) *string {
	if ns.Valid {
		return &ns.String
	}
	return nil
}

func nullInt64Ptr(ni sql.NullInt64) *int64 {
	if ni.Valid {
		return &ni.Int64
	}
	return nil
}

type userDTO struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	ChurchName  string `json:"church_name"`
	Timezone    string `json:"timezone"`
}

func toUserDTO(u sqlc.User) userDTO {
	return userDTO{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		ChurchName:  u.ChurchName,
		Timezone:    u.Timezone,
	}
}
