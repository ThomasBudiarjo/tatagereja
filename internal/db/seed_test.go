package db_test

import (
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
)

func TestSeedIsIdempotent(t *testing.T) {
	conn, err := db.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer conn.Close()

	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	changed, err := db.Seed(conn)
	if err != nil {
		t.Fatalf("first Seed: %v", err)
	}
	if !changed {
		t.Fatal("expected first seed to change the database")
	}

	count := func(table string) int {
		var n int
		if err := conn.QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		return n
	}
	if got := count("pelayanan_types"); got != 2 {
		t.Fatalf("pelayanan_types rows=%d, want 2", got)
	}
	if got := count("serving_roles"); got != 9 {
		t.Fatalf("serving_roles rows=%d, want 9", got)
	}

	// Second run must not error and must not duplicate rows.
	if _, err := db.Seed(conn); err != nil {
		t.Fatalf("second Seed: %v", err)
	}
	if got := count("pelayanan_types"); got != 2 {
		t.Fatalf("pelayanan_types rows after re-seed=%d, want 2", got)
	}
	if got := count("serving_roles"); got != 9 {
		t.Fatalf("serving_roles rows after re-seed=%d, want 9", got)
	}
}
