# Architecture

Relay is a local-first baseball analytics app built around cached Statcast pitch-level data.

## System Overview

```txt
Statcast provider
  -> ingestion scripts
  -> data/statcast.parquet
  -> DuckDB query services
  -> FastAPI endpoints
  -> React frontend
```

Natural-language queries follow a separate deterministic path:

```txt
User text
  -> /query
  -> validated skill call
  -> existing API endpoints
  -> focused chart/table/summary or full workbench
```

## Backend Layers

### API

Route modules live in `backend/app/api`.

- `pitches.py`: pitch search, heatmap, cached pitchers, options, cache metadata
- `compare.py`: pitcher period comparison and comparison heatmaps
- `nl_query.py`: natural-language skill parsing
- `errors.py`: shared API error translation

### Services

Service modules live in `backend/app/services`.

- `pitch_query_service.py`: DuckDB pitch search, filter options, heatmaps, metadata
- `pitch_compare_service.py`: period comparison metrics and deltas
- `nl_query_service.py`: rule-based natural-language parser and skill registry

### Database Helpers

DuckDB/parquet helpers live in `backend/app/db`.

The app reads from Parquet and builds temporary DuckDB views. The data cache is local and file-based for now.

## Frontend Layers

### App Shell

`frontend/src/App.tsx` owns shared app state:

- active view
- backend health
- cached metadata
- pitch filters
- comparison filters
- Ask Relay query state
- focused answer mode

### Views

`frontend/src/views` contains workbench-level pages:

- Pitch Explorer
- Compare

### Components

`frontend/src/components` contains chart-level components:

- pitch heatmap
- strike-zone chart
- movement chart
- comparison movement diff
- delta heatmap

## Data Model

Relay currently treats Statcast Parquet rows as the source of truth.

Important identity rule:

```txt
pitcher MLBAM ID is canonical
```

Names are used for display and search.

## Query Safety

Relay avoids raw SQL generation from user text.

Natural language produces a skill call:

```json
{
  "skill": "search_pitches",
  "args": {
    "pitcher_name": "Paul Skenes",
    "pitch_type_group": "fastball"
  }
}
```

The backend validates:

- skill name
- allowed args for that skill
- parser output shape

Unsupported args are dropped with warnings.

## Performance Notes

DuckDB over Parquet is good enough for the current local cache size.

Current optimizations:

- shared query builder helpers
- manifest-backed cache metadata when available
- chart-ready comparison payloads for heatmaps
- filter option endpoints scoped by current pitcher/date/pitch filters

Likely future improvements:

- precomputed pitcher/season metadata
- larger cached materialized summaries
- single comparison endpoint payload for every comparison chart and drilldown
- server-side pagination for very large pitch tables

## Future Directions

### Data

- Direct Baseball Savant provider behind the existing provider interface
- Larger cache management workflow
- More explicit game-type handling in the UI
- Optional postseason/spring-training views

### Analytics

- richer pitch result drilldowns
- batter handedness splits everywhere
- pitch-type-specific trend lines
- release traits and extension
- game-by-game comparison mode

### Natural Language

- keep rule-based parser as fallback
- add a model-backed parser that emits the same skill contract
- use cache metadata as model context
- never allow model-generated raw SQL

### Product

- pitcher home/profile page
- saved queries
- shareable comparison URLs
- export chart/table snapshots
