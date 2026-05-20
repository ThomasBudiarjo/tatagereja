package tests

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func TestJemaat_CrossUserReturns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID:      u1,
		NamaLengkap: "Budi",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestKeluarga_CrossUserIsolation(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	k, err := q.CreateKeluarga(ctx, sqlc.CreateKeluargaParams{
		UserID:       u1,
		NamaKeluarga: "Keluarga Budi",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetKeluarga(ctx, sqlc.GetKeluargaParams{ID: k.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestKebaktian_CrossUserIsolation(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	k, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID:      u1,
		Nama:        "Kebaktian Minggu",
		WaktuMulai:  "2026-05-20T02:00:00.000000Z",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetKebaktian(ctx, sqlc.GetKebaktianParams{ID: k.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestServiceType_CrossUserIsolation(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	st, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{
		UserID: u1,
		Nama:   "Piano",
		Urutan: 0,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetServiceType(ctx, sqlc.GetServiceTypeParams{ID: st.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}

func TestPelayan_CrossUserIsolation(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{
		UserID:      u1,
		NamaLengkap: "Budi",
	})
	if err != nil {
		t.Fatal(err)
	}
	p, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{
		UserID:   u1,
		JemaatID: j.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = q.GetPelayan(ctx, sqlc.GetPelayanParams{ID: p.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows, got %v", err)
	}
}
