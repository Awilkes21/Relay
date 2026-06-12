# Relay

Relay is a baseball analytics app for querying, visualizing, and comparing cached Statcast pitch-level data.

The core idea is query-first baseball analysis: ask for a pitcher, pitch type, chart, table, or comparison in plain language, then open the full Pitch Explorer or Compare workbench when you want deeper control.

## What Relay Does

- Ingests Statcast pitch-level data into a local Parquet cache.
- Queries cached data through a FastAPI backend using DuckDB.
- Provides a React + TypeScript frontend with:
  - Ask Relay natural-language query entry
  - Pitcher Profile cached range, arsenal, and game-trend view
  - Pitch Explorer filters, tables, heatmaps, strike-zone views, and movement charts
  - Pitcher comparison workflow with period presets, movement diff, heatmaps, and pitch-type deltas
- Keeps natural language deterministic for now by translating text into safe structured skill calls. Relay does not generate raw SQL.

## Repository Layout

```txt
backend/
  app/
    api/          FastAPI route modules
    db/           DuckDB/parquet cache helpers
    services/     pitch search, comparison, and query parsing logic
    main.py       FastAPI app entrypoint
  scripts/        Statcast ingestion scripts and provider layer
  tests/          backend unit tests

frontend/
  src/
    components/   chart and reusable UI components
    views/        Pitch Explorer and Compare workbench views
    App.tsx       app shell, Ask Relay flow, shared state

data/             local Statcast cache and manifest, ignored by git
docs/             project documentation
```

## Quickstart

### 1. Backend

From the repo root:

```powershell
cd backend
python -m venv ..\.venv
..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

Useful checks:

- Health: `http://127.0.0.1:8000/health`
- OpenAPI docs: `http://127.0.0.1:8000/docs`

### 2. Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server usually runs at `http://localhost:5173`.

The frontend reads `VITE_API_URL`; if unset, it defaults to `http://localhost:8000`.

### 3. Use Demo Data

For a portfolio/demo setup, install the curated demo cache:

```powershell
cd backend
python scripts\prepare_demo_cache.py --skip-build --install
```

If `data/demo/statcast.parquet` does not exist yet, build it from your local cache and install it:

```powershell
cd backend
python scripts\prepare_demo_cache.py --install
```

The app reads the active cache from `data/statcast.parquet`.

### 4. Ingest Sample Data

Relay needs a local Statcast cache before pitch searches or comparisons are useful.

Example batch ingestion:

```powershell
cd backend
..\.venv\Scripts\Activate.ps1
python scripts\ingest_statcast_batch.py `
  --start-date 2024-04-01 `
  --end-date 2026-05-21 `
  --pitcher-name "Aaron Nola" `
  --pitcher-name "Tarik Skubal" `
  --pitcher-name "Paul Skenes" `
  --pitcher-name "Nolan McLean" `
  --pitcher-name "Kyle Bradish" `
  --pitcher-name "Cade Povich" `
  --output ..\data\statcast.parquet `
  --manifest ..\data\statcast_manifest.json `
  --replace
```

By default ingestion keeps regular-season games only. Use `--include-spring-training` or `--all-game-types` only when you explicitly want those rows.

## Common Commands

Backend tests:

```powershell
.\.venv\Scripts\python.exe -m unittest discover backend\tests
```

Frontend build:

```powershell
cd frontend
npm run build
```

Rebuild the cache manifest without fetching new data:

```powershell
cd backend
python scripts\ingest_statcast_batch.py `
  --start-date 2024-04-01 `
  --end-date 2026-05-21 `
  --output ..\data\statcast.parquet `
  --manifest ..\data\statcast_manifest.json `
  --index-only
```

## Documentation

- [docs/development.md](docs/development.md): local setup, commands, and environment variables
- [docs/data-ingestion.md](docs/data-ingestion.md): Statcast cache, manifest, game types, and ingestion scripts
- [docs/api.md](docs/api.md): backend endpoint overview and example requests
- [docs/natural-language.md](docs/natural-language.md): Ask Relay skill-call contract and supported phrasing
- [docs/frontend.md](docs/frontend.md): frontend views, charts, and query-first UX
- [docs/architecture.md](docs/architecture.md): system architecture and future direction

## Notes

- `data/statcast.parquet` and `data/statcast_manifest.json` are local cache artifacts, not source-controlled app code.
- MLBAM pitcher ID is the canonical identity; names are display/search labels.
- The current natural-language layer is rule-based by design. A model-backed parser can be added later as long as it emits the same validated skill-call shape.
