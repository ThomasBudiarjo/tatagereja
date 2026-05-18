package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// Open opens the SQLite database file using modernc.org/sqlite (pure Go).
// SQLite is single-writer. MaxOpenConns(1) serializes all access through
// one connection, eliminating "database is locked" errors entirely.
func Open(url string) (*sql.DB, error) {
	database, err := sql.Open("sqlite", url)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA foreign_keys = ON",
		"PRAGMA temp_store = MEMORY",
		"PRAGMA cache_size = -2000",
	}
	for _, p := range pragmas {
		if _, err := database.Exec(p); err != nil {
			return nil, fmt.Errorf("apply pragma %q: %w", p, err)
		}
	}

	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	database.SetConnMaxLifetime(0)

	return database, nil
}
