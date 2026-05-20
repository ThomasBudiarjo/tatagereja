package tests

import (
	"context"
	"database/sql"
	"testing"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

func TestJadwal_BulkReplace(t *testing.T) {
	_, q := NewTestDB(t)
	u1, _ := SeedTwoUsers(t, q)
	ctx := context.Background()

	st, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{
		UserID: u1, Nama: "Multimedia", Urutan: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	jemaat, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID: u1, NamaLengkap: "Andi",
	})
	if err != nil {
		t.Fatal(err)
	}
	p, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{
		UserID: u1, JemaatID: jemaat.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	k, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "Kebaktian", WaktuMulai: "2026-05-25T02:00:00.000000Z",
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := q.DeleteJadwalByKebaktian(ctx, sqlc.DeleteJadwalByKebaktianParams{
		KebaktianID: k.ID, UserID: u1,
	}); err != nil {
		t.Fatal(err)
	}
	_, err = q.CreateJadwal(ctx, sqlc.CreateJadwalParams{
		UserID: u1, KebaktianID: k.ID, ServiceTypeID: st.ID,
		PelayanID: sql.NullInt64{Int64: p.ID, Valid: true},
	})
	if err != nil {
		t.Fatal(err)
	}

	rows, err := q.ListJadwalByKebaktian(ctx, sqlc.ListJadwalByKebaktianParams{
		KebaktianID: k.ID, UserID: u1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 jadwal row, got %d", len(rows))
	}
}
