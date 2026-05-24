# Natural Language Queries

Ask Relay is the query-first entry point. The current implementation is intentionally rule-based and deterministic.

Relay translates plain language into structured skill calls. It does not generate raw SQL.

## Skill Call Contract

Shape:

```json
{
  "skill": "search_pitches",
  "args": {},
  "warnings": [],
  "parser": "rule_based"
}
```

Supported skills:

- `search_pitches`
- `get_pitch_heatmap`
- `compare_pitcher_periods`
- `summarize_arsenal`
- `summarize_movement`

The frontend executes the skill by calling existing API endpoints. This keeps natural language separate from data access.

## Result Focus

Relay supports a `focus` argument that tells the frontend which surface to show:

- `table`
- `heatmap`
- `strike_zone`
- `movement`
- `arsenal`
- `summary`
- `movement_diff`
- `location_delta`
- `comparison_table`
- `period_tables`

In the UI this is displayed as `View`, for example `View: Heatmap`.

Focused results stay on the Home page and show only the requested table/chart/summary. The user can then open the full Explorer or Compare workbench with the same filters already applied.

## Examples

Pitch search:

```txt
Skenes fastballs over 97 to left handed hitters
```

Focused heatmap:

```txt
heatmap for Cade Povich curveballs this year
```

Focused table:

```txt
show Skenes fastballs over 99 as a table
```

Movement:

```txt
Nola sinker movement
```

Arsenal:

```txt
Skubal pitch mix this year
```

Comparison:

```txt
compare Nola curveballs previous season vs current season same span
```

Year comparison:

```txt
compare Tarik Skubal in 2025 to 2026 so far
```

Comparison movement:

```txt
compare Nola previous season vs current season movement
```

Delta heatmap:

```txt
compare Nola previous season vs current season delta heatmap
```

## Supported Phrasing

### Pitchers

The parser matches cached pitchers by display name tokens. MLBAM ID remains canonical in data and API calls.

If the parser cannot find a unique cached pitcher, it returns a warning.

### Pitch Types

Specific pitch examples:

- four-seam fastball: `FF`
- sinker: `SI`
- slider: `SL`
- sweeper: `ST`
- curveball: `CU`
- knuckle curve: `KC`
- changeup: `CH`
- cutter: `FC`
- splitter: `FS`

Pitch families:

- `fastball`: four-seamers, sinkers, cutters, splitters where supported by backend grouping
- `breaking`: sliders, sweepers, curveballs, knuckle curves
- `offspeed`: changeups and splitters where supported by backend grouping

Examples:

```txt
Bradish fastballs
Bradish breaking balls
Bradish offspeed
Bradish four seam fastballs
```

### Counts

Supported:

- exact counts: `3-2`, `0/2`
- `full count`
- `two-strike counts`
- `ahead in the count`
- `behind in the count`
- `even counts`
- number words for balls/strikes, such as `two strikes`

### Velocity

Supported:

- `over 97`
- `above 97`
- `at least 97`
- `97+`
- `under 90`
- `between 84 and 88`
- `94-97 mph`

### Batter Side

Supported examples:

- `vs lefties`
- `to left handed hitters`
- `against LHH`
- `facing right-handed batters`
- `vs RHH`

### Base State

Supported:

- `runners on`
- `with runners`
- `bases empty`
- `nobody on`

### Location

Supported:

- `in the zone`
- `zone only`
- `out of the zone`
- `off the plate`

### Results

Supported:

- whiffs, swing and miss, swinging strikes
- called strikes, taken strikes
- in play, put in play, batted balls
- strikeouts
- home runs
- walks

### Seasons

Supported:

- explicit year: `2025`
- `this season`, `current season`
- `this year`, `current year`
- `last season`, `previous season`, `prior season`
- `last year`, `previous year`, `prior year`

## Warnings

Warnings are shown inline in the Ask Relay panel. Examples:

- no unique cached pitcher found
- unsupported comparison preset
- unsupported arguments dropped during validation

## Future Model Parser

The model-backed path should preserve the same contract:

1. Model receives user text and optional context.
2. Model returns JSON shaped like `SkillCall`.
3. Relay validates the JSON against the skill registry.
4. Unsupported args are dropped.
5. App services execute only known skills.

This keeps an eventual SLM/LLM useful without allowing it to invent SQL, endpoints, or executable behavior.
