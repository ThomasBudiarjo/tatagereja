package db_test

import (
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
)

func TestOpenAppliesPragmas(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer conn.Close()

	var journalMode string
	if err := conn.QueryRow("PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("query journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal_mode=%q, want wal", journalMode)
	}

	var foreignKeys int
	if err := conn.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		t.Fatalf("query foreign_keys: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys=%d, want 1", foreignKeys)
	}
}

func TestOpenCreatesParentDir(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "dir", "test.db")
	conn, err := db.Open(path)
	if err != nil {
		t.Fatalf("Open with missing parent dir: %v", err)
	}
	defer conn.Close()
	if err := db.Ping(conn); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}
