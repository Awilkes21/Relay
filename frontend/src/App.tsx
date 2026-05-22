import { useEffect, useMemo, useState } from "react";
import {
  API_URL,
  type CachedPitcher,
  type CompareFilters,
  type HeatmapMode,
  type PitchHeatmapResponse,
  type PitchFilterOptions,
  type PitcherCompareResponse,
  type PitchFilters,
  type PitchResult,
  type SavedComparison,
  comparePitcher,
  getPitchHeatmap,
  getHealth,
  getPitchFilterOptions,
  getPitchers,
  searchPitches,
} from "./api";
import MovementChart from "./components/MovementChart";
import PitchHeatmap from "./components/PitchHeatmap";
import StrikeZoneChart from "./components/StrikeZoneChart";
import "./App.css";

type BackendStatus = "checking" | "connected" | "error";
type ActiveView = "explorer" | "compare";
type ComparePreset = "first_second" | "last30_previous30" | "month_month";
type SortDirection = "asc" | "desc";
type PitchSortKey =
  | "game_date"
  | "player_name"
  | "batter_name"
  | "pitch_type"
  | "release_speed"
  | "release_spin_rate"
  | "pfx_z"
  | "pfx_x"
  | "location"
  | "bb_type"
  | "launch_speed"
  | "launch_angle"
  | "hit_distance_sc"
  | "estimated_ba_using_speedangle"
  | "estimated_woba_using_speedangle"
  | "count"
  | "description"
  | "events";

const DAY_MS = 24 * 60 * 60 * 1000;

const initialFilters: PitchFilters = {
  pitcher_id: "",
  pitcher_name: "",
  season: "",
  single_game: "",
  start_date: "",
  end_date: "",
  pitch_type: "",
  count: "",
  balls: "",
  strikes: "",
  min_velocity: "",
  max_velocity: "",
  batter_hand: "",
  description: "",
  events: "",
  base_state: "",
  location_filter: "",
  result_order: "latest",
  limit: "500",
};

const filterFields = [
  { name: "pitcher_name", label: "Pitcher", type: "text" },
  { name: "season", label: "Season", type: "select" },
  { name: "single_game", label: "Game", type: "select" },
  { name: "start_date", label: "From", type: "date" },
  { name: "end_date", label: "To", type: "date" },
  { name: "pitch_type", label: "Pitch Type", type: "select" },
  { name: "min_velocity", label: "Min Velo", type: "number" },
  { name: "max_velocity", label: "Max Velo", type: "number" },
  { name: "batter_hand", label: "Batter Side", type: "select" },
  { name: "count", label: "Count", type: "select" },
  { name: "base_state", label: "Base State", type: "select" },
  { name: "location_filter", label: "Pitch Location", type: "select" },
  { name: "description", label: "Pitch Result", type: "text" },
  { name: "events", label: "PA Result", type: "text" },
  { name: "result_order", label: "Sample", type: "select" },
  { name: "limit", label: "Pitches Shown", type: "select" },
] as const;

type FilterField = (typeof filterFields)[number];

const filterGroups: Array<{ title: string; fields: FilterField[] }> = [
  {
    title: "Pitcher",
    fields: filterFields.filter((field) => ["pitcher_name", "season"].includes(field.name)),
  },
  {
    title: "Display",
    fields: filterFields.filter((field) =>
      ["result_order", "limit"].includes(field.name),
    ),
  },
  {
    title: "Game & Dates",
    fields: filterFields.filter((field) =>
      ["single_game", "start_date", "end_date"].includes(field.name),
    ),
  },
  {
    title: "Pitch Traits",
    fields: filterFields.filter((field) =>
      ["pitch_type", "min_velocity", "max_velocity", "batter_hand"].includes(field.name),
    ),
  },
  {
    title: "Count & Location",
    fields: filterFields.filter((field) =>
      ["count", "base_state", "location_filter"].includes(field.name),
    ),
  },
  {
    title: "Outcome",
    fields: filterFields.filter((field) =>
      ["description", "events"].includes(field.name),
    ),
  },
];

const emptyPitchOptions: PitchFilterOptions = {
  seasons: [],
  game_dates: [],
  pitch_types: [],
  batter_hands: [],
  descriptions: [],
  events: [],
  velocity: {
    min: null,
    max: null,
  },
};

const initialCompareFilters: CompareFilters = {
  pitcher_id: "",
  pitcher_name: "",
  a_start: "",
  a_end: "",
  b_start: "",
  b_end: "",
};

const compareFields = [
  { name: "a_start", label: "Period A Start", type: "date", required: true },
  { name: "a_end", label: "Period A End", type: "date", required: true },
  { name: "b_start", label: "Period B Start", type: "date", required: true },
  { name: "b_end", label: "Period B End", type: "date", required: true },
] as const;

const descriptionLabels: Record<string, string> = {
  ball: "Ball",
  blocked_ball: "Blocked Ball",
  called_strike: "Called Strike",
  foul: "Foul",
  foul_bunt: "Foul Bunt",
  foul_tip: "Foul Tip",
  hit_by_pitch: "Hit By Pitch",
  hit_into_play: "Ball In Play",
  hit_into_play_no_out: "Ball In Play, No Out",
  hit_into_play_score: "Ball In Play, Run Scores",
  missed_bunt: "Missed Bunt",
  swinging_strike: "Swinging Strike",
  swinging_strike_blocked: "Swinging Strike, Blocked",
};

const eventLabels: Record<string, string> = {
  double: "Double",
  field_error: "Field Error",
  field_out: "Field Out",
  fielders_choice: "Fielder's Choice",
  fielders_choice_out: "Fielder's Choice Out",
  force_out: "Force Out",
  grounded_into_double_play: "Grounded Into Double Play",
  hit_by_pitch: "Hit By Pitch",
  home_run: "Home Run",
  sac_bunt: "Sac Bunt",
  sac_fly: "Sac Fly",
  single: "Single",
  strikeout: "Strikeout",
  strikeout_double_play: "Strikeout Double Play",
  triple: "Triple",
  walk: "Walk",
};

const battedBallLabels: Record<string, string> = {
  ground_ball: "Ground Ball",
  line_drive: "Line Drive",
  fly_ball: "Fly Ball",
  popup: "Popup",
};

function formatValue(value: string | number | null | undefined) {
  return value ?? "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = dateFromIso(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = dateFromIso(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? "-" : value.toFixed(digits);
}

