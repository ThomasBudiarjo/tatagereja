.PHONY: help setup dev build test lint sqlc seed-admin clean tailwind tailwind-watch tailwind-cli spa spa-dev
TAILWIND_VERSION := v4.3.0
TAILWIND_BIN     := bin/tailwindcss
TAILWIND_OS      := $(shell uname -s | tr A-Z a-z)
TAILWIND_ARCH    := $(shell uname -m | sed -e s/x86_64/x64/ -e s/aarch64/arm64/)
help:
	@echo "setup | dev | build | test | lint | sqlc | seed-admin | tailwind | tailwind-watch | clean"
setup:
	go mod download
dev:
	go tool air
build: tailwind spa
	go build -o bin/server ./cmd/server

spa:
	npm --prefix frontend install --include=dev
	npm --prefix frontend run build

spa-dev:
	npm --prefix frontend run dev
test:
	go test -race -cover ./...
lint:
	golangci-lint run
sqlc:
	go tool sqlc generate
seed-admin:
	go run ./cmd/seed-admin --email=admin@example.com --password=changeme --display-name="Admin" --church-name="GKI Demo"

$(TAILWIND_BIN):
	mkdir -p bin
	curl -sL -o $@ "https://github.com/tailwindlabs/tailwindcss/releases/download/$(TAILWIND_VERSION)/tailwindcss-$(TAILWIND_OS)-$(TAILWIND_ARCH)"
	chmod +x $@

tailwind-cli: $(TAILWIND_BIN)

tailwind: $(TAILWIND_BIN)
	$(TAILWIND_BIN) -i internal/templates/static/styles.src.css -o internal/templates/static/styles.css --minify

tailwind-watch: $(TAILWIND_BIN)
	$(TAILWIND_BIN) -i internal/templates/static/styles.src.css -o internal/templates/static/styles.css --watch

clean:
	rm -rf bin tmp data
