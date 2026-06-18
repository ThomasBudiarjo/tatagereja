package middleware

import (
	"context"
	"net/http"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

type ctxKey int

const (
	userCtxKey ctxKey = iota
	sessionIDCtxKey
)

// SessionResolver resolves a session id to its owning user.
type SessionResolver interface {
	UserForID(ctx context.Context, id string) (gen.User, error)
}

// Session reads and verifies the signed session cookie. When it resolves to a
// live session, the user and session id are stored in the request context. It
// never rejects requests itself; route guards decide what to do with an absent
// user.
func Session(secret []byte, resolver SessionResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(auth.SessionCookieName)
			if err == nil {
				if sid, ok := auth.VerifyValue(secret, cookie.Value); ok {
					if user, err := resolver.UserForID(r.Context(), sid); err == nil {
						ctx := context.WithValue(r.Context(), userCtxKey, &user)
						ctx = context.WithValue(ctx, sessionIDCtxKey, sid)
						r = r.WithContext(ctx)
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// UserFrom returns the authenticated user from the request context, if any.
func UserFrom(ctx context.Context) (*gen.User, bool) {
	u, ok := ctx.Value(userCtxKey).(*gen.User)
	return u, ok
}

// SessionIDFrom returns the current session id from the request context, if any.
func SessionIDFrom(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(sessionIDCtxKey).(string)
	return id, ok
}
