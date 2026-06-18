package middleware

import (
	"encoding/json"
	"net/http"
)

// CrossOrigin builds CSRF protection using Go 1.25's
// net/http.CrossOriginProtection. Safe methods always pass; unsafe cross-origin
// browser requests are rejected via Sec-Fetch-Site (with an Origin-vs-Host
// fallback). trustedOrigins lists additional allowed origins (e.g. the
// production site origin).
func CrossOrigin(trustedOrigins []string) func(http.Handler) http.Handler {
	cop := http.NewCrossOriginProtection()
	for _, origin := range trustedOrigins {
		if origin != "" {
			// Invalid origins are ignored; misconfiguration must not crash boot.
			_ = cop.AddTrustedOrigin(origin)
		}
	}
	cop.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "cross-origin request forbidden"})
	}))
	return cop.Handler
}
