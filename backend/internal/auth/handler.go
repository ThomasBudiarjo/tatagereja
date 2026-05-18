package auth

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"

	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/internal/httpx"
)

type Handler struct {
	cfg      *config.Config
	q        sqlc.Querier
	db       *sql.DB
	validate *validator.Validate
}

func NewHandler(cfg *config.Config, q sqlc.Querier, db *sql.DB) *Handler {
	return &Handler{cfg: cfg, q: q, db: db, validate: validator.New()}
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email,max=200"`
	Password string `json:"password" validate:"required,min=1,max=200"`
}

type userResponse struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	ChurchName  string `json:"church_name"`
	Timezone    string `json:"timezone"`
}

func toUserResponse(u sqlc.User) userResponse {
	return userResponse{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		ChurchName:  u.ChurchName,
		Timezone:    u.Timezone,
	}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if err := h.validate.Struct(&req); err != nil {
		httpx.WriteValidationError(w, err)
		return
	}
	u, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	if !VerifyPassword(u.PasswordHash, req.Password) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := CreateSession(r.Context(), h.q, u.ID, h.cfg.SessionTTL)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "session create failed")
		return
	}
	SetSessionCookie(w, h.cfg, token)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(u)})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(CookieName)
	if err == nil && c.Value != "" {
		_ = DeleteSession(r.Context(), h.q, c.Value)
	}
	ClearSessionCookie(w, h.cfg)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDCtxKey{}).(int64)
	if !ok || userID == 0 {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	u, err := h.q.GetUserByID(r.Context(), userID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "db error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"user": toUserResponse(u)})
}

type userIDCtxKey struct{}

// UserIDKey is the request-context key used by middleware.
var UserIDKey = userIDCtxKey{}
