package web

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

type loginPageData struct {
	Email  string
	Errors map[string]string
	Flash  *Flash
}

type signupPageData struct {
	Email            string
	DisplayName      string
	ChurchName       string
	Errors           map[string]string
	TurnstileSiteKey string
}

func mountAuthRoutes(r chi.Router, cfg *config.Config, q *sqlc.Queries, rdr *Renderer) {
	r.Get("/login", func(w http.ResponseWriter, r *http.Request) {
		data := loginPageData{Errors: map[string]string{}}
		if f, ok := PopFlash(w, r); ok {
			data.Flash = &f
		}
		_ = rdr.Fragment(w, r, "login.html", data)
	})
	r.Post("/login", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		email := strings.ToLower(strings.TrimSpace(r.FormValue("email")))
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

	r.Get("/signup", func(w http.ResponseWriter, r *http.Request) {
		if isLoggedIn(r, q) {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		_ = rdr.Fragment(w, r, "signup.html", signupPageData{
			Errors:           map[string]string{},
			TurnstileSiteKey: cfg.TurnstileSiteKey,
		})
	})
	r.Post("/signup", func(w http.ResponseWriter, r *http.Request) {
		if isLoggedIn(r, q) {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		email := strings.ToLower(strings.TrimSpace(r.FormValue("email")))
		password := r.FormValue("password")
		passwordConfirm := r.FormValue("password_confirm")
		displayName := strings.TrimSpace(r.FormValue("display_name"))
		churchName := strings.TrimSpace(r.FormValue("church_name"))
		turnstileToken := r.FormValue("cf-turnstile-response")

		render := func(status int, errs map[string]string) {
			w.WriteHeader(status)
			_ = rdr.Fragment(w, r, "signup.html", signupPageData{
				Email:            email,
				DisplayName:      displayName,
				ChurchName:       churchName,
				Errors:           errs,
				TurnstileSiteKey: cfg.TurnstileSiteKey,
			})
		}

		errs := map[string]string{}
		Required(email, "Email", errs)
		ValidEmail(email, "Email", errs)
		MaxLen(email, 200, "Email", errs)
		Required(password, "Password", errs)
		MinLen(password, 8, "Password", errs)
		Required(passwordConfirm, "PasswordConfirm", errs)
		if passwordConfirm != "" && passwordConfirm != password {
			errs["PasswordConfirm"] = "Konfirmasi kata sandi tidak cocok"
		}
		Required(displayName, "DisplayName", errs)
		MaxLen(displayName, 200, "DisplayName", errs)
		Required(churchName, "ChurchName", errs)
		MaxLen(churchName, 200, "ChurchName", errs)
		if len(errs) > 0 {
			render(http.StatusUnprocessableEntity, errs)
			return
		}

		ok, err := auth.VerifyTurnstile(r.Context(), cfg.TurnstileSecretKey, turnstileToken, r.RemoteAddr)
		if err != nil || !ok {
			render(http.StatusUnprocessableEntity, map[string]string{"_form": "Verifikasi gagal, coba lagi."})
			return
		}

		if _, err := q.GetUserByEmail(r.Context(), email); err == nil {
			render(http.StatusUnprocessableEntity, map[string]string{"Email": "Email sudah terdaftar"})
			return
		}

		hash, err := auth.HashPassword(password)
		if err != nil {
			WriteServerError(w, err)
			return
		}

		_, err = q.CreateUser(r.Context(), sqlc.CreateUserParams{
			Email:        email,
			PasswordHash: hash,
			DisplayName:  displayName,
			ChurchName:   churchName,
			Timezone:     "Asia/Jakarta",
		})
		if err != nil {
			if IsUniqueViolation(err) {
				render(http.StatusUnprocessableEntity, map[string]string{"Email": "Email sudah terdaftar"})
				return
			}
			WriteServerError(w, err)
			return
		}

		RedirectWithFlash(w, r, "/login", "Akun dibuat, silakan masuk.", "success")
	})
}

func isLoggedIn(r *http.Request, q *sqlc.Queries) bool {
	c, err := r.Cookie(auth.CookieName)
	if err != nil || c.Value == "" {
		return false
	}
	_, err = auth.LookupSession(r.Context(), q, c.Value)
	return err == nil
}
