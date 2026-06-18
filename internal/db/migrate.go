package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
)

// Migrate applies any unapplied SQL migrations from the embedded migrations
// directory, in filename order. Each migration runs in its own transaction and
// is recorded in schema_migrations. It returns changed=true when at least one
// migration was applied this call.
func Migrate(conn *sql.DB) (changed bool, err error) {
	if _, err = conn.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return false, fmt.Errorf("ensure schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return false, fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var exists int
		if err = conn.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=?", name).Scan(&exists); err != nil {
			return changed, fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists > 0 {
			continue
		}

		body, readErr := fs.ReadFile(migrationsFS, "migrations/"+name)
		if readErr != nil {
			return changed, fmt.Errorf("read migration %s: %w", name, readErr)
		}

		if err = applyMigration(conn, name, string(body)); err != nil {
			return changed, err
		}
		changed = true
	}
	return changed, nil
}

func applyMigration(conn *sql.DB, name, body string) (err error) {
	tx, err := conn.Begin()
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", name, err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if _, err = tx.Exec(body); err != nil {
		return fmt.Errorf("exec migration %s: %w", name, err)
	}
	if _, err = tx.Exec("INSERT INTO schema_migrations (version) VALUES (?)", name); err != nil {
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", name, err)
	}
	return nil
}
