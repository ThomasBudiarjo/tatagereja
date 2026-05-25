package tests

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/tatagereja/tatagereja/internal/auth"
	"github.com/tatagereja/tatagereja/internal/config"
	"github.com/tatagereja/tatagereja/internal/db/sqlc"
	"github.com/tatagereja/tatagereja/internal/web"
)

func newAPI(t *testing.T) (http.Handler, *sqlc.Queries, *sql.DB) {
	t.Helper()
	d, q := NewTestDB(t)
	cfg := &config.Config{AppEnv: "development"}
	return web.NewRouter(cfg, d), q, d
}

func sessionCookie(t *testing.T, q *sqlc.Queries, uid int64) *http.Cookie {
	t.Helper()
	token, err := auth.CreateSession(context.Background(), q, uid, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: auth.CookieName, Value: token}
}

func do(t *testing.T, h http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	return rr
}

func TestAPI_RequiresAuth(t *testing.T) {
	h, _, _ := newAPI(t)
	rr := do(t, h, http.MethodGet, "/api/jemaat", "", nil)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("want json content-type, got %q", ct)
	}
}

func TestAPI_Me(t *testing.T) {
	h, q, _ := newAPI(t)
	u1, _ := SeedTwoUsers(t, q)
	rr := do(t, h, http.MethodGet, "/api/me", "", sessionCookie(t, q, u1))
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rr.Code, rr.Body.String())
	}
	var resp struct {
		User struct {
			ChurchName string `json:"church_name"`
		} `json:"user"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.User.ChurchName != "GKI Satu" {
		t.Fatalf("unexpected church %q", resp.User.ChurchName)
	}
}

func TestAPI_JemaatCRUD(t *testing.T) {
	h, q, _ := newAPI(t)
	u1, _ := SeedTwoUsers(t, q)
	cookie := sessionCookie(t, q, u1)

	// Create
	rr := do(t, h, http.MethodPost, "/api/jemaat", `{"nama_lengkap":"Budi Santoso"}`, cookie)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: want 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	var created struct {
		Jemaat struct {
			ID          int64  `json:"id"`
			NamaLengkap string `json:"nama_lengkap"`
		} `json:"jemaat"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Jemaat.ID == 0 || created.Jemaat.NamaLengkap != "Budi Santoso" {
		t.Fatalf("unexpected create payload: %s", rr.Body.String())
	}
	id := created.Jemaat.ID

	// List
	rr = do(t, h, http.MethodGet, "/api/jemaat", "", cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("list: want 200, got %d", rr.Code)
	}
	var list struct {
		Items []struct {
			ID int64 `json:"id"`
		} `json:"items"`
		Total int64 `json:"total"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if list.Total != 1 || len(list.Items) != 1 {
		t.Fatalf("unexpected list: %s", rr.Body.String())
	}

	// Validation error -> 422 with field errors
	rr = do(t, h, http.MethodPost, "/api/jemaat", `{"nama_lengkap":""}`, cookie)
	if rr.Code != http.StatusUnprocessableEntity {
		t.Fatalf("validation: want 422, got %d", rr.Code)
	}
	var verr struct {
		Errors map[string]string `json:"errors"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &verr); err != nil {
		t.Fatal(err)
	}
	if verr.Errors["NamaLengkap"] == "" {
		t.Fatalf("expected NamaLengkap error, got %s", rr.Body.String())
	}

	// Update
	rr = do(t, h, http.MethodPut, "/api/jemaat/"+itoa(id), `{"nama_lengkap":"Budi S."}`, cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("update: want 200, got %d (%s)", rr.Code, rr.Body.String())
	}

	// Get
	rr = do(t, h, http.MethodGet, "/api/jemaat/"+itoa(id), "", cookie)
	if rr.Code != http.StatusOK {
		t.Fatalf("get: want 200, got %d", rr.Code)
	}

	// Delete (soft) -> 204
	rr = do(t, h, http.MethodDelete, "/api/jemaat/"+itoa(id), "", cookie)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("delete: want 204, got %d", rr.Code)
	}

	// After delete, list is empty
	rr = do(t, h, http.MethodGet, "/api/jemaat", "", cookie)
	_ = json.Unmarshal(rr.Body.Bytes(), &list)
	if list.Total != 0 {
		t.Fatalf("want empty after delete, got total=%d", list.Total)
	}
}

