package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

func TestRequireUserRejectsAnonymous(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("next handler must not run without a user")
	})
	rec := httptest.NewRecorder()
	RequireUser(next).ServeHTTP(rec, httptest.NewRequest("GET", "/api/persons", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want 401", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"error":"unauthorized"`) {
		t.Fatalf("body=%q, want unauthorized error", rec.Body.String())
	}
}

func TestRequireUserPassesAuthenticated(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { called = true })

	req := httptest.NewRequest("GET", "/api/persons", nil)
	ctx := context.WithValue(req.Context(), userCtxKey, &gen.User{ID: "u1", Email: "a@example.com"})
	rec := httptest.NewRecorder()
	RequireUser(next).ServeHTTP(rec, req.WithContext(ctx))

	if !called {
		t.Fatal("next handler was not called for an authenticated request")
	}
}
