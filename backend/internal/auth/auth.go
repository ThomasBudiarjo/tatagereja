package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db/sqlc"
)

const CookieName = "tatagereja_session"

func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

func VerifyPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func CreateSession(ctx context.Context, q *sqlc.Queries, userID int64, ttl time.Duration) (string, error) {
	token, err := newToken()
	if err != nil {
		return "", err
	}
	expires := time.Now().UTC().Add(ttl).Format("2006-01-02T15:04:05.000000Z")
	_, err = q.CreateSession(ctx, sqlc.CreateSessionParams{
		Token:     token,
		UserID:    userID,
		ExpiresAt: expires,
	})
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

func LookupSession(ctx context.Context, q *sqlc.Queries, token string) (int64, error) {
	s, err := q.GetSession(ctx, token)
	if err != nil {
		return 0, err
	}
	return s.UserID, nil
}

func DeleteSession(ctx context.Context, q *sqlc.Queries, token string) error {
	return q.DeleteSession(ctx, token)
}

func SetCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		MaxAge:   int((time.Duration(config.SessionTTLDays) * 24 * time.Hour).Seconds()),
	})
}

func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func CurrentUser(ctx context.Context, q *sqlc.Queries, userID int64) (sqlc.User, error) {
	if userID == 0 {
		return sqlc.User{}, errors.New("missing user")
	}
	return q.GetUserByID(ctx, userID)
}
