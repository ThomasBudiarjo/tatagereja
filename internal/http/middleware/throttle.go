package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"time"
)

// AuthThrottle is a fixed-window per-client-IP rate limiter for auth-sensitive
// endpoints. When a client exceeds max requests within window, it returns 429.
//
// Keying is by remote IP. Email-based keying (the spec's second dimension) is
// best added in the handler after the JSON body is decoded, to avoid consuming
// the request body in middleware.
func AuthThrottle(max int, window time.Duration) func(http.Handler) http.Handler {
	type bucket struct {
		count int
		reset time.Time
	}
	var (
		mu      sync.Mutex
		buckets = map[string]*bucket{}
	)

	allow := func(key string) bool {
		now := time.Now()
		mu.Lock()
		defer mu.Unlock()

		b := buckets[key]
		if b == nil || now.After(b.reset) {
			b = &bucket{reset: now.Add(window)}
			buckets[key] = b
			// Opportunistically drop expired buckets to bound memory.
			for k, v := range buckets {
				if now.After(v.reset) {
					delete(buckets, k)
				}
			}
		}
		b.count++
		return b.count <= max
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !allow(clientIP(r)) {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "too many requests, please slow down"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// clientIP returns the remote IP from RemoteAddr. Proxy headers are not trusted
// here; that requires validating the upstream (Heroku/Cloudflare) path first.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
