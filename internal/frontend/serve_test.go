package frontend_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/frontend"
)

func do(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	frontend.Handler().ServeHTTP(w, req)
	return w
}

func TestServesIndex(t *testing.T) {
	w := do(t, "/")
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "tatagereja") {
		t.Fatalf("body did not contain index marker: %q", w.Body.String())
	}
}

func TestSPAFallbackForRoutes(t *testing.T) {
	w := do(t, "/login")
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "tatagereja") {
		t.Fatal("expected SPA fallback to index.html")
	}
}

func TestMissingAssetReturns404(t *testing.T) {
	w := do(t, "/assets/does-not-exist.js")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d (expected 404 for missing asset)", w.Code)
	}
}

func TestAPINotIntercepted(t *testing.T) {
	w := do(t, "/api/me")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d (frontend handler must not serve /api)", w.Code)
	}
}
