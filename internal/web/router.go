package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func NewRouter(cfg *config.Config, database *sql.DB) http.Handler {
	q := sqlc.New(database)
	rdr := NewRenderer()

	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.RealIP,
		Logging,
		middleware.Recoverer,
		MethodOverride,
		middleware.Timeout(30*time.Second),
	)

	r.Get("/health", healthHandler(database))
	mountAuthRoutes(r, cfg, q, rdr)

	r.Group(func(r chi.Router) {
		r.Use(RequireAuth(q))
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "/jemaat", http.StatusFound)
		})
		mountJemaat(r, q, rdr)
		mountKeluarga(r, q, rdr)
		mountPelayan(r, q, database, rdr)
		mountServiceTypes(r, q, rdr)
		mountKebaktian(r, q, rdr)
		mountJadwal(r, q, database, rdr)
	})

	return r
}

func healthHandler(database *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		w.Header().Set("Content-Type", "application/json")
		if err := database.PingContext(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"status": "degraded",
				"db":     "error",
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
			"db":     "ok",
		})
	}
}
