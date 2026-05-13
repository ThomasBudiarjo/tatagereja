# Deployment

## Backend (Heroku)

```bash
heroku login
heroku create shepherd-api --buildpack https://github.com/lstoll/heroku-buildpack-monorepo
heroku buildpacks:add heroku/go
heroku config:set APP_BASE=backend
heroku config:set JWT_SECRET="$(openssl rand -base64 32)"
heroku config:set JWT_ISSUER=shepherd
heroku config:set JWT_AUDIENCE=shepherd-web
heroku config:set APP_ENV=production
heroku config:set CORS_ALLOWED_ORIGINS=https://shepherd.pages.dev
```

### Database (Turso)

```bash
turso db create shepherd-prod
turso db show --url shepherd-prod
turso db tokens create shepherd-prod
heroku config:set DATABASE_URL="libsql://..."
```

### First admin

```bash
cd backend
DATABASE_URL="libsql://..." go run scripts/seed-admin/main.go \
    --church-slug=demo --church-name="Demo Church" \
    --email=admin@example.com --password="..."
```

## Frontend (Cloudflare Pages)

Connect GitHub repo, set:
- Build command: `cd frontend && npm install && npm run build`
- Output directory: `frontend/dist`
- Env var: `VITE_API_URL=https://shepherd-api.herokuapp.com`
