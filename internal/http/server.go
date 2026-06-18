// Package http builds the application HTTP handler: chi router, middleware,
// the JSON API, and the embedded SPA fallback.
package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/http/middleware"
)

// maxBodyBytes caps JSON request bodies for API handlers.
const maxBodyBytes = 1 << 20 // 1 MiB

// Deps carries the collaborators the router needs. It is extended as later
// tasks add the database, auth service, and sessions.
type Deps struct {
	Config config.Config
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
		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusNotFound, "not found")
		})
		api.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		})
	})

	if deps.Frontend != nil {
		r.Handle("/*", deps.Frontend)
	}

	return r
}
