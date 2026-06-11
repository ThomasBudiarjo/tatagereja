// Package app wires the HTTP router: API routes, auth middleware, the
// write-triggered backup hook, and SPA static serving.
package app

import (
	"database/sql"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/thomasbudiarjo/tatagereja/internal/attendance"
	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/backup"
	"github.com/thomasbudiarjo/tatagereja/internal/church"
	"github.com/thomasbudiarjo/tatagereja/internal/family"
	"github.com/thomasbudiarjo/tatagereja/internal/httpx"
	"github.com/thomasbudiarjo/tatagereja/internal/member"
	"github.com/thomasbudiarjo/tatagereja/internal/report"
	"github.com/thomasbudiarjo/tatagereja/internal/service"
)

func New(sqldb *sql.DB, bk *backup.Backup, distFS fs.FS, cookieSecure bool) http.Handler {
	authH := &auth.Handler{DB: sqldb, CookieSecure: cookieSecure}
	churchH := &church.Handler{DB: sqldb}
	memberH := &member.Handler{DB: sqldb}
	familyH := &family.Handler{DB: sqldb}
	serviceH := &service.Handler{DB: sqldb}
	attendanceH := &attendance.Handler{DB: sqldb}
	reportH := &report.Handler{DB: sqldb}

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(api chi.Router) {
		api.Use(noStore)
		api.Use(markDirtyOnWrite(bk))

		api.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			if err := sqldb.Ping(); err != nil {
				httpx.Error(w, http.StatusServiceUnavailable, "database unavailable")
				return
			}
			w.Write([]byte("OK"))
		})

		api.Post("/auth/register", authH.Register)
		api.Post("/auth/login", authH.Login)
		api.Post("/auth/logout", authH.Logout)

		api.Group(func(pr chi.Router) {
			pr.Use(authH.RequireAuth)

			pr.Get("/me", authH.Me)

			pr.Get("/church", churchH.Get)
			pr.Patch("/church", churchH.Update)

			pr.Get("/members", memberH.List)
			pr.Post("/members", memberH.Create)
			pr.Get("/members/{id}", memberH.Get)
			pr.Patch("/members/{id}", memberH.Update)
			pr.Delete("/members/{id}", memberH.Delete)

			pr.Get("/families", familyH.List)
			pr.Post("/families", familyH.Create)
			pr.Get("/families/{id}", familyH.Get)
			pr.Patch("/families/{id}", familyH.Update)
			pr.Delete("/families/{id}", familyH.Delete)
			pr.Post("/families/{id}/members", familyH.AddMember)
			pr.Delete("/families/{id}/members/{fmID}", familyH.RemoveMember)

			pr.Get("/services", serviceH.List)
			pr.Post("/services", serviceH.Create)
			pr.Get("/services/{id}", serviceH.Get)
			pr.Patch("/services/{id}", serviceH.Update)
			pr.Delete("/services/{id}", serviceH.Delete)
			pr.Get("/services/{id}/roles", serviceH.ListRoles)
			pr.Post("/services/{id}/roles", serviceH.CreateRole)
			pr.Delete("/services/{id}/roles/{roleID}", serviceH.DeleteRole)
			pr.Get("/services/{id}/attendance", attendanceH.Get)
			pr.Post("/services/{id}/attendance", attendanceH.Save)

			pr.Get("/reports/dashboard", reportH.Dashboard)
			pr.Get("/reports/members.csv", reportH.MembersCSV)
			pr.Get("/reports/attendance.csv", reportH.AttendanceCSV)
		})

		api.NotFound(func(w http.ResponseWriter, _ *http.Request) {
			httpx.Error(w, http.StatusNotFound, "not found")
		})
	})

	r.NotFound(spaHandler(distFS))
	return r
}

// noStore keeps API responses out of Cloudflare and browser caches.
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// markDirtyOnWrite schedules a debounced Litestream sync after every
// successful mutating API request (PRD §5.2).
func markDirtyOnWrite(bk *backup.Backup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			if ww.Status() < 400 {
				bk.MarkDirty()
			}
		})
	}
}

// spaHandler serves the embedded Vite build: hashed assets get immutable
// caching, everything else falls back to index.html (no-cache) so client-side
// routing works on hard refresh.
func spaHandler(distFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(distFS))
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if f, err := distFS.Open(path); err == nil {
				f.Close()
				if strings.HasPrefix(path, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else {
					w.Header().Set("Cache-Control", "no-cache")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback
		index, err := fs.ReadFile(distFS, "index.html")
		if err != nil {
			http.Error(w, "frontend build missing", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(index)
	}
}
