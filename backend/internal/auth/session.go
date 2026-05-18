package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"

	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

var ErrInvalidSession = errors.New("invalid session")

const sessionTimeFormat = "2006-01-02T15:04:05.000Z"

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func CreateSession(ctx context.Context, q sqlc.Querier, userID int64, ttl time.Duration) (string, error) {
	token, err := newToken()
	if err != nil {
		return "", err
	}
	expires := time.Now().UTC().Add(ttl).Format(sessionTimeFormat)
	if _, err := q.CreateSession(ctx, sqlc.CreateSessionParams{
		Token:     token,
		UserID:    userID,
		ExpiresAt: expires,
	}); err != nil {
		return "", err
	}
	return token, nil
}

func LookupSession(ctx context.Context, q sqlc.Querier, token string) (int64, error) {
	s, err := q.GetSession(ctx, token)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInvalidSession
	}
	if err != nil {
		return 0, err
	}
	if expired(s.ExpiresAt) {
		_ = q.DeleteSession(ctx, token)
		return 0, ErrInvalidSession
	}
	return s.UserID, nil
}

func DeleteSession(ctx context.Context, q sqlc.Querier, token string) error {
	return q.DeleteSession(ctx, token)
}

func expired(iso string) bool {
	t, err := time.Parse(sessionTimeFormat, iso)
	if err != nil {
		return true
	}
	return time.Now().UTC().After(t)
}
