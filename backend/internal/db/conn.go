package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/tursodatabase/libsql-client-go/libsql"
	_ "modernc.org/sqlite"
)

func Open(url string) (*sql.DB, error) {
	driver := "libsql"

	db, err := sql.Open(driver, url)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	if strings.HasPrefix(url, "file:") || strings.HasPrefix(url, ":memory:") {
		if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
			return nil, fmt.Errorf("enable fk: %w", err)
		}
	}

	return db, nil
}
