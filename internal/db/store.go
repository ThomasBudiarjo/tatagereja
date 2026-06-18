package db

import (
	"context"
	"database/sql"

	"github.com/thomasbudiarjo/tatagereja/internal/db/gen"
)

// Notifier is the subset of the replicator the Store needs: it is told after
// every committed mutation so replication can be scheduled.
type Notifier interface {
	NotifyWrite()
}

// Store is the application data-access layer. Read-only queries go through the
// embedded *gen.Queries directly. Mutations run through Tx, which notifies the
// replicator only after a successful commit.
type Store struct {
	*gen.Queries
	db   *sql.DB
	repl Notifier
}

// NewStore wraps a database connection and replicator.
func NewStore(conn *sql.DB, repl Notifier) *Store {
	return &Store{
		Queries: gen.New(conn),
		db:      conn,
		repl:    repl,
	}
}

// Tx runs fn inside a transaction. If fn returns nil and the commit succeeds,
// the replicator is notified. Any error rolls back and skips notification.
func (s *Store) Tx(ctx context.Context, fn func(q *gen.Queries) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(s.Queries.WithTx(tx)); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.repl.NotifyWrite()
	return nil
}
