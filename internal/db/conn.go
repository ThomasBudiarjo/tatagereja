package db

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/benbjohnson/litestream"
	"github.com/tatagereja/tatagereja/internal/config"
	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

func Apply(database *sql.DB) error {
	if _, err := database.Exec(schemaSQL); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	return nil
}

func Open(ctx context.Context, cfg *config.Config) (*sql.DB, *litestream.Store, error) {
	path, err := filepath.Abs(cfg.SQLitePath)
	if err != nil {
		return nil, nil, fmt.Errorf("resolve sqlite path: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, nil, fmt.Errorf("mkdir sqlite dir: %w", err)
	}

	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := restoreFromReplica(ctx, path, cfg.LitestreamReplicaURL); err != nil &&
			!errors.Is(err, litestream.ErrNoSnapshots) &&
			!errors.Is(err, litestream.ErrTxNotAvailable) {
			return nil, nil, fmt.Errorf("restore from replica: %w", err)
		}
	}

	store, err := openLitestreamStore(ctx, path, cfg.LitestreamReplicaURL)
	if err != nil {
		return nil, nil, err
	}

	database, err := openSQLite(path)
	if err != nil {
		_ = store.Close(ctx)
		return nil, nil, err
	}

	return database, store, nil
}

func openSQLite(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(wal)",
		path,
	)
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	database.SetMaxOpenConns(5)
	database.SetMaxIdleConns(2)
	return database, nil
}

func SyncAndClose(ctx context.Context, store *litestream.Store) error {
	for _, lsDB := range store.DBs() {
		if err := lsDB.SyncAndWait(ctx); err != nil {
			return fmt.Errorf("litestream sync: %w", err)
		}
	}
	if err := store.Close(ctx); err != nil {
		return fmt.Errorf("litestream close: %w", err)
	}
	return nil
}

func restoreFromReplica(ctx context.Context, destPath, replicaURL string) error {
	client, err := litestream.NewReplicaClientFromURL(replicaURL)
	if err != nil {
		return fmt.Errorf("replica client: %w", err)
	}
	replica := litestream.NewReplicaWithClient(nil, client)
	opt := litestream.NewRestoreOptions()
	opt.OutputPath = destPath
	if err := replica.Restore(ctx, opt); err != nil {
		return err
	}
	return nil
}
