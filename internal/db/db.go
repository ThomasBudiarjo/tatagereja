package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const defaultPath = "/tmp/tatagereja.db"

// Path returns the SQLite database file location, configurable via the
// DATABASE_PATH environment variable.
func Path() string {
	if p := os.Getenv("DATABASE_PATH"); p != "" {
		return p
	}
	return defaultPath
}

// Open opens the SQLite database with WAL mode, foreign keys, and a busy
// timeout enabled.
func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
	}

	dsn := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)",
		path,
	)

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	// SQLite handles a single writer; avoid lock contention from the pool.
	conn.SetMaxOpenConns(1)

	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping sqlite database: %w", err)
	}

	return conn, nil
}
