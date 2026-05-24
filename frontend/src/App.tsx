import { useEffect, useMemo, useState } from "react";
import {
  API_URL,
  type CachedPitcher,
  type CacheMetadataResponse,
  type CompareFilters,
  type HeatmapMode,
  type DataQualityMetric,
  type PitchHeatmapResponse,
  type PitchFilterOptions,
  type PitcherCompareResponse,
  type PitchFilters,
  type PitchResult,
  type RelaySkillCall,
  type SavedComparison,
  comparePitcher,
  getCacheMetadata,
  getPitchDataQuality,
  getPitchHeatmap,
  getHealth,
  getPitchFilterOptions,
  getPitchers,
  parseNaturalLanguageQuery,
  searchPitches,
} from "./api";
import PitchExplorerView from "./views/PitchExplorerView";
import CompareView from "./views/CompareView";
import MovementChart from "./components/MovementChart";
import PitchHeatmap from "./components/PitchHeatmap";
import StrikeZoneChart from "./components/StrikeZoneChart";
import CompareMovementChart from "./components/CompareMovementChart";
import CompareDeltaHeatmap from "./components/CompareDeltaHeatmap";
import { formatPitchType, formatPitchTypeWithCode } from "./pitchTypes";
import { countLabel } from "./text";
import "./App.css";

type BackendStatus = "checking" | "connected" | "error";
type ActiveView = "home" | "explorer" | "compare";
type ThemeMode = "light" | "dark";
type ComparePreset =
  | "last30_previous30"
  | "month_month"
  | "latest_month_previous_month"
  | "previous_current_ytd"
  | "previous_current_season"
  | "previous_current_same_span"
  | "season_first_second";
type DateRange = {
  start: Date;
  end: Date;
};
type QueryFocusTarget = {
  target: string;
  nonce: number;
};
type ExplorerAnswerSnapshot = {
  filters: PitchFilters;
  results: PitchResult[];
  resultCount: number;
  totalResultCount: number;
  heatmap: PitchHeatmapResponse | null;
  heatmapMode: HeatmapMode;
  dataQualityMetrics: DataQualityMetric[];
  dataQualityPitchCount: number;
};

type CompareAnswerSnapshot = {
  filters: CompareFilters;
  comparison: PitcherCompareResponse | null;
  heatmapA: PitchHeatmapResponse | null;
  heatmapB: PitchHeatmapResponse | null;
  heatmapMode: HeatmapMode;
  visiblePitchTypes: string[];
};

type HomeAnswer = {
  id: string;
  view: "explorer" | "compare";
  target: string;
  query: string;
  createdAt: number;
  explorer?: ExplorerAnswerSnapshot;
  compare?: CompareAnswerSnapshot;
};
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
  pitch_type_group: "",
  count: "",
  balls: "",
  strikes: "",
  min_velocity: "",
  max_velocity: "",
  batter_hand: "",
  description: "",
  events: "",
  base_state: "",
  count_group: "",
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

function pitchField(name: FilterField["name"]) {
  return filterFields.find((field) => field.name === name)!;
}

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
  pitch_type: "",
  batter_hand: "",
  a_game: "",
  a_start: "",
  a_end: "",
  b_game: "",
  b_start: "",
  b_end: "",
};

