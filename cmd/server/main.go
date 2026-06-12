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

	"github.com/ThomasBudiarjo/tatagereja/internal/app"
	"github.com/ThomasBudiarjo/tatagereja/internal/db"
	"github.com/ThomasBudiarjo/tatagereja/migrations"
	"github.com/ThomasBudiarjo/tatagereja/web"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	dbPath := db.Path()
	conn, err := db.Open(dbPath)
	if err != nil {
		return err
	}
	defer conn.Close()
	log.Printf("sqlite database at %s", dbPath)

	if err := db.Migrate(conn, migrations.FS); err != nil {
		return err
	}

	dist, err := web.Dist()
	if err != nil {
		return err
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           app.NewRouter(conn, dist),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("listening on :%s", port)
		errCh <- server.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case sig := <-stop:
		log.Printf("received %s, shutting down", sig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
