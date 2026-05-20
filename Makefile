.PHONY: help setup dev build test lint sqlc seed-admin clean
help:
	@echo "setup | dev | build | test | lint | sqlc | seed-admin | clean"
setup:
	go mod download
dev:
	go tool air
build:
	go build -o bin/server ./cmd/server
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
