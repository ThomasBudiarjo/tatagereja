package tests

import (
	"context"
	"testing"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/db"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"

	"database/sql"

	_ "modernc.org/sqlite"
)

func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
	t.Helper()
	d, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec("PRAGMA foreign_keys = ON"); err != nil {
		t.Fatal(err)
	}
	if err := db.Apply(d); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d, sqlc.New(d)
}

func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) {
	t.Helper()
	ctx := context.Background()
	hash, err := auth.HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}
	user1, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        "church1@example.com",
		PasswordHash: hash,
		DisplayName:  "Admin 1",
		ChurchName:   "GKI Satu",
		Timezone:     "Asia/Jakarta",
	})
	if err != nil {
		t.Fatal(err)
	}
	user2, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        "church2@example.com",
		PasswordHash: hash,
		DisplayName:  "Admin 2",
		ChurchName:   "GKI Dua",
		Timezone:     "Asia/Jakarta",
	})
	if err != nil {
		t.Fatal(err)
	}
	return user1.ID, user2.ID
}
