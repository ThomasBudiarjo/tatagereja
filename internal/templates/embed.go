package templates

import "embed"

// FS holds HTML templates embedded for the web renderer.
//
//go:embed all:*
var FS embed.FS
