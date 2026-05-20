package tests

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func TestJadwal_BulkReplace(t *testing.T) {
	d, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	// Setup: create kebaktian, service types, jemaat, pelayan
	kb, _ := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "Ibadah Minggu", WaktuMulai: "2024-01-07T09:00:00Z",
	})
	st1, _ := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{UserID: u1, Nama: "Worship Leader"})
	st2, _ := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{UserID: u1, Nama: "Multimedia"})
	j, _ := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"})
	p, _ := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{UserID: u1, JemaatID: j.ID})

	// First save
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	qtx := q.WithTx(tx)
	_ = qtx.DeleteJadwalByKebaktian(ctx, sqlc.DeleteJadwalByKebaktianParams{KebaktianID: kb.ID, UserID: u1})
	_, _ = qtx.CreateJadwalSlot(ctx, sqlc.CreateJadwalSlotParams{
		UserID: u1, KebaktianID: kb.ID, ServiceTypeID: st1.ID,
		PelayanID: sql.NullInt64{Int64: p.ID, Valid: true},
	})
	_, _ = qtx.CreateJadwalSlot(ctx, sqlc.CreateJadwalSlotParams{
		UserID: u1, KebaktianID: kb.ID, ServiceTypeID: st2.ID,
	})
	if err := tx.Commit(); err != nil {
		t.Fatalf("first commit: %v", err)
	}

	slots, _ := q.ListJadwalByKebaktian(ctx, sqlc.ListJadwalByKebaktianParams{KebaktianID: kb.ID, UserID: u1})
	if len(slots) != 2 {
		t.Fatalf("expected 2 slots, got %d", len(slots))
	}

	// Second save (bulk replace — clear and re-insert)
	tx2, _ := d.BeginTx(ctx, nil)
	qtx2 := q.WithTx(tx2)
	_ = qtx2.DeleteJadwalByKebaktian(ctx, sqlc.DeleteJadwalByKebaktianParams{KebaktianID: kb.ID, UserID: u1})
	_, _ = qtx2.CreateJadwalSlot(ctx, sqlc.CreateJadwalSlotParams{
		UserID: u1, KebaktianID: kb.ID, ServiceTypeID: st1.ID,
	})
	if err := tx2.Commit(); err != nil {
		t.Fatalf("second commit: %v", err)
	}

	slots2, _ := q.ListJadwalByKebaktian(ctx, sqlc.ListJadwalByKebaktianParams{KebaktianID: kb.ID, UserID: u1})
	if len(slots2) != 1 {
		t.Fatalf("expected 1 slot after replace, got %d", len(slots2))
	}
	if slots2[0].PelayanID.Valid {
		t.Fatal("expected empty pelayan after replace")
	}
}

func TestJadwal_CrossUser(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	kb, _ := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "Ibadah", WaktuMulai: "2024-01-07T09:00:00Z",
	})

	_, err := q.GetKebaktian(ctx, sqlc.GetKebaktianParams{ID: kb.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected ErrNoRows for cross-user kebaktian, got %v", err)
	}
}
