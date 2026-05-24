# Frontend

Relay's frontend is a React + TypeScript + Vite app.

Entry point:

```txt
frontend/src/App.tsx
```

Main views:

```txt
frontend/src/views/PitchExplorerView.tsx
frontend/src/views/CompareView.tsx
```

Main chart components:

```txt
frontend/src/components/PitchHeatmap.tsx
frontend/src/components/StrikeZoneChart.tsx
frontend/src/components/MovementChart.tsx
frontend/src/components/CompareMovementChart.tsx
frontend/src/components/CompareDeltaHeatmap.tsx
```

## App Structure

The app has three top-level views:

- Home: Ask Relay natural-language entry
- Pitch Explorer: full pitch search and visualization workbench
- Compare: pitcher period comparison workbench

The Home query flow can produce focused results. A focused result shows only the requested chart/table/summary and keeps the query visible as context. The user can click `Open Full Explorer` or `Open Full Compare` to continue with the same filters in the full workbench.

## Ask Relay Flow

1. User submits a natural-language query.
2. Frontend calls `POST /query`.
3. Backend returns a structured skill call.
4. Frontend previews the parsed skill and args.
5. User clicks the dynamic action button, such as:
   - `Show Heatmap`
   - `Show Pitch Table`
   - `Show Arsenal Summary`
   - `Compare Movement`
6. Frontend calls the normal API endpoints for the skill.
7. Result appears as a focused answer or in the full workbench.

## Pitch Explorer

Pitch Explorer includes:

- pitcher-first filters
- season/game/date controls
- pitch type and pitch family filters
- velocity range
- batter side
- count and count group
- base state
- zone/out-of-zone location filters
- result filters
- sortable pitch table
- data quality cards
- arsenal summary
- heatmap
- strike-zone chart
- movement chart

Charts and tables are collapsible where useful.

## Compare

Compare includes:

- pitcher selection
- pitch-type scope chips
- batter side scope
- comparison presets
- manual Period 1 and Period 2 date/game inputs
- comparison summary cards
- movement diff chart
- Period 1 and Period 2 heatmaps
- delta heatmap
- period tables
- pitch-type diff table
- pitch-type drilldown

Common presets include:

- Previous Season vs Current Season
- Prior YTD vs Current YTD
- Previous 30 vs Last 30
- Previous Month vs Latest Month
- First Half vs Second Half

## Chart Orientation

Charts are displayed from the pitcher view where that makes baseball sense.

Movement:

- horizontal axis uses arm side/glove side labels
- vertical axis uses rise/drop labels
- movement values are displayed in inches
- arm angle is displayed as degrees when available

Location:

- strike zone and heatmaps use pitcher-view horizontal orientation
- heatmap selections use a circular brush

## Dark Mode

Dark/light mode is controlled by the app shell and stored in local storage.

Components should use CSS variables from `App.css` instead of hard-coded light colors when possible.

## UI Conventions

- Use full pitch names in user-facing labels when space allows.
- Keep compact Statcast pitch codes where dense chart legends need them.
- Add units in table headers and chart labels.
- Keep filter panels collapsible after successful searches.
- Prefer icon action buttons for compact chart controls.
- Keep focused query results clear and minimal.

## Build

```powershell
cd frontend
npm run build
```

Build output goes to `frontend/dist`.
