// Package web embeds the built SolidJS frontend. The dist directory is
// produced by `npm run build`; a committed placeholder index.html keeps
// `go build` working before the first frontend build.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the frontend filesystem rooted at the dist directory.
func Dist() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
