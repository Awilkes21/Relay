# Data Ingestion

Relay reads cached Statcast data from local Parquet files. The app does not fetch Statcast data during normal API requests.

## Cache Files

Default cache:

```txt
data/statcast.parquet
```

Recommended manifest:

```txt
data/statcast_manifest.json
```

The Parquet file is the actual pitch-level data cache. The manifest is metadata about that cache: row counts, pitchers, seasons, pitch types, game types, date ranges, and data-quality reporting.

## Portfolio Demo Cache

Relay can use a committed curated demo cache so the app opens with useful data immediately.

Build the demo artifacts from an existing local cache:

```powershell
cd backend
python scripts\prepare_demo_cache.py
```

Install the demo artifacts as the active app cache:

```powershell
cd backend
python scripts\prepare_demo_cache.py --skip-build --install
```

Build and install in one step:

```powershell
cd backend
python scripts\prepare_demo_cache.py --install
```

Demo artifacts live in:

```txt
data/demo/statcast.parquet
data/demo/statcast_manifest.json
```

## Single-Pitcher Ingestion

Use this when testing one pitcher and date range:

```powershell
cd backend
python scripts\ingest_statcast.py `
  --start-date 2024-04-01 `
  --end-date 2024-04-07 `
  --pitcher-name "Aaron Nola" `
  --output ..\data\statcast.parquet
```

Use `--pitcher-id` if you already know the MLBAM ID:

```powershell
python scripts\ingest_statcast.py `
  --start-date 2024-04-01 `
  --end-date 2024-09-30 `
  --pitcher-id 605400 `
  --output ..\data\statcast.parquet `
  --append
```

## Multi-Pitcher Batch Ingestion

This is the preferred local workflow:

```powershell
cd backend
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

Use `--replace` to rebuild the cache from scratch. Omit `--replace` to append and dedupe against the existing cache.

## Rebuild Metadata Only

If the Parquet cache already exists and you only need the manifest:

```powershell
cd backend
python scripts\ingest_statcast_batch.py `
  --start-date 2024-04-01 `
  --end-date 2026-05-21 `
  --output ..\data\statcast.parquet `
  --manifest ..\data\statcast_manifest.json `
  --index-only
```

## Game Types

Relay defaults to regular-season games only:

```txt
R
```

Supported game type codes:

- `R`: regular season
- `S`: spring training
- `F`: wild card
- `D`: division series
- `L`: league championship
- `W`: world series

Options:

```powershell
--game-type R
--game-type D
```

Include spring training in addition to selected game types:

```powershell
--include-spring-training
```

Keep every returned game type:

```powershell
--all-game-types
```

## Provider Layer

Ingestion uses `backend/scripts/statcast_provider.py`.

Current provider:

```txt
pybaseball
```

The provider layer isolates pybaseball so a direct Baseball Savant provider can be added later without changing app services or API code.

## Identity

Relay treats MLBAM pitcher ID as canonical.

Names are used for:

- search labels
- display labels
- resolving IDs during ingestion

If name matching is ambiguous, prefer `--pitcher-id`.

## Data Quality

`/cache/metadata` exposes data-quality rates for fields used by charts and analysis, including:

- arm angle
- spin
- movement
- plate location
- batted-ball metrics

Statcast fields are not equally complete. Missingness is expected and should be considered when interpreting charts.

## Unknown Pitch Types

Relay filters out unknown pitch types from user-facing pitch-type lists and comparison summaries where possible. The raw cache may still contain Statcast rows with missing or unknown pitch codes.
