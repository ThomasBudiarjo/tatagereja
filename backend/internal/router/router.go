package router

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/internal/health"
	"github.com/tatagereja/tatagereja/backend/internal/jadwal"
	"github.com/tatagereja/tatagereja/backend/internal/jemaat"
	"github.com/tatagereja/tatagereja/backend/internal/kebaktian"
	"github.com/tatagereja/tatagereja/backend/internal/keluarga"
	appmw "github.com/tatagereja/tatagereja/backend/internal/middleware"
	"github.com/tatagereja/tatagereja/backend/internal/pelayan"
	"github.com/tatagereja/tatagereja/backend/internal/servicetypes"
)

func New(cfg *config.Config, database *sql.DB) http.Handler {
	queries := sqlc.New(database)

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(appmw.Logging)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", health.New(database).Handle)

	ah := auth.NewHandler(cfg, queries, database)
	r.Post("/auth/login", ah.Login)
	r.Post("/auth/logout", ah.Logout)

	r.Group(func(r chi.Router) {
		r.Use(appmw.RequireAuth(queries))

		r.Get("/me", ah.Me)

		jh := jemaat.NewHandler(queries, database)
		r.Route("/jemaat", func(r chi.Router) {
			r.Get("/", jh.List)
			r.Post("/", jh.Create)
			r.Get("/{id}", jh.Get)
			r.Put("/{id}", jh.Update)
			r.Delete("/{id}", jh.Delete)
		})

		kh := keluarga.NewHandler(queries, database)
		r.Route("/keluarga", func(r chi.Router) {
			r.Get("/", kh.List)
			r.Post("/", kh.Create)
			r.Get("/{id}", kh.Get)
			r.Put("/{id}", kh.Update)
			r.Delete("/{id}", kh.Delete)
		})

		ph := pelayan.NewHandler(queries, database)
		r.Route("/pelayan", func(r chi.Router) {
			r.Get("/", ph.List)
			r.Post("/", ph.Create)
			r.Get("/{id}", ph.Get)
			r.Put("/{id}", ph.Update)
			r.Delete("/{id}", ph.Delete)
		})

		sth := servicetypes.NewHandler(queries, database)
		r.Route("/service-types", func(r chi.Router) {
			r.Get("/", sth.List)
			r.Post("/", sth.Create)
			r.Put("/{id}", sth.Update)
			r.Delete("/{id}", sth.Delete)
		})

		kbh := kebaktian.NewHandler(queries, database)
		jdh := jadwal.NewHandler(queries, database)
		r.Route("/kebaktian", func(r chi.Router) {
			r.Get("/", kbh.List)
			r.Post("/", kbh.Create)
			r.Get("/{id}", kbh.Get)
			r.Put("/{id}", kbh.Update)
			r.Delete("/{id}", kbh.Delete)
			r.Get("/{id}/jadwal", jdh.Get)
			r.Put("/{id}/jadwal", jdh.Replace)
		})
	})

	return r
}