const compareFields = [
  { name: "a_game", label: "Period 1 Game", type: "select", required: false },
  { name: "a_start", label: "Period 1 Start", type: "date", required: true },
  { name: "a_end", label: "Period 1 End", type: "date", required: true },
  { name: "b_game", label: "Period 2 Game", type: "select", required: false },
  { name: "b_start", label: "Period 2 Start", type: "date", required: true },
  { name: "b_end", label: "Period 2 End", type: "date", required: true },
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

const whiffDescriptions = new Set(["swinging_strike", "swinging_strike_blocked"]);

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

function formatDateRange(start: string | null | undefined, end: string | null | undefined) {
  return `${formatDate(start)} to ${formatDate(end)}`;
}

function formatShortDateRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "";
  const startDate = dateFromIso(start);
  const endDate = dateFromIso(end);

  if (
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    startDate.getFullYear() === endDate.getFullYear()
  ) {
    const monthDay = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${monthDay.format(startDate)} - ${monthDay.format(endDate)}, ${endDate.getFullYear()}`;
  }

  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
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

function formatQualityRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const percent = value * 100;
  if (percent === 0 || percent === 100) return `${percent.toFixed(0)}%`;
  if (percent < 0.1) return "<0.1%";
  if (percent > 99.9) return ">99.9%";
  if (percent < 1 || percent > 99) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(0)}%`;
}

function formatDelta(value: number | null | undefined, kind: "rate" | "number") {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return kind === "rate"
    ? `${sign}${(value * 100).toFixed(1)} pts`
    : `${sign}${value.toFixed(1)}`;
}

function formatDeltaWithUnit(
  value: number | null | undefined,
  kind: "rate" | "number",
  unit = "",
  digits = 1,
) {
  if (value === null || value === undefined) return "-";
  if (kind === "rate") return formatDelta(value, "rate");
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function formatNumberWithUnit(
  value: number | null | undefined,
  unit: string,
  digits = 1,
) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(digits)} ${unit}`;
}

function rateFromPitches(pitches: PitchResult[], predicate: (pitch: PitchResult) => boolean) {
  if (pitches.length === 0) return null;
  return pitches.filter(predicate).length / pitches.length;
}

function zoneRateFromPitches(pitches: PitchResult[]) {
  const locatedPitches = pitches.filter(
    (pitch) => pitch.plate_x !== null && pitch.plate_z !== null,
  );
  if (locatedPitches.length === 0) return null;

  return (
    locatedPitches.filter(
      (pitch) =>
        pitch.plate_x !== null &&
        pitch.plate_z !== null &&
        Math.abs(pitch.plate_x) <= 0.83 &&
        pitch.plate_z >= 1.5 &&
        pitch.plate_z <= 3.5,
    ).length / locatedPitches.length
  );
}

function whiffRateFromPitches(pitches: PitchResult[]) {
  return rateFromPitches(pitches, (pitch) =>
    pitch.description ? whiffDescriptions.has(pitch.description) : false,
  );
}

function rateDelta(period1Rate: number | null, period2Rate: number | null) {
  return period1Rate === null || period2Rate === null ? null : period2Rate - period1Rate;
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

function formatPersonName(value: string | null | undefined) {
  if (!value) return "";
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : value;
}

function searchFiltersPitcherName(filters: Pick<CompareFilters, "pitcher_name" | "pitcher_id">) {
  return formatPersonName(filters.pitcher_name) || (filters.pitcher_id ? "selected pitcher" : "selected pitcher");
}

function pitchPhraseFromTypes(pitchTypes: string[] | undefined, preferredTypes: string[]) {
  const availableTypes = new Set(pitchTypes ?? []);
  const pitchType = preferredTypes.find((type) => availableTypes.has(type));
  const phrases: Record<string, string> = {
    FF: "four seam fastballs",
    SI: "sinkers",
    FC: "cutters",
    SL: "sliders",
    ST: "sweepers",
    CU: "curveballs",
    KC: "knuckle curves",
    CH: "changeups",
    FS: "splitters",
  };
  return pitchType ? phrases[pitchType] ?? formatPitchType(pitchType).toLowerCase() : null;
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

function compareDateAsc(a: Date, b: Date) {
  return a.getTime() - b.getTime();
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
      ...Object.keys(comparison.period_a.metrics.average_arm_angle),
      ...Object.keys(comparison.period_b.metrics.average_arm_angle),
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

  return largest ? `${formatPitchType(largest[0])} ${formatDelta(largest[1], kind)}` : "-";
}

function averageNumbers(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState("Checking backend...");
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem("relay.theme") === "dark" ? "dark" : "light",
  );
  const [filters, setFilters] = useState<PitchFilters>(initialFilters);
  const [results, setResults] = useState<PitchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [totalResultCount, setTotalResultCount] = useState(0);
  const [heatmap, setHeatmap] = useState<PitchHeatmapResponse | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("all");
  const [resultDataQualityMetrics, setResultDataQualityMetrics] = useState<DataQualityMetric[]>([]);
  const [dataQualityPitchCount, setDataQualityPitchCount] = useState(0);
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
  const [cacheMetadata, setCacheMetadata] = useState<CacheMetadataResponse | null>(null);
  const [pitchOptions, setPitchOptions] = useState<PitchFilterOptions>(emptyPitchOptions);
  const [compareOptions, setCompareOptions] = useState<PitchFilterOptions>(emptyPitchOptions);
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
  const [compareHeatmapA, setCompareHeatmapA] = useState<PitchHeatmapResponse | null>(null);
  const [compareHeatmapB, setCompareHeatmapB] = useState<PitchHeatmapResponse | null>(null);
  const [compareHeatmapMode, setCompareHeatmapMode] = useState<HeatmapMode>("all");
  const [isCompareHeatmapLoading, setIsCompareHeatmapLoading] = useState(false);
  const [drilldownPitchType, setDrilldownPitchType] = useState<string | null>(null);
  const [drilldownA, setDrilldownA] = useState<PitchResult[]>([]);
  const [drilldownB, setDrilldownB] = useState<PitchResult[]>([]);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [comparisonName, setComparisonName] = useState("");
  const [askQuery, setAskQuery] = useState("");
  const [skillCall, setSkillCall] = useState<RelaySkillCall | null>(null);
  const [isParsingQuery, setIsParsingQuery] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [lastAppliedQuery, setLastAppliedQuery] = useState("");
  const [explorerFocus, setExplorerFocus] = useState<QueryFocusTarget | null>(null);
  const [compareFocus, setCompareFocus] = useState<QueryFocusTarget | null>(null);
  const [homeAnswers, setHomeAnswers] = useState<HomeAnswer[]>([]);
  const [collapsedHomeAnswers, setCollapsedHomeAnswers] = useState<Record<string, boolean>>({});
  const [homeHeatmapLoading, setHomeHeatmapLoading] = useState<Record<string, boolean>>({});

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
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("relay.theme", theme);
    window.dispatchEvent(new CustomEvent("relay-theme-change"));
  }, [theme]);

  useEffect(() => {
    const stored = window.localStorage.getItem("relay.savedComparisons");
    setSavedComparisons(stored ? JSON.parse(stored) : []);
  }, []);

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrilldownPitchType(null);
        setDrilldownA([]);
        setDrilldownB([]);
      }
    }

    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
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
    getCacheMetadata()
      .then((metadata) => setCacheMetadata(metadata))
      .catch(() => setCacheMetadata(null));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const pitcher = resolvableExplorerPitcher();
      getPitchFilterOptions({
        pitcher_id: pitcher ? String(pitcher.pitcher) : filters.pitcher_id,
        pitcher_name: pitcher ? "" : filters.pitcher_name,
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
        typeof currentFilters.pitch_type === "string" &&
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

  useEffect(() => {
    const pitcher = resolvableComparePitcher();
    if (!pitcher) {
      setCompareOptions(emptyPitchOptions);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      getPitchFilterOptions({
        pitcher_id: String(pitcher.pitcher),
        pitcher_name: "",
      })
        .then((options) => setCompareOptions(options))
        .catch(() => setCompareOptions(emptyPitchOptions));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [compareFilters.pitcher_id, compareFilters.pitcher_name, pitchers]);

  function matchesPitcherInput(
    pitcher: CachedPitcher,
    pitcherId: string | undefined,
    pitcherName: string | undefined,
  ) {
    const normalizedPitcherId = pitcherId?.trim() ?? "";
    const normalizedPitcherName = pitcherName?.trim().toLowerCase() ?? "";
    const displayName = formatPersonName(pitcher.player_name).toLowerCase();
    return (
      String(pitcher.pitcher) === normalizedPitcherId ||
      (normalizedPitcherName.length > 0 &&
        (pitcher.player_name.toLowerCase() === normalizedPitcherName ||
          displayName === normalizedPitcherName))
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

  function compareCachedDates() {
    return Array.from(
      new Set(compareOptions.game_dates.map((game) => game.game_date).filter(Boolean)),
    )
      .map(dateFromIso)
      .sort(compareDateAsc);
  }

  function compareSeasonRanges() {
    const bySeason = new Map<number, Date[]>();
    compareCachedDates().forEach((date) => {
      const season = date.getFullYear();
      bySeason.set(season, [...(bySeason.get(season) ?? []), date]);
    });

    return Array.from(bySeason.entries())
      .map(([season, dates]) => {
        const sortedDates = dates.sort(compareDateAsc);
        return {
          season,
          start: sortedDates[0],
          end: sortedDates.at(-1)!,
          gameCount: sortedDates.length,
        };
      })
      .sort((a, b) => a.season - b.season);
  }

  function latestTwoSeasonRanges() {
    const ranges = compareSeasonRanges();
    if (ranges.length < 2) return null;
    return {
      previous: ranges.at(-2)!,
      current: ranges.at(-1)!,
    };
  }

  function compareMonthRanges() {
    const byMonth = new Map<string, Date[]>();
    compareCachedDates().forEach((date) => {
      byMonth.set(monthKey(date), [...(byMonth.get(monthKey(date)) ?? []), date]);
    });

    return Array.from(byMonth.entries())
      .map(([key, dates]) => {
        const sortedDates = dates.sort(compareDateAsc);
        return {
          key,
          start: sortedDates[0],
          end: sortedDates.at(-1)!,
          gameCount: sortedDates.length,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  function dateRangesFromGameDates(gameDates: Array<{ game_date: string }>) {
    const dates = Array.from(new Set(gameDates.map((game) => game.game_date).filter(Boolean)))
      .map(dateFromIso)
      .sort(compareDateAsc);

    const bySeason = new Map<number, Date[]>();
    const byMonth = new Map<string, Date[]>();
    dates.forEach((date) => {
      bySeason.set(date.getFullYear(), [...(bySeason.get(date.getFullYear()) ?? []), date]);
      byMonth.set(monthKey(date), [...(byMonth.get(monthKey(date)) ?? []), date]);
    });

    const seasons = Array.from(bySeason.entries())
      .map(([season, seasonDates]) => {
        const sortedDates = seasonDates.sort(compareDateAsc);
        return {
          season,
          start: sortedDates[0],
          end: sortedDates.at(-1)!,
          gameCount: sortedDates.length,
        };
      })
      .sort((a, b) => a.season - b.season);

    const months = Array.from(byMonth.entries())
      .map(([key, monthDates]) => {
        const sortedDates = monthDates.sort(compareDateAsc);
        return {
          key,
          start: sortedDates[0],
          end: sortedDates.at(-1)!,
          gameCount: sortedDates.length,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return { dates, seasons, months };
  }

  function compareFiltersWithPreset(
    baseFilters: CompareFilters,
    preset: ComparePreset,
    gameDates: Array<{ game_date: string }>,
  ) {
    const { dates, seasons, months } = dateRangesFromGameDates(gameDates);
    if (dates.length < 2) return null;

    const first = dates[0];
    const last = dates.at(-1)!;
    const days = inclusiveDayCount(first, last);
    let periodA: DateRange;
    let periodB: DateRange;

    if (preset === "season_first_second") {
      const periodADays = Math.floor(days / 2);
      const aEnd = addDays(first, periodADays - 1);
      periodA = { start: first, end: aEnd };
      periodB = { start: addDays(aEnd, 1), end: last };
    } else if (preset === "last30_previous30") {
      if (days < 60) return null;
      const bStart = addDays(last, -29);
      const aEnd = addDays(bStart, -1);
      periodA = { start: addDays(aEnd, -29), end: aEnd };
      periodB = { start: bStart, end: last };
    } else if (preset === "month_month") {
      if (months.length < 2) return null;
      periodA = months[0];
      periodB = months[1];
    } else if (preset === "latest_month_previous_month") {
      if (months.length < 2) return null;
      periodA = months.at(-2)!;
      periodB = months.at(-1)!;
    } else {
      if (seasons.length < 2) return null;
      const previous = seasons.at(-2)!;
      const current = seasons.at(-1)!;
      if (preset === "previous_current_same_span" || preset === "previous_current_ytd") {
        const currentDays = inclusiveDayCount(current.start, current.end);
        const previousEnd = addDays(previous.start, currentDays - 1);
        periodA = {
          start: previous.start,
          end: previousEnd > previous.end ? previous.end : previousEnd,
        };
        periodB = current;
      } else {
        periodA = previous;
        periodB = current;
      }
    }

    return {
      ...baseFilters,
      a_game: "",
      b_game: "",
      a_start: isoDate(periodA.start),
      a_end: isoDate(periodA.end),
      b_start: isoDate(periodB.start),
      b_end: isoDate(periodB.end),
    };
  }

  function compareFiltersWithSeasonYears(
    baseFilters: CompareFilters,
    periodASeason: number,
    periodBSeason: number,
    gameDates: Array<{ game_date: string }>,
  ) {
    const { seasons } = dateRangesFromGameDates(gameDates);
    const periodA = seasons.find((season) => season.season === periodASeason);
    const periodB = seasons.find((season) => season.season === periodBSeason);
    if (!periodA || !periodB) return null;

    return {
      ...baseFilters,
      a_game: "",
      b_game: "",
      a_start: isoDate(periodA.start),
      a_end: isoDate(periodA.end),
      b_start: isoDate(periodB.start),
      b_end: isoDate(periodB.end),
    };
  }

  function comparePresetError(preset: ComparePreset) {
    if (preset === "season_first_second") {
      return "This pitcher needs at least two cached dates for a first-half vs second-half comparison.";
    }
    if (preset === "month_month" || preset === "latest_month_previous_month") {
      return "This pitcher needs cached data in at least two calendar months for this preset.";
    }
    if (
      preset === "previous_current_season" ||
      preset === "previous_current_same_span" ||
      preset === "previous_current_ytd"
    ) {
      return "This pitcher needs cached data in at least two seasons for this preset.";
    }
    return "This pitcher needs at least 60 cached dates for this 30-day preset.";
  }

  function applyComparePresetRange(periodA: DateRange, periodB: DateRange) {
    setCompareFilters((current) => ({
      ...current,
      a_start: isoDate(periodA.start),
      a_end: isoDate(periodA.end),
      b_start: isoDate(periodB.start),
      b_end: isoDate(periodB.end),
    }));
  }

  function bestPitcherNameMatch(pitcherName: string) {
    const query = pitcherName.trim().toLowerCase();
    if (!query) return null;

    const rankedMatches = [
      pitchers.filter((pitcher) => formatPersonName(pitcher.player_name).toLowerCase() === query),
      pitchers.filter((pitcher) =>
        formatPersonName(pitcher.player_name)
          .toLowerCase()
          .split(/\s+/)
          .some((token) => token === query),
      ),
      pitchers.filter((pitcher) =>
        formatPersonName(pitcher.player_name)
          .toLowerCase()
          .split(/\s+/)
          .some((token) => token.startsWith(query)),
      ),
      pitchers.filter((pitcher) => formatPersonName(pitcher.player_name).toLowerCase().includes(query)),
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

  function completePitcherName<T extends Pick<PitchFilters, "pitcher_id" | "pitcher_name">>(
    currentFilters: T,
  ) {
    const match =
      selectedPitcherForFilters(currentFilters) ??
      bestPitcherNameMatch(currentFilters.pitcher_name ?? "");
    return match
      ? {
          ...currentFilters,
          pitcher_id: String(match.pitcher),
          pitcher_name: formatPersonName(match.player_name),
        }
      : currentFilters;
  }

  function pitcherIdQueryFilters<T extends Pick<PitchFilters, "pitcher_id" | "pitcher_name">>(
    currentFilters: T,
  ) {
    const match = selectedPitcherForFilters(currentFilters);
    return match
      ? {
          ...currentFilters,
          pitcher_id: String(match.pitcher),
          pitcher_name: "",
        }
      : currentFilters;
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

    return `${countLabel(pitchers.length, "pitcher")} | ${countLabel(totalPitches, "pitch")} | ${firstDate} to ${lastDate}`;
  }

  function hasComparePresetRange(preset: ComparePreset, pitcher = compareDateRangePitcher()) {
    if (!pitcher) return false;
    const first = dateFromIso(pitcher.first_game_date);
    const last = dateFromIso(pitcher.last_game_date);
    const days = inclusiveDayCount(
      first,
      last,
    );
    if (preset === "season_first_second") return days >= 2;
    if (preset === "month_month") return monthKey(first) !== monthKey(last);
    if (preset === "latest_month_previous_month") return compareMonthRanges().length >= 2;
    if (preset === "previous_current_season") return latestTwoSeasonRanges() !== null;
    if (preset === "previous_current_same_span" || preset === "previous_current_ytd") {
      const ranges = latestTwoSeasonRanges();
      if (!ranges) return false;
      return ranges.previous.gameCount > 0 && ranges.current.gameCount > 0;
    }
    return days >= 60;
  }

  function setComparePreset(preset: ComparePreset) {
    const pitcher = compareDateRangePitcher();
    if (!pitcher) {
      setCompareError("Enter a cached pitcher before using a preset.");
      return;
    }
    if (!hasComparePresetRange(preset, pitcher)) {
      setCompareError(comparePresetError(preset));
      return;
    }

    setCompareError(null);
    const first = dateFromIso(pitcher.first_game_date);
    const last = dateFromIso(pitcher.last_game_date);
    const days = inclusiveDayCount(first, last);

    if (preset === "season_first_second") {
      const periodADays = Math.floor(days / 2);
      const aEnd = addDays(first, periodADays - 1);
      const bStart = addDays(aEnd, 1);
      applyComparePresetRange({ start: first, end: aEnd }, { start: bStart, end: last });
    } else if (preset === "last30_previous30") {
      const bStart = addDays(last, -29);
      const aEnd = addDays(bStart, -1);
      const aStart = addDays(aEnd, -29);
      applyComparePresetRange({ start: aStart, end: aEnd }, { start: bStart, end: last });
    } else if (preset === "month_month") {
      const aEnd = endOfMonth(first);
      const bStart = startOfNextMonth(first);
      const bEnd = endOfMonth(bStart) > last ? last : endOfMonth(bStart);
      applyComparePresetRange({ start: first, end: aEnd }, { start: bStart, end: bEnd });
    } else if (preset === "latest_month_previous_month") {
      const months = compareMonthRanges();
      const previous = months.at(-2)!;
      const current = months.at(-1)!;
      applyComparePresetRange(previous, current);
    } else if (preset === "previous_current_season") {
      const ranges = latestTwoSeasonRanges()!;
      applyComparePresetRange(ranges.previous, ranges.current);
    } else {
      const ranges = latestTwoSeasonRanges()!;
      const currentDays = inclusiveDayCount(ranges.current.start, ranges.current.end);
      const previousEnd = addDays(ranges.previous.start, currentDays - 1);
      applyComparePresetRange(
        { start: ranges.previous.start, end: previousEnd > ranges.previous.end ? ranges.previous.end : previousEnd },
        ranges.current,
      );
    }
  }

  function skillNameLabel(skill: RelaySkillCall["skill"]) {
    if (skill === "search_pitches") return "Pitch Search";
    if (skill === "get_pitch_heatmap") return "Heatmap";
    if (skill === "compare_pitcher_periods") return "Compare";
    if (skill === "summarize_arsenal") return "Arsenal Summary";
    return "Movement Summary";
  }

  function focusLabel(target: string) {
    const labels: Record<string, string> = {
      summary: "Summary",
      data_quality: "Data Quality",
      arsenal: "Arsenal Summary",
      heatmap: "Heatmap",
      strike_zone: "Strike Zone",
      movement: "Movement Chart",
      movement_diff: "Movement Diff",
      location_delta: "Delta Heatmap",
      table: "Pitch Table",
      comparison_table: "Pitch Type Changes Table",
      period_tables: "Period Tables",
      period_heatmaps: "Period Heatmaps",
      drilldown: "Drilldown",
    };
    return labels[target] ?? target.replaceAll("_", " ");
  }

  function skillActionLabel(call: RelaySkillCall) {
    const focus = skillFocus(call.args);
    if (call.skill === "compare_pitcher_periods") {
      if (focus === "movement_diff" || focus === "movement") return "Compare Movement";
      if (focus === "location_delta") return "Compare Heatmap";
      if (focus === "heatmap" || focus === "period_heatmaps") return "Compare Heatmaps";
      if (focus === "comparison_table" || focus === "table") return "Compare Table";
      if (focus === "summary") return "Compare Summary";
      return "Apply & Compare";
    }

    if (focus) return `Show ${focusLabel(focus)}`;
    if (call.skill === "get_pitch_heatmap") return "Show Heatmap";
    if (call.skill === "summarize_arsenal") return "Show Arsenal";
    if (call.skill === "summarize_movement") return "Show Movement";
    return "Apply & Search";
  }

  function skillArgLabel(name: string) {
    const labels: Record<string, string> = {
      pitcher_name: "Pitcher",
      pitch_type: "Pitch Type",
      pitch_type_group: "Pitch Family",
      season: "Season",
      balls: "Balls",
      strikes: "Strikes",
      min_velocity: "Min Velo",
      max_velocity: "Max Velo",
      batter_hand: "Batter Side",
      description: "Pitch Result",
      events: "PA Result",
      base_state: "Base State",
      count_group: "Count Group",
      location_filter: "Pitch Location",
      mode: "Heatmap Mode",
      focus: "View",
      preset: "Preset",
      period_a_season: "Period 1 Season",
      period_b_season: "Period 2 Season",
      period_b_to_date: "Period 2 To Date",
    };
    return labels[name] ?? name.replaceAll("_", " ");
  }

  function skillArgDisplayValue(name: string, value: string | number | boolean | null | undefined) {
    if (value === null || value === undefined || value === "") return "-";
    const stringValue = String(value);
    if (name === "pitch_type") return formatPitchTypeWithCode(stringValue);
    if (name === "pitch_type_group") {
      const labels: Record<string, string> = {
        fastball: "Fastballs",
        breaking: "Breaking Balls",
        offspeed: "Offspeed",
      };
      return labels[stringValue] ?? stringValue;
    }
    if (name === "batter_hand") return stringValue === "L" ? "Left" : stringValue === "R" ? "Right" : stringValue;
    if (name === "description") return formatDescription(stringValue);
    if (name === "events") return formatEvent(stringValue);
    if (name === "base_state") {
      return stringValue === "bases_empty" ? "Bases Empty" : "Runners On";
    }
    if (name === "count_group") {
      const labels: Record<string, string> = {
        ahead: "Pitcher Ahead",
        behind: "Pitcher Behind",
        even: "Even Count",
        two_strikes: "Two Strikes",
        full_count: "Full Count",
      };
      return labels[stringValue] ?? stringValue;
    }
    if (name === "location_filter") {
      return stringValue === "zone" ? "In Zone" : "Out of Zone";
    }
    if (name === "mode") {
      return stringValue
        .split("_")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
    }
    if (name === "focus") return focusLabel(stringValue);
    if (name === "preset") {
      return stringValue
        .split("_")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
    }
    if (name === "period_b_to_date") return stringValue === "true" ? "Yes" : "No";
    return stringValue;
  }

  function skillArgsToPitchFilters(args: RelaySkillCall["args"]): PitchFilters {
    const nextFilters: PitchFilters = {};
    [
      "pitcher_name",
      "pitch_type",
      "pitch_type_group",
      "season",
      "min_velocity",
      "max_velocity",
      "batter_hand",
      "description",
      "events",
      "base_state",
      "count_group",
      "location_filter",
    ].forEach((key) => {
      const value = args[key];
      if (value !== null && value !== undefined && value !== "") {
        nextFilters[key as keyof PitchFilters] = String(value);
      }
    });

    if (args.balls !== null && args.balls !== undefined) nextFilters.balls = String(args.balls);
    if (args.strikes !== null && args.strikes !== undefined) nextFilters.strikes = String(args.strikes);
    if (nextFilters.balls && nextFilters.strikes) {
      nextFilters.count = `${nextFilters.balls}-${nextFilters.strikes}`;
    }

    return nextFilters;
  }

  function skillArgsToCompareFilters(args: RelaySkillCall["args"]): Partial<CompareFilters> {
    const nextFilters: Partial<CompareFilters> = {};
    ["pitcher_name", "pitch_type", "batter_hand"].forEach((key) => {
      const value = args[key];
      if (value !== null && value !== undefined && value !== "") {
        nextFilters[key as keyof CompareFilters] = String(value);
      }
    });
    return nextFilters;
  }

  async function handleAskRelay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = askQuery.trim();
    if (!query) return;

    setIsParsingQuery(true);
    setAskError(null);
    setAskNotice(null);
    try {
      setSkillCall(await parseNaturalLanguageQuery(query));
    } catch (error) {
      setSkillCall(null);
      setAskError(error instanceof Error ? error.message : "Query parsing failed");
    } finally {
      setIsParsingQuery(false);
    }
  }

  function isExplorerSkill(skill: RelaySkillCall["skill"]) {
    return skill !== "compare_pitcher_periods";
  }

  function skillFocus(args: RelaySkillCall["args"]) {
    const focus = args.focus;
    return typeof focus === "string" && focus.trim() ? focus.trim() : "";
  }

  function triggerExplorerFocus(target: string) {
    if (target) {
      setExplorerFocus({ target, nonce: Date.now() });
    }
  }

  function triggerCompareFocus(target: string) {
    if (target) {
      setCompareFocus({ target, nonce: Date.now() });
    }
  }

  function appendHomeAnswer(answer: Omit<HomeAnswer, "id" | "createdAt">) {
    setHomeAnswers((current) => [
      ...current,
      {
        ...answer,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      },
    ]);
  }

  function removeHomeAnswer(answerId: string) {
    setHomeAnswers((current) => current.filter((answer) => answer.id !== answerId));
    setCollapsedHomeAnswers((current) => {
      const next = { ...current };
      delete next[answerId];
      return next;
    });
  }

  function toggleHomeAnswer(answerId: string) {
    setCollapsedHomeAnswers((current) => ({
      ...current,
      [answerId]: !current[answerId],
    }));
  }

  function updateHomeAnswer(answerId: string, updater: (answer: HomeAnswer) => HomeAnswer) {
    setHomeAnswers((current) =>
      current.map((answer) => (answer.id === answerId ? updater(answer) : answer)),
    );
  }

  async function updateHomeExplorerHeatmap(answer: HomeAnswer, mode: HeatmapMode) {
    if (!answer.explorer) return;

    setHomeHeatmapLoading((current) => ({ ...current, [answer.id]: true }));
    try {
      const heatmapResponse = await getPitchHeatmap(answer.explorer.filters, mode);
      updateHomeAnswer(answer.id, (currentAnswer) =>
        currentAnswer.explorer
          ? {
              ...currentAnswer,
              explorer: {
                ...currentAnswer.explorer,
                heatmap: heatmapResponse,
                heatmapMode: mode,
              },
            }
          : currentAnswer,
      );
    } catch (error) {
      setAskNotice(error instanceof Error ? error.message : "Heatmap failed");
    } finally {
      setHomeHeatmapLoading((current) => ({ ...current, [answer.id]: false }));
    }
  }

  async function updateHomeCompareHeatmaps(answer: HomeAnswer, mode: HeatmapMode) {
    const snapshot = answer.compare;
    if (!snapshot) return;

    setHomeHeatmapLoading((current) => ({ ...current, [answer.id]: true }));
    try {
      const [periodA, periodB] = await Promise.all([
        getPitchHeatmap(comparePeriodPitchFilters(snapshot.filters, "a"), mode),
        getPitchHeatmap(comparePeriodPitchFilters(snapshot.filters, "b"), mode),
      ]);
      updateHomeAnswer(answer.id, (currentAnswer) =>
        currentAnswer.compare
          ? {
              ...currentAnswer,
              compare: {
                ...currentAnswer.compare,
                heatmapA: periodA,
                heatmapB: periodB,
                heatmapMode: mode,
              },
            }
          : currentAnswer,
      );
    } catch (error) {
      setAskNotice(error instanceof Error ? error.message : "Compare heatmaps failed");
    } finally {
      setHomeHeatmapLoading((current) => ({ ...current, [answer.id]: false }));
    }
  }

  async function runPitchSearch(searchFilters: PitchFilters, mode: HeatmapMode): Promise<ExplorerAnswerSnapshot | null> {
    const completedFilters = completePitcherName(searchFilters);
    const pitcher = selectedPitcherForFilters(completedFilters);
    if (!pitcher) {
      setFilters(completedFilters);
      setSearchError("Choose a cached pitcher before searching.");
      return null;
    }

    setFilters(completedFilters);
    setIsSearching(true);
    setIsHeatmapLoading(true);
    setSearchError(null);

    try {
      const queryFilters = pitcherIdQueryFilters(completedFilters);
      const [response, heatmapResponse, dataQualityResponse] = await Promise.all([
        searchPitches(queryFilters),
        getPitchHeatmap(queryFilters, mode),
        getPitchDataQuality(queryFilters),
      ]);
      setResults(response.results);
      setResultCount(response.count);
      setTotalResultCount(response.total_count);
      setHeatmap(heatmapResponse);
      setResultDataQualityMetrics(dataQualityResponse.metrics);
      setDataQualityPitchCount(dataQualityResponse.pitch_count);
      setLastPitchSearchFilters(queryFilters);
      setAskNotice(null);
      return {
        filters: queryFilters,
        results: response.results,
        resultCount: response.count,
        totalResultCount: response.total_count,
        heatmap: heatmapResponse,
        heatmapMode: mode,
        dataQualityMetrics: dataQualityResponse.metrics,
        dataQualityPitchCount: dataQualityResponse.pitch_count,
      };
    } catch (error) {
      setResults([]);
      setResultCount(0);
      setTotalResultCount(0);
      setHeatmap(null);
      setResultDataQualityMetrics([]);
      setDataQualityPitchCount(0);
      setLastPitchSearchFilters(null);
      setSearchError(error instanceof Error ? error.message : "Search failed");
      return null;
    } finally {
      setIsSearching(false);
      setIsHeatmapLoading(false);
    }
  }

  async function runCompareSearch(searchFilters: CompareFilters): Promise<CompareAnswerSnapshot | null> {
      setCompareFilters(searchFilters);

    if (!selectedPitcherForFilters(searchFilters)) {
      setCompareError("Choose a cached pitcher before comparing.");
      return null;
    }

    if (!searchFilters.a_start || !searchFilters.a_end || !searchFilters.b_start || !searchFilters.b_end) {
      setCompareError("Choose start and end dates for both periods.");
      return null;
    }

    setIsComparing(true);
    setCompareError(null);

    try {
      const queryFilters = pitcherIdQueryFilters(searchFilters);
      const response = await comparePitcher(queryFilters, compareHeatmapMode);
      const nextPitchTypes = collectPitchTypes(response);
      setComparison(response);
      setComparePitchTypes(nextPitchTypes);
      setCompareHeatmapA(response.chart_data?.heatmaps.period_a ?? null);
      setCompareHeatmapB(response.chart_data?.heatmaps.period_b ?? null);
      setDrilldownPitchType(null);
      setDrilldownA([]);
      setDrilldownB([]);
      setAskNotice(null);
      return {
        filters: queryFilters,
        comparison: response,
        heatmapA: response.chart_data?.heatmaps.period_a ?? null,
        heatmapB: response.chart_data?.heatmaps.period_b ?? null,
        heatmapMode: compareHeatmapMode,
        visiblePitchTypes: nextPitchTypes,
      };
    } catch (error) {
      setComparison(null);
      setCompareHeatmapA(null);
      setCompareHeatmapB(null);
      setCompareError(error instanceof Error ? error.message : "Comparison failed");
      return null;
    } finally {
      setIsComparing(false);
    }
  }

  async function applySkillCall() {
    if (!skillCall) return;

    setAskNotice(null);
    setAskError(null);
    const focus = skillFocus(skillCall.args);
    const queryText = askQuery.trim();
    setLastAppliedQuery(queryText);

    if (skillCall.skill === "compare_pitcher_periods") {
      const shouldFocusAnswer = Boolean(focus);
      setActiveView(shouldFocusAnswer ? "home" : "compare");
      const scopedFilters = completePitcherName({
        ...initialCompareFilters,
        ...skillArgsToCompareFilters(skillCall.args),
      });
      setCompareFilters(scopedFilters);
      setComparison(null);
      setComparePitchTypes([]);
      setCompareHeatmapA(null);
      setCompareHeatmapB(null);
      setDrilldownPitchType(null);
      setDrilldownA([]);
      setDrilldownB([]);
      setCompareError(null);

      const preset = skillCall.args.preset ? String(skillCall.args.preset) : "";
      const periodASeason = Number(skillCall.args.period_a_season);
      const periodBSeason = Number(skillCall.args.period_b_season);
      const pitcher = selectedPitcherForFilters(scopedFilters);
      if (periodASeason && periodBSeason && pitcher && preset !== "previous_current_same_span") {
        try {
          const options = await getPitchFilterOptions({
            pitcher_id: String(pitcher.pitcher),
            pitcher_name: "",
          });
          const seasonFilters = compareFiltersWithSeasonYears(
            scopedFilters,
            periodASeason,
            periodBSeason,
            options.game_dates,
          );
          if (seasonFilters) {
            const snapshot = await runCompareSearch(seasonFilters);
            if (shouldFocusAnswer && snapshot) {
              appendHomeAnswer({ view: "compare", target: focus, query: queryText, compare: snapshot });
            } else {
              triggerCompareFocus("summary");
            }
            return;
          }
          setAskNotice(
            `Applied the compare scope, but cached data was not available for ${periodASeason} and ${periodBSeason}.`,
          );
        } catch (error) {
          setAskNotice(
            error instanceof Error
              ? `Applied the compare scope, but could not load season dates: ${error.message}`
              : "Applied the compare scope, but could not load season dates.",
          );
        }
        return;
      }
      if (preset && pitcher) {
        try {
          const options = await getPitchFilterOptions({
            pitcher_id: String(pitcher.pitcher),
            pitcher_name: "",
          });
          const presetFilters = compareFiltersWithPreset(
            scopedFilters,
            preset as ComparePreset,
            options.game_dates,
          );
          if (presetFilters) {
            const snapshot = await runCompareSearch(presetFilters);
            if (shouldFocusAnswer && snapshot) {
              appendHomeAnswer({ view: "compare", target: focus, query: queryText, compare: snapshot });
            } else {
              triggerCompareFocus("summary");
            }
            return;
          }
          setAskNotice(
            `Applied the compare scope, but ${skillArgDisplayValue("preset", preset)} is not available for this cached pitcher.`,
          );
        } catch (error) {
          setAskNotice(
            error instanceof Error
              ? `Applied the compare scope, but could not load preset dates: ${error.message}`
              : "Applied the compare scope, but could not load preset dates.",
          );
        }
        return;
      }

      setAskNotice(
        preset
          ? `Applied the compare scope. Use the ${skillArgDisplayValue("preset", preset)} preset to fill the periods.`
          : "Applied the compare scope. Choose the two periods to compare.",
      );
      triggerCompareFocus(focus);
      return;
    }

    const explorerTarget = focus || (skillCall.skill === "get_pitch_heatmap" ? "heatmap" : "");
    const shouldFocusAnswer = Boolean(explorerTarget);
    const nextHeatmapMode = skillCall.args.mode &&
      ["all", "whiffs", "hard_contact", "in_zone"].includes(String(skillCall.args.mode))
        ? (String(skillCall.args.mode) as HeatmapMode)
        : heatmapMode;
    const nextFilters: PitchFilters = {
      ...initialFilters,
      ...skillArgsToPitchFilters(skillCall.args),
      pitcher_id: "",
    };

    setActiveView(shouldFocusAnswer ? "home" : "explorer");
    setFilters(nextFilters);
    setResults([]);
    setResultCount(0);
    setTotalResultCount(0);
    setHeatmap(null);
    setLastPitchSearchFilters(null);
    setHeatmapMode(nextHeatmapMode);

    setSearchError(null);
    const snapshot = await runPitchSearch(nextFilters, nextHeatmapMode);
    if (shouldFocusAnswer && snapshot) {
      appendHomeAnswer({ view: "explorer", target: explorerTarget, query: queryText, explorer: snapshot });
    } else {
      triggerExplorerFocus(explorerTarget);
    }
  }

  function updateFilter(name: keyof PitchFilters, value: string) {
    const [balls, strikes] = value.split("-");
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
      ...(name === "pitcher_name"
        ? {
            pitcher_id: "",
            season: "",
            single_game: "",
            start_date: "",
            end_date: "",
            pitch_type: "",
            pitch_type_group: "",
            count: "",
            balls: "",
            strikes: "",
            min_velocity: "",
            max_velocity: "",
            batter_hand: "",
            description: "",
            events: "",
            base_state: "",
            count_group: "",
            location_filter: "",
          }
        : {}),
      ...(name === "single_game" ? { start_date: value, end_date: value } : {}),
      ...(name === "start_date" || name === "end_date" ? { single_game: "" } : {}),
      ...(name === "count"
        ? {
            balls: value ? balls : "",
            strikes: value ? strikes : "",
            count_group: "",
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
            pitch_type: "",
            batter_hand: "",
            a_game: "",
            a_start: "",
            a_end: "",
            b_game: "",
            b_start: "",
            b_end: "",
          }
        : {}),
      ...(name === "a_game" ? { a_start: value, a_end: value } : {}),
      ...(name === "b_game" ? { b_start: value, b_end: value } : {}),
      ...(name === "a_start" || name === "a_end" ? { a_game: "" } : {}),
      ...(name === "b_start" || name === "b_end" ? { b_game: "" } : {}),
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
          countLabel(game.pitch_count, "pitch"),
        ]
          .filter(Boolean)
          .join(" - "),
      }));
    }
    if (name === "pitch_type") {
      return pitchOptions.pitch_types.map((pitchType) => ({
        value: pitchType,
        label: formatPitchTypeWithCode(pitchType),
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
    if (name === "count_group") {
      const labels: Record<string, string> = {
        ahead: "Pitcher Ahead",
        behind: "Pitcher Behind",
        even: "Even Count",
        two_strikes: "Two Strikes",
        full_count: "Full Count",
      };
      return labels[value] ?? value;
    }
    if (name === "location_filter") {
      return value === "zone" ? "In Zone" : "Out of Zone";
    }
    if (name === "description") return formatDescription(value);
    if (name === "events") return formatEvent(value);
    if (name === "single_game") return formatDate(value);
    if (name === "pitcher_name") return formatPersonName(value);
    if (name === "pitch_type") return formatPitchTypeWithCode(value);
    if (name === "pitch_type_group") {
      const labels: Record<string, string> = {
        fastball: "Fastballs",
        breaking: "Breaking Balls",
        offspeed: "Offspeed",
      };
      return labels[value] ?? value;
    }
    if (name === "count") return value;
    if (name === "result_order") {
      return filterSelectOptions(name).find((option) => option.value === value)?.label ?? value;
    }
    return value;
  }

  function filterLabel(name: keyof PitchFilters) {
    if (name === "pitch_type_group") return "Pitch Family";
    if (name === "count_group") return "Count Group";
    return filterFields.find((field) => field.name === name)?.label ?? name;
  }

  function activePitchFilters() {
    return Object.entries(filters)
      .filter(
        (entry): entry is [keyof PitchFilters, string] => {
          const value = entry[1];
          if (typeof value !== "string") return false;
          return Boolean(value.trim()) &&
          value !== initialFilters[entry[0] as keyof PitchFilters] &&
          entry[0] !== "pitcher_id" &&
          entry[0] !== "balls" &&
          entry[0] !== "strikes";
        },
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
    setResultDataQualityMetrics([]);
    setDataQualityPitchCount(0);
    setLastPitchSearchFilters(null);
    setSearchError(null);
  }

  function compareFieldLabel(name: keyof CompareFilters) {
    if (name === "pitcher_name") return "Pitcher";
    if (name === "pitcher_id") return "Pitcher ID";
    if (name === "pitch_type") return "Pitch Types";
    if (name === "batter_hand") return "Batter Side";
    if (name === "a_game") return "Period 1 Game";
    if (name === "b_game") return "Period 2 Game";
    return compareFields.find((field) => field.name === name)?.label ?? name;
  }

  function activeCompareFilters() {
    return Object.entries(compareFilters)
      .filter(
        (entry): entry is [keyof CompareFilters, string] =>
          Boolean(entry[1]?.trim()) && entry[0] !== "pitcher_id",
      )
      .map(([name, value]) => ({
        name,
        label: compareFieldLabel(name),
        value:
          name === "batter_hand"
            ? value === "L"
              ? "Left"
              : value === "R"
                ? "Right"
                : value
            : name === "pitch_type"
              ? value
                  .split(",")
                  .map((pitchType) => formatPitchTypeWithCode(pitchType.trim()))
                  .join(", ")
            : name === "a_game" || name === "b_game"
              ? formatDate(value)
              : name === "a_start" || name === "a_end" || name === "b_start" || name === "b_end"
                ? formatDate(value)
              : value,
      }));
  }

  function removeCompareFilter(name: keyof CompareFilters) {
    setCompareFilters((currentFilters) => ({
      ...currentFilters,
      [name]: "",
      ...(name === "a_game" ? { a_start: "", a_end: "" } : {}),
      ...(name === "b_game" ? { b_start: "", b_end: "" } : {}),
    }));
  }

  function clearCompareFilters() {
    setCompareFilters(initialCompareFilters);
    setComparison(null);
    setCompareError(null);
    setComparePitchTypes([]);
    setCompareHeatmapA(null);
    setCompareHeatmapB(null);
    setDrilldownPitchType(null);
    setDrilldownA([]);
    setDrilldownB([]);
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
    await runPitchSearch(filters, heatmapMode);
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

  function comparePeriodPitchFilters(
    filters: CompareFilters,
    period: "a" | "b",
    pitchTypeOverride?: string,
  ): PitchFilters {
    const pitcher = selectedPitcherForFilters(filters);
    return {
      pitcher_id: pitcher ? String(pitcher.pitcher) : filters.pitcher_id,
      pitcher_name: "",
      start_date: period === "a" ? filters.a_start : filters.b_start,
      end_date: period === "a" ? filters.a_end : filters.b_end,
      pitch_type: pitchTypeOverride ?? filters.pitch_type,
      batter_hand: filters.batter_hand,
      result_order: "latest",
      limit: "500",
    };
  }

  async function loadCompareHeatmaps(filters: CompareFilters, mode = compareHeatmapMode) {
    setIsCompareHeatmapLoading(true);
    try {
      const [periodA, periodB] = await Promise.all([
        getPitchHeatmap(comparePeriodPitchFilters(filters, "a"), mode),
        getPitchHeatmap(comparePeriodPitchFilters(filters, "b"), mode),
      ]);
      setCompareHeatmapA(periodA);
      setCompareHeatmapB(periodB);
    } finally {
      setIsCompareHeatmapLoading(false);
    }
  }

  async function updateCompareHeatmapMode(mode: HeatmapMode) {
    setCompareHeatmapMode(mode);
    if (!comparison) return;

    try {
      await loadCompareHeatmaps(compareFilters, mode);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : "Compare heatmaps failed");
    }
  }

  async function loadPitchTypeDrilldown(pitchType: string) {
    if (drilldownPitchType === pitchType) {
      setDrilldownPitchType(null);
      setDrilldownA([]);
      setDrilldownB([]);
      return;
    }

    setDrilldownPitchType(pitchType);
    setIsDrilldownLoading(true);
    setCompareError(null);
    try {
      const [periodA, periodB] = await Promise.all([
        searchPitches({
          ...comparePeriodPitchFilters(compareFilters, "a", pitchType),
          limit: "5000",
        }),
        searchPitches({
          ...comparePeriodPitchFilters(compareFilters, "b", pitchType),
          limit: "5000",
        }),
      ]);
      setDrilldownA(periodA.results);
      setDrilldownB(periodB.results);
    } catch (error) {
      setDrilldownA([]);
      setDrilldownB([]);
      setCompareError(error instanceof Error ? error.message : "Pitch drilldown failed");
    } finally {
      setIsDrilldownLoading(false);
    }
  }

  async function handleCompare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchFilters = completePitcherName(compareFilters);
    await runCompareSearch(searchFilters);
  }

  const pitchTypes = useMemo(
    () => (comparison ? collectPitchTypes(comparison) : []),
    [comparison],
  );
  const visiblePitchTypes = useMemo(
    () =>
      comparePitchTypes.length > 0
        ? pitchTypes.filter((pitchType) => comparePitchTypes.includes(pitchType))
        : pitchTypes,
    [comparePitchTypes, pitchTypes],
  );
  const topUsageDelta = useMemo(
    () =>
      comparison
        ? largestDeltaLabel(
            Object.fromEntries(
              Object.entries(comparison.deltas.pitch_usage).map(([pitchType, metric]) => [
                pitchType,
                metric.rate,
              ]),
            ),
            "rate",
          )
        : "-",
    [comparison],
  );
  const topVelocityDelta = useMemo(
    () =>
      comparison
        ? largestDeltaLabel(comparison.deltas.average_velocity, "number")
        : "-",
    [comparison],
  );
  const topSpinDelta = useMemo(
    () =>
      comparison
        ? largestDeltaLabel(comparison.deltas.average_spin_rate, "number")
        : "-",
    [comparison],
  );
  const freshness = useMemo(() => datasetFreshness(), [pitchers]);
  const compareDateRange = useMemo(
    () => compareDateRangePitcher(),
    [compareFilters.pitcher_id, compareFilters.pitcher_name, pitchers],
  );
  const comparePitcherSelection = useMemo(
    () => resolvableComparePitcher(),
    [compareFilters.pitcher_id, compareFilters.pitcher_name, pitchers],
  );
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
  const arsenalSummary = useMemo(
    () =>
      Array.from(
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
        .sort((a, b) => b.count - a.count),
    [results],
  );
  const activePitchFilterList = useMemo(
    () => activePitchFilters(),
    [filters, pitchOptions],
  );
  const activeCompareFilterList = useMemo(
    () => activeCompareFilters(),
    [compareFilters],
  );
  const sampleQueries = useMemo(() => {
    if (pitchers.length === 0) {
      return ["Search a cached pitcher to get started"];
    }

    const sortedPitchers = [...pitchers].sort((a, b) => b.pitch_count - a.pitch_count);
    const pitchTypes = cacheMetadata?.pitch_types ?? [];
    const firstPitcher = sortedPitchers[0];
    const secondPitcher = sortedPitchers[1] ?? sortedPitchers[0];
    const multiSeasonPitcher =
      sortedPitchers.find(
        (pitcher) =>
          dateFromIso(pitcher.first_game_date).getFullYear() !==
          dateFromIso(pitcher.last_game_date).getFullYear(),
      ) ?? sortedPitchers[0];
    const comparePitchPhrase =
      pitchPhraseFromTypes(pitchTypes, ["CU", "SL", "ST", "KC", "CH", "FF"]) ?? "four seam fastballs";

    return [
      `${formatPersonName(firstPitcher.player_name)} fastballs over 97 to left handed hitters`,
      `${formatPersonName(secondPitcher.player_name)} breaking balls with runners on`,
      `compare ${formatPersonName(multiSeasonPitcher.player_name)} ${comparePitchPhrase} previous season vs current season same span`,
    ];
  }, [cacheMetadata?.pitch_types, pitchers]);

  function openHomeAnswer(answer: HomeAnswer) {
    if (answer.view === "explorer" && answer.explorer) {
      setFilters(answer.explorer.filters);
      setResults(answer.explorer.results);
      setResultCount(answer.explorer.resultCount);
      setTotalResultCount(answer.explorer.totalResultCount);
      setHeatmap(answer.explorer.heatmap);
      setHeatmapMode(answer.explorer.heatmapMode);
      setResultDataQualityMetrics(answer.explorer.dataQualityMetrics);
      setDataQualityPitchCount(answer.explorer.dataQualityPitchCount);
      setLastPitchSearchFilters(answer.explorer.filters);
      setLastAppliedQuery(answer.query);
      setExplorerFocus({ target: answer.target, nonce: Date.now() });
      setActiveView("explorer");
      return;
    }

    if (answer.view === "compare" && answer.compare) {
      setCompareFilters(answer.compare.filters);
      setComparison(answer.compare.comparison);
      setCompareHeatmapA(answer.compare.heatmapA);
      setCompareHeatmapB(answer.compare.heatmapB);
      setCompareHeatmapMode(answer.compare.heatmapMode);
      setComparePitchTypes(answer.compare.visiblePitchTypes);
      setLastAppliedQuery(answer.query);
      setCompareFocus({ target: answer.target, nonce: Date.now() });
      setActiveView("compare");
    }
  }

  function renderHomeExplorerAnswer(answer: HomeAnswer) {
    const snapshot = answer.explorer;
    if (!snapshot) return null;

    if (snapshot.results.length === 0) {
      return (
        <div className="empty-state">
          <p>No pitches matched this query. Try removing or modifying some filters.</p>
        </div>
      );
    }

    if (answer.target === "heatmap") {
      return (
        <PitchHeatmap
          heatmap={snapshot.heatmap}
          mode={snapshot.heatmapMode}
          isLoading={Boolean(homeHeatmapLoading[answer.id])}
          onModeChange={(mode) => updateHomeExplorerHeatmap(answer, mode)}
          pitcherHand={snapshot.results.find((pitch) => pitch.p_throws)?.p_throws}
          collapsible={false}
        />
      );
    }

    if (answer.target === "strike_zone") {
      return <StrikeZoneChart pitches={snapshot.results} />;
    }

    if (answer.target === "movement") {
      return <MovementChart pitches={snapshot.results} />;
    }

    if (answer.target === "data_quality") {
      return (
        <section className="chart-panel data-quality-panel">
          <div className="chart-heading">
            <div>
              <h3>Data Quality</h3>
              <p>
                Availability across all {countLabel(snapshot.dataQualityPitchCount, "matching pitch")} for these filters,
                independent of the display limit.
              </p>
            </div>
          </div>
          <div className="data-quality-grid">
            {snapshot.dataQualityMetrics.map((metric) => (
              <div className="data-quality-card" key={metric.key}>
                <span>{metric.label}</span>
                <strong>{formatQualityRate(metric.available_rate)}</strong>
                <small>
                  {metric.available_count} of {metric.denominator_count}{" "}
                  {metric.denominator === "balls_in_play" ? "BIP" : "pitches"} available
                </small>
                <small>{formatQualityRate(metric.missing_rate)} missing</small>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (answer.target === "table") {
      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Pitcher</th>
                <th>Batter</th>
                <th>Type</th>
                <th>Velocity (mph)</th>
                <th>Spin (rpm)</th>
                <th>Count</th>
                <th>Description</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.results.slice(0, 50).map((pitch, index) => (
                <tr key={`${answer.id}-${pitch.game_date}-${index}`}>
                  <td>{formatDate(pitch.game_date)}</td>
                  <td>{formatPersonName(pitch.player_name)}</td>
                  <td>{formatBatter(pitch)}</td>
                  <td>{formatPitchType(pitch.pitch_type)}</td>
                  <td>{formatNumber(pitch.release_speed)}</td>
                  <td>{formatNumber(pitch.release_spin_rate, 0)}</td>
                  <td>{pitch.balls ?? ""}-{pitch.strikes ?? ""}</td>
                  <td>{formatDescription(pitch.description)}</td>
                  <td>{formatEvent(pitch.events)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="results-header">
        <h3>Results</h3>
        <span>
          {snapshot.totalResultCount > snapshot.resultCount
            ? `Showing ${snapshot.resultCount} of ${countLabel(snapshot.totalResultCount, "pitch")}`
            : countLabel(snapshot.resultCount, "pitch")}
        </span>
      </div>
    );
  }

  function renderHomeCompareAnswer(answer: HomeAnswer) {
    const snapshot = answer.compare;
    const comparison = snapshot?.comparison;
    if (!snapshot || !comparison) {
      return (
        <div className="empty-state">
          <p>No comparison matched this query. Try removing or modifying some filters.</p>
        </div>
      );
    }

    if (answer.target === "movement" || answer.target === "movement_diff") {
      return (
        <CompareMovementChart
          comparison={comparison}
          visiblePitchTypes={snapshot.visiblePitchTypes}
          periodALabel={`Period 1 (${formatShortDateRange(comparison.period_a.start, comparison.period_a.end)})`}
          periodBLabel={`Period 2 (${formatShortDateRange(comparison.period_b.start, comparison.period_b.end)})`}
        />
      );
    }

    if (answer.target === "heatmap" || answer.target === "period_heatmaps") {
      return (
        <div className="comparison-panels">
          <PitchHeatmap
            collapsible={false}
            heatmap={snapshot.heatmapA}
            mode={snapshot.heatmapMode}
            isLoading={Boolean(homeHeatmapLoading[answer.id])}
            onModeChange={(mode) => updateHomeCompareHeatmaps(answer, mode)}
            pitcherHand={comparison.pitcher_hand}
            subtitle={formatDateRange(comparison.period_a.start, comparison.period_a.end)}
            title="Period 1 Heatmap"
          />
          <PitchHeatmap
            collapsible={false}
            heatmap={snapshot.heatmapB}
            mode={snapshot.heatmapMode}
            isLoading={Boolean(homeHeatmapLoading[answer.id])}
            onModeChange={(mode) => updateHomeCompareHeatmaps(answer, mode)}
            pitcherHand={comparison.pitcher_hand}
            subtitle={formatDateRange(comparison.period_b.start, comparison.period_b.end)}
            title="Period 2 Heatmap"
          />
        </div>
      );
    }

    if (answer.target === "location_delta") {
      return (
        <CompareDeltaHeatmap
          periodA={snapshot.heatmapA}
          periodB={snapshot.heatmapB}
          isLoading={false}
          periodAStart={comparison.period_a.start}
          periodAEnd={comparison.period_a.end}
          periodBStart={comparison.period_b.start}
          periodBEnd={comparison.period_b.end}
          pitcherHand={comparison.pitcher_hand}
          pitchType={snapshot.filters.pitch_type}
          batterHand={snapshot.filters.batter_hand}
        />
      );
    }

    return (
      <div className="comparison-summary">
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
    );
  }

  function renderHomeAnswerContent(answer: HomeAnswer) {
    return answer.view === "compare"
      ? renderHomeCompareAnswer(answer)
      : renderHomeExplorerAnswer(answer);
  }

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
        <div className="header-actions">
          <button
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="icon-action-button theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            type="button"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <div className={`status-pill status-pill--${backendStatus}`}>
            <span className="status-dot" />
            <span>{statusText}</span>
          </div>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Relay views">
        <button
          className={activeView === "home" ? "view-tab is-active" : "view-tab"}
          onClick={() => setActiveView("home")}
          type="button"
        >
          Home
        </button>
        <button
          className={activeView === "explorer" ? "view-tab is-active" : "view-tab"}
          onClick={() => {
            setActiveView("explorer");
          }}
          type="button"
        >
          Pitch Explorer
        </button>
        <button
          className={activeView === "compare" ? "view-tab is-active" : "view-tab"}
          onClick={() => {
            setActiveView("compare");
          }}
          type="button"
        >
          Compare
        </button>
      </nav>
      {freshness ? <div className="data-freshness">Cache: {freshness}</div> : null}
      <section className="home-section" hidden={activeView !== "home"} aria-labelledby="home-title">
        <div className="home-copy">
          <h2 id="home-title">Ask Relay</h2>
          <p>Start with a plain-language baseball question. Relay will translate it into filters, searches, charts, or comparisons.</p>
        </div>
        <section className="ask-relay-panel" aria-label="Ask Relay">
          <form className="ask-relay-form" onSubmit={handleAskRelay}>
            <label className="ask-relay-field">
              <span>Question</span>
              <input
                value={askQuery}
                onChange={(event) => setAskQuery(event.target.value)}
                placeholder="Skenes fastballs over 97 as a heatmap"
                type="text"
              />
            </label>
            <button className="search-button" disabled={isParsingQuery || !askQuery.trim()} type="submit">
              {isParsingQuery ? "Parsing..." : "Ask"}
            </button>
          </form>
          <div className="query-examples" aria-label="Example questions">
            {sampleQueries.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setAskQuery(example)}
              >
                {example}
              </button>
            ))}
          </div>
          {askError ? <div className="error-banner">{askError}</div> : null}
          {askNotice ? <div className="inline-note">{askNotice}</div> : null}
          {skillCall?.warnings.length ? (
            <div className="query-warning-row" aria-live="polite">
              {skillCall.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          {skillCall ? (
            <div className="skill-preview">
              <div className="skill-preview-heading">
                <div>
                  <span>Ready to Show</span>
                  <strong>{skillNameLabel(skillCall.skill)}</strong>
                </div>
                <button className="secondary-button" onClick={applySkillCall} type="button">
                  {skillActionLabel(skillCall)}
                </button>
              </div>
              {Object.keys(skillCall.args).length > 0 ? (
                <div className="skill-args">
                  {Object.entries(skillCall.args).map(([name, value]) => (
                    <span className="skill-arg-chip" key={name}>
                      {skillArgLabel(name)}: {skillArgDisplayValue(name, value)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="inline-note">No filters were confidently parsed.</p>
              )}
            </div>
          ) : null}
        </section>
        {homeAnswers.length > 0 ? (
          <section className="home-answer-stack" aria-label="Relay answers">
            {homeAnswers.map((answer) => {
              const isCollapsed = Boolean(collapsedHomeAnswers[answer.id]);
              return (
                <article className="home-answer-card" key={answer.id}>
                  <header className="focused-answer-header">
                    <button
                      aria-label={isCollapsed ? "Expand answer" : "Collapse answer"}
                      className="disclosure-button"
                      onClick={() => toggleHomeAnswer(answer.id)}
                      title={isCollapsed ? "Expand" : "Collapse"}
                      type="button"
                    >
                      {isCollapsed ? ">" : "v"}
                    </button>
                    <div>
                      <span>Showing</span>
                      <strong>{focusLabel(answer.target)}</strong>
                    </div>
                    <p>
                      <span>You asked:</span> {answer.query}
                    </p>
                    <div className="focused-answer-actions">
                      <button
                        className="secondary-button"
                        onClick={() => openHomeAnswer(answer)}
                        type="button"
                      >
                        Open Full {answer.view === "compare" ? "Compare" : "Explorer"}
                      </button>
                      <button
                        aria-label={`Remove ${focusLabel(answer.target)} answer`}
                        className="icon-action-button"
                        onClick={() => removeHomeAnswer(answer.id)}
                        title="Remove answer"
                        type="button"
                      >
                        x
                      </button>
                    </div>
                  </header>
                  <div className="home-answer-content" hidden={isCollapsed}>
                    {renderHomeAnswerContent(answer)}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
      <datalist id="cached-pitchers">
        {pitchers.map((pitcher) => (
          <option key={pitcher.pitcher} value={formatPersonName(pitcher.player_name)} />
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

      <PitchExplorerView
        hidden={activeView !== "explorer"}
        context={{
          API_URL,
          pitcherError,
          pitchOptionsError,
          selectedExplorerPitcher,
          formatDate,
          formatPersonName,
          resolvableExplorerPitcher,
          renderPitchFilterField,
          pitchField,
          activePitchFilterList,
          removePitchFilter,
          isSearching,
          clearPitchFilters,
          handleSearch,
          searchError,
          totalResultCount,
          resultCount,
          results,
          downloadCsv,
          formatBatter,
          describePlateLocation,
          formatBattedBall,
          formatNumber,
          averageNumbers,
          arsenalSummary,
          formatRate,
          heatmap,
          heatmapMode,
          isHeatmapLoading,
          updateHeatmapMode,
          renderSortableHeader,
          sortedResults,
          formatValue,
          formatBreak,
          formatDescription,
          formatEvent,
          dataQualityMetrics: resultDataQualityMetrics,
          dataQualityPitchCount,
          explorerFocus,
          lastAppliedQuery: activeView === "explorer" ? lastAppliedQuery : "",
          focusedResultTarget: ""
        }}
      />

      <CompareView
        hidden={activeView !== "compare"}
        context={{
          API_URL,
          handleCompare,
          pitcherError,
          compareDateRange,
          formatDate,
          compareFilters,
          completePitcherName,
          updateCompareFilter,
          compareOptions,
          hasComparePresetRange,
          setComparePreset,
          compareFields,
          formatShortDate,
          formatShortDateRange,
          activeCompareFilterList,
          removeCompareFilter,
          isComparing,
          canCompare,
          clearCompareFilters,
          compareError,
          comparison,
          searchFiltersPitcherName,
          comparisonName,
          setComparisonName,
          saveCurrentComparison,
          downloadCsv,
          visiblePitchTypes,
          savedComparisons,
          setCompareFilters,
          setComparePitchTypes,
          pitchTypes,
          comparePitchTypes,
          topUsageDelta,
          formatDelta,
          formatDeltaWithUnit,
          compareHeatmapA,
          compareHeatmapB,
          compareHeatmapMode,
          isCompareHeatmapLoading,
          updateCompareHeatmapMode,
          formatDateRange,
          formatRate,
          formatNumber,
          formatNumberWithUnit,
          drilldownPitchType,
          loadPitchTypeDrilldown,
          isDrilldownLoading,
          drilldownA,
          drilldownB,
          setDrilldownPitchType,
          setDrilldownA,
          setDrilldownB,
          whiffRateFromPitches,
          zoneRateFromPitches,
          rateDelta,
          formatBatter,
          formatDescription,
          formatEvent,
          compareFocus,
          lastAppliedQuery: activeView === "compare" ? lastAppliedQuery : "",
          focusedResultTarget: ""
        }}
      />
    </main>
  );
}

export default App;
