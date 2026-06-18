package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/http/middleware"
)

func ok200(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

func TestCrossOriginRejectsCrossSiteUnsafe(t *testing.T) {
	h := middleware.CrossOrigin(nil)(http.HandlerFunc(ok200))
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want 403", w.Code)
	}
}

func TestCrossOriginAllowsSameOriginUnsafe(t *testing.T) {
	h := middleware.CrossOrigin(nil)(http.HandlerFunc(ok200))
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", w.Code)
	}
}

func TestCrossOriginAllowsSafeMethods(t *testing.T) {
	h := middleware.CrossOrigin(nil)(http.HandlerFunc(ok200))
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("safe method status=%d, want 200", w.Code)
	}
}
