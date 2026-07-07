package db_test

import (
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
)

func TestNewID(t *testing.T) {
	seen := make(map[string]bool)
	for range 100 {
		id := db.NewID()
		if len(id) != 22 {
			t.Fatalf("len(id)=%d, want 22", len(id))
		}
		if seen[id] {
			t.Fatalf("duplicate id %q", id)
		}
		seen[id] = true
	}
}
