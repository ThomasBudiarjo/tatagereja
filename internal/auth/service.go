package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// Service implements the email/password auth use cases.
type Service struct {
	store    *db.Store
	sessions *SessionService
}

// NewService wires the auth service over the data store and session service.
func NewService(store *db.Store, sessions *SessionService) *Service {
	return &Service{store: store, sessions: sessions}
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func newID() string {
	return db.NewID()
}

// Register creates a user and an initial session in one transaction. It returns
// the created user and the new session id.
func (s *Service) Register(ctx context.Context, email, password string) (gen.User, string, error) {
	email = normalizeEmail(email)

	if _, err := s.store.GetUserByEmail(ctx, email); err == nil {
		return gen.User{}, "", ErrEmailTaken
	} else if !errors.Is(err, sql.ErrNoRows) {
		return gen.User{}, "", err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return gen.User{}, "", err
	}

	var user gen.User
	sessionID := NewSessionID()
	err = s.store.Tx(ctx, func(q *gen.Queries) error {
		u, err := q.CreateUser(ctx, gen.CreateUserParams{
			ID:           newID(),
			Email:        email,
			PasswordHash: hash,
		})
		if err != nil {
			return err
		}
		user = u
		_, err = q.CreateSession(ctx, gen.CreateSessionParams{
			ID:        sessionID,
			UserID:    u.ID,
			ExpiresAt: s.sessions.expiry(),
		})
		return err
	})
	if err != nil {
		return gen.User{}, "", err
	}
	return user, sessionID, nil
}

// Login verifies credentials and starts a new session. All failure modes return
// ErrInvalidCredentials so callers cannot enumerate accounts.
func (s *Service) Login(ctx context.Context, email, password string) (gen.User, string, error) {
	email = normalizeEmail(email)

	user, err := s.store.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return gen.User{}, "", ErrInvalidCredentials
		}
		return gen.User{}, "", err
	}

	ok, err := VerifyPassword(user.PasswordHash, password)
	if err != nil || !ok {
		return gen.User{}, "", ErrInvalidCredentials
	}

	sessionID, err := s.sessions.Create(ctx, user.ID)
	if err != nil {
		return gen.User{}, "", err
	}
	return user, sessionID, nil
}

// Logout deletes the session.
func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.sessions.Delete(ctx, sessionID)
}

// Me returns the user for a valid, non-expired session.
func (s *Service) Me(ctx context.Context, sessionID string) (gen.User, error) {
	return s.sessions.UserForID(ctx, sessionID)
}
