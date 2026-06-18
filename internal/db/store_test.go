package db_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

type countingNotifier struct{ n int }

func (c *countingNotifier) NotifyWrite() { c.n++ }

func newStore(t *testing.T) (*db.Store, *countingNotifier) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "store.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	notifier := &countingNotifier{}
	return db.NewStore(conn, notifier), notifier
}

func TestTxNotifiesOnCommit(t *testing.T) {
	store, notifier := newStore(t)
	ctx := context.Background()

	err := store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.CreateUser(ctx, gen.CreateUserParams{
			ID:           "u1",
			Email:        "a@example.com",
			PasswordHash: "hash",
		})
		return err
	})
	if err != nil {
		t.Fatalf("Tx: %v", err)
	}
	if notifier.n != 1 {
		t.Fatalf("NotifyWrite called %d times, want 1", notifier.n)
	}
}

func TestTxRollbackDoesNotNotify(t *testing.T) {
	store, notifier := newStore(t)
	ctx := context.Background()

	wantErr := context.Canceled
	err := store.Tx(ctx, func(q *gen.Queries) error {
		_, _ = q.CreateUser(ctx, gen.CreateUserParams{ID: "u2", Email: "b@example.com", PasswordHash: "h"})
		return wantErr
	})
	if err != wantErr {
		t.Fatalf("Tx err=%v, want %v", err, wantErr)
	}
	if notifier.n != 0 {
		t.Fatalf("NotifyWrite called %d times on rollback, want 0", notifier.n)
	}
	// The rolled-back user must not exist.
	if _, err := store.GetUserByEmail(ctx, "b@example.com"); err == nil {
		t.Fatal("expected rolled-back user to be absent")
	}
}

func TestReadQueryDoesNotNotify(t *testing.T) {
	store, notifier := newStore(t)
	ctx := context.Background()
	_, _ = store.GetUserByEmail(ctx, "missing@example.com")
	if notifier.n != 0 {
		t.Fatalf("read query notified %d times, want 0", notifier.n)
	}
}
