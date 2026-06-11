// TataGereja — a free, simple church management app.
//
// Startup sequence (PRD §4.3):
//  1. Restore SQLite from Litestream/object storage
//  2. If no backup exists, create a fresh database
//  3. Run pending migrations
//  4. Start HTTP server
//  5. Litestream replication runs as a background goroutine
//
// On SIGTERM the server drains in-flight requests and forces a final sync.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/thomasbudiarjo/tatagereja/internal/app"
	"github.com/thomasbudiarjo/tatagereja/internal/backup"
	"github.com/thomasbudiarjo/tatagereja/internal/config"
	"github.com/thomasbudiarjo/tatagereja/internal/db"
	"github.com/thomasbudiarjo/tatagereja/migrations"
	"github.com/thomasbudiarjo/tatagereja/web"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bk := backup.New(cfg.Backup, cfg.DatabasePath)
	if err := bk.Restore(ctx); err != nil {
		log.Fatalf("restore database: %v", err)
	}

	sqldb, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer sqldb.Close()

	if err := db.Migrate(sqldb, migrations.FS); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	if err := bk.Start(); err != nil {
		log.Fatalf("start replication: %v", err)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.New(sqldb, bk, web.Dist(), cfg.CookieSecure),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("tatagereja listening on :%s (db: %s)", cfg.Port, cfg.DatabasePath)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}
	bk.Close(shutdownCtx)
	log.Println("bye")
}
