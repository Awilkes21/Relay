import { useEffect, useMemo, useState } from "react";
import {
  API_URL,
  type CachedPitcher,
  type CacheMetadataResponse,
  type CompareFilters,
  type HeatmapMode,
  type PitchHeatmapResponse,
  type PitchFilterOptions,
  type PitcherCompareResponse,
  type PitchFilters,
  type PitchResult,
  type SavedComparison,
  comparePitcher,
  getCacheMetadata,
  getPitchHeatmap,
  getHealth,
  getPitchFilterOptions,
  getPitchers,
  searchPitches,
} from "./api";
import PitchExplorerView from "./views/PitchExplorerView";
import CompareView from "./views/CompareView";
import { formatPitchType, formatPitchTypeWithCode } from "./pitchTypes";
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

function formatDelta(value: number | null | undefined, kind: "rate" | "number") {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return kind === "rate"
    ? `${sign}${(value * 100).toFixed(1)} pts`
    : `${sign}${value.toFixed(1)}`;
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
            pitcher_id: "",
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
          `${game.pitch_count} pitches`,
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
    if (name === "location_filter") {
      return value === "zone" ? "In Zone" : "Out of Zone";
    }
    if (name === "description") return formatDescription(value);
    if (name === "events") return formatEvent(value);
    if (name === "single_game") return formatDate(value);
    if (name === "pitcher_name") return formatPersonName(value);
    if (name === "pitch_type") return formatPitchTypeWithCode(value);
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
          entry[0] !== "pitcher_id" &&
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
    if (name === "pitch_type") return "Pitch Type";
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
      const queryFilters = pitcherIdQueryFilters(searchFilters);
      const [response, heatmapResponse] = await Promise.all([
        searchPitches(queryFilters),
        getPitchHeatmap(queryFilters, heatmapMode),
      ]);
      setResults(response.results);
      setResultCount(response.count);
      setTotalResultCount(response.total_count);
      setHeatmap(heatmapResponse);
      setLastPitchSearchFilters(queryFilters);
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
      const queryFilters = pitcherIdQueryFilters(searchFilters);
      const response = await comparePitcher(queryFilters, compareHeatmapMode);
      setComparison(response);
      setComparePitchTypes(collectPitchTypes(response));
      setCompareHeatmapA(response.chart_data?.heatmaps.period_a ?? null);
      setCompareHeatmapB(response.chart_data?.heatmaps.period_b ?? null);
      setDrilldownPitchType(null);
      setDrilldownA([]);
      setDrilldownB([]);
    } catch (error) {
      setComparison(null);
      setCompareHeatmapA(null);
      setCompareHeatmapB(null);
      setCompareError(
        error instanceof Error ? error.message : "Comparison failed",
      );
    } finally {
      setIsComparing(false);
    }
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
  const dataQualityMetrics = cacheMetadata?.data_quality?.metrics ?? [];

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
          dataQualityMetrics
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
          topVelocityDelta,
          topSpinDelta,
          formatDelta,
          compareHeatmapA,
          compareHeatmapB,
          compareHeatmapMode,
          isCompareHeatmapLoading,
          updateCompareHeatmapMode,
          formatDateRange,
          formatRate,
          formatNumber,
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
          formatEvent
        }}
      />
    </main>
  );
}

export default App;
