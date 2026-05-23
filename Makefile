.PHONY: help setup dev build test lint sqlc seed-admin clean spa spa-dev
help:
	@echo "setup | dev | build | spa | spa-dev | test | lint | sqlc | seed-admin | clean"
setup:
	go mod download
	npm --prefix frontend install
dev:
	go tool air
build: spa
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

clean:
	rm -rf bin tmp data
