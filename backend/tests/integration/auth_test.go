package integration

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tatagereja/tatagereja/backend/internal/auth"
	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/backend/internal/router"
	"github.com/tatagereja/tatagereja/backend/tests/testutil"
)

func newTestServer(t *testing.T) (*httptest.Server, *sql.DB, *sqlc.Queries) {
	t.Helper()
	database, q := testutil.NewTestDB(t)
	cfg := &config.Config{
		Port:               "0",
		Env:                "test",
		DatabaseURL:        ":memory:",
		SessionTTL:         24 * time.Hour,
		CookieSecure:       false,
		CORSAllowedOrigins: []string{"*"},
		LogLevel:           "error",
	}
	srv := httptest.NewServer(router.New(cfg, database))
	t.Cleanup(srv.Close)
	return srv, database, q
}

func TestSmoke_HealthCheck(t *testing.T) {
	srv, _, _ := newTestServer(t)

	res, err := http.Get(srv.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("health expected 200, got %d", res.StatusCode)
	}
}

func TestSmoke_MeRequiresAuth(t *testing.T) {
	srv, _, _ := newTestServer(t)

	res, err := http.Get(srv.URL + "/me")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", res.StatusCode)
	}
}

func TestSmoke_LoginThenMe(t *testing.T) {
	srv, _, q := newTestServer(t)

	hash, err := auth.HashPassword("secret123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := q.CreateUser(context.Background(), sqlc.CreateUserParams{
		Email: "smoke@example.com", PasswordHash: hash,
		DisplayName: "Smoke", ChurchName: "Smoke Church", Timezone: "Asia/Jakarta",
	}); err != nil {
		t.Fatal(err)
	}

	client := &http.Client{
		Jar: nil,
	}
	body, _ := json.Marshal(map[string]string{"email": "smoke@example.com", "password": "secret123"})
	res, err := client.Post(srv.URL+"/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login expected 200, got %d", res.StatusCode)
	}
	var sessionCookie string
	for _, c := range res.Cookies() {
		if c.Name == auth.CookieName {
			sessionCookie = c.Value
		}
	}
	if sessionCookie == "" {
		t.Fatal("expected session cookie after login")
	}

	req, _ := http.NewRequest("GET", srv.URL+"/me", nil)
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: sessionCookie})
	res, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("/me expected 200, got %d", res.StatusCode)
	}
	var meResp struct {
		User struct {
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.NewDecoder(res.Body).Decode(&meResp); err != nil {
		t.Fatal(err)
	}
	if !strings.EqualFold(meResp.User.Email, "smoke@example.com") {
		t.Fatalf("expected smoke@example.com, got %s", meResp.User.Email)
	}
}
