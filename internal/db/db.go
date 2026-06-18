// Package db owns the SQLite connection, migrations, seeds, and the
// replication-aware data access Store. The driver is pure-Go modernc.org/sqlite
// so the binary builds without cgo.
package db

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// Open opens (creating if needed) the SQLite database at path with the WAL
// settings required for the single-writer deployment. Parent directories are
// created automatically.
func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	// modernc accepts repeated _pragma query params applied on each connection.
	dsn := "file:" + path + "?" + url.Values{
		"_pragma": {
			"busy_timeout(5000)",
			"journal_mode(WAL)",
			"foreign_keys(ON)",
			"synchronous(NORMAL)",
		},
	}.Encode()

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// Single writer: WAL allows concurrent readers, but the app keeps one
	// connection to avoid SQLITE_BUSY churn on writes.
	conn.SetMaxOpenConns(1)

	if err := conn.Ping(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return conn, nil
}

// Ping verifies the database connection is alive.
func Ping(conn *sql.DB) error {
	return conn.Ping()
}