func TestAPI_CrossUserIsolation(t *testing.T) {
	h, q, _ := newAPI(t)
	u1, u2 := SeedTwoUsers(t, q)

	// u1 creates a jemaat
	rr := do(t, h, http.MethodPost, "/api/jemaat", `{"nama_lengkap":"Milik U1"}`, sessionCookie(t, q, u1))
	var created struct {
		Jemaat struct {
			ID int64 `json:"id"`
		} `json:"jemaat"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &created)

	// u2 must not be able to read it
	rr = do(t, h, http.MethodGet, "/api/jemaat/"+itoa(created.Jemaat.ID), "", sessionCookie(t, q, u2))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("cross-user read: want 404, got %d", rr.Code)
	}
}

func TestAPI_FullScheduleFlow(t *testing.T) {
	h, q, _ := newAPI(t)
	u1, _ := SeedTwoUsers(t, q)
	c := sessionCookie(t, q, u1)

	// Service type
	rr := do(t, h, http.MethodPost, "/api/service-types", `{"nama":"Musik","urutan":"1"}`, c)
	if rr.Code != http.StatusCreated {
		t.Fatalf("service-type create: want 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	var st struct {
		ServiceType struct {
			ID int64 `json:"id"`
		} `json:"service_type"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &st)

	// Jemaat -> pelayan
	rr = do(t, h, http.MethodPost, "/api/jemaat", `{"nama_lengkap":"Pelayan A"}`, c)
	var jem struct {
		Jemaat struct {
			ID int64 `json:"id"`
		} `json:"jemaat"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &jem)

	rr = do(t, h, http.MethodPost, "/api/pelayan",
		`{"jemaat_id":`+itoa(jem.Jemaat.ID)+`,"service_type_ids":[`+itoa(st.ServiceType.ID)+`]}`, c)
	if rr.Code != http.StatusCreated {
		t.Fatalf("pelayan create: want 201, got %d (%s)", rr.Code, rr.Body.String())
	}

	// Pelayan list shows service-type name
	rr = do(t, h, http.MethodGet, "/api/pelayan", "", c)
	if !strings.Contains(rr.Body.String(), "Musik") {
		t.Fatalf("pelayan list missing service type: %s", rr.Body.String())
	}
	var pl struct {
		Items []struct {
			ID int64 `json:"id"`
		} `json:"items"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &pl)
	if len(pl.Items) != 1 {
		t.Fatalf("want 1 pelayan, got %d", len(pl.Items))
	}
	pelayanID := pl.Items[0].ID

	// Kebaktian (local time round-trips through the user's timezone)
	rr = do(t, h, http.MethodPost, "/api/kebaktian", `{"nama":"Ibadah Minggu","waktu_mulai_local":"2025-01-05T09:00"}`, c)
	if rr.Code != http.StatusCreated {
		t.Fatalf("kebaktian create: want 201, got %d (%s)", rr.Code, rr.Body.String())
	}
	var keb struct {
		Kebaktian struct {
			ID              int64  `json:"id"`
			WaktuMulaiLocal string `json:"waktu_mulai_local"`
		} `json:"kebaktian"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &keb)
	if keb.Kebaktian.WaktuMulaiLocal != "2025-01-05T09:00" {
		t.Fatalf("local time did not round-trip: %q", keb.Kebaktian.WaktuMulaiLocal)
	}
	kid := itoa(keb.Kebaktian.ID)

	// Jadwal editor data exposes the service type + pelayan option
	rr = do(t, h, http.MethodGet, "/api/kebaktian/"+kid+"/jadwal", "", c)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "Pelayan A") {
		t.Fatalf("jadwal editor: got %d (%s)", rr.Code, rr.Body.String())
	}

	// Assign the pelayan to the slot
	rr = do(t, h, http.MethodPost, "/api/kebaktian/"+kid+"/jadwal",
		`{"slots":[{"service_type_id":`+itoa(st.ServiceType.ID)+`,"pelayan_id":`+itoa(pelayanID)+`,"catatan":"lagu pembuka"}]}`, c)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("jadwal replace: want 204, got %d (%s)", rr.Code, rr.Body.String())
	}

	// Service type is now in use -> delete must 409
	rr = do(t, h, http.MethodDelete, "/api/service-types/"+itoa(st.ServiceType.ID), "", c)
	if rr.Code != http.StatusConflict {
		t.Fatalf("service-type delete in use: want 409, got %d", rr.Code)
	}
}

func itoa(n int64) string {
	return strings.TrimSpace(jsonNumber(n))
}

func jsonNumber(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}
