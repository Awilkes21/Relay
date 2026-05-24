# API

Relay's backend is a FastAPI app. It reads cached Statcast Parquet data through DuckDB and exposes deterministic endpoints for pitch search, heatmaps, metadata, comparisons, and natural-language skill parsing.

Base local URL:

```txt
http://127.0.0.1:8000
```

OpenAPI docs:

```txt
http://127.0.0.1:8000/docs
```

## Health

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

## Cache Metadata

### `GET /cache/metadata`

Returns cache-level metadata, pitcher list, pitch types, seasons, date ranges, game types, and data-quality reporting.

When `data/statcast_manifest.json` exists, Relay uses it as the primary metadata source and falls back to DuckDB when needed.

## Pitchers

### `GET /pitchers`

Returns cached pitchers.

Example response shape:

```json
{
  "count": 1,
  "results": [
    {
      "pitcher": 605400,
      "player_name": "Nola, Aaron",
      "pitch_count": 3000,
      "first_game_date": "2024-04-05",
      "last_game_date": "2024-09-29"
    }
  ]
}
```

## Pitch Options

### `GET /pitch-options`

Returns filter options for the current pitcher/scope:

- seasons
- game dates
- pitch types
- batter sides
- counts
- velocity range
- descriptions
- events

Common query params:

```txt
pitcher_id
pitcher_name
season
start_date
end_date
pitch_type
pitch_type_group
batter_hand
count_group
location_filter
base_state
description
events
```

## Pitch Search

### `GET /pitches`

Searches cached pitch-level rows.

Common query params:

- `pitcher_id` or `pitcher_name`
- `season`
- `start_date`, `end_date`
- `pitch_type`
- `pitch_type_group`: `fastball`, `breaking`, `offspeed`
- `balls`, `strikes`
- `count_group`: `ahead`, `behind`, `even`, `two_strikes`, `full_count`
- `min_velocity`, `max_velocity`
- `batter_hand`: `L` or `R`
- `description`
- `events`
- `base_state`: `runners_on` or `bases_empty`
- `location_filter`: `zone` or `out_of_zone`
- `result_order`: `latest`, `oldest`, or `random`
- `limit`: 1 to 5000

Example:

```txt
GET /pitches?pitcher_name=Paul%20Skenes&pitch_type_group=fastball&min_velocity=97&batter_hand=L
```

Response:

```json
{
  "count": 500,
  "total_count": 837,
  "movement": {
    "display": "Relay displays pfx_x and pfx_z as inches by multiplying by 12."
  },
  "results": []
}
```

## Pitch Heatmap

### `GET /pitches/heatmap`

Builds chart-ready location bins for the current pitch filters.

Additional query params:

- `mode`: `all`, `whiffs`, `hard_contact`, `in_zone`
- `x_bins`: 10 to 60
- `z_bins`: 10 to 60

Example:

```txt
GET /pitches/heatmap?pitcher_name=Cade%20Povich&pitch_type=CU&season=2026&mode=all
```

## Pitcher Comparison

### `GET /compare/pitcher`

Compares one pitcher over Period 1 and Period 2.

Required:

- `pitcher_id` or `pitcher_name`
- `a_start`
- `a_end`
- `b_start`
- `b_end`

Optional:

- `pitch_type`: one pitch code or comma-separated pitch codes
- `batter_hand`: `L` or `R`
- `heatmap_mode`: `all`, `whiffs`, `hard_contact`, `in_zone`
- `include_heatmaps`: boolean
- `x_bins`, `z_bins`

Example:

```txt
GET /compare/pitcher?pitcher_name=Aaron%20Nola&a_start=2024-04-05&a_end=2024-07-02&b_start=2024-07-03&b_end=2024-09-29
```

Comparison metrics include:

- pitch usage by pitch type
- average velocity by pitch type
- average spin by pitch type
- induced vertical break by pitch type
- horizontal break by pitch type
- arm angle by pitch type
- strike rate
- whiff rate
- zone rate
- deltas between periods

## Natural Language

### `POST /query`

Translates a user query into a structured skill call.

Important: this endpoint does not return raw SQL.

Request:

```json
{
  "query": "show Skenes fastballs over 97 to left handed hitters as a heatmap"
}
```

Response:

```json
{
  "skill": "get_pitch_heatmap",
  "args": {
    "pitcher_name": "Paul Skenes",
    "pitch_type_group": "fastball",
    "min_velocity": 97,
    "batter_hand": "L",
    "focus": "heatmap",
    "mode": "all"
  },
  "warnings": [],
  "parser": "rule_based"
}
```

### `GET /query/skills`

Returns the allowed skill registry and supported argument names.
