// Package backup embeds Litestream as a library to replicate the SQLite
// database to an S3-compatible bucket (e.g. Cloudflare R2).
//
// Strategy (see PRD §5):
//   - Restore on startup (before the app opens the database).
//   - Litestream's replica monitor pushes on a periodic interval (10m).
//   - MarkDirty schedules a debounced sync ~5s after any write, coalescing
//     bursts of writes into a single sync.
//   - Close performs a final forced sync, used by the SIGTERM handler.
//
// When no bucket is configured every method is a no-op, so local development
// needs no object storage.
package backup

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/benbjohnson/litestream"
	lss3 "github.com/benbjohnson/litestream/s3"

	"github.com/thomasbudiarjo/tatagereja/internal/config"
)

type Backup struct {
	enabled  bool
	dbPath   string
	debounce time.Duration

	lsdb    *litestream.DB
	replica *litestream.Replica

	dirty chan struct{}
	stop  chan struct{}
	wg    sync.WaitGroup
}

func New(cfg config.Backup, dbPath string) *Backup {
	b := &Backup{
		enabled:  cfg.Bucket != "",
		dbPath:   dbPath,
		debounce: cfg.Debounce,
		dirty:    make(chan struct{}, 1),
		stop:     make(chan struct{}),
	}
	if !b.enabled {
		log.Println("backup: REPLICA_BUCKET not set, replication disabled")
		return b
	}

	client := lss3.NewReplicaClient()
	client.Bucket = cfg.Bucket
	client.Path = cfg.Path
	client.Endpoint = cfg.Endpoint
	client.Region = cfg.Region
	client.AccessKeyID = cfg.AccessKeyID
	client.SecretAccessKey = cfg.SecretAccessKey
	client.ForcePathStyle = cfg.ForcePathStyle

	b.lsdb = litestream.NewDB(dbPath)
	b.replica = litestream.NewReplica(b.lsdb, "s3")
	b.replica.Client = client
	b.replica.SyncInterval = cfg.SyncInterval
	b.lsdb.Replicas = append(b.lsdb.Replicas, b.replica)
	return b
}

// Restore pulls the latest generation from the replica if no local database
// file exists yet. Must run before the application opens the database.
func (b *Backup) Restore(ctx context.Context) error {
	if !b.enabled {
		return nil
	}
	if _, err := os.Stat(b.dbPath); err == nil {
		log.Println("backup: local database exists, skipping restore")
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	opt := litestream.NewRestoreOptions()
	opt.OutputPath = b.dbPath

	var err error
	if opt.Generation, _, err = b.replica.CalcRestoreTarget(ctx, opt); err != nil {
		return err
	}
	if opt.Generation == "" {
		log.Println("backup: no backup generation found, starting with a fresh database")
		return nil
	}
	log.Printf("backup: restoring generation %s", opt.Generation)
	if err := b.replica.Restore(ctx, opt); err != nil {
		return err
	}
	log.Println("backup: restore complete")
	return nil
}

// Start begins WAL monitoring/replication and the debounce worker.
func (b *Backup) Start() error {
	if !b.enabled {
		return nil
	}
	if err := b.lsdb.Open(); err != nil {
		return err
	}
	b.wg.Add(1)
	go b.debounceLoop()
	log.Println("backup: litestream replication started")
	return nil
}

// MarkDirty schedules a debounced sync. Safe to call from any goroutine.
func (b *Backup) MarkDirty() {
	if !b.enabled {
		return
	}
	select {
	case b.dirty <- struct{}{}:
	default: // a sync is already pending; the pending one will cover this write
	}
}

func (b *Backup) debounceLoop() {
	defer b.wg.Done()
	timer := time.NewTimer(0)
	if !timer.Stop() {
		<-timer.C
	}
	for {
		select {
		case <-b.stop:
			return
		case <-b.dirty:
			timer.Reset(b.debounce)
		case <-timer.C:
			b.sync(context.Background())
		}
	}
}

// sync flushes the WAL into Litestream's shadow copy and pushes it to the
// replica immediately.
func (b *Backup) sync(ctx context.Context) {
	if err := b.lsdb.Sync(ctx); err != nil {
		log.Printf("backup: db sync error: %v", err)
		return
	}
	if err := b.replica.Sync(ctx); err != nil {
		log.Printf("backup: replica sync error: %v", err)
	}
}

// Close stops the debounce worker, forces a final sync (the SIGTERM flush),
// and shuts down Litestream.
func (b *Backup) Close(ctx context.Context) {
	if !b.enabled {
		return
	}
	close(b.stop)
	b.wg.Wait()
	log.Println("backup: final sync before shutdown")
	b.sync(ctx)
	if err := b.lsdb.Close(); err != nil {
		log.Printf("backup: close error: %v", err)
	}
}
