package router

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"

	"github.com/thomas/tatagereja/backend/internal/config"
	"github.com/thomas/tatagereja/backend/internal/handlers"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
)

func New(cfg *config.Config, database *sql.DB) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(appmw.Logging)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public
	r.Get("/health", handlers.Health(database))

	// Auth (rate-limited, public)
	r.Group(func(r chi.Router) {
		r.Use(httprate.LimitByIP(10, time.Minute))
		h := handlers.NewAuthHandler(cfg, database)
		r.Post("/auth/login", h.Login)
		r.Post("/auth/refresh", h.Refresh)
		r.Post("/auth/logout", h.Logout)
	})

	// Authenticated
	r.Group(func(r chi.Router) {
		r.Use(appmw.RequireAuth(cfg))
		r.Use(appmw.ChurchScope)

		auth := handlers.NewAuthHandler(cfg, database)
		r.Get("/me", auth.Me)

		jh := handlers.NewJemaatHandler(database)
		r.Route("/jemaat", func(r chi.Router) {
			r.Get("/", jh.List)
			r.Post("/", jh.Create)
			r.Get("/{id}", jh.Get)
			r.Put("/{id}", jh.Update)
			r.Delete("/{id}", jh.Delete)
		})

		ph := handlers.NewPelayanHandler(database)
		r.Route("/pelayan", func(r chi.Router) {
			r.Get("/", ph.List)
			r.Post("/", ph.Create)
			r.Get("/{id}", ph.Get)
			r.Put("/{id}", ph.Update)
			r.Delete("/{id}", ph.Delete)
		})

		sth := handlers.NewServiceTypeHandler(database)
		r.Route("/service-types", func(r chi.Router) {
			r.Get("/", sth.List)
			r.Post("/", sth.Create)
			r.Put("/{id}", sth.Update)
			r.Delete("/{id}", sth.Delete)
		})

		kh := handlers.NewKebaktianHandler(database)
		r.Route("/kebaktian", func(r chi.Router) {
			r.Get("/", kh.List)
			r.Post("/", kh.Create)
			r.Get("/{id}", kh.Get)
			r.Put("/{id}", kh.Update)
			r.Delete("/{id}", kh.Delete)
			r.Get("/{id}/jadwal", kh.GetJadwal)
			r.Put("/{id}/jadwal", kh.UpdateJadwal)
		})
	})

	return r
}
