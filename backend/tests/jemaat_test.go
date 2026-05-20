package tests

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func TestJemaat_CreateAndGet(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID:      u1,
		NamaLengkap: "Siti Rahayu",
		NamaPanggilan: sql.NullString{String: "Siti", Valid: true},
	})
	if err != nil {
		t.Fatalf("CreateJemaat: %v", err)
	}
	if j.NamaLengkap != "Siti Rahayu" {
		t.Fatalf("expected NamaLengkap 'Siti Rahayu', got %q", j.NamaLengkap)
	}
	if j.UserID != u1 {
		t.Fatalf("expected UserID %d, got %d", u1, j.UserID)
	}

	got, err := q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u1})
	if err != nil {
		t.Fatalf("GetJemaat: %v", err)
	}
	if got.NamaLengkap != j.NamaLengkap {
		t.Fatalf("mismatch: %q vs %q", got.NamaLengkap, j.NamaLengkap)
	}
}

func TestJemaat_Update(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Original"})
	updated, err := q.UpdateJemaat(ctx, sqlc.UpdateJemaatParams{
		ID: j.ID, UserID: u1, NamaLengkap: "Updated",
	})
	if err != nil {
		t.Fatalf("UpdateJemaat: %v", err)
	}
	if updated.NamaLengkap != "Updated" {
		t.Fatalf("expected 'Updated', got %q", updated.NamaLengkap)
	}
}

func TestJemaat_Deactivate(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "To Deactivate"})
	if err := q.DeactivateJemaat(ctx, sqlc.DeactivateJemaatParams{ID: j.ID, UserID: u1}); err != nil {
		t.Fatalf("DeactivateJemaat: %v", err)
	}

	items, _ := q.ListJemaat(ctx, sqlc.ListJemaatParams{UserID: u1, Limit: 10, Offset: 0})
	for _, item := range items {
		if item.ID == j.ID {
			t.Fatal("deactivated jemaat still appears in list")
		}
	}
}

func TestJemaat_Pagination(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
			UserID:      u1,
			NamaLengkap: "Jemaat " + string(rune('A'+i)),
		})
	}

	page1, _ := q.ListJemaat(ctx, sqlc.ListJemaatParams{UserID: u1, Limit: 3, Offset: 0})
	page2, _ := q.ListJemaat(ctx, sqlc.ListJemaatParams{UserID: u1, Limit: 3, Offset: 3})

	if len(page1) != 3 {
		t.Fatalf("expected 3 on page1, got %d", len(page1))
	}
	if len(page2) != 2 {
		t.Fatalf("expected 2 on page2, got %d", len(page2))
	}
}

func TestJemaat_Search(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Andreas Wijaya"})
	_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi Santoso"})

	results, err := q.SearchJemaat(ctx, sqlc.SearchJemaatParams{
		UserID: u1, Query: "%Andreas%", Limit: 10, Offset: 0,
	})
	if err != nil {
		t.Fatalf("SearchJemaat: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].NamaLengkap != "Andreas Wijaya" {
		t.Fatalf("unexpected result: %q", results[0].NamaLengkap)
	}
}

func TestJemaat_UpdateWrongUser_NoRows(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"})
	_, err := q.UpdateJemaat(ctx, sqlc.UpdateJemaatParams{ID: j.ID, UserID: u2, NamaLengkap: "Hacked"})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected ErrNoRows updating another user's jemaat, got %v", err)
	}
}
