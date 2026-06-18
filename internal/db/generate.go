package db

// Regenerate the typed query layer (internal/db/gen) from the SQL in
// internal/db/queries against the schema in internal/db/migrations.
//
//go:generate go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 generate
