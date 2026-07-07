// Command server is the tatagereja web process: it serves the embedded SPA and
// the JSON API from a single pure-Go binary.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/auth"
	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/internal/frontend"
	apphttp "github.com/thomasbudiarjo/tatagereja/internal/http"
	"github.com/thomasbudiarjo/tatagereja/internal/litestream"
	"github.com/thomasbudiarjo/tatagereja/internal/scheduling"
)

const (
	httpShutdownTimeout = 10 * time.Second
	flushTimeout        = 25 * time.Second
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// 1. Open SQLite (WAL pragmas applied on connect).
	conn, err := db.Open(cfg.DatabasePath)
	if err != nil {
		return err
	}

	// 2. Migrations, then idempotent seeds; track whether the DB changed.
	migrated, err := db.Migrate(conn)
	if err != nil {
		_ = conn.Close()
		return err
	}
	seeded, err := db.Seed(conn)
	if err != nil {
		_ = conn.Close()
		return err
	}
	logger.Info("database ready",
		"path", cfg.DatabasePath, "migrated", migrated, "seeded", seeded)

	// 3. Start replication (no-op in this milestone).
	repl := litestream.NewNoop(logger)
	if err := repl.Start(context.Background()); err != nil {
		_ = conn.Close()
		return err
	}
	store := db.NewStore(conn, repl)
	sessions := auth.NewSessionService(store)
	authService := auth.NewService(store, sessions)

	// 4. If boot changed the DB, push a replication flush before serving.
	if migrated || seeded {
		repl.NotifyWrite()
		flushCtx, cancel := context.WithTimeout(context.Background(), flushTimeout)
		if err := repl.Flush(flushCtx); err != nil {
			logger.Warn("boot replication flush failed", "err", err)
		}
		cancel()
	}

	// 5. Build the HTTP handler and server.
	handler := apphttp.NewRouter(apphttp.Deps{
		Config:     cfg,
		Store:      store,
		Auth:       authService,
		Sessions:   sessions,
		Scheduling: scheduling.NewService(store),
		Frontend:   frontend.Handler(),
	})
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("http server starting", "addr", srv.Addr, "env", cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	select {
	case err := <-serveErr:
		_ = conn.Close()
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	// 6. Graceful shutdown: drain HTTP, flush + close replication, close DB.
	return shutdown(logger, srv, repl, conn)
}

func shutdown(logger *slog.Logger, srv *http.Server, repl litestream.Replicator, conn interface{ Close() error }) error {
	httpCtx, cancel := context.WithTimeout(context.Background(), httpShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(httpCtx); err != nil {
		logger.Error("graceful HTTP shutdown failed", "err", err)
	}

	flushCtx, cancelFlush := context.WithTimeout(context.Background(), flushTimeout)
	defer cancelFlush()
	if err := repl.Flush(flushCtx); err != nil {
		logger.Error("final replication flush failed", "err", err)
	} else {
		logger.Info("final replication flush complete")
	}
	if err := repl.Close(flushCtx); err != nil {
		logger.Error("replicator close failed", "err", err)
	}
	if err := conn.Close(); err != nil {
		logger.Error("database close failed", "err", err)
	}

	logger.Info("server stopped cleanly")
	return nil
}
