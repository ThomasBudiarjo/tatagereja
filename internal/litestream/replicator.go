// Package litestream defines the replication interface the app boots against.
// This milestone ships only a no-op implementation; the real Litestream-backed
// replicator (R2 restore/replicate/flush) is added in a later milestone behind
// this same interface.
package litestream

import "context"

// Replicator drives SQLite replication to durable storage.
type Replicator interface {
	// Start begins background replication.
	Start(ctx context.Context) error
	// NotifyWrite signals that a mutation committed; it schedules a debounced
	// sync. Safe for concurrent use.
	NotifyWrite()
	// Flush forces any pending committed changes to be replicated, bounded by
	// the context deadline. Safe to call multiple times.
	Flush(ctx context.Context) error
	// Close stops replication and releases resources.
	Close(ctx context.Context) error
}
