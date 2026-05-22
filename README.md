# Relay
Baseball analytics platform focused on exploring and comparing pitcher and team behavior over time.

Backend: FastAPI
Frontend: React + TypeScript + Vite
Data: DuckDB first, Postgres later if needed
Ingestion: pybaseball / Statcast
Charts: SVG/D3 or Recharts

## Backend

Run the FastAPI backend locally:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

On Windows PowerShell, activate the virtual environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

The health check is available at `http://127.0.0.1:8000/health`.

Run a focused Statcast ingestion for one pitcher/date range:

```bash
python scripts/ingest_statcast.py \
  --start-date 2024-04-01 \
  --end-date 2024-04-07 \
  --pitcher-name "Aaron Nola" \
  --output ../data/statcast.parquet
```

Append another pitcher/date range into the shared local parquet cache:

```bash
python scripts/ingest_statcast.py \
  --start-date 2024-04-01 \
  --end-date 2024-09-30 \
  --pitcher-id 669373 \
  --output ../data/statcast.parquet \
  --append
```

Batch ingest multiple pitchers into the shared cache:

```bash
python scripts/ingest_statcast_batch.py \
  --start-date 2024-04-01 \
  --end-date 2024-09-30 \
  --pitcher-name "Aaron Nola" \
  --pitcher-name "Tarik Skubal" \
  --output ../data/statcast.parquet
```

Set `RELAY_CORS_ORIGINS` to configure local frontend origins if needed:

```powershell
$env:RELAY_CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
```

## Frontend

Run the React frontend locally:

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` to point at a different backend URL if needed. By default,
the frontend uses `http://localhost:8000`.
