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
	"github.com/thomasbudiarjo/tatagereja/internal/scheduling"
)

// maxBodyBytes caps JSON request bodies for API handlers.
const maxBodyBytes = 1 << 20 // 1 MiB

// Auth endpoint rate limit: requests per window, per client IP.
const (
	authRateMax    = 10
	authRateWindow = time.Minute
)

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
	// Scheduling, when non-nil, mounts the worship service roster endpoints.
	Scheduling *scheduling.Service
	// TrustedOrigins are extra origins allowed by cross-origin protection
	// (e.g. the production site origin). Same-origin requests pass regardless.
	TrustedOrigins []string
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
		api.Use(middleware.CrossOrigin(deps.TrustedOrigins))
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
			throttle := middleware.AuthThrottle(authRateMax, authRateWindow)
			api.With(throttle, middleware.RequireJSON).Post("/auth/register", h.register)
			api.With(throttle, middleware.RequireJSON).Post("/auth/login", h.login)
			api.Post("/auth/logout", h.logout)
			api.Get("/me", h.me)
		}

		if deps.Store != nil {
			persons := &personHandlers{store: deps.Store}
			roles := &roleHandlers{store: deps.Store}
			api.Group(func(pr chi.Router) {
				pr.Use(middleware.RequireUser)

				pr.Get("/pelayanan-types", roles.listPelayananTypes)

				pr.Get("/roles", roles.list)
				pr.Post("/roles", roles.create)
				pr.Put("/roles/{code}", roles.update)
				pr.Delete("/roles/{code}", roles.delete)

				pr.Get("/persons", persons.list)
				pr.Post("/persons", persons.create)
				pr.Get("/persons/{id}", persons.get)
				pr.Put("/persons/{id}", persons.update)
				pr.Delete("/persons/{id}", persons.delete)

				if deps.Scheduling != nil {
					services := &serviceHandlers{scheduling: deps.Scheduling}
					pr.Get("/services", services.list)
					pr.Post("/services", services.create)
					pr.Get("/services/{id}", services.get)
					pr.Put("/services/{id}", services.update)
					pr.Delete("/services/{id}", services.delete)
					pr.Post("/services/{id}/assignments", services.assign)
					pr.Delete("/services/{id}/assignments/{assignmentId}", services.unassign)
				}
			})
		}
	})

	if deps.Frontend != nil {
		r.Handle("/*", deps.Frontend)
	}

	return r
}
