FROM mcr.microsoft.com/devcontainers/go:1-1.23-bookworm

ARG NODE_VERSION=20

RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

RUN curl -sSfL https://get.tur.so/install.sh | bash \
    && mv /root/.turso/turso /usr/local/bin/turso || true

RUN curl -sSf https://atlasgo.sh | sh -s -- --community

RUN go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

RUN go install github.com/air-verse/air@latest

RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh \
    | sh -s -- -b $(go env GOPATH)/bin v1.61.0

ENV PATH="/root/go/bin:${PATH}"
