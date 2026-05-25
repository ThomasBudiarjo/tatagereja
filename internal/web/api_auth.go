package web

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type signupReq struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
	DisplayName     string `json:"display_name"`
	ChurchName      string `json:"church_name"`
	TurnstileToken  string `json:"turnstile_token"`
}

func mountAPIAuthPublic(r chi.Router, cfg *config.Config, q *sqlc.Queries) {
	r.Post("/auth/login", apiLogin(cfg, q))
	r.Post("/auth/signup", apiSignup(cfg, q))
	r.Post("/auth/logout", apiLogout(q))
	r.Get("/config", apiConfig(cfg))
}

func apiConfig(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"turnstile_site_key": cfg.TurnstileSiteKey,
		})
	}
}

func apiMe(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := LoadUser(r.Context(), q, r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserDTO(user)})
	}
}

func apiLogin(cfg *config.Config, q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req loginReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}
		email := strings.ToLower(strings.TrimSpace(req.Email))
		errs := map[string]string{}
		Required(email, "Email", errs)
		ValidEmail(email, "Email", errs)
		Required(req.Password, "Password", errs)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}

		user, err := q.GetUserByEmail(r.Context(), email)
		if err != nil || !auth.VerifyPassword(user.PasswordHash, req.Password) {
			writeValidationErrors(w, map[string]string{"Email": "Email atau kata sandi salah"})
			return
		}

		token, err := auth.CreateSession(r.Context(), q, user.ID, time.Duration(config.SessionTTLDays)*24*time.Hour)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}
		auth.SetCookie(w, token, cfg.CookieSecure())
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserDTO(user)})
	}
}

func apiLogout(q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(auth.CookieName); err == nil && c.Value != "" {
			_ = auth.DeleteSession(r.Context(), q, c.Value)
		}
		auth.ClearCookie(w)
		writeJSON(w, http.StatusNoContent, nil)
	}
}

func apiSignup(cfg *config.Config, q *sqlc.Queries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req signupReq
		if err := decodeJSON(w, r, &req); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid request")
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		displayName := strings.TrimSpace(req.DisplayName)
		churchName := strings.TrimSpace(req.ChurchName)

		errs := map[string]string{}
		Required(email, "Email", errs)
		ValidEmail(email, "Email", errs)
		MaxLen(email, 200, "Email", errs)
		Required(req.Password, "Password", errs)
		MinLen(req.Password, 8, "Password", errs)
		Required(req.PasswordConfirm, "PasswordConfirm", errs)
		if req.PasswordConfirm != "" && req.PasswordConfirm != req.Password {
			errs["PasswordConfirm"] = "Konfirmasi kata sandi tidak cocok"
		}
		Required(displayName, "DisplayName", errs)
		MaxLen(displayName, 200, "DisplayName", errs)
		Required(churchName, "ChurchName", errs)
		MaxLen(churchName, 200, "ChurchName", errs)
		if len(errs) > 0 {
			writeValidationErrors(w, errs)
			return
		}

		ok, err := auth.VerifyTurnstile(r.Context(), cfg.TurnstileSecretKey, req.TurnstileToken, r.RemoteAddr)
		if err != nil || !ok {
			writeValidationErrors(w, map[string]string{"_form": "Verifikasi gagal, coba lagi."})
			return
		}

		if _, err := q.GetUserByEmail(r.Context(), email); err == nil {
			writeValidationErrors(w, map[string]string{"Email": "Email sudah terdaftar"})
			return
		}

		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}

		if _, err := q.CreateUser(r.Context(), sqlc.CreateUserParams{
			Email:        email,
			PasswordHash: hash,
			DisplayName:  displayName,
			ChurchName:   churchName,
			Timezone:     "Asia/Jakarta",
		}); err != nil {
			if IsUniqueViolation(err) {
				writeValidationErrors(w, map[string]string{"Email": "Email sudah terdaftar"})
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "server error")
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{"message": "Akun dibuat, silakan masuk."})
	}
}
