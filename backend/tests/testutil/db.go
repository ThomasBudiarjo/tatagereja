package testutil

import (
	"context"
	"database/sql"
	"testing"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/db"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

// NewTestDB creates an in-memory SQLite DB with schema applied.
func NewTestDB(t *testing.T) (*sql.DB, *sqlc.Queries) {
	t.Helper()
	database, err := db.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.Apply(database); err != nil {
		t.Fatalf("apply schema: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database, sqlc.New(database)
}

// SeedTwoUsers creates two distinct users and returns their IDs.
func SeedTwoUsers(t *testing.T, q *sqlc.Queries) (u1, u2 int64) {
	t.Helper()
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	ctx := context.Background()
	user1, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email: "a@example.com", PasswordHash: hash,
		DisplayName: "User A", ChurchName: "Church A", Timezone: "Asia/Jakarta",
	})
	if err != nil {
		t.Fatalf("create user1: %v", err)
	}
	user2, err := q.CreateUser(ctx, sqlc.CreateUserParams{
		Email: "b@example.com", PasswordHash: hash,
		DisplayName: "User B", ChurchName: "Church B", Timezone: "Asia/Jakarta",
	})
	if err != nil {
		t.Fatalf("create user2: %v", err)
	}
	return user1.ID, user2.ID
}
