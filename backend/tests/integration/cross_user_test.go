package integration

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"gopkg.in/guregu/null.v4"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/tests/testutil"
)

func TestCrossUser_Jemaat_Returns404(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID: u1, NamaLengkap: "Budi",
	})
	if err != nil {
		t.Fatalf("create jemaat: %v", err)
	}

	_, err = q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user read, got %v", err)
	}
}

func TestCrossUser_Keluarga_Returns404(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	k, err := q.CreateKeluarga(ctx, sqlc.CreateKeluargaParams{
		UserID: u1, NamaKeluarga: "Family Budi",
	})
	if err != nil {
		t.Fatalf("create keluarga: %v", err)
	}

	_, err = q.GetKeluarga(ctx, sqlc.GetKeluargaParams{ID: k.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestCrossUser_ServiceType_Returns404(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	st, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{
		UserID: u1, Nama: "Worship Leader",
	})
	if err != nil {
		t.Fatalf("create st: %v", err)
	}

	_, err = q.GetServiceType(ctx, sqlc.GetServiceTypeParams{ID: st.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestCrossUser_Pelayan_Returns404(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"})
	if err != nil {
		t.Fatal(err)
	}
	p, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{UserID: u1, JemaatID: j.ID})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetPelayan(ctx, sqlc.GetPelayanParams{ID: p.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestCrossUser_Kebaktian_Returns404(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	k, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "KU 1", WaktuMulai: "2026-05-18T02:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetKebaktian(ctx, sqlc.GetKebaktianParams{ID: k.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestCrossUser_ListJemaatExcludesOtherUsers(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	if _, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u2, NamaLengkap: "Citra"}); err != nil {
		t.Fatal(err)
	}
	rows, err := q.ListJemaat(ctx, sqlc.ListJemaatParams{UserID: u1, Limit: 100, Offset: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].NamaLengkap != "Budi" {
		t.Fatalf("u1 should only see Budi, got %+v", rows)
	}
}

func TestJemaatCRUD_HappyPath(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, _ := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	row, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID:        u1,
		NamaLengkap:   "Budi",
		NamaPanggilan: null.StringFrom("Bud"),
		Email:         null.StringFrom("budi@example.com"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if row.NamaLengkap != "Budi" {
		t.Fatalf("unexpected nama: %s", row.NamaLengkap)
	}

	updated, err := q.UpdateJemaat(ctx, sqlc.UpdateJemaatParams{
		ID: row.ID, UserID: u1, NamaLengkap: "Budi Updated",
		NamaPanggilan: null.StringFrom("Bud"),
		Email:         null.StringFrom("budi@example.com"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.NamaLengkap != "Budi Updated" {
		t.Fatalf("expected updated name, got %s", updated.NamaLengkap)
	}

	if err := q.DeactivateJemaat(ctx, sqlc.DeactivateJemaatParams{ID: row.ID, UserID: u1}); err != nil {
		t.Fatal(err)
	}
	count, err := q.CountJemaat(ctx, u1)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("expected 0 active jemaat after deactivate, got %d", count)
	}
}

func TestJadwalReplace_RespectsUserIsolation(t *testing.T) {
	_, q := testutil.NewTestDB(t)
	u1, u2 := testutil.SeedTwoUsers(t, q)
	ctx := context.Background()

	st, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{UserID: u1, Nama: "WL"})
	if err != nil {
		t.Fatal(err)
	}
	k, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "Sunday", WaktuMulai: "2026-05-18T02:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := q.CreateJadwal(ctx, sqlc.CreateJadwalParams{
		UserID: u1, KebaktianID: k.ID, ServiceTypeID: st.ID,
	}); err != nil {
		t.Fatal(err)
	}
	// u2 deletes "all jadwal for kebaktian k" — should not affect u1's data.
	if err := q.DeleteJadwalForKebaktian(ctx, sqlc.DeleteJadwalForKebaktianParams{
		KebaktianID: k.ID, UserID: u2,
	}); err != nil {
		t.Fatalf("delete by u2 should silently no-op, got %v", err)
	}
	rows, err := q.ListJadwalForKebaktian(ctx, sqlc.ListJadwalForKebaktianParams{
		UserID: u1, KebaktianID: k.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("u1's jadwal should still be intact, got %d rows", len(rows))
	}
}
