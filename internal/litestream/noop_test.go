package litestream_test

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/thomasbudiarjo/tatagereja/internal/litestream"
)

func TestNoopMethodsReturnNil(t *testing.T) {
	r := litestream.NewNoop(slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx := context.Background()
	if err := r.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := r.Flush(ctx); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	if err := r.Close(ctx); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func TestNoopNotifyWriteIsConcurrencySafe(t *testing.T) {
	r := litestream.NewNoop(slog.New(slog.NewTextHandler(io.Discard, nil)))
	var wg sync.WaitGroup
	for range 100 {
		wg.Go(r.NotifyWrite)
	}
	wg.Wait()
}
