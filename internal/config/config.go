// Package config loads runtime configuration from environment variables.
package config

import (
	"os"
	"time"
)

type Config struct {
	Port         string
	DatabasePath string
	CookieSecure bool
	Backup       Backup
}

// Backup configures Litestream replication to an S3-compatible bucket.
// Replication is disabled when Bucket is empty.
type Backup struct {
	Bucket          string
	Path            string
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
	ForcePathStyle  bool
	SyncInterval    time.Duration
	Debounce        time.Duration
}

func Load() Config {
	return Config{
		Port:         envOr("PORT", "8080"),
		DatabasePath: envOr("DATABASE_PATH", "/tmp/tatagereja.db"),
		CookieSecure: envOr("COOKIE_SECURE", "false") == "true",
		Backup: Backup{
			Bucket:          os.Getenv("REPLICA_BUCKET"),
			Path:            envOr("REPLICA_PATH", "tatagereja"),
			Endpoint:        os.Getenv("REPLICA_ENDPOINT"),
			Region:          envOr("REPLICA_REGION", "auto"),
			AccessKeyID:     os.Getenv("REPLICA_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("REPLICA_SECRET_ACCESS_KEY"),
			ForcePathStyle:  envOr("REPLICA_FORCE_PATH_STYLE", "false") == "true",
			SyncInterval:    durationOr("BACKUP_SYNC_INTERVAL", 10*time.Minute),
			Debounce:        durationOr("BACKUP_DEBOUNCE", 5*time.Second),
		},
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func durationOr(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
