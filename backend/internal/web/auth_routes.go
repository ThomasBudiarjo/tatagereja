package web

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

type loginPageData struct {
	Email  string
	Errors map[string]string
}

func mountAuthRoutes(r chi.Router, cfg *config.Config, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/login", func(w http.ResponseWriter, r *http.Request) {
		_ = rdr.Fragment(w, r, "login.html", loginPageData{Errors: map[string]string{}})
	})
	r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		email := strings.TrimSpace(r.FormValue("email"))
		password := r.FormValue("password")
		errs := map[string]string{}
		Required(email, "Email", errs)
		ValidEmail(email, "Email", errs)
		Required(password, "Password", errs)
		if len(errs) > 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = rdr.Fragment(w, r, "login.html", loginPageData{Email: email, Errors: errs})
			return
		}

		user, err := q.GetUserByEmail(r.Context(), email)
		if err != nil || !auth.VerifyPassword(user.PasswordHash, password) {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = rdr.Fragment(w, r, "login.html", loginPageData{
				Email:  email,
				Errors: map[string]string{"Email": "Email atau kata sandi salah"},
			})
			return
		}

		token, err := auth.CreateSession(r.Context(), q, user.ID, time.Duration(config.SessionTTLDays)*24*time.Hour)
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		auth.SetCookie(w, token, cfg.CookieSecure())
		http.Redirect(w, r, "/", http.StatusSeeOther)
	})
	r.Post("/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(auth.CookieName); err == nil && c.Value != "" {
			_ = auth.DeleteSession(r.Context(), q, c.Value)
		}
		auth.ClearCookie(w)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
	})
}
