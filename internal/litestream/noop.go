package litestream

import (
	"context"
	"log/slog"
)

// noop is a Replicator that does nothing but log. It lets the full boot
// lifecycle and every NotifyWrite call site run unchanged until the real
// Litestream replicator is wired in.
type noop struct {
	logger *slog.Logger
}

// NewNoop returns a no-op Replicator.
func NewNoop(logger *slog.Logger) Replicator {
	return &noop{logger: logger}
}

func (n *noop) Start(context.Context) error {
	n.logger.Info("replication disabled (no-op replicator)")
	return nil
}

func (n *noop) NotifyWrite() {}

func (n *noop) Flush(context.Context) error {
	n.logger.Debug("noop replicator flush")
	return nil
}

func (n *noop) Close(context.Context) error { return nil }
