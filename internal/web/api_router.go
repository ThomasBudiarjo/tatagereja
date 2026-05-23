package web

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

// mountAPI mounts the JSON API under /api. Public auth endpoints sit outside
// the auth group; everything else requires a valid session and returns 401
// JSON (not a redirect) when unauthenticated.
func mountAPI(r chi.Router, cfg *config.Config, q *sqlc.Queries) {
	r.Route("/api", func(r chi.Router) {
		mountAPIAuthPublic(r, cfg, q)

		r.Group(func(r chi.Router) {
			r.Use(RequireAuthAPI(q))
			r.Get("/me", apiMe(q))
			mountAPIJemaat(r, q)
			mountAPIKeluarga(r, q)
		})

		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeJSONError(w, http.StatusNotFound, "not found")
		})
	})
}
