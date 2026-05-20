package replication

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"

	"github.com/benbjohnson/litestream"
	lss3 "github.com/benbjohnson/litestream/s3"

	"github.com/thomasbudiarjo/tatagereja/backend/internal/config"
)

// Manager wraps a litestream.DB and its replica.
// All methods are no-ops when replication is not configured.
type Manager struct {
	db      *litestream.DB
	replica *litestream.Replica
	enabled bool
}

// New creates a Manager from config. If replica env vars are not all set,
// replication is disabled and all methods become no-ops (dev mode).
func New(cfg config.Config) *Manager {
	if !cfg.ReplicaConfigured() {
		slog.Info("replication: no replica configured, running without Litestream")
		return &Manager{enabled: false}
	}

	client := lss3.NewReplicaClient()
	client.Bucket = cfg.ReplicaBucket
	client.Path = cfg.ReplicaPath
	client.AccessKeyID = cfg.ReplicaAccessKeyID
	client.SecretAccessKey = cfg.ReplicaSecretAccessKey
	if cfg.ReplicaEndpoint != "" {
		client.Endpoint = cfg.ReplicaEndpoint
		// Required for Cloudflare R2 and other non-AWS S3 endpoints.
		client.ForcePathStyle = true
	}

	lsDB := litestream.NewDB(cfg.DatabasePath)
	replica := litestream.NewReplica(lsDB, "s3")
	replica.Client = client
	lsDB.Replicas = append(lsDB.Replicas, replica)

	return &Manager{db: lsDB, replica: replica, enabled: true}
}

// Restore checks the replica for existing snapshots and downloads the latest
// one if the local DB file is missing. Safe to call on first deploy when no
// backup exists yet. Must be called BEFORE sql.Open.
func (m *Manager) Restore(ctx context.Context) error {
	if !m.enabled {
		return nil
	}

	if _, err := os.Stat(m.db.Path()); err == nil {
		slog.Info("replication: local DB exists, skipping restore", "path", m.db.Path())
		return nil
	}

	slog.Info("replication: local DB not found, checking replica for snapshots", "path", m.db.Path())

	snapshots, err := m.replica.Snapshots(ctx)
	if err != nil {
		return fmt.Errorf("replication: checking snapshots: %w", err)
	}
	if len(snapshots) == 0 {
		slog.Info("replication: no snapshots found on replica (first deploy), starting fresh")
		return nil
	}

	opt := litestream.NewRestoreOptions()
	opt.OutputPath = m.db.Path()
	if err := m.replica.Restore(ctx, opt); err != nil {
		if errors.Is(err, litestream.ErrNoSnapshots) {
			slog.Info("replication: no snapshots available (race), starting fresh")
			return nil
		}
		return fmt.Errorf("replication: restore: %w", err)
	}

	slog.Info("replication: database restored from replica", "path", m.db.Path())
	return nil
}

// Start opens Litestream WAL monitoring and begins replicating to S3.
// Must be called AFTER sql.Open and db.Apply.
func (m *Manager) Start(ctx context.Context) error {
	if !m.enabled {
		return nil
	}
	if err := m.db.Open(); err != nil {
		return fmt.Errorf("replication: litestream open: %w", err)
	}
	slog.Info("replication: Litestream started", "path", m.db.Path())
	return nil
}

// Stop flushes pending WAL segments to the replica and shuts down Litestream.
// Must run before database.Close — register this defer AFTER database.Close
// so it executes first (Go defers are LIFO).
func (m *Manager) Stop() {
	if !m.enabled || m.db == nil {
		return
	}
	slog.Info("replication: flushing WAL to replica and stopping")
	if err := m.db.Close(); err != nil {
		slog.Error("replication: close error", "err", err)
	}
}
