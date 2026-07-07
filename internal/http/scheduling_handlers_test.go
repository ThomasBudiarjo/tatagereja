package http_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	apphttp "github.com/thomasbudiarjo/tatagereja/internal/http"
	"github.com/thomasbudiarjo/tatagereja/internal/scheduling"
)

// newAPIServer builds a server with migrations and seeds applied plus a client
// already registered and logged in via its cookie jar.
func newAPIServer(t *testing.T) (*httptest.Server, *http.Client) {
	t.Helper()
	conn, err := db.Open(filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := db.Migrate(conn); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := db.Seed(conn); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	store := db.NewStore(conn, noopNotifier{})
	sessions := auth.NewSessionService(store)
	cfg := config.Config{AppEnv: "development", SessionSecret: []byte("0123456789abcdef0123456789abcdef")}

	srv := httptest.NewServer(apphttp.NewRouter(apphttp.Deps{
		Config:     cfg,
		Store:      store,
		Auth:       auth.NewService(store, sessions),
		Sessions:   sessions,
		Scheduling: scheduling.NewService(store),
	}))
	t.Cleanup(srv.Close)

	client := newClient(t)
	res := postJSON(t, client, srv.URL+"/api/auth/register", map[string]string{
		"email": "admin@example.com", "password": "password123",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("register status=%d", res.StatusCode)
	}
	return srv, client
}

func doJSON(t *testing.T, client *http.Client, method, url string, body any) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		buf, _ := json.Marshal(body)
		reader = bytes.NewReader(buf)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, url, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return res
}

func decodeBody[T any](t *testing.T, res *http.Response) T {
	t.Helper()
	defer res.Body.Close()
	var v T
	if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return v
}

func TestProtectedRoutesRequireAuth(t *testing.T) {
	srv, _ := newAPIServer(t)
	anon := &http.Client{} // no cookie jar

	paths := []struct{ method, path string }{
		{"GET", "/api/pelayanan-types"},
		{"GET", "/api/roles"},
		{"POST", "/api/roles"},
		{"GET", "/api/persons"},
		{"POST", "/api/persons"},
		{"GET", "/api/services?from=2026-07-01&to=2026-07-31"},
		{"POST", "/api/services"},
	}
	for _, p := range paths {
		res := doJSON(t, anon, p.method, srv.URL+p.path, map[string]string{})
		res.Body.Close()
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s %s status=%d, want 401", p.method, p.path, res.StatusCode)
		}
	}
}

func TestPersonCRUDAPI(t *testing.T) {
	srv, client := newAPIServer(t)

	// Empty name rejected.
	res := doJSON(t, client, "POST", srv.URL+"/api/persons", map[string]string{"name": "  "})
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty name status=%d, want 400", res.StatusCode)
	}

	res = doJSON(t, client, "POST", srv.URL+"/api/persons", map[string]string{
		"name": "Budi", "phone": "0812", "notes": "tenor",
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create status=%d, want 201", res.StatusCode)
	}
	created := decodeBody[map[string]string](t, res)
	if created["name"] != "Budi" || created["id"] == "" {
		t.Fatalf("created=%v", created)
	}

	res = doJSON(t, client, "PUT", srv.URL+"/api/persons/"+created["id"], map[string]string{
		"name": "Budi Santoso", "phone": "0812", "notes": "",
	})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("update status=%d", res.StatusCode)
	}
	updated := decodeBody[map[string]string](t, res)
	if updated["name"] != "Budi Santoso" {
		t.Fatalf("updated=%v", updated)
	}

	res = doJSON(t, client, "GET", srv.URL+"/api/persons", nil)
	list := decodeBody[[]map[string]string](t, res)
	if len(list) != 1 {
		t.Fatalf("list len=%d, want 1", len(list))
	}

	res = doJSON(t, client, "PUT", srv.URL+"/api/persons/missing", map[string]string{"name": "X"})
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("update missing status=%d, want 404", res.StatusCode)
	}

	res = doJSON(t, client, "DELETE", srv.URL+"/api/persons/"+created["id"], nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete status=%d", res.StatusCode)
	}
	res = doJSON(t, client, "GET", srv.URL+"/api/persons/"+created["id"], nil)
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted status=%d, want 404", res.StatusCode)
	}
}

