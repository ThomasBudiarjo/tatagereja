package config

import "testing"

func TestLoadDefaultsInDevelopment(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SESSION_SECRET", "")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.Port != "7356" || c.DatabasePath != "./data/app.db" {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if len(c.SessionSecret) < 32 {
		t.Fatalf("dev session secret should be padded to >=32 bytes, got %d", len(c.SessionSecret))
	}
	if !c.IsDevelopment() {
		t.Fatal("expected development")
	}
}

func TestLoadRequiresSessionSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SESSION_SECRET", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for missing SESSION_SECRET in production")
	}
}

func TestLoadRejectsShortSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SESSION_SECRET", "tooshort")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for short SESSION_SECRET")
	}
}

func TestLoadAcceptsValidSecretInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SESSION_SECRET", "0123456789abcdef0123456789abcdef")
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.IsDevelopment() || !c.IsProduction() {
		t.Fatal("expected production")
	}
}
