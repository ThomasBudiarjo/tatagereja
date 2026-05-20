package web

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/config"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func NewRouter(cfg config.Config, database *sql.DB) http.Handler {
	q := sqlc.New(database)
	rdr := NewRenderer()

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(LoggingMiddleware)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/health", healthHandler(database))
	auth.MountRoutes(r, cfg, q, rdr)

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

		dbStatus := "ok"
		if err := database.PingContext(ctx); err != nil {
			dbStatus = "error"
		}

		status := "ok"
		code := http.StatusOK
		if dbStatus != "ok" {
			status = "degraded"
			code = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": status, "db": dbStatus})
	}
}
