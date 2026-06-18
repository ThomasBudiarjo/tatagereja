package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
	"github.com/thomasbudiarjo/tatagereja/internal/http/middleware"
)

// minPasswordLen is the minimum accepted password length (UX guard; the real
// strength policy can grow later).
const minPasswordLen = 8

// apiHandlers holds the collaborators the auth endpoints need.
type apiHandlers struct {
	auth   *auth.Service
	secret []byte
	isProd bool
}

type userJSON struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func userResponse(u gen.User) userJSON {
	return userJSON{ID: u.ID, Email: u.Email}
}

type registerRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstileToken"` // accepted but not verified yet
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *apiHandlers) register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Email) == "" || len(req.Password) < minPasswordLen {
		writeError(w, http.StatusBadRequest, "email and a password of at least 8 characters are required")
		return
	}

	// Turnstile verification is deferred; the token is accepted and ignored.

	user, sid, err := h.auth.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrEmailTaken) {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not complete registration")
		return
	}

	http.SetCookie(w, auth.SessionCookie(h.secret, sid, h.isProd))
	writeJSON(w, http.StatusCreated, userResponse(user))
}

func (h *apiHandlers) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	user, sid, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		// Uniform error for every failure mode.
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	http.SetCookie(w, auth.SessionCookie(h.secret, sid, h.isProd))
	writeJSON(w, http.StatusOK, userResponse(user))
}

func (h *apiHandlers) logout(w http.ResponseWriter, r *http.Request) {
	if sid, ok := middleware.SessionIDFrom(r.Context()); ok {
		_ = h.auth.Logout(r.Context(), sid)
	}
	http.SetCookie(w, auth.ClearSessionCookie(h.isProd))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *apiHandlers) me(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, userResponse(*user))
}
