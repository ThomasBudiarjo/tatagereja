package frontend

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// dist returns the embedded SPA filesystem rooted at the dist directory.
func dist() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		// Cannot happen: dist is embedded at compile time.
		panic(err)
	}
	return sub
}

// Available reports whether a built index.html is embedded.
func Available() bool {
	_, err := fs.Stat(dist(), "index.html")
	return err == nil
}

// Handler serves the embedded SPA. Hashed assets are served directly with a
// long immutable cache; unknown non-asset paths fall back to index.html for
// client-side routing. Requests under /api are never served here.
func Handler() http.Handler {
	root := dist()
	fileServer := http.FileServerFS(root)
	index, _ := fs.ReadFile(root, "index.html")

	serveIndex := func(w http.ResponseWriter, status int) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(status)
		_, _ = w.Write(index)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Defense in depth: the API is mounted separately, but if this handler
		// is ever reached for an API path, do not shadow it with the SPA.
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/api" {
			http.NotFound(w, r)
			return
		}

		clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if clean == "" || clean == "." {
			serveIndex(w, http.StatusOK)
			return
		}

		if f, err := root.Open(clean); err == nil {
			info, statErr := f.Stat()
			_ = f.Close()
			if statErr == nil && !info.IsDir() {
				if strings.HasPrefix(clean, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Missing file: a request for an asset (has an extension) is a real
		// 404; anything else is a client-side route -> serve the SPA shell.
		if path.Ext(clean) != "" {
			http.NotFound(w, r)
			return
		}
		serveIndex(w, http.StatusOK)
	})
}