function formatBreak(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : (value * 12).toFixed(1);
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const csv = [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, kind: "rate" | "number") {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return kind === "rate"
    ? `${sign}${(value * 100).toFixed(1)} pts`
    : `${sign}${value.toFixed(1)}`;
}

function titleCaseCode(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDescription(value: string | null | undefined) {
  if (!value) return "";
  return descriptionLabels[value] ?? titleCaseCode(value);
}

function formatEvent(value: string | null | undefined) {
  if (!value) return "";
  return eventLabels[value] ?? titleCaseCode(value);
}

function formatBattedBall(value: string | null | undefined) {
  if (!value) return "-";
  return battedBallLabels[value] ?? titleCaseCode(value);
}

function formatBatter(pitch: PitchResult) {
  return pitch.batter_name ?? "";
}

function searchFiltersPitcherName(filters: Pick<CompareFilters, "pitcher_name" | "pitcher_id">) {
  return filters.pitcher_name || (filters.pitcher_id ? `Pitcher ${filters.pitcher_id}` : "selected pitcher");
}

function pitchSortValue(pitch: PitchResult, key: PitchSortKey) {
  if (key === "batter_name") return formatBatter(pitch);
  if (key === "location") return describePlateLocation(pitch);
  if (key === "count") {
    if (pitch.balls === null || pitch.strikes === null) return null;
    return pitch.balls * 10 + pitch.strikes;
  }
  return pitch[key];
}

function compareSortValues(
  aValue: string | number | null | undefined,
  bValue: string | number | null | undefined,
) {
  const aMissing = aValue === null || aValue === undefined || aValue === "";
  const bMissing = bValue === null || bValue === undefined || bValue === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof aValue === "number" && typeof bValue === "number") {
    return aValue - bValue;
  }

  return String(aValue).localeCompare(String(bValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function describePlateLocation(pitch: PitchResult) {
  if (pitch.plate_x === null || pitch.plate_z === null) return "";

  if (pitch.plate_z > 3.5) return "Above Zone";
  if (pitch.plate_z < 1.5) return "Below Zone";

  const vertical = pitch.plate_z >= 2.5 ? "High" : "Low";
  if (Math.abs(pitch.plate_x) <= 0.28) return `${vertical} Heart`;

  if (Math.abs(pitch.plate_x) > 0.83) {
    return pitch.plate_x < 0 ? `${vertical} Off Left` : `${vertical} Off Right`;
  }

  if (pitch.stand === "R") {
    return pitch.plate_x < 0 ? `${vertical} Inside` : `${vertical} Away`;
  }
  if (pitch.stand === "L") {
    return pitch.plate_x > 0 ? `${vertical} Inside` : `${vertical} Away`;
  }

  return pitch.plate_x < 0 ? `${vertical} Left` : `${vertical} Right`;
}

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inclusiveDayCount(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function collectPitchTypes(comparison: PitcherCompareResponse) {
  return Array.from(
    new Set([
      ...Object.keys(comparison.period_a.metrics.pitch_usage),
      ...Object.keys(comparison.period_b.metrics.pitch_usage),
      ...Object.keys(comparison.deltas.pitch_usage),
      ...Object.keys(comparison.period_a.metrics.average_velocity),
      ...Object.keys(comparison.period_b.metrics.average_velocity),
      ...Object.keys(comparison.period_a.metrics.average_spin_rate),
      ...Object.keys(comparison.period_b.metrics.average_spin_rate),
      ...Object.keys(comparison.period_a.metrics.average_induced_vertical_break),
      ...Object.keys(comparison.period_b.metrics.average_induced_vertical_break),
      ...Object.keys(comparison.period_a.metrics.average_horizontal_break),
      ...Object.keys(comparison.period_b.metrics.average_horizontal_break),
    ]),
  ).sort();
}

function largestDeltaLabel(
  values: Record<string, number | null | undefined>,
  kind: "rate" | "number",
) {
  const largest = Object.entries(values)
    .filter((entry): entry is [string, number] => entry[1] !== null && entry[1] !== undefined)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  return largest ? `${largest[0]} ${formatDelta(largest[1], kind)}` : "-";
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState("Checking backend...");
  const [activeView, setActiveView] = useState<ActiveView>("explorer");
  const [filters, setFilters] = useState<PitchFilters>(initialFilters);
  const [results, setResults] = useState<PitchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [heatmap, setHeatmap] = useState<PitchHeatmapResponse | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("all");
  const [lastPitchSearchFilters, setLastPitchSearchFilters] = useState<PitchFilters | null>(null);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pitchSort, setPitchSort] = useState<{
    key: PitchSortKey;
    direction: SortDirection;
  }>({ key: "game_date", direction: "desc" });
  const [pitchers, setPitchers] = useState<CachedPitcher[]>([]);
  const [pitcherError, setPitcherError] = useState<string | null>(null);
  const [pitchOptions, setPitchOptions] = useState<PitchFilterOptions>(emptyPitchOptions);
  const [pitchOptionsError, setPitchOptionsError] = useState<string | null>(null);
  const [compareFilters, setCompareFilters] = useState<CompareFilters>(
    initialCompareFilters,
  );
  const [comparison, setComparison] = useState<PitcherCompareResponse | null>(
    null,
  );
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparePitchTypes, setComparePitchTypes] = useState<string[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [comparisonName, setComparisonName] = useState("");

  useEffect(() => {
    let isMounted = true;

    getHealth()
      .then((health) => {
        if (!isMounted) return;
        setBackendStatus(health.status === "ok" ? "connected" : "error");
        setStatusText(
          health.status === "ok"
            ? "Backend connected"
            : `Backend status: ${health.status}`,
        );
      })
      .catch((error: Error) => {
        if (!isMounted) return;
        setBackendStatus("error");
        setStatusText(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("relay.savedComparisons");
    setSavedComparisons(stored ? JSON.parse(stored) : []);
  }, []);

  useEffect(() => {
    getPitchers()
      .then((response) => {
        setPitchers(response.results);
        setPitcherError(null);
      })
      .catch((error: Error) => {
        setPitchers([]);
        setPitcherError(error.message);
      });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      getPitchFilterOptions({
        pitcher_id: filters.pitcher_id,
        pitcher_name: filters.pitcher_name,
        season: filters.season,
        start_date: filters.start_date,
        end_date: filters.end_date,
        pitch_type: filters.pitch_type,
        balls: filters.balls,
        strikes: filters.strikes,
        batter_hand: filters.batter_hand,
        description: filters.description,
        events: filters.events,
        base_state: filters.base_state,
        location_filter: filters.location_filter,
      })
        .then((options) => {
          setPitchOptions(options);
          setPitchOptionsError(null);
        })
        .catch((error: Error) => {
          setPitchOptions(emptyPitchOptions);
          setPitchOptionsError(error.message);
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    filters.pitcher_id,
    filters.pitcher_name,
    filters.season,
    filters.start_date,
    filters.end_date,
    filters.pitch_type,
    filters.balls,
    filters.strikes,
    filters.batter_hand,
    filters.description,
    filters.events,
    filters.base_state,
    filters.location_filter,
  ]);

  useEffect(() => {
    setFilters((currentFilters) => {
      const nextFilters = { ...currentFilters };
      let changed = false;

      if (
        currentFilters.pitch_type &&
        pitchOptions.pitch_types.length > 0 &&
        !pitchOptions.pitch_types.includes(currentFilters.pitch_type)
      ) {
        nextFilters.pitch_type = "";
        changed = true;
      }
      if (
        currentFilters.batter_hand &&
        pitchOptions.batter_hands.length > 0 &&
        !pitchOptions.batter_hands.includes(currentFilters.batter_hand)
      ) {
        nextFilters.batter_hand = "";
        changed = true;
      }

      return changed ? nextFilters : currentFilters;
    });
  }, [pitchOptions.pitch_types, pitchOptions.batter_hands]);

  function matchesPitcherInput(
    pitcher: CachedPitcher,
    pitcherId: string | undefined,
    pitcherName: string | undefined,
  ) {
    const normalizedPitcherId = pitcherId?.trim() ?? "";
    const normalizedPitcherName = pitcherName?.trim().toLowerCase() ?? "";
    return (
      String(pitcher.pitcher) === normalizedPitcherId ||
      (normalizedPitcherName.length > 0 &&
        pitcher.player_name.toLowerCase() === normalizedPitcherName)
    );
  }

  function selectedPitcherForFilters(
    pitcherFilters: Pick<PitchFilters, "pitcher_id" | "pitcher_name">,
  ) {
    return pitchers.find((pitcher) =>
      matchesPitcherInput(pitcher, pitcherFilters.pitcher_id, pitcherFilters.pitcher_name),
    );
  }

  function selectedExplorerPitcher() {
    return selectedPitcherForFilters(filters);
  }

  function resolvableExplorerPitcher() {
    return selectedExplorerPitcher() ?? bestPitcherNameMatch(filters.pitcher_name ?? "");
  }

  function selectedComparePitcher() {
    return pitchers.find((pitcher) =>
      matchesPitcherInput(
        pitcher,
        compareFilters.pitcher_id,
        compareFilters.pitcher_name,
      ),
    );
  }

  function compareDateRangePitcher() {
    return selectedComparePitcher() ?? bestPitcherNameMatch(compareFilters.pitcher_name);
  }

  function resolvableComparePitcher() {
    return selectedComparePitcher() ?? bestPitcherNameMatch(compareFilters.pitcher_name);
  }

  function bestPitcherNameMatch(pitcherName: string) {
    const query = pitcherName.trim().toLowerCase();
    if (!query) return null;

    const rankedMatches = [
      pitchers.filter((pitcher) => pitcher.player_name.toLowerCase() === query),
      pitchers.filter((pitcher) =>
        pitcher.player_name
          .toLowerCase()
          .split(/\s+/)
          .some((token) => token === query),
      ),
      pitchers.filter((pitcher) =>
        pitcher.player_name
          .toLowerCase()
          .split(/\s+/)
          .some((token) => token.startsWith(query)),
      ),
      pitchers.filter((pitcher) => pitcher.player_name.toLowerCase().includes(query)),
    ];

    for (const matches of rankedMatches) {
      const uniqueMatches = Array.from(
        new Map(matches.map((pitcher) => [pitcher.player_name, pitcher])).values(),
      );
      if (uniqueMatches.length === 1) {
        return uniqueMatches[0];
      }
    }

    return null;
  }

  function completePitcherName<T extends Pick<PitchFilters, "pitcher_name">>(
    currentFilters: T,
  ) {
    const match = bestPitcherNameMatch(currentFilters.pitcher_name ?? "");
    return match ? { ...currentFilters, pitcher_name: match.player_name } : currentFilters;
  }

  function datasetFreshness() {
    if (pitchers.length === 0) return null;
    const totalPitches = pitchers.reduce((sum, pitcher) => sum + pitcher.pitch_count, 0);
    const firstDate = pitchers
      .map((pitcher) => pitcher.first_game_date)
      .sort()[0];
    const lastDate = pitchers
      .map((pitcher) => pitcher.last_game_date)
      .sort()
      .at(-1);

    return `${pitchers.length} pitchers | ${totalPitches} pitches | ${firstDate} to ${lastDate}`;
  }

  function hasComparePresetRange(preset: ComparePreset, pitcher = compareDateRangePitcher()) {
    if (!pitcher) return false;
    const first = dateFromIso(pitcher.first_game_date);
    const last = dateFromIso(pitcher.last_game_date);
    const days = inclusiveDayCount(
      first,
      last,
    );
    if (preset === "first_second") return days >= 2;
    if (preset === "month_month") return monthKey(first) !== monthKey(last);
    return days >= 60;
  }

  function setComparePreset(preset: ComparePreset) {
    const pitcher = compareDateRangePitcher();
    if (!pitcher) {
      setCompareError("Enter a cached pitcher before using a preset.");
      return;
    }
    if (!hasComparePresetRange(preset, pitcher)) {
      setCompareError(
        preset === "first_second"
          ? "This pitcher needs at least two cached dates for a first-half comparison."
          : preset === "month_month"
            ? "This pitcher needs cached data in at least two calendar months for this preset."
            : "This pitcher needs at least 60 cached dates for this 30-day preset.",
      );
      return;
    }

    setCompareError(null);
    const first = dateFromIso(pitcher.first_game_date);
    const last = dateFromIso(pitcher.last_game_date);
    const days = inclusiveDayCount(first, last);

    if (preset === "first_second") {
      const periodADays = Math.floor(days / 2);
      const aEnd = addDays(first, periodADays - 1);
      const bStart = addDays(aEnd, 1);
      setCompareFilters((current) => ({
        ...current,
        a_start: isoDate(first),
        a_end: isoDate(aEnd),
        b_start: isoDate(bStart),
        b_end: isoDate(last),
      }));
    } else if (preset === "last30_previous30") {
      const bStart = addDays(last, -29);
      const aEnd = addDays(bStart, -1);
      const aStart = addDays(aEnd, -29);
      setCompareFilters((current) => ({
        ...current,
        a_start: isoDate(aStart),
        a_end: isoDate(aEnd),
        b_start: isoDate(bStart),
        b_end: isoDate(last),
      }));
    } else {
      const aEnd = endOfMonth(first);
      const bStart = startOfNextMonth(first);
      const bEnd = endOfMonth(bStart) > last ? last : endOfMonth(bStart);
      setCompareFilters((current) => ({
        ...current,
        a_start: isoDate(first),
        a_end: isoDate(aEnd),
        b_start: isoDate(bStart),
        b_end: isoDate(bEnd),
      }));
    }
  }

  function updateFilter(name: keyof PitchFilters, value: string) {
    const [balls, strikes] = value.split("-");
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
      ...(name === "pitcher_name"
        ? {
            season: "",
            single_game: "",
            start_date: "",
            end_date: "",
            pitch_type: "",
            count: "",
            balls: "",
            strikes: "",
            min_velocity: "",
            max_velocity: "",
            batter_hand: "",
            description: "",
            events: "",
            base_state: "",
            location_filter: "",
          }
        : {}),
      ...(name === "single_game" ? { start_date: value, end_date: value } : {}),
      ...(name === "start_date" || name === "end_date" ? { single_game: "" } : {}),
      ...(name === "count"
        ? {
            balls: value ? balls : "",
            strikes: value ? strikes : "",
          }
        : {}),
    }));
  }

  function updateCompareFilter(name: keyof CompareFilters, value: string) {
    setCompareFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
      ...(name === "pitcher_name"
        ? {
            pitcher_id: "",
            a_start: "",
            a_end: "",
            b_start: "",
            b_end: "",
          }
        : {}),
    }));
  }

  function filterSelectOptions(name: keyof PitchFilters) {
    if (name === "season") {
      return pitchOptions.seasons.map((season) => ({
        value: String(season),
        label: String(season),
      }));
    }
    if (name === "single_game") {
      return pitchOptions.game_dates.map((game) => ({
        value: game.game_date,
        label: [
          formatShortDate(game.game_date),
          game.opponent_team
            ? `vs ${game.opponent_team}`
            : game.away_team && game.home_team
              ? `${game.away_team} at ${game.home_team}`
              : null,
          `${game.pitch_count} pitches`,
        ]
          .filter(Boolean)
          .join(" - "),
      }));
    }
    if (name === "pitch_type") {
      return pitchOptions.pitch_types.map((pitchType) => ({
        value: pitchType,
        label: pitchType,
      }));
    }
    if (name === "count") {
      return ["0-0", "0-1", "0-2", "1-0", "1-1", "1-2", "2-0", "2-1", "2-2", "3-0", "3-1", "3-2"].map(
        (count) => ({ value: count, label: count }),
      );
    }
    if (name === "batter_hand") {
      const batterHands = pitchOptions.batter_hands.length
        ? pitchOptions.batter_hands
        : ["L", "R"];
      return batterHands.map((hand) => ({
        value: hand,
        label: hand === "L" ? "Left" : hand === "R" ? "Right" : hand,
      }));
    }
    if (name === "base_state") {
      return [
        { value: "bases_empty", label: "Bases Empty" },
        { value: "runners_on", label: "Runners On" },
      ];
    }
    if (name === "location_filter") {
      return [
        { value: "zone", label: "In Zone" },
        { value: "out_of_zone", label: "Out of Zone" },
      ];
    }
    if (name === "result_order") {
      return [
        { value: "latest", label: "Latest Pitches" },
        { value: "oldest", label: "Oldest Pitches" },
        { value: "random", label: "Random Sample" },
      ];
    }
    if (name === "limit") {
      return ["100", "250", "500", "1000", "2500", "5000"].map((value) => ({
        value,
        label: value,
      }));
    }
    return [];
  }

  function isFilterDisabled(name: keyof PitchFilters) {
    if (name === "pitcher_name" || name === "result_order" || name === "limit") {
      return false;
    }
    return !selectedExplorerPitcher();
  }

  function datalistForFilter(name: keyof PitchFilters) {
    if (name === "pitcher_name") return "cached-pitchers";
    if (name === "description") return "pitch-descriptions";
    if (name === "events") return "pitch-events";
    return undefined;
  }

  function filterDisplayValue(name: keyof PitchFilters, value: string) {
    if (name === "batter_hand") {
      return value === "L" ? "Left" : value === "R" ? "Right" : value;
    }
    if (name === "base_state") {
      return value === "bases_empty" ? "Bases Empty" : "Runners On";
    }
    if (name === "location_filter") {
      return value === "zone" ? "In Zone" : "Out of Zone";
    }
    if (name === "description") return formatDescription(value);
    if (name === "events") return formatEvent(value);
    if (name === "single_game") return formatDate(value);
    if (name === "count") return value;
    if (name === "result_order") {
      return filterSelectOptions(name).find((option) => option.value === value)?.label ?? value;
    }
    return value;
  }

  function filterLabel(name: keyof PitchFilters) {
    return filterFields.find((field) => field.name === name)?.label ?? name;
  }

  function activePitchFilters() {
    return Object.entries(filters)
      .filter(
        (entry): entry is [keyof PitchFilters, string] =>
          Boolean(entry[1]?.trim()) &&
          entry[1] !== initialFilters[entry[0] as keyof PitchFilters] &&
          entry[0] !== "balls" &&
          entry[0] !== "strikes",
      )
      .map(([name, value]) => ({
        name,
        label: filterLabel(name),
        value: filterDisplayValue(name, value),
      }));
  }

  function removePitchFilter(name: keyof PitchFilters) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: "",
      ...(name === "single_game" ? { start_date: "", end_date: "" } : {}),
      ...(name === "count" ? { balls: "", strikes: "" } : {}),
    }));
  }

  function clearPitchFilters() {
    setFilters(initialFilters);
    setResults([]);
    setResultCount(0);
    setTotalResultCount(0);
    setHeatmap(null);
    setLastPitchSearchFilters(null);
    setSearchError(null);
  }

  function compareFieldLabel(name: keyof CompareFilters) {
    if (name === "pitcher_name") return "Pitcher";
    if (name === "pitcher_id") return "Pitcher ID";
    return compareFields.find((field) => field.name === name)?.label ?? name;
  }

  function activeCompareFilters() {
    return Object.entries(compareFilters)
      .filter((entry): entry is [keyof CompareFilters, string] => Boolean(entry[1]?.trim()))
      .map(([name, value]) => ({
        name,
        label: compareFieldLabel(name),
        value,
      }));
  }

  function removeCompareFilter(name: keyof CompareFilters) {
    setCompareFilters((currentFilters) => ({ ...currentFilters, [name]: "" }));
  }

  function clearCompareFilters() {
    setCompareFilters(initialCompareFilters);
    setComparison(null);
    setCompareError(null);
    setComparePitchTypes([]);
  }

  function renderPitchFilterField(field: FilterField) {
    return (
      <label className="filter-field" key={field.name}>
        <span>{field.label}</span>
        {field.type === "select" ? (
          <select
            disabled={isFilterDisabled(field.name)}
            name={field.name}
            value={filters[field.name]}
            onChange={(event) => updateFilter(field.name, event.target.value)}
          >
            <option value="">
              {isFilterDisabled(field.name)
                ? "Select a pitcher first"
                : "Any"}
            </option>
            {filterSelectOptions(field.name).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            list={datalistForFilter(field.name)}
            disabled={isFilterDisabled(field.name)}
            inputMode={field.type === "number" ? "numeric" : "text"}
            name={field.name}
            type={field.type}
            min={
              field.name === "start_date" || field.name === "end_date"
                ? selectedExplorerPitcher()?.first_game_date
                : (field.name === "min_velocity" || field.name === "max_velocity") &&
                    pitchOptions.velocity.min !== null
                ? pitchOptions.velocity.min
                : undefined
            }
            max={
              field.name === "start_date" || field.name === "end_date"
                ? selectedExplorerPitcher()?.last_game_date
                : (field.name === "min_velocity" || field.name === "max_velocity") &&
                    pitchOptions.velocity.max !== null
                ? pitchOptions.velocity.max
                : undefined
            }
            placeholder={
              field.name === "min_velocity" && pitchOptions.velocity.min !== null
                ? `>= ${pitchOptions.velocity.min.toFixed(1)}`
                : field.name === "max_velocity" && pitchOptions.velocity.max !== null
                  ? `<= ${pitchOptions.velocity.max.toFixed(1)}`
                  : undefined
            }
            step={
              field.name === "min_velocity" || field.name === "max_velocity"
                ? "0.1"
                : "1"
            }
            value={filters[field.name]}
            onBlur={() => {
              if (field.name === "pitcher_name") {
                setFilters((currentFilters) => completePitcherName(currentFilters));
              }
            }}
            onChange={(event) => updateFilter(field.name, event.target.value)}
          />
        )}
      </label>
    );
  }

  function updatePitchSort(key: PitchSortKey) {
    setPitchSort((currentSort) => ({
      key,
      direction:
        currentSort.key === key && currentSort.direction === "asc" ? "desc" : "asc",
    }));
  }

  function renderSortableHeader(key: PitchSortKey, label: string) {
    const isActive = pitchSort.key === key;
    return (
      <th aria-sort={isActive ? (pitchSort.direction === "asc" ? "ascending" : "descending") : "none"}>
        <button
          className={isActive ? "table-sort-button is-active" : "table-sort-button"}
          onClick={() => updatePitchSort(key)}
          type="button"
        >
          <span>{label}</span>
          <span aria-hidden="true">{isActive ? (pitchSort.direction === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchFilters = completePitcherName(filters);
    const pitcher = selectedPitcherForFilters(searchFilters);
    if (!pitcher) {
      setFilters(searchFilters);
      setSearchError("Choose a cached pitcher before searching.");
      return;
    }

    setFilters(searchFilters);
    setIsSearching(true);
    setIsHeatmapLoading(true);
    setSearchError(null);

    try {
      const [response, heatmapResponse] = await Promise.all([
        searchPitches(searchFilters),
        getPitchHeatmap(searchFilters, heatmapMode),
      ]);
      setResults(response.results);
      setResultCount(response.count);
      setTotalResultCount(response.total_count);
      setHeatmap(heatmapResponse);
      setLastPitchSearchFilters(searchFilters);
    } catch (error) {
      setResults([]);
      setResultCount(0);
      setTotalResultCount(0);
      setHeatmap(null);
      setLastPitchSearchFilters(null);
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
      setIsHeatmapLoading(false);
    }
  }

  async function updateHeatmapMode(mode: HeatmapMode) {
    setHeatmapMode(mode);
    if (!lastPitchSearchFilters) return;

    setIsHeatmapLoading(true);
    setSearchError(null);
    try {
      setHeatmap(await getPitchHeatmap(lastPitchSearchFilters, mode));
    } catch (error) {
      setHeatmap(null);
      setSearchError(error instanceof Error ? error.message : "Heatmap failed");
    } finally {
      setIsHeatmapLoading(false);
    }
  }

  async function handleCompare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchFilters = completePitcherName(compareFilters);
    setCompareFilters(searchFilters);

    if (!selectedPitcherForFilters(searchFilters)) {
      setCompareError("Choose a cached pitcher before comparing.");
      return;
    }

    if (!searchFilters.a_start || !searchFilters.a_end || !searchFilters.b_start || !searchFilters.b_end) {
      setCompareError("Choose start and end dates for both periods.");
      return;
    }

    setIsComparing(true);
    setCompareError(null);

    try {
      const response = await comparePitcher(searchFilters);
      setComparison(response);
      setComparePitchTypes(collectPitchTypes(response));
    } catch (error) {
      setComparison(null);
      setCompareError(
        error instanceof Error ? error.message : "Comparison failed",
      );
    } finally {
      setIsComparing(false);
    }
  }

  const pitchTypes = comparison ? collectPitchTypes(comparison) : [];
  const visiblePitchTypes =
    comparePitchTypes.length > 0 ? pitchTypes.filter((pitchType) => comparePitchTypes.includes(pitchType)) : pitchTypes;
  const topUsageDelta = comparison
    ? largestDeltaLabel(
        Object.fromEntries(
          Object.entries(comparison.deltas.pitch_usage).map(([pitchType, metric]) => [
            pitchType,
            metric.rate,
          ]),
        ),
        "rate",
      )
    : "-";
  const topVelocityDelta = comparison
    ? largestDeltaLabel(comparison.deltas.average_velocity, "number")
    : "-";
  const topSpinDelta = comparison
    ? largestDeltaLabel(comparison.deltas.average_spin_rate, "number")
    : "-";
  const freshness = datasetFreshness();
  const compareDateRange = compareDateRangePitcher();
  const comparePitcherSelection = resolvableComparePitcher();
  const canCompare =
    Boolean(comparePitcherSelection) &&
    Boolean(
      compareFilters.a_start &&
        compareFilters.a_end &&
        compareFilters.b_start &&
        compareFilters.b_end,
    );
  const sortedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        const comparison = compareSortValues(
          pitchSortValue(a, pitchSort.key),
          pitchSortValue(b, pitchSort.key),
        );
        return pitchSort.direction === "asc" ? comparison : comparison * -1;
      }),
    [results, pitchSort],
  );
  const arsenalSummary = Array.from(
    results.reduce((groups, pitch) => {
      const pitchType = pitch.pitch_type ?? "Unknown";
      const current = groups.get(pitchType) ?? {
        pitchType,
        count: 0,
        velocity: [] as number[],
        spin: [] as number[],
        ivb: [] as number[],
        hb: [] as number[],
      };
      current.count += 1;
      if (pitch.release_speed !== null) current.velocity.push(pitch.release_speed);
      if (pitch.release_spin_rate !== null) current.spin.push(pitch.release_spin_rate);
      if (pitch.pfx_z !== null) current.ivb.push(pitch.pfx_z * 12);
      if (pitch.pfx_x !== null) current.hb.push(pitch.pfx_x * 12);
      groups.set(pitchType, current);
      return groups;
    }, new Map<string, { pitchType: string; count: number; velocity: number[]; spin: number[]; ivb: number[]; hb: number[] }>()),
  )
    .map((entry) => entry[1])
    .sort((a, b) => b.count - a.count);
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  function saveCurrentComparison() {
    if (!comparisonName.trim()) return;
    const next = [
      {
        id: crypto.randomUUID(),
        name: comparisonName.trim(),
        filters: compareFilters,
        created_at: new Date().toISOString(),
      },
      ...savedComparisons,
    ];
    setSavedComparisons(next);
    window.localStorage.setItem("relay.savedComparisons", JSON.stringify(next));
    setComparisonName("");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Relay</h1>
          <p>Baseball analytics for exploring Statcast pitch data</p>
        </div>
        <div className={`status-pill status-pill--${backendStatus}`}>
          <span className="status-dot" />
          <span>{statusText}</span>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Relay views">
        <button
          className={activeView === "explorer" ? "view-tab is-active" : "view-tab"}
          onClick={() => setActiveView("explorer")}
          type="button"
        >
          Pitch Explorer
        </button>
        <button
          className={activeView === "compare" ? "view-tab is-active" : "view-tab"}
          onClick={() => setActiveView("compare")}
          type="button"
        >
          Compare
        </button>
      </nav>
      {freshness ? <div className="data-freshness">Cache: {freshness}</div> : null}
      <datalist id="cached-pitchers">
        {pitchers.map((pitcher) => (
          <option key={pitcher.pitcher} value={pitcher.player_name} />
        ))}
      </datalist>
      <datalist id="pitch-descriptions">
        {pitchOptions.descriptions.map((description) => (
          <option key={description} value={description} label={formatDescription(description)} />
        ))}
      </datalist>
      <datalist id="pitch-events">
        {pitchOptions.events.map((event) => (
          <option key={event} value={event} label={formatEvent(event)} />
        ))}
      </datalist>

      {activeView === "explorer" ? (
        <section className="page-section" aria-labelledby="pitch-explorer-title">
        <div className="section-heading">
          <h2 id="pitch-explorer-title">Pitch Explorer</h2>
          <span>{API_URL}</span>
        </div>

        <form className="filter-panel" onSubmit={handleSearch}>
          {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
          {pitchOptionsError ? <div className="inline-note">{pitchOptionsError}</div> : null}
          {selectedExplorerPitcher() ? (
            <div className="inline-note">
              Cached range: {selectedExplorerPitcher()?.first_game_date} to{" "}
              {selectedExplorerPitcher()?.last_game_date}
            </div>
          ) : resolvableExplorerPitcher() ? (
            <div className="inline-note pitcher-first-note">
              Press Search or leave the field to use {resolvableExplorerPitcher()?.player_name}.
            </div>
          ) : (
            <div className="inline-note pitcher-first-note">
              Choose a cached pitcher to unlock seasons, games, dates, pitch types, counts,
              locations, and outcomes.
            </div>
          )}
          {filterGroups.map((group) => (
            <section className="filter-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="filter-grid">
                {group.fields.map((field) => renderPitchFilterField(field))}
              </div>
            </section>
          ))}
          {activePitchFilters().length > 0 ? (
            <div className="active-filter-bar">
              <span>Active Filters</span>
              {activePitchFilters().map((filter) => (
                <button
                  className="filter-chip"
                  key={filter.name}
                  type="button"
                  onClick={() => removePitchFilter(filter.name)}
                >
                  {filter.label}: {filter.value} x
                </button>
              ))}
            </div>
          ) : null}
          <div className="form-actions">
            <button
              className="search-button"
              disabled={isSearching || !resolvableExplorerPitcher()}
              type="submit"
            >
              {isSearching
                ? "Searching..."
                : resolvableExplorerPitcher()
                  ? "Search"
                  : "Choose Pitcher"}
            </button>
            <button className="secondary-button" onClick={clearPitchFilters} type="button">
              Clear Filters
            </button>
          </div>
        </form>

        {searchError ? <div className="error-banner">{searchError}</div> : null}

        <div className="results-header">
          <h3>Results</h3>
          <span>
            {totalResultCount > resultCount
              ? `Showing ${resultCount} of ${totalResultCount} pitches`
              : `${resultCount} pitches`}
          </span>
        </div>
        {results.length > 0 ? (
          <button
            className="secondary-button"
            onClick={() =>
              downloadCsv(
                "relay-pitches.csv",
                results.map((pitch) => ({
                  game_date: formatDate(pitch.game_date),
                  player_name: pitch.player_name,
                  batter: formatBatter(pitch),
                  batter_hand: pitch.stand,
                  pitch_type: pitch.pitch_type,
                  release_speed: pitch.release_speed,
                  release_spin_rate: pitch.release_spin_rate,
                  p_throws: pitch.p_throws,
                  release_pos_x: pitch.release_pos_x,
                  release_pos_z: pitch.release_pos_z,
                  ivb_inches: pitch.pfx_z === null ? null : pitch.pfx_z * 12,
                  hb_inches: pitch.pfx_x === null ? null : pitch.pfx_x * 12,
                  plate_location: describePlateLocation(pitch),
                  plate_x: pitch.plate_x,
                  plate_z: pitch.plate_z,
                  batted_ball_type: formatBattedBall(pitch.bb_type),
                  exit_velocity: pitch.launch_speed,
                  launch_angle: pitch.launch_angle,
                  estimated_distance: pitch.hit_distance_sc,
                  expected_ba: pitch.estimated_ba_using_speedangle,
                  expected_woba: pitch.estimated_woba_using_speedangle,
                  woba_value: pitch.woba_value,
                  balls: pitch.balls,
                  strikes: pitch.strikes,
                  description: pitch.description,
                  events: pitch.events,
                })),
              )
            }
            type="button"
          >
            Export Results CSV
          </button>
        ) : null}

        {arsenalSummary.length > 0 ? (
          <section className="chart-panel">
            <div className="chart-heading">
              <h3>Arsenal Summary</h3>
              <span>Current result set</span>
            </div>
            <div className="table-wrap compact-table-wrap">
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Pitch</th>
                    <th>Count</th>
                    <th>Usage</th>
                    <th>Velo</th>
                    <th>Spin</th>
                    <th>IVB</th>
                    <th>HB</th>
                  </tr>
                </thead>
                <tbody>
                  {arsenalSummary.map((pitch) => (
                    <tr key={pitch.pitchType}>
                      <td>{pitch.pitchType}</td>
                      <td>{pitch.count}</td>
                      <td>{formatRate(pitch.count / results.length)}</td>
                      <td>{formatNumber(avg(pitch.velocity))}</td>
                      <td>{formatNumber(avg(pitch.spin), 0)}</td>
                      <td>{formatNumber(avg(pitch.ivb))}</td>
                      <td>{formatNumber(avg(pitch.hb))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <PitchHeatmap
          heatmap={heatmap}
          mode={heatmapMode}
          isLoading={isHeatmapLoading}
          onModeChange={updateHeatmapMode}
        />
        <StrikeZoneChart pitches={results} />
        <MovementChart pitches={results} />

        <div className="table-wrap">
          {results.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {renderSortableHeader("game_date", "Date")}
                  {renderSortableHeader("player_name", "Pitcher")}
                  {renderSortableHeader("batter_name", "Batter")}
                  {renderSortableHeader("pitch_type", "Type")}
                  {renderSortableHeader("release_speed", "Velocity")}
                  {renderSortableHeader("release_spin_rate", "Spin")}
                  {renderSortableHeader("pfx_z", "IVB")}
                  {renderSortableHeader("pfx_x", "HB")}
                  {renderSortableHeader("location", "Location")}
                  {renderSortableHeader("bb_type", "Contact")}
                  {renderSortableHeader("launch_speed", "Exit Velo")}
                  {renderSortableHeader("launch_angle", "Launch Angle")}
                  {renderSortableHeader("hit_distance_sc", "Distance")}
                  {renderSortableHeader("estimated_ba_using_speedangle", "xBA")}
                  {renderSortableHeader("estimated_woba_using_speedangle", "xwOBA")}
                  {renderSortableHeader("count", "Count")}
                  {renderSortableHeader("description", "Description")}
                  {renderSortableHeader("events", "Events")}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((pitch, index) => (
                  <tr
                    key={`${pitch.game_date}-${pitch.pitcher}-${pitch.batter}-${index}`}
                  >
                    <td>{formatDate(pitch.game_date)}</td>
                    <td>{formatValue(pitch.player_name)}</td>
                    <td>{formatBatter(pitch)}</td>
                    <td>{formatValue(pitch.pitch_type)}</td>
                    <td>{formatValue(pitch.release_speed)}</td>
                    <td>{formatNumber(pitch.release_spin_rate, 0)}</td>
                    <td>{formatBreak(pitch.pfx_z)}</td>
                    <td>{formatBreak(pitch.pfx_x)}</td>
                    <td>{describePlateLocation(pitch)}</td>
                    <td>{formatBattedBall(pitch.bb_type)}</td>
                    <td>{formatNumber(pitch.launch_speed)}</td>
                    <td>{formatNumber(pitch.launch_angle, 0)}</td>
                    <td>{formatNumber(pitch.hit_distance_sc, 0)}</td>
                    <td>{formatNumber(pitch.estimated_ba_using_speedangle, 3)}</td>
                    <td>{formatNumber(pitch.estimated_woba_using_speedangle, 3)}</td>
                    <td>
                      {pitch.balls ?? ""}
                      {pitch.balls !== null || pitch.strikes !== null ? "-" : ""}
                      {pitch.strikes ?? ""}
                    </td>
                    <td>{formatDescription(pitch.description)}</td>
                    <td>{formatEvent(pitch.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p>
                {isSearching
                  ? "Loading pitches..."
                  : selectedExplorerPitcher()
                    ? "Run a search to see cached Statcast pitches."
                    : "Choose a pitcher to begin exploring cached Statcast pitches."}
              </p>
            </div>
          )}
        </div>
      </section>
      ) : (
        <section className="page-section" aria-labelledby="compare-title">
          <div className="section-heading">
            <h2 id="compare-title">Pitcher Compare</h2>
            <span>{API_URL}</span>
          </div>

          <form className="filter-panel" onSubmit={handleCompare}>
            {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
            {compareDateRange ? (
              <div className="inline-note">
                Cached range: {compareDateRange.first_game_date} to{" "}
                {compareDateRange.last_game_date}
              </div>
            ) : (
              <div className="inline-note pitcher-first-note">
                Choose a cached pitcher to unlock period presets and date ranges.
              </div>
            )}
            <section className="filter-group">
              <h3>Pitcher</h3>
              <div className="filter-grid compare-filter-grid">
                <label className="filter-field">
                  <span>Pitcher</span>
                  <input
                    list="cached-pitchers"
                    name="pitcher_name"
                    type="text"
                    value={compareFilters.pitcher_name}
                    onBlur={() => {
                      setCompareFilters((currentFilters) =>
                        completePitcherName(currentFilters),
                      );
                    }}
                    onChange={(event) =>
                      updateCompareFilter("pitcher_name", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>
            <section className="filter-group">
              <h3>Periods</h3>
              <div className="filter-grid compare-filter-grid">
                {compareFields.map((field) => (
                <label className="filter-field" key={field.name}>
                  <span>{field.label}</span>
                  <input
                    disabled={!compareDateRange}
                    name={field.name}
                    type={field.type}
                    min={field.type === "date" ? compareDateRange?.first_game_date : undefined}
                    max={field.type === "date" ? compareDateRange?.last_game_date : undefined}
                    value={compareFilters[field.name]}
                    onChange={(event) =>
                      updateCompareFilter(field.name, event.target.value)
                    }
                    required={field.required}
                  />
                </label>
              ))}
              </div>
            </section>
            {activeCompareFilters().length > 0 ? (
              <div className="active-filter-bar">
                <span>Comparison Inputs</span>
                {activeCompareFilters().map((filter) => (
                  <button
                    className="filter-chip"
                    key={filter.name}
                    type="button"
                    onClick={() => removeCompareFilter(filter.name)}
                  >
                    {filter.label}: {filter.value} x
                  </button>
                ))}
              </div>
            ) : null}
            <div className="preset-row">
              <button
                disabled={!hasComparePresetRange("first_second", compareDateRange)}
                type="button"
                onClick={() => setComparePreset("first_second")}
              >
                First Half vs Second Half
              </button>
              <button
                disabled={!hasComparePresetRange("last30_previous30", compareDateRange)}
                type="button"
                onClick={() => setComparePreset("last30_previous30")}
              >
                Previous 30 vs Last 30
              </button>
              <button
                disabled={!hasComparePresetRange("month_month", compareDateRange)}
                type="button"
                onClick={() => setComparePreset("month_month")}
              >
                First Month vs Second Month
              </button>
            </div>
            <div className="form-actions">
              <button
                className="search-button"
                disabled={isComparing || !canCompare}
                type="submit"
              >
                {isComparing ? "Comparing..." : canCompare ? "Compare" : "Choose Periods"}
              </button>
              <button className="secondary-button" onClick={clearCompareFilters} type="button">
                Clear Compare
              </button>
            </div>
          </form>

          {compareError ? <div className="error-banner">{compareError}</div> : null}

          {comparison ? (
            <>
              <div className="compare-result-header">
                <div>
                  <h3>
                    {formatShortDate(comparison.period_a.start)} -{" "}
                    {formatShortDate(comparison.period_a.end)} vs{" "}
                    {formatShortDate(comparison.period_b.start)} -{" "}
                    {formatShortDate(comparison.period_b.end)}
                  </h3>
                  <p>
                    Period B minus Period A for {searchFiltersPitcherName(compareFilters)}
                  </p>
                </div>
                <div className="save-row">
                  <input
                    placeholder="Name this comparison"
                    value={comparisonName}
                    onChange={(event) => setComparisonName(event.target.value)}
                  />
                  <button className="secondary-button" onClick={saveCurrentComparison} type="button">
                    Save
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      downloadCsv(
                        "relay-comparison.csv",
                        visiblePitchTypes.map((pitchType) => ({
                          pitch_type: pitchType,
                          a_usage: comparison.period_a.metrics.pitch_usage[pitchType]?.rate,
                          b_usage: comparison.period_b.metrics.pitch_usage[pitchType]?.rate,
                          usage_delta: comparison.deltas.pitch_usage[pitchType]?.rate,
                          velocity_delta: comparison.deltas.average_velocity[pitchType],
                          spin_delta: comparison.deltas.average_spin_rate[pitchType],
                          ivb_delta: comparison.deltas.average_induced_vertical_break[pitchType],
                          hb_delta: comparison.deltas.average_horizontal_break[pitchType],
                        })),
                      )
                    }
                    type="button"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              {savedComparisons.length > 0 ? (
                <div className="saved-row">
                  <span>Saved</span>
                  {savedComparisons.map((saved) => (
                    <button
                      key={saved.id}
                      onClick={() => setCompareFilters(saved.filters)}
                      type="button"
                    >
                      {saved.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="pitch-type-toggles">
                <span>Pitch Types</span>
                {pitchTypes.map((pitchType) => (
                  <label key={pitchType}>
                    <input
                      checked={comparePitchTypes.includes(pitchType)}
                      onChange={(event) => {
                        setComparePitchTypes((current) =>
                          event.target.checked
                            ? [...current, pitchType]
                            : current.filter((value) => value !== pitchType),
                        );
                      }}
                      type="checkbox"
                    />
                    {pitchType}
                  </label>
                ))}
              </div>
              <div className="comparison-summary">
                <div className="metric-card">
                  <span>Usage Delta</span>
                  <strong>{topUsageDelta}</strong>
                </div>
                <div className="metric-card">
                  <span>Pitch-Type Velo Delta</span>
                  <strong>{topVelocityDelta}</strong>
                </div>
                <div className="metric-card">
                  <span>Pitch-Type Spin Delta</span>
                  <strong>{topSpinDelta}</strong>
                </div>
                <div className="metric-card">
                  <span>Pitch Count</span>
                  <strong>{formatDelta(comparison.deltas.pitch_count, "number")}</strong>
                </div>
                <div className="metric-card">
                  <span>Strike Rate</span>
                  <strong>{formatDelta(comparison.deltas.strike_rate, "rate")}</strong>
                </div>
                <div className="metric-card">
                  <span>Whiff Rate</span>
                  <strong>{formatDelta(comparison.deltas.whiff_rate, "rate")}</strong>
                </div>
                <div className="metric-card">
                  <span>Zone Rate</span>
                  <strong>{formatDelta(comparison.deltas.zone_rate, "rate")}</strong>
                </div>
              </div>

              <div className="comparison-panels">
                <section className="comparison-panel">
                  <h3>Period A</h3>
                  <p>
                    {comparison.period_a.start} to {comparison.period_a.end}
                  </p>
                  <div className="summary-row">
                    <span>Pitches</span>
                    <strong>{comparison.period_a.metrics.pitch_count}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Strike Rate</span>
                    <strong>{formatRate(comparison.period_a.metrics.strike_rate)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Whiff Rate</span>
                    <strong>{formatRate(comparison.period_a.metrics.whiff_rate)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Zone Rate</span>
                    <strong>{formatRate(comparison.period_a.metrics.zone_rate)}</strong>
                  </div>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Pitch</th>
                        <th>Usage</th>
                        <th>Velo</th>
                        <th>Spin</th>
                        <th>IVB</th>
                        <th>HB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{pitchType}</td>
                          <td>
                            {formatRate(
                              comparison.period_a.metrics.pitch_usage[pitchType]
                                ?.rate,
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_a.metrics.average_velocity[
                                pitchType
                              ],
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_a.metrics.average_spin_rate[
                                pitchType
                              ],
                              0,
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_a.metrics
                                .average_induced_vertical_break[pitchType],
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_a.metrics.average_horizontal_break[
                                pitchType
                              ],
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="comparison-panel">
                  <h3>Period B</h3>
                  <p>
                    {comparison.period_b.start} to {comparison.period_b.end}
                  </p>
                  <div className="summary-row">
                    <span>Pitches</span>
                    <strong>{comparison.period_b.metrics.pitch_count}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Strike Rate</span>
                    <strong>{formatRate(comparison.period_b.metrics.strike_rate)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Whiff Rate</span>
                    <strong>{formatRate(comparison.period_b.metrics.whiff_rate)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Zone Rate</span>
                    <strong>{formatRate(comparison.period_b.metrics.zone_rate)}</strong>
                  </div>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>Pitch</th>
                        <th>Usage</th>
                        <th>Velo</th>
                        <th>Spin</th>
                        <th>IVB</th>
                        <th>HB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{pitchType}</td>
                          <td>
                            {formatRate(
                              comparison.period_b.metrics.pitch_usage[pitchType]
                                ?.rate,
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_b.metrics.average_velocity[
                                pitchType
                              ],
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_b.metrics.average_spin_rate[
                                pitchType
                              ],
                              0,
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_b.metrics
                                .average_induced_vertical_break[pitchType],
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              comparison.period_b.metrics.average_horizontal_break[
                                pitchType
                              ],
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              <div className="results-header">
                <h3>Pitch-Type Diff</h3>
                <span>Period B minus Period A</span>
              </div>
              <div className="table-wrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Pitch</th>
                      <th>A Usage</th>
                      <th>B Usage</th>
                      <th>Usage Delta</th>
                      <th>A Velo</th>
                      <th>B Velo</th>
                      <th>Velo Delta</th>
                      <th>Spin Delta</th>
                      <th>IVB Delta</th>
                      <th>HB Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePitchTypes.map((pitchType) => (
                      <tr key={pitchType}>
                        <td>{pitchType}</td>
                        <td>
                          {formatRate(
                            comparison.period_a.metrics.pitch_usage[pitchType]
                              ?.rate,
                          )}
                        </td>
                        <td>
                          {formatRate(
                            comparison.period_b.metrics.pitch_usage[pitchType]
                              ?.rate,
                          )}
                        </td>
                        <td>
                          {formatDelta(
                            comparison.deltas.pitch_usage[pitchType]?.rate,
                            "rate",
                          )}
                        </td>
                        <td>
                          {formatNumber(
                            comparison.period_a.metrics.average_velocity[
                              pitchType
                            ],
                          )}
                        </td>
                        <td>
                          {formatNumber(
                            comparison.period_b.metrics.average_velocity[
                              pitchType
                            ],
                          )}
                        </td>
                        <td>
                          {formatDelta(
                            comparison.deltas.average_velocity[pitchType],
                            "number",
                          )}
                        </td>
                        <td>
                          {formatDelta(
                            comparison.deltas.average_spin_rate[pitchType],
                            "number",
                          )}
                        </td>
                        <td>
                          {formatDelta(
                            comparison.deltas.average_induced_vertical_break[
                              pitchType
                            ],
                            "number",
                          )}
                        </td>
                        <td>
                          {formatDelta(
                            comparison.deltas.average_horizontal_break[pitchType],
                            "number",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state bordered-empty">
              <p>
                {isComparing
                  ? "Loading comparison..."
                  : "Choose two date ranges to compare a pitcher's profile."}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
