package http_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	apphttp "github.com/thomasbudiarjo/tatagereja/internal/http"
)

type noopNotifier struct{}

func (noopNotifier) NotifyWrite() {}

func newAuthServer(t *testing.T) *httptest.Server {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	store := db.NewStore(conn, noopNotifier{})
	sessions := auth.NewSessionService(store)
	cfg := config.Config{AppEnv: "development", SessionSecret: []byte("0123456789abcdef0123456789abcdef")}

	srv := httptest.NewServer(apphttp.NewRouter(apphttp.Deps{
		Config:   cfg,
		Store:    store,
		Auth:     auth.NewService(store, sessions),
		Sessions: sessions,
	}))
	t.Cleanup(srv.Close)
	return srv
}

func postJSON(t *testing.T, client *http.Client, url string, body any) *http.Response {
	t.Helper()
	buf, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return res
}

func newClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar}
}

func TestRegisterSetsCookieAndMeWorks(t *testing.T) {
	srv := newAuthServer(t)
	client := newClient(t)

	res := postJSON(t, client, srv.URL+"/api/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("register status=%d", res.StatusCode)
	}
	if len(res.Cookies()) == 0 {
		t.Fatal("expected a session cookie to be set")
	}

	// /api/me should now return the user using the jar cookie.
	meRes, err := client.Get(srv.URL + "/api/me")
	if err != nil {
		t.Fatal(err)
	}
	defer meRes.Body.Close()
	if meRes.StatusCode != http.StatusOK {
		t.Fatalf("me status=%d", meRes.StatusCode)
	}
	var me map[string]string
	_ = json.NewDecoder(meRes.Body).Decode(&me)
	if me["email"] != "user@example.com" {
		t.Fatalf("me email=%q", me["email"])
	}
}

func TestMeWithoutCookieIs401(t *testing.T) {
	srv := newAuthServer(t)
	res, err := http.Get(srv.URL + "/api/me")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me status=%d, want 401", res.StatusCode)
	}
}

func TestLoginWrongPasswordIsUniform401(t *testing.T) {
	srv := newAuthServer(t)
	client := newClient(t)
	reg := postJSON(t, client, srv.URL+"/api/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	reg.Body.Close()

	res := postJSON(t, newClient(t), srv.URL+"/api/auth/login", map[string]string{
		"email": "user@example.com", "password": "wrongpassword",
	})
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("login status=%d, want 401", res.StatusCode)
	}
	var body map[string]string
	_ = json.NewDecoder(res.Body).Decode(&body)
	if body["error"] != "invalid email or password" {
		t.Fatalf("error=%q", body["error"])
	}
}

func TestLogoutClearsSession(t *testing.T) {
	srv := newAuthServer(t)
	client := newClient(t)
	reg := postJSON(t, client, srv.URL+"/api/auth/register", map[string]string{
		"email": "user@example.com", "password": "password123",
	})
	reg.Body.Close()

	out := postJSON(t, client, srv.URL+"/api/auth/logout", map[string]string{})
	out.Body.Close()
	if out.StatusCode != http.StatusOK {
		t.Fatalf("logout status=%d", out.StatusCode)
	}

	meRes, err := client.Get(srv.URL + "/api/me")
	if err != nil {
		t.Fatal(err)
	}
	defer meRes.Body.Close()
	if meRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout status=%d, want 401", meRes.StatusCode)
	}
}

func TestRegisterRejectsNonJSON(t *testing.T) {
	srv := newAuthServer(t)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/auth/register", bytes.NewReader([]byte("email=x")))
	req.Header.Set("Content-Type", "text/plain")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusUnsupportedMediaType {
		t.Fatalf("status=%d, want 415", res.StatusCode)
	}
}
