package db

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"

	_ "github.com/sqlitecloud/sqlitecloud-go"
)

//go:embed schema.sql
var schemaSQL string

func Open(url string) (*sql.DB, error) {
	d, err := sql.Open("sqlitecloud", url)
	if err != nil {
		return nil, fmt.Errorf("db.Open: %w", err)
	}
	if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("db.Open pragma: %w", err)
	}
	d.SetMaxOpenConns(5)
	d.SetMaxIdleConns(2)
	return d, nil
}

func MustOpen(url string) *sql.DB {
	d, err := Open(url)
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
