package tests

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/db"
	"github.com/thomasbudiarjo/tatagereja/backend/internal/db/sqlc"
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
	t.Cleanup(func() { d.Close() })
	return d, sqlc.New(d)
}

func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) {
	t.Helper()
	ctx := context.Background()
	user1, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        "user1@test.com",
		PasswordHash: "$2a$12$placeholder1",
		DisplayName:  "User One",
		ChurchName:   "Gereja Satu",
		Timezone:     "Asia/Jakarta",
	})
	if err != nil {
		t.Fatal(err)
	}
	user2, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email:        "user2@test.com",
		PasswordHash: "$2a$12$placeholder2",
		DisplayName:  "User Two",
		ChurchName:   "Gereja Dua",
		Timezone:     "Asia/Jakarta",
	})
	if err != nil {
		t.Fatal(err)
	}
	return user1.ID, user2.ID
}
