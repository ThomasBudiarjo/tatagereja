package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

func Open(path string) (*sql.DB, error) {
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)"
	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("db.Open: %w", err)
	}
	// Litestream requires a single writer; WAL allows concurrent reads.
	d.SetMaxOpenConns(1)
	d.SetMaxIdleConns(1)
	return d, nil
}

func MustOpen(path string) *sql.DB {
	d, err := Open(path)
	if err != nil {
		log.Fatalf("db.MustOpen: %v", err)
	}
	return d
}

func Apply(d *sql.DB) error {
	if _, err := d.Exec(schemaSQL); err != nil {
		return fmt.Errorf("db.Apply: %w", err)
	}
	return nil
}
