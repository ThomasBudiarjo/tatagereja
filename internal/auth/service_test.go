package auth_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
)

type countNotifier struct{ n int }

func (c *countNotifier) NotifyWrite() { c.n++ }

func newServiceEnv(t *testing.T) (*auth.Service, *countNotifier) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "svc.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	notifier := &countNotifier{}
	store := db.NewStore(conn, notifier)
	sessions := auth.NewSessionService(store)
	return auth.NewService(store, sessions), notifier
}

func TestRegisterCreatesUserAndSession(t *testing.T) {
	svc, notifier := newServiceEnv(t)
	ctx := context.Background()

	user, sid, err := svc.Register(ctx, "  New@Example.com ", "password123")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if user.Email != "new@example.com" {
		t.Fatalf("email not normalized: %q", user.Email)
	}
	if sid == "" {
		t.Fatal("expected a session id")
	}
	if notifier.n == 0 {
		t.Fatal("expected replication notification after register commit")
	}
	me, err := svc.Me(ctx, sid)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if me.ID != user.ID {
		t.Fatal("session did not resolve to the registered user")
	}
}

func TestRegisterDuplicateEmail(t *testing.T) {
	svc, _ := newServiceEnv(t)
	ctx := context.Background()
	if _, _, err := svc.Register(ctx, "a@b.com", "password123"); err != nil {
		t.Fatalf("first register: %v", err)
	}
	_, _, err := svc.Register(ctx, "A@b.com", "password123")
	if !errors.Is(err, auth.ErrEmailTaken) {
		t.Fatalf("err=%v, want ErrEmailTaken", err)
	}
}

func TestLoginWrongPasswordUniform(t *testing.T) {
	svc, _ := newServiceEnv(t)
	ctx := context.Background()
	if _, _, err := svc.Register(ctx, "a@b.com", "rightpass1"); err != nil {
		t.Fatal(err)
	}
	_, _, err := svc.Login(ctx, "a@b.com", "wrongpass")
	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("err=%v, want ErrInvalidCredentials", err)
	}
}

func TestLoginMissingUserUniform(t *testing.T) {
	svc, _ := newServiceEnv(t)
	_, _, err := svc.Login(context.Background(), "nobody@b.com", "x")
	if !errors.Is(err, auth.ErrInvalidCredentials) {
		t.Fatalf("err=%v, want ErrInvalidCredentials", err)
	}
}

func TestLoginSuccessAndLogout(t *testing.T) {
	svc, _ := newServiceEnv(t)
	ctx := context.Background()
	if _, _, err := svc.Register(ctx, "a@b.com", "rightpass1"); err != nil {
		t.Fatal(err)
	}
	user, sid, err := svc.Login(ctx, "A@B.com", "rightpass1")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if sid == "" || user.Email != "a@b.com" {
		t.Fatalf("unexpected login result: sid=%q user=%+v", sid, user)
	}
	if err := svc.Logout(ctx, sid); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := svc.Me(ctx, sid); err == nil {
		t.Fatal("session should be invalid after logout")
	}
}
