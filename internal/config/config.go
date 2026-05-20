package config

import (
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const SessionTTLDays = 7

type Config struct {
	Port                 string
	AppEnv               string
	SQLitePath           string
	LitestreamReplicaURL string
	AWSAccessKeyID       string
	AWSSecretAccessKey   string
	AWSRegion            string
	AWSEndpointURL       string
	LogLevel             string
}

func MustLoad() *Config {
	cfg := &Config{
		Port:                 envOr("PORT", "8080"),
		AppEnv:               envOr("APP_ENV", "development"),
		SQLitePath:           envOr("SQLITE_PATH", "./data/tatagereja.db"),
		LitestreamReplicaURL: normalizeReplicaURL(envOr("LITESTREAM_REPLICA_URL", "./data/replica")),
		AWSAccessKeyID:       os.Getenv("AWS_ACCESS_KEY_ID"),
		AWSSecretAccessKey:   os.Getenv("AWS_SECRET_ACCESS_KEY"),
		AWSRegion:            envOr("AWS_REGION", "auto"),
		AWSEndpointURL:       os.Getenv("AWS_ENDPOINT_URL"),
		LogLevel:             envOr("LOG_LEVEL", "info"),
	}
	cfg.applyAWSEnv()
	cfg.configureLogging()
	return cfg
}

func (c *Config) CookieSecure() bool {
	return c.AppEnv == "production"
}

func (c *Config) applyAWSEnv() {
	if c.AWSAccessKeyID != "" {
		os.Setenv("AWS_ACCESS_KEY_ID", c.AWSAccessKeyID)
	}
	if c.AWSSecretAccessKey != "" {
		os.Setenv("AWS_SECRET_ACCESS_KEY", c.AWSSecretAccessKey)
	}
	if c.AWSRegion != "" {
		os.Setenv("AWS_REGION", c.AWSRegion)
	}
	if c.AWSEndpointURL != "" {
		os.Setenv("AWS_ENDPOINT_URL", c.AWSEndpointURL)
		os.Setenv("AWS_S3_FORCE_PATH_STYLE", "true")
	}
}

func (c *Config) configureLogging() {
	var level slog.Level
	switch strings.ToLower(c.LogLevel) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func normalizeReplicaURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		raw = "./data/replica"
	}
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "file" {
			return raw
		}
		path := u.Path
		if path == "" {
			path = u.Opaque
		}
		abs, err := filepath.Abs(path)
		if err != nil {
			return raw
		}
		return "file://" + filepath.ToSlash(abs)
	}
	abs, err := filepath.Abs(raw)
	if err != nil {
		return raw
	}
	return "file://" + filepath.ToSlash(abs)
}
