# Deployment

Relay can be deployed as a single Docker web service for a portfolio demo.

The production image:

- installs backend Python dependencies
- builds the React frontend
- serves the built frontend from FastAPI
- includes the committed `data/demo` cache
- uses same-origin API requests in production

## Local Production Check

From the repo root:

```powershell
docker build -t relay-demo .
docker run --rm -p 8000:8000 relay-demo
```

Then open:

```txt
http://localhost:8000
```

Useful checks:

```txt
http://localhost:8000/health
http://localhost:8000/cache/metadata
```

## Render

This repo includes `render.yaml` for a Docker web service.

Recommended setup:

1. Push `main` to GitHub.
2. Create a new Render Blueprint from the repository.
3. Use the generated web service.
4. Confirm `/health` returns `{"status":"ok"}`.

The app does not need a separate frontend deployment when using this Docker path.

## Data

Production uses the committed demo cache at:

```txt
data/demo/statcast.parquet
data/demo/statcast_manifest.json
```

Local development can still use the ignored active cache:

```txt
data/statcast.parquet
data/statcast_manifest.json
```

If the active local cache is missing, the backend falls back to the demo cache.
