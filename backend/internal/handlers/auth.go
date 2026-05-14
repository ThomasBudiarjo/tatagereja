package handlers

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-playground/validator/v10"

	"github.com/thomas/tatagereja/backend/internal/auth"
	"github.com/thomas/tatagereja/backend/internal/config"
	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
	"github.com/thomas/tatagereja/backend/internal/models"
)

type AuthHandler struct {
	cfg      *config.Config
	q        *sqlc.Queries
	validate *validator.Validate
}

func NewAuthHandler(cfg *config.Config, db *sql.DB) *AuthHandler {
	return &AuthHandler{cfg: cfg, q: sqlc.New(db), validate: validator.New()}
}

func (h *AuthHandler) cookieSecure() bool {
	return h.cfg.Env == "production"
}

func (h *AuthHandler) cookieSameSite() http.SameSite {
	if h.cfg.Env == "production" {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

func (h *AuthHandler) setAccessCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "shepherd_session",
		Value:    token,
		Path:     "/",
		MaxAge:   int(auth.AccessTokenTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure(),
		SameSite: h.cookieSameSite(),
	})
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "shepherd_refresh",
		Value:    token,
		Path:     "/auth",
		MaxAge:   int(auth.RefreshTokenTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure(),
		SameSite: h.cookieSameSite(),
	})
}

func (h *AuthHandler) clearCookies(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: "shepherd_session", Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: h.cookieSecure(), SameSite: h.cookieSameSite(),
	})
	http.SetCookie(w, &http.Cookie{
		Name: "shepherd_refresh", Value: "", Path: "/auth", MaxAge: -1,
		HttpOnly: true, Secure: h.cookieSecure(), SameSite: h.cookieSameSite(),
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		writeValidationError(w, err)
		return
	}

	user, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		slog.Error("get user by email", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if !auth.VerifyPassword(user.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	accessToken, err := auth.IssueAccessToken(h.cfg.JWTSecret, user.ID, user.ChurchID, user.Role)
	if err != nil {
		slog.Error("issue access token", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	refreshToken, err := auth.IssueRefreshToken(h.cfg.JWTSecret, user.ID, user.ChurchID)
	if err != nil {
		slog.Error("issue refresh token", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.setAccessCookie(w, accessToken)
	h.setRefreshCookie(w, refreshToken)

	_ = h.q.UpdateLastLogin(r.Context(), user.ID)

	writeJSON(w, http.StatusOK, models.LoginResponse{
		User: models.UserResponse{
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Role:        user.Role,
			ChurchID:    user.ChurchID,
		},
	})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("shepherd_refresh")
	if err != nil {
		writeError(w, http.StatusUnauthorized, "no refresh token")
		return
	}

	claims, err := auth.ParseToken(cookie.Value, h.cfg.JWTSecret)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	user, err := h.q.GetUserByID(r.Context(), claims.UserID)
	if err != nil || user.IsActive == 0 {
		writeError(w, http.StatusUnauthorized, "user not found or inactive")
		return
	}

	accessToken, err := auth.IssueAccessToken(h.cfg.JWTSecret, user.ID, user.ChurchID, user.Role)
	if err != nil {
		slog.Error("issue access token", "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	h.setAccessCookie(w, accessToken)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := appmw.GetUserID(r)

	user, err := h.q.GetUserByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, models.UserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
		ChurchID:    user.ChurchID,
	})
}
