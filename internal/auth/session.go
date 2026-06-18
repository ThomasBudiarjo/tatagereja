package auth

import (
	"context"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// sqliteTimeLayout matches SQLite's datetime('now') text format so stored
// expiries compare correctly in queries.
const sqliteTimeLayout = "2006-01-02 15:04:05"

// SessionService manages the lifecycle of SQLite-backed sessions.
type SessionService struct {
	store *db.Store
	ttl   time.Duration
}

// NewSessionService returns a session service with the default TTL.
func NewSessionService(store *db.Store) *SessionService {
	return &SessionService{store: store, ttl: DefaultSessionTTL}
}

func (s *SessionService) expiry() string {
	return time.Now().Add(s.ttl).UTC().Format(sqliteTimeLayout)
}

// Create starts a new session for userID and returns its id.
func (s *SessionService) Create(ctx context.Context, userID string) (string, error) {
	id := NewSessionID()
	err := s.store.Tx(ctx, func(q *gen.Queries) error {
		_, err := q.CreateSession(ctx, gen.CreateSessionParams{
			ID:        id,
			UserID:    userID,
			ExpiresAt: s.expiry(),
		})
		return err
	})
	if err != nil {
		return "", err
	}
	return id, nil
}

// UserForID returns the user owning a non-expired session.
func (s *SessionService) UserForID(ctx context.Context, id string) (gen.User, error) {
	return s.store.GetUserBySessionID(ctx, id)
}

// Delete removes a session (logout).
func (s *SessionService) Delete(ctx context.Context, id string) error {
	return s.store.Tx(ctx, func(q *gen.Queries) error {
		return q.DeleteSession(ctx, id)
	})
}

// Rotate replaces oldID with a fresh session id for userID in one transaction.
// Used after login to prevent session fixation.
func (s *SessionService) Rotate(ctx context.Context, oldID, userID string) (string, error) {
	newID := NewSessionID()
	err := s.store.Tx(ctx, func(q *gen.Queries) error {
		if err := q.DeleteSession(ctx, oldID); err != nil {
			return err
		}
		_, err := q.CreateSession(ctx, gen.CreateSessionParams{
			ID:        newID,
			UserID:    userID,
			ExpiresAt: s.expiry(),
		})
		return err
	})
	if err != nil {
		return "", err
	}
	return newID, nil
}
