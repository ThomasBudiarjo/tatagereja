package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/http/middleware"
)

func TestAuthThrottleBlocksAfterMax(t *testing.T) {
	h := middleware.AuthThrottle(3, time.Minute)(http.HandlerFunc(ok200))

	send := func() int {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "1.2.3.4:5555"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w.Code
	}

	for i := range 3 {
		if code := send(); code != http.StatusOK {
			t.Fatalf("request %d status=%d, want 200", i+1, code)
		}
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("4th request status=%d, want 429", code)
	}
}

func TestAuthThrottleSeparatesByIP(t *testing.T) {
	h := middleware.AuthThrottle(1, time.Minute)(http.HandlerFunc(ok200))

	send := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = ip + ":1111"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w.Code
	}

	if code := send("1.1.1.1"); code != http.StatusOK {
		t.Fatalf("ip A first status=%d", code)
	}
	if code := send("2.2.2.2"); code != http.StatusOK {
		t.Fatalf("ip B first status=%d, want 200 (separate bucket)", code)
	}
	if code := send("1.1.1.1"); code != http.StatusTooManyRequests {
		t.Fatalf("ip A second status=%d, want 429", code)
	}
}
