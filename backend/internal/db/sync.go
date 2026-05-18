package db

import (
	"database/sql"
	_ "embed"
	"fmt"
)

//go:embed schema.sql
var schemaSQL string

// Apply executes schema.sql. All CREATE TABLE statements use IF NOT EXISTS,
// so this is idempotent and safe to call on every boot.
func Apply(database *sql.DB) error {
	if _, err := database.Exec(schemaSQL); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	return nil
}
