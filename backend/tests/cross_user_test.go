package tests

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
)

func TestJemaat_CrossUser_Returns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi Santoso"})
	if err != nil {
		t.Fatalf("CreateJemaat: %v", err)
	}

	_, err = q.GetJemaat(ctx, sqlc.GetJemaatParams{ID: j.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user jemaat access, got %v", err)
	}
}

func TestKeluarga_CrossUser_Returns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	k, err := q.CreateKeluarga(ctx, sqlc.CreateKeluargaParams{UserID: u1, NamaKeluarga: "Keluarga Santoso"})
	if err != nil {
		t.Fatalf("CreateKeluarga: %v", err)
	}

	_, err = q.GetKeluarga(ctx, sqlc.GetKeluargaParams{ID: k.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user keluarga access, got %v", err)
	}
}

func TestServiceType_CrossUser_Returns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	st, err := q.CreateServiceType(ctx, sqlc.CreateServiceTypeParams{UserID: u1, Nama: "Worship Leader"})
	if err != nil {
		t.Fatalf("CreateServiceType: %v", err)
	}

	_, err = q.GetServiceType(ctx, sqlc.GetServiceTypeParams{ID: st.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user service type access, got %v", err)
	}
}

func TestPelayan_CrossUser_Returns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	j, err := q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Budi"})
	if err != nil {
		t.Fatalf("CreateJemaat: %v", err)
	}
	p, err := q.CreatePelayan(ctx, sqlc.CreatePelayanParams{UserID: u1, JemaatID: j.ID})
	if err != nil {
		t.Fatalf("CreatePelayan: %v", err)
	}

	_, err = q.GetPelayan(ctx, sqlc.GetPelayanParams{ID: p.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user pelayan access, got %v", err)
	}
}

func TestKebaktian_CrossUser_Returns404(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	kb, err := q.CreateKebaktian(ctx, sqlc.CreateKebaktianParams{
		UserID: u1, Nama: "Ibadah Minggu", WaktuMulai: "2024-01-07T09:00:00Z",
	})
	if err != nil {
		t.Fatalf("CreateKebaktian: %v", err)
	}

	_, err = q.GetKebaktian(ctx, sqlc.GetKebaktianParams{ID: kb.ID, UserID: u2})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for cross-user kebaktian access, got %v", err)
	}
}

func TestJemaat_ListIsolated(t *testing.T) {
	_, q := NewTestDB(t)
	u1, u2 := SeedTwoUsers(t, q)
	ctx := context.Background()

	_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Jemaat A"})
	_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u1, NamaLengkap: "Jemaat B"})
	_, _ = q.CreateJemaat(ctx, sqlc.CreateJemaatParams{UserID: u2, NamaLengkap: "Jemaat C"})

	items, err := q.ListJemaat(ctx, sqlc.ListJemaatParams{UserID: u1, Limit: 10, Offset: 0})
	if err != nil {
		t.Fatalf("ListJemaat: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 jemaat for u1, got %d", len(items))
	}
	for _, item := range items {
		if item.UserID != u1 {
			t.Fatalf("jemaat %d belongs to user %d, not u1 %d", item.ID, item.UserID, u1)
		}
	}
}
