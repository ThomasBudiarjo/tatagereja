package web

import (
	"io"
	"io/fs"
	"net/http"
	"strings"

	"github.com/tatagereja/tatagereja/internal/spa"
)

// spaHandler serves the embedded SolidJS SPA from the site root. Hashed asset
// files (under assets/) get a 1-year immutable cache so Cloudflare can serve
// them from the edge; every other path falls back to index.html (no-cache) so
// client-side routing and fresh deploys work.
func spaHandler() http.Handler {
	dist := spa.FS
	fileServer := http.FileServer(http.FS(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rel := strings.TrimPrefix(r.URL.Path, "/")
		if rel == "" {
			serveSPAIndex(w, dist)
			return
		}
		f, err := dist.Open(rel)
		if err != nil {
			serveSPAIndex(w, dist)
			return
		}
		_ = f.Close()
		if strings.HasPrefix(rel, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}

func serveSPAIndex(w http.ResponseWriter, dist fs.FS) {
	f, err := dist.Open("index.html")
	if err != nil {
		http.Error(w, "spa not built", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, f)
}
