// Package frontend embeds the built Vite+ SPA and serves it with SPA fallback.
//
// The dist directory always contains at least a committed placeholder
// index.html so the Go module compiles before `task fe:build` has run. A real
// build overwrites dist with hashed assets, which are then embedded into the
// binary.
package frontend

import "embed"

//go:embed all:dist
var distFS embed.FS
