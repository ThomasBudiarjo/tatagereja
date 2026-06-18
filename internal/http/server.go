// Package http builds the application HTTP handler: chi router, middleware,
// the JSON API, and the embedded SPA fallback.
package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/http/middleware"
)

// maxBodyBytes caps JSON request bodies for API handlers.
const maxBodyBytes = 1 << 20 // 1 MiB

// Deps carries the collaborators the router needs. It is extended as later
// tasks add the database, auth service, and sessions.
type Deps struct {
	Config config.Config
	// Store is the data-access layer.
	Store *db.Store
	// Auth, when non-nil, mounts the auth + /api/me endpoints.
	Auth *auth.Service
	// Sessions resolves the signed session cookie to a user.
	Sessions *auth.SessionService
	// Frontend, when non-nil, serves the embedded SPA as the catch-all route.
	Frontend http.Handler
}

// NewRouter builds the application handler.
func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.SecurityHeaders(deps.Config.IsProduction()))

	r.With(middleware.NoStore).Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		api.Use(middleware.NoStore)
		api.Use(middleware.MaxBytes(maxBodyBytes))
		if deps.Sessions != nil {
			api.Use(middleware.Session(deps.Config.SessionSecret, deps.Sessions))
		}

		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusNotFound, "not found")
		})
		api.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		})

		if deps.Auth != nil {
			h := &apiHandlers{
				auth:   deps.Auth,
				secret: deps.Config.SessionSecret,
				isProd: deps.Config.IsProduction(),
			}
			api.With(middleware.RequireJSON).Post("/auth/register", h.register)
			api.With(middleware.RequireJSON).Post("/auth/login", h.login)
			api.Post("/auth/logout", h.logout)
			api.Get("/me", h.me)
		}
	})

	if deps.Frontend != nil {
		r.Handle("/*", deps.Frontend)
	}

	return r
}
