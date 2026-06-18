package auth_test

import (
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
)

func TestSignVerifyRoundTrip(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	signed := auth.SignValue(secret, "session-id-123")
	got, ok := auth.VerifyValue(secret, signed)
	if !ok {
		t.Fatal("expected valid signature")
	}
	if got != "session-id-123" {
		t.Fatalf("value=%q, want session-id-123", got)
	}
}

func TestVerifyRejectsTamperedValue(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	signed := auth.SignValue(secret, "session-id-123")
	if _, ok := auth.VerifyValue(secret, signed+"x"); ok {
		t.Fatal("expected tampered signature to be rejected")
	}
	if _, ok := auth.VerifyValue(secret, "session-id-123.deadbeef"); ok {
		t.Fatal("expected forged signature to be rejected")
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	signed := auth.SignValue([]byte("0123456789abcdef0123456789abcdef"), "x")
	if _, ok := auth.VerifyValue([]byte("ffffffffffffffffffffffffffffffff"), signed); ok {
		t.Fatal("expected wrong secret to reject")
	}
}

func TestNewSessionIDIsDistinct(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		id := auth.NewSessionID()
		if id == "" {
			t.Fatal("empty session id")
		}
		if seen[id] {
			t.Fatalf("duplicate session id %q", id)
		}
		seen[id] = true
	}
}
