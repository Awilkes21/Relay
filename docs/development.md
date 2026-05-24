# Development

This guide covers local setup and day-to-day commands for Relay.

## Requirements

- Python 3.11 or newer recommended
- Node.js 20 or newer recommended
- npm
- A local virtual environment at repo root, usually `.venv`

## Backend Setup

From the repo root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend runs at `http://127.0.0.1:8000`.

Useful URLs:

- `GET /health`: health check
- `/docs`: FastAPI OpenAPI docs

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5173`.

## Environment Variables

### Backend

`RELAY_CORS_ORIGINS`

Comma-separated list of frontend origins allowed by FastAPI CORS middleware.

Default:

```txt
http://localhost:5173,http://127.0.0.1:5173
```

Example:

```powershell
$env:RELAY_CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

`RELAY_NL_PARSER`

Controls the natural-language parser provider.

- `rule_based`: current default
- `model`, `llm`, or `slm`: reserved placeholder; not configured yet

### Frontend

`VITE_API_URL`

Backend URL used by the frontend.

Default:

```txt
http://localhost:8000
```

Example:

```powershell
$env:VITE_API_URL="http://127.0.0.1:8000"
npm run dev
```

## Testing

Run backend unit tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover backend\tests
```

Run targeted backend tests:

```powershell
.\.venv\Scripts\python.exe -m unittest backend.tests.test_nl_query_service
```

Build frontend:

```powershell
cd frontend
npm run build
```

## Local Data Expectations

Most app features require `data/statcast.parquet`.

Optional but recommended:

```txt
data/statcast_manifest.json
```

The manifest speeds up metadata reads and captures cache contents, game types, seasons, pitchers, and data-quality reporting.

## Common Troubleshooting

### Frontend says backend failed to fetch

Check:

- Backend is running on `http://127.0.0.1:8000` or the URL in `VITE_API_URL`.
- `GET /health` returns `{ "status": "ok" }`.
- `RELAY_CORS_ORIGINS` includes the Vite origin.

### Searches return no data

Check:

- `data/statcast.parquet` exists.
- The requested pitcher/date range exists in the cache.
- `GET /cache/metadata` shows the pitcher and season you expect.

### Ingestion includes unexpected games

By default, ingestion keeps regular-season games only. If spring training appears, rebuild the cache without `--include-spring-training` or `--all-game-types`.
