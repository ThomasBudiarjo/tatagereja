# API Reference

Base URL: `https://<backend-host>/`

- Content type: `application/json`
- Auth: httpOnly cookie `shepherd_session` or `Authorization: Bearer <token>`
- Errors: `{"error": "message"}` with 4xx/5xx status
- Pagination: `?limit=50&offset=0`

## Auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | No |
| POST | `/api/auth/refresh` | Refresh cookie |
| POST | `/api/auth/logout` | No |
| GET | `/api/me` | Yes |

### POST /api/auth/login

Request: `{ "email": "...", "password": "..." }`
Response: `{ "user": { "id", "email", "display_name", "role", "church_id" } }`

## Jemaat

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/jemaat?limit=&offset=&q=` | Yes |
| POST | `/api/jemaat` | Yes |
| GET | `/api/jemaat/{id}` | Yes |
| PUT | `/api/jemaat/{id}` | Yes |
| DELETE | `/api/jemaat/{id}` | Yes |

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | No |
