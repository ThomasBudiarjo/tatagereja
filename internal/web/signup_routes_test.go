package web

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
)

func newSignupTestRouter(t *testing.T) (http.Handler, *sqlc.Queries) {
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

	cfg := &config.Config{
		AppEnv: "test",
		// Empty TurnstileSecretKey → VerifyTurnstile bypass.
	}
	return NewRouter(cfg, d), sqlc.New(d)
}

func postForm(t *testing.T, h http.Handler, path string, form url.Values) *http.Response {
	t.Helper()
	req := httptest.NewRequest("POST", path, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func validSignupForm() url.Values {
	return url.Values{
		"email":            {"new@example.com"},
		"display_name":     {"Pak Budi"},
		"church_name":      {"GKI Demo"},
		"password":         {"correcthorse"},
		"password_confirm": {"correcthorse"},
	}
}

func TestSignup_GETRendersForm(t *testing.T) {
	h, _ := newSignupTestRouter(t)
	req := httptest.NewRequest("GET", "/signup", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d want 200", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`name="email"`,
		`name="display_name"`,
		`name="church_name"`,
		`name="password"`,
		`name="password_confirm"`,
		`action="/signup"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q", want)
		}
	}
}

func TestSignup_POSTCreatesUserAndRedirects(t *testing.T) {
	h, q := newSignupTestRouter(t)

	resp := postForm(t, h, "/signup", validSignupForm())
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("status=%d want 303", resp.StatusCode)
	}
	if loc := resp.Header.Get("Location"); loc != "/login" {
		t.Errorf("Location=%q want /login", loc)
	}

	var sawFlash bool
	for _, c := range resp.Cookies() {
		if c.Name == flashCookieName && c.Value != "" {
			sawFlash = true
		}
	}
	if !sawFlash {
		t.Error("expected flash cookie to be set")
	}

	user, err := q.GetUserByEmail(context.Background(), "new@example.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if user.DisplayName != "Pak Budi" || user.ChurchName != "GKI Demo" {
		t.Errorf("user fields wrong: %+v", user)
	}
	if user.Timezone != "Asia/Jakarta" {
		t.Errorf("timezone=%q want Asia/Jakarta", user.Timezone)
	}
	if !auth.VerifyPassword(user.PasswordHash, "correcthorse") {
		t.Error("password hash does not verify against original password")
	}
}

func TestSignup_POSTMismatchedConfirm(t *testing.T) {
	h, q := newSignupTestRouter(t)
	form := validSignupForm()
	form.Set("password_confirm", "different")

	resp := postForm(t, h, "/signup", form)
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d want 422", resp.StatusCode)
	}
	body := readBody(t, resp)
	if !strings.Contains(body, "Konfirmasi kata sandi tidak cocok") {
		t.Errorf("body missing mismatch error; got: %s", body)
	}
	if _, err := q.GetUserByEmail(context.Background(), "new@example.com"); err == nil {
		t.Error("user should not be created when validation fails")
	}
}

func TestSignup_POSTShortPassword(t *testing.T) {
	h, _ := newSignupTestRouter(t)
	form := validSignupForm()
	form.Set("password", "short")
	form.Set("password_confirm", "short")

	resp := postForm(t, h, "/signup", form)
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d want 422", resp.StatusCode)
	}
	body := readBody(t, resp)
	if !strings.Contains(body, "Minimal 8 karakter") {
		t.Errorf("body missing min-length error; got: %s", body)
	}
}

func TestSignup_POSTDuplicateEmail(t *testing.T) {
	h, q := newSignupTestRouter(t)
	hash, _ := auth.HashPassword("password")
	_, err := q.CreateUser(context.Background(), sqlc.CreateUserParams{
		Email:        "new@example.com",
		PasswordHash: hash,
		DisplayName:  "Existing",
		ChurchName:   "Existing Church",
		Timezone:     "Asia/Jakarta",
	})
	if err != nil {
		t.Fatal(err)
	}

	resp := postForm(t, h, "/signup", validSignupForm())
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d want 422", resp.StatusCode)
	}
	body := readBody(t, resp)
	if !strings.Contains(body, "Email sudah terdaftar") {
		t.Errorf("body missing duplicate-email error; got: %s", body)
	}
}

func TestSignup_POSTNormalizesEmailCase(t *testing.T) {
	h, q := newSignupTestRouter(t)
	form := validSignupForm()
	form.Set("email", "MixedCase@Example.COM")

	resp := postForm(t, h, "/signup", form)
	if resp.StatusCode != http.StatusSeeOther {
		t.Fatalf("status=%d want 303", resp.StatusCode)
	}
	if _, err := q.GetUserByEmail(context.Background(), "mixedcase@example.com"); err != nil {
		t.Errorf("expected lowercased email row to exist: %v", err)
	}
}

func readBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	defer resp.Body.Close()
	var b strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			b.Write(buf[:n])
		}
		if err != nil {
			break
		}
	}
	return b.String()
}
