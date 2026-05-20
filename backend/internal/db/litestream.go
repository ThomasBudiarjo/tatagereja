package db

import (
	"context"
	"fmt"
	"time"

	"github.com/benbjohnson/litestream"
	_ "github.com/benbjohnson/litestream/file"
	_ "github.com/benbjohnson/litestream/s3"
)

func openLitestreamStore(ctx context.Context, dbPath, replicaURL string) (*litestream.Store, error) {
	lsDB := litestream.NewDB(dbPath)

	client, err := litestream.NewReplicaClientFromURL(replicaURL)
	if err != nil {
		return nil, fmt.Errorf("replica client: %w", err)
	}

	replica := litestream.NewReplicaWithClient(lsDB, client)
	lsDB.Replica = replica

	levels := litestream.CompactionLevels{
		{Level: 0},
		{Level: 1, Interval: 10 * time.Second},
	}

	store := litestream.NewStore([]*litestream.DB{lsDB}, levels)
	if err := store.Open(ctx); err != nil {
		return nil, fmt.Errorf("litestream store open: %w", err)
	}
	return store, nil
}
