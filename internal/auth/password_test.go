package auth_test

import (
	"strings"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
)

func TestHashAndVerify(t *testing.T) {
	hash, err := auth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("unexpected hash format: %q", hash)
	}

	ok, err := auth.VerifyPassword(hash, "correct horse battery staple")
	if err != nil {
		t.Fatalf("VerifyPassword: %v", err)
	}
	if !ok {
		t.Fatal("expected correct password to verify")
	}

	ok, err = auth.VerifyPassword(hash, "wrong password")
	if err != nil {
		t.Fatalf("VerifyPassword (wrong): %v", err)
	}
	if ok {
		t.Fatal("expected wrong password to fail verification")
	}
}

func TestHashUsesRandomSalt(t *testing.T) {
	a, _ := auth.HashPassword("same")
	b, _ := auth.HashPassword("same")
	if a == b {
		t.Fatal("expected different hashes for the same password (random salt)")
	}
}

func TestVerifyRejectsMalformedHash(t *testing.T) {
	cases := []string{"", "notahash", "$argon2id$v=19$bad", "$argon2id$v=19$m=65536,t=3,p=2$short$short"}
	for _, c := range cases {
		if _, err := auth.VerifyPassword(c, "x"); err == nil {
			t.Fatalf("expected error for malformed hash %q", c)
		}
	}
}
