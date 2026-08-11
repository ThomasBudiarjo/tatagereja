# TataGereja

TataGereja is an open-source church management mobile application with a PocketBase backend that can use the official hosted service or a church's own server.

The product direction and implementation sequence are documented in [PLAN.md](./PLAN.md).

## Repository structure

```text
apps/
├── mobile/       # Expo React Native application
└── backend/      # PocketBase hooks, migrations, and development scripts
```

This repository uses npm workspaces.

## Prerequisites

- A supported Node.js release: 22.13–22.x, 24.3–24.x, or 25 and newer
- npm 10.9.9
- Linux, macOS, or Windows with WSL for the backend scripts
- A POSIX shell, `curl`, `unzip`, and either `sha256sum` or `shasum`
- Android Studio or an Android device with Expo Go for Android development

## Setup

Install all workspace dependencies from the repository root:

```sh
npm install
```

PocketBase downloads automatically on its first run. To install it without starting the server:

```sh
npm run backend:install
```

## Development

Start the mobile application:

```sh
npm run mobile
```

Start it directly on Android:

```sh
npm run mobile:android
```

Start PocketBase in another terminal:

```sh
npm run backend
```

The local PocketBase API and administration UI use port `8090`. Runtime data is written to `apps/backend/pb_data/` and is not committed.

## Verification

Run the checks for every workspace:

```sh
npm run check
```
