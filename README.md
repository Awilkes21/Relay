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
  --pitcher-id 605400 \
  --output ../data/statcast_sample.parquet
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
