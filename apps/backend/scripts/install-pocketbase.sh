#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/pocketbase-version.sh"
BACKEND_DIR=$(dirname "$SCRIPT_DIR")
INSTALL_DIR="$BACKEND_DIR/.pocketbase/$POCKETBASE_VERSION"
POCKETBASE_BIN="$INSTALL_DIR/pocketbase"

if [ -x "$POCKETBASE_BIN" ]; then
  installed_version=$($POCKETBASE_BIN --version 2>/dev/null || true)
  if [ "$installed_version" = "pocketbase version $POCKETBASE_VERSION" ]; then
    exit 0
  fi

  echo "Replacing unexpected PocketBase binary: ${installed_version:-unknown version}" >&2
fi

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "PocketBase installation supports Linux and macOS." >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

archive="pocketbase_${POCKETBASE_VERSION}_${os}_${arch}.zip"
release_url="https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}"
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM

case "${os}_${arch}" in
  darwin_amd64) expected_checksum="8c8fcaa6e9315d8453bdac0c55d6def22933e103ad2da3a5063de87d3210f49c" ;;
  darwin_arm64) expected_checksum="6b58246406274f66bb1ada518f19f8067d31f5fd47781144c0c863e98699b149" ;;
  linux_amd64) expected_checksum="67f68c8041dbb6a35fd7af5997ffc5063a7a7b96bf9df810360788f9e9975408" ;;
  linux_arm64) expected_checksum="5bad497eaf2522418673eacfcc90e75106036f19b4aeeac6e59bc48503c01ddf" ;;
  *) echo "No pinned checksum for ${os}_${arch}." >&2; exit 1 ;;
esac

echo "Downloading PocketBase v${POCKETBASE_VERSION}..."
curl -fsSL "$release_url/$archive" -o "$temp_dir/$archive"

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum=$(sha256sum "$temp_dir/$archive" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum=$(shasum -a 256 "$temp_dir/$archive" | awk '{ print $1 }')
else
  echo "PocketBase installation requires sha256sum or shasum." >&2
  exit 1
fi

if [ "$actual_checksum" != "$expected_checksum" ]; then
  echo "PocketBase checksum verification failed." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
unzip -oq "$temp_dir/$archive" pocketbase -d "$INSTALL_DIR"
chmod +x "$POCKETBASE_BIN"
echo "PocketBase v${POCKETBASE_VERSION} installed."
