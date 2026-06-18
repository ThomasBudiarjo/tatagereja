package auth_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

type noopNotifier struct{}

func (noopNotifier) NotifyWrite() {}

func newSessionEnv(t *testing.T) (*db.Store, *auth.SessionService) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "sess.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	store := db.NewStore(conn, noopNotifier{})
	ctx := context.Background()
	err = store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.CreateUser(ctx, gen.CreateUserParams{ID: "u1", Email: "u1@example.com", PasswordHash: "h"})
		return err
	})
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return store, auth.NewSessionService(store)
}

func TestSessionCreateAndFetch(t *testing.T) {
	_, svc := newSessionEnv(t)
	ctx := context.Background()
	id, err := svc.Create(ctx, "u1")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	u, err := svc.UserForID(ctx, id)
	if err != nil {
		t.Fatalf("UserForID: %v", err)
	}
	if u.ID != "u1" {
		t.Fatalf("user id=%q, want u1", u.ID)
	}
}

func TestSessionRotate(t *testing.T) {
	_, svc := newSessionEnv(t)
	ctx := context.Background()
	id1, _ := svc.Create(ctx, "u1")
	id2, err := svc.Rotate(ctx, id1, "u1")
	if err != nil {
		t.Fatalf("Rotate: %v", err)
	}
	if id1 == id2 {
		t.Fatal("rotate must change the session id")
	}
	if _, err := svc.UserForID(ctx, id1); err == nil {
		t.Fatal("old session must be invalid after rotate")
	}
	if _, err := svc.UserForID(ctx, id2); err != nil {
		t.Fatalf("new session must be valid: %v", err)
	}
}

func TestSessionDelete(t *testing.T) {
	_, svc := newSessionEnv(t)
	ctx := context.Background()
	id, _ := svc.Create(ctx, "u1")
	if err := svc.Delete(ctx, id); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := svc.UserForID(ctx, id); err == nil {
		t.Fatal("deleted session must be invalid")
	}
}

func TestExpiredSessionNotReturned(t *testing.T) {
	store, svc := newSessionEnv(t)
	ctx := context.Background()
	past := time.Now().Add(-time.Hour).UTC().Format("2006-01-02 15:04:05")
	err := store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.CreateSession(ctx, gen.CreateSessionParams{ID: "expired", UserID: "u1", ExpiresAt: past})
		return err
	})
	if err != nil {
		t.Fatalf("insert expired session: %v", err)
	}
	if _, err := svc.UserForID(ctx, "expired"); err == nil {
		t.Fatal("expired session must not resolve to a user")
	}
}
