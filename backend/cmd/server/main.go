package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tatagereja/tatagereja/backend/internal/config"
	"github.com/tatagereja/tatagereja/backend/internal/db"
	"github.com/tatagereja/tatagereja/backend/internal/web"
)

func main() {
	cfg := config.MustLoad()

	ctx := context.Background()
	database, store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = store.Close(shutdownCtx)
	}()

	if err := db.Apply(database); err != nil {
		log.Fatal(err)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           web.NewRouter(cfg, database),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