type serviceBody struct {
	ID          string `json:"id"`
	Date        string `json:"date"`
	StartTime   string `json:"startTime"`
	Assignments []struct {
		ID         string `json:"id"`
		PersonName string `json:"personName"`
		RoleCode   string `json:"roleCode"`
	} `json:"assignments"`
}

func createTestPerson(t *testing.T, client *http.Client, url, name string) string {
	t.Helper()
	res := doJSON(t, client, "POST", url+"/api/persons", map[string]string{"name": name})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create person status=%d", res.StatusCode)
	}
	return decodeBody[map[string]string](t, res)["id"]
}

func createTestService(t *testing.T, client *http.Client, url, date, startTime string) string {
	t.Helper()
	res := doJSON(t, client, "POST", url+"/api/services", map[string]string{
		"pelayananTypeCode": "ibadah_umum", "date": date, "startTime": startTime,
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create service status=%d", res.StatusCode)
	}
	return decodeBody[serviceBody](t, res).ID
}

func TestServicesAPI(t *testing.T) {
	srv, client := newAPIServer(t)

	// Invalid payloads.
	res := doJSON(t, client, "POST", srv.URL+"/api/services", map[string]string{
		"pelayananTypeCode": "ibadah_umum", "date": "07/05/2026", "startTime": "09:00",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad date status=%d, want 400", res.StatusCode)
	}

	id := createTestService(t, client, srv.URL, "2026-07-05", "09:00")
	createTestService(t, client, srv.URL, "2026-08-02", "09:00")

	// Range list: only July.
	res = doJSON(t, client, "GET", srv.URL+"/api/services?from=2026-07-01&to=2026-07-31", nil)
	list := decodeBody[[]serviceBody](t, res)
	if len(list) != 1 || list[0].ID != id {
		t.Fatalf("july services=%+v", list)
	}
	if list[0].Assignments == nil {
		t.Fatal("assignments must be [] not null")
	}

	// Bad range params.
	res = doJSON(t, client, "GET", srv.URL+"/api/services?from=2026-07-31&to=2026-07-01", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("inverted range status=%d, want 400", res.StatusCode)
	}
	res = doJSON(t, client, "GET", srv.URL+"/api/services", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing range status=%d, want 400", res.StatusCode)
	}

	// Update + get + delete round trip.
	res = doJSON(t, client, "PUT", srv.URL+"/api/services/"+id, map[string]string{
		"pelayananTypeCode": "pemuda", "date": "2026-07-05", "startTime": "17:00", "title": "Ibadah Pemuda",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("update service status=%d", res.StatusCode)
	}
	res = doJSON(t, client, "DELETE", srv.URL+"/api/services/"+id, nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete service status=%d", res.StatusCode)
	}
	res = doJSON(t, client, "GET", srv.URL+"/api/services/"+id, nil)
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("get deleted service status=%d, want 404", res.StatusCode)
	}
}

type assignBody struct {
	Assignment struct {
		ID         string `json:"id"`
		PersonName string `json:"personName"`
		RoleName   string `json:"roleName"`
	} `json:"assignment"`
	Warnings []string `json:"warnings"`
}

func TestAssignmentsAPI(t *testing.T) {
	srv, client := newAPIServer(t)

	personID := createTestPerson(t, client, srv.URL, "Budi")
	morningID := createTestService(t, client, srv.URL, "2026-07-05", "09:00")
	eveningID := createTestService(t, client, srv.URL, "2026-07-05", "17:00")

	// First assignment: created, no warnings.
	res := doJSON(t, client, "POST", srv.URL+"/api/services/"+morningID+"/assignments", map[string]string{
		"personId": personID, "roleCode": "singer",
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("assign status=%d, want 201", res.StatusCode)
	}
	first := decodeBody[assignBody](t, res)
	if first.Assignment.PersonName != "Budi" || first.Assignment.RoleName != "Singer" {
		t.Fatalf("assignment=%+v", first.Assignment)
	}
	if len(first.Warnings) != 0 {
		t.Fatalf("warnings=%v, want none", first.Warnings)
	}

	// Same person on a same-date second service: 201 with warnings.
	res = doJSON(t, client, "POST", srv.URL+"/api/services/"+eveningID+"/assignments", map[string]string{
		"personId": personID, "roleCode": "singer",
	})
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("conflicting assign status=%d, want 201", res.StatusCode)
	}
	second := decodeBody[assignBody](t, res)
	if len(second.Warnings) != 1 {
		t.Fatalf("warnings=%v, want 1", second.Warnings)
	}

	// Duplicate → 409.
	res = doJSON(t, client, "POST", srv.URL+"/api/services/"+morningID+"/assignments", map[string]string{
		"personId": personID, "roleCode": "singer",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate assign status=%d, want 409", res.StatusCode)
	}

	// Unknown role → 400; missing service → 404.
	res = doJSON(t, client, "POST", srv.URL+"/api/services/"+morningID+"/assignments", map[string]string{
		"personId": personID, "roleCode": "nonexistent",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown role status=%d, want 400", res.StatusCode)
	}
	res = doJSON(t, client, "POST", srv.URL+"/api/services/missing/assignments", map[string]string{
		"personId": personID, "roleCode": "singer",
	})
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("missing service status=%d, want 404", res.StatusCode)
	}

	// Role in use cannot be deleted.
	res = doJSON(t, client, "DELETE", srv.URL+"/api/roles/singer", nil)
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("delete in-use role status=%d, want 409", res.StatusCode)
	}
	body := decodeBody[map[string]string](t, res)
	if body["error"] != "peran masih dipakai dalam jadwal" {
		t.Fatalf("error=%q", body["error"])
	}

	// Unassign removes the roster entry.
	res = doJSON(t, client, "DELETE", srv.URL+"/api/services/"+morningID+"/assignments/"+first.Assignment.ID, nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unassign status=%d", res.StatusCode)
	}
	res = doJSON(t, client, "GET", srv.URL+"/api/services/"+morningID, nil)
	svc := decodeBody[serviceBody](t, res)
	if len(svc.Assignments) != 0 {
		t.Fatalf("assignments after unassign=%+v", svc.Assignments)
	}
}

func TestRolesAPI(t *testing.T) {
	srv, client := newAPIServer(t)

	res := doJSON(t, client, "GET", srv.URL+"/api/roles", nil)
	roles := decodeBody[[]map[string]any](t, res)
	if len(roles) != 9 {
		t.Fatalf("seeded roles=%d, want 9", len(roles))
	}

	res = doJSON(t, client, "GET", srv.URL+"/api/pelayanan-types", nil)
	types := decodeBody[[]map[string]string](t, res)
	if len(types) != 2 {
		t.Fatalf("pelayanan types=%d, want 2", len(types))
	}

	// Invalid code rejected.
	res = doJSON(t, client, "POST", srv.URL+"/api/roles", map[string]any{"code": "Bad Code!", "name": "X"})
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad code status=%d, want 400", res.StatusCode)
	}

	res = doJSON(t, client, "POST", srv.URL+"/api/roles", map[string]any{
		"code": "saxophone", "name": "Saksofon", "sortOrder": 65,
	})
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create role status=%d, want 201", res.StatusCode)
	}

	// Duplicate code → 409.
	res = doJSON(t, client, "POST", srv.URL+"/api/roles", map[string]any{"code": "saxophone", "name": "Dup"})
	res.Body.Close()
	if res.StatusCode != http.StatusConflict {
		t.Fatalf("dup role status=%d, want 409", res.StatusCode)
	}

	res = doJSON(t, client, "PUT", srv.URL+"/api/roles/saxophone", map[string]any{"name": "Saxophone", "sortOrder": 66})
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("update role status=%d", res.StatusCode)
	}

	res = doJSON(t, client, "DELETE", srv.URL+"/api/roles/saxophone", nil)
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("delete role status=%d", res.StatusCode)
	}
}
