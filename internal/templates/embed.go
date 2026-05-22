package templates

import (
	"embed"
	"io/fs"
)

// FS holds HTML templates embedded for the web renderer.
//
//go:embed all:*
var FS embed.FS

// StaticFS exposes static assets (styles.css, htmx.min.js, etc.) rooted at the
// static/ subdirectory so handlers can serve them from "/static/".
var StaticFS fs.FS

func init() {
	sub, err := fs.Sub(FS, "static")
	if err != nil {
		panic("templates: static sub-fs: " + err.Error())
	}
	StaticFS = sub
}
