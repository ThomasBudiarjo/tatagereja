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
	"github.com/thomas/tatagereja/backend/internal/db/sqlc"
	"github.com/thomas/tatagereja/backend/internal/handlers"
	appmw "github.com/thomas/tatagereja/backend/internal/middleware"
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
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", handlers.Health(database))

	r.Group(func(r chi.Router) {
		r.Use(httprate.LimitByIP(10, time.Minute))
		h := handlers.NewAuthHandler(cfg, queries)
		r.Post("/api/auth/login", h.Login)
		r.Post("/api/auth/refresh", h.Refresh)
		r.Post("/api/auth/logout", h.Logout)
	})

	r.Group(func(r chi.Router) {
		r.Use(appmw.RequireAuth(cfg))
		r.Use(appmw.ChurchScope)

		h := handlers.NewAuthHandler(cfg, queries)
		r.Get("/api/me", h.Me)
	})

	return r
}
