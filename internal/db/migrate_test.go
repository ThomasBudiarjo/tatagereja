package db_test

import (
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
)

func TestMigrateAppliesAndIsIdempotent(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer conn.Close()

	changed, err := db.Migrate(conn)
	if err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	if !changed {
		t.Fatal("expected first migrate to change the database")
	}

	for _, table := range []string{"users", "sessions", "pelayanan_types", "schema_migrations"} {
		var n int
		q := "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?"
		if err := conn.QueryRow(q, table).Scan(&n); err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if n != 1 {
			t.Fatalf("table %s missing after migrate", table)
		}
	}

	changed, err = db.Migrate(conn)
	if err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
	if changed {
		t.Fatal("expected second migrate to report no change")
	}
}
