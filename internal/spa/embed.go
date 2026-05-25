package spa

import (
	"embed"
	"io/fs"
)

// distFS holds the built SolidJS SPA produced by `vite build` (frontend/).
//
//go:embed all:dist
var distFS embed.FS

// FS exposes the SPA build output rooted at the dist/ subdirectory.
var FS fs.FS

func init() {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("spa: dist sub-fs: " + err.Error())
	}
	FS = sub
}
