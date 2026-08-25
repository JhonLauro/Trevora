# Deploying Trevora on Render

Two services, deployed from this one repo:

| Service | Type | Root dir | URL shape |
|---|---|---|---|
| `trevora-api` | Web Service (Docker) | `backend/trevora-api` | `https://trevora-api.onrender.com` |
| `trevora-web` | Static Site | `frontend/trevora-web` | `https://trevora-web.onrender.com` |

`render.yaml` at the repo root describes both. Everything marked `sync: false`
is a secret Render asks you for — nothing sensitive is committed.

## Before you start

The API runs `spring.jpa.hibernate.ddl-auto=validate`: it does **not** create
tables. Apply `database/migrations/*.sql` to the Supabase project first, or the
API will fail to start with a schema validation error.

## 1. Push the repo

Render deploys from GitHub. Make sure `master` is pushed to
`https://github.com/JhonLauro/Trevora`.

## 2. Create both services

Render dashboard → **New → Blueprint** → pick the repo. Render reads
`render.yaml` and prompts for each secret.

### API environment variables

| Key | Value |
|---|---|
| `SUPABASE_DB_URL` | `jdbc:postgresql://aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require` |
| `SUPABASE_DB_USERNAME` | `postgres.<project-ref>` |
| `SUPABASE_DB_PASSWORD` | database password |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon key |
| `TREVORA_CORS_ALLOWED_ORIGINS` | `https://trevora-web.onrender.com` (fill in after step 3) |
| `GOOGLE_CLOUD_VISION_API_KEY` | OCR key |
| `OPENAI_API_KEY` | OpenAI key |

Every one of these already exists in `backend/trevora-api/.env` — copy the
values straight across. That local file is gitignored and stays that way; the
values live only in Render's environment settings.

**Use the pooler host, not `db.<ref>.supabase.co`.** The direct host resolves to
IPv6 only and Render's outbound traffic is IPv4 — the direct URL fails with a
connection timeout that looks like a firewall problem but isn't. The local
`.env` already points at the pooler (`aws-1-ap-northeast-1.pooler.supabase.com`),
so copying it as-is is correct. `prepareThreshold=0` in `application.properties`
is what makes the JDBC driver work through pgbouncer's transaction mode.

Do **not** set `PORT` — Render injects it, and `server.port=${PORT:8080}`
already reads it.

### Frontend environment variables

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://trevora-api.onrender.com/api` (trailing `/api` matters) |
| `VITE_SUPABASE_URL` | same as `SUPABASE_URL` (already in `frontend/trevora-web/.env`) |
| `VITE_SUPABASE_ANON_KEY` | same as `SUPABASE_ANON_KEY` |
| `VITE_SUPABASE_RECEIPT_BUCKET` | *optional* — only if your bucket is not named `service-receipts` |

These are **build-time** values — Vite inlines them into the bundle. Changing
one requires a redeploy (Manual Deploy → Clear build cache & deploy), not just
a restart.

## 3. Close the loop

The two services reference each other's URLs, so one value on each side can
only be filled once both exist:

1. Deploy the API, copy its URL.
2. Set `VITE_API_BASE_URL` on the static site → redeploy it, copy its URL.
3. Set `TREVORA_CORS_ALLOWED_ORIGINS` on the API → it restarts automatically.

Without step 3 the site loads but every API call fails CORS in the browser
console.

## 4. Supabase settings

Supabase → Authentication → URL Configuration: add the static site URL as
**Site URL** and to **Redirect URLs**, otherwise email confirmation and
password-reset links point back at `localhost:5173`.

## Verifying

```bash
curl https://trevora-api.onrender.com/health
```

`{"status":"UP"}` means the process is up and the database connection
validated at startup. Then open the site, sign in, and load a vehicle.

## Free tier caveats

- **The API sleeps after 15 minutes of inactivity.** The next request wakes it,
  and a Spring Boot cold start takes ~30–60 s — the first page load after idle
  will look broken. Upgrading `trevora-api` to a paid instance is the only real
  fix; a keep-alive ping is a workaround.
- 512 MB RAM. `JAVA_OPTS` in the Dockerfile caps the heap at 70% of that. If
  deploys start failing with out-of-memory during the Maven build, that's the
  build container, not the runtime — upgrade the instance for the build.
- Static sites do not sleep, so the frontend is always instant.

## Custom domain

Add it under the static site's **Settings → Custom Domains**, then append it to
`TREVORA_CORS_ALLOWED_ORIGINS` on the API (comma-separated) and to Supabase's
redirect URLs.
