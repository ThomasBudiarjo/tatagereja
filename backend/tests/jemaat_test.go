package tests

import (
	"context"
	"testing"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

func TestJemaat_CRUD(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID:      u1,
		NamaLengkap: "Budi Santoso",
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u1})
	if err != nil {
		t.Fatal(err)
	}
	if got.NamaLengkap != "Budi Santoso" {
		t.Fatalf("unexpected name %q", got.NamaLengkap)
	}

	_, err = q.UpdateJemaat(ctx, sqlc.UpdateJemaatParams{
		NamaLengkap: "Budi S.",
		ID:          j.ID,
		UserID:      u1,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := q.DeactivateJemaat(ctx, sqlc.DeactivateJemaatParams{ID: j.ID, UserID: u1}); err != nil {
		t.Fatal(err)
	}
}
