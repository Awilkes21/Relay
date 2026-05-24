import { useEffect, useMemo, useState } from "react";
import type { PitchResult } from "../api";
import { formatPitchType } from "../pitchTypes";
import { countLabel } from "../text";
import Icon from "./Icon";

type StrikeZoneChartProps = {
  pitches: PitchResult[];
};

type PlottedPitch = PitchResult & {
  plate_x: number;
  plate_z: number;
};

type PlotDomain = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
};

type ColorMode = "pitch" | "result" | "contact";
type CountFilter = "all" | "ahead" | "even" | "behind" | "two_strikes" | "full";
type DensityMode = "off" | "on";
type Bucket = {
  column: number;
  row: number;
  label: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
};
type BucketSummary = {
  bucket: Bucket;
  pitches: PlottedPitch[];
  count: number;
  share: number;
  strikeRate: number | null;
  whiffRate: number | null;
  averageExitVelocity: number | null;
  topPitchType: string | null;
};

const width = 560;
const height = 460;
const padding = 46;
const baseXMin = -2.5;
const baseXMax = 2.5;
const baseZMin = 0;
const baseZMax = 5;
const zoneLeft = -0.83;
const zoneRight = 0.83;
const zoneTop = 3.5;
const zoneBottom = 1.5;
const zoneMiddle = (zoneTop + zoneBottom) / 2;
const zoneCenterX = (zoneLeft + zoneRight) / 2;
const zoomLevels = [1, 1.5, 2] as const;

const pitchColors: Record<string, string> = {
  FF: "#1d4f7a",
  SI: "#287271",
  SL: "#b5651d",
  CH: "#7b4ea3",
  CU: "#9a3326",
  FC: "#44633f",
  FS: "#4b5565",
};

const resultColors: Record<string, string> = {
  ball: "#8b95a6",
  strike: "#1d4f7a",
  whiff: "#b33a31",
  foul: "#9a6a20",
  in_play: "#287271",
  hit_by_pitch: "#7b4ea3",
};

const contactColors: Record<string, string> = {
  hard: "#b33a31",
  medium: "#b5651d",
  soft: "#287271",
  no_contact: "#7f92a8",
};

const descriptionLabels: Record<string, string> = {
  ball: "Ball",
  called_strike: "Called Strike",
  blocked_ball: "Blocked Ball",
  swinging_strike: "Swinging Strike",
  swinging_strike_blocked: "Swinging Strike, Blocked",
  foul: "Foul",
  foul_tip: "Foul Tip",
  foul_bunt: "Foul Bunt",
  missed_bunt: "Missed Bunt",
  hit_by_pitch: "Hit By Pitch",
  hit_into_play: "Ball In Play",
  hit_into_play_no_out: "Ball In Play, No Out",
  hit_into_play_score: "Ball In Play, Run Scores",
};

const colorModes: Array<{ value: ColorMode; label: string }> = [
  { value: "pitch", label: "Pitch" },
  { value: "result", label: "Result" },
  { value: "contact", label: "Contact" },
];

const countFilters: Array<{ value: CountFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ahead", label: "Ahead" },
  { value: "even", label: "Even" },
  { value: "behind", label: "Behind" },
  { value: "two_strikes", label: "2K" },
  { value: "full", label: "Full" },
];

const whiffDescriptions = new Set(["swinging_strike", "swinging_strike_blocked"]);
const strikeDescriptions = new Set([
  "called_strike",
  "swinging_strike",
  "swinging_strike_blocked",
  "foul",
  "foul_tip",
  "foul_bunt",
  "missed_bunt",
  "hit_into_play",
  "hit_into_play_no_out",
  "hit_into_play_score",
]);

function scaleX(value: number, domain: PlotDomain) {
  return (
    padding +
    ((value - domain.xMin) / (domain.xMax - domain.xMin)) * (width - padding * 2)
  );
}

function scaleZ(value: number, domain: PlotDomain) {
  return (
    height -
    padding -
    ((value - domain.zMin) / (domain.zMax - domain.zMin)) * (height - padding * 2)
  );
}

function pitcherViewX(plateX: number) {
  return plateX * -1;
}

function pitchColor(pitchType: string | null) {
  return pitchType ? pitchColors[pitchType] ?? "#2f6f9f" : "#7f92a8";
}

function titleCaseCode(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDetail(value: string | number | null) {
  return value ?? "-";
}

function formatDescription(value: string | null | undefined) {
  if (!value) return "-";
  return descriptionLabels[value] ?? titleCaseCode(value);
}

function formatEvent(value: string | null | undefined) {
  return titleCaseCode(value);
}

function formatPitchResult(pitch: PitchResult) {
  return pitch.events ? formatEvent(pitch.events) : formatDescription(pitch.description);
}

function formatSpin(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} rpm`;
}

function truncateLabel(value: string, maxLength = 24) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatBreak(value: number | null) {
  return value === null ? "-" : `${(value * 12).toFixed(1)} in`;
}

function formatContactNumber(value: number | null, unit: string, digits = 1) {
  return value === null ? "-" : `${value.toFixed(digits)} ${unit}`;
}

function formatBattedBall(value: string | null) {
  if (!value) return "-";
  return titleCaseCode(value);
}

function formatRate(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function hasLocation(pitch: PitchResult): pitch is PlottedPitch {
  return pitch.plate_x !== null && pitch.plate_z !== null;
}

function domainForZoom(zoom: number): PlotDomain {
  const xCenter = (baseXMin + baseXMax) / 2;
  const zCenter = (baseZMin + baseZMax) / 2;
  const xRange = (baseXMax - baseXMin) / zoom;
  const zRange = (baseZMax - baseZMin) / zoom;

  return {
    xMin: xCenter - xRange / 2,
    xMax: xCenter + xRange / 2,
    zMin: zCenter - zRange / 2,
    zMax: zCenter + zRange / 2,
  };
}

function describePitchLocation(pitch: PlottedPitch) {
  const x = pitcherViewX(pitch.plate_x);
  const z = pitch.plate_z;
  const vertical =
    z > zoneTop
      ? "Above Zone"
      : z < zoneBottom
        ? "Below Zone"
        : z >= zoneMiddle
          ? "Upper"
          : "Lower";
  const horizontal =
    x < zoneLeft
      ? "Outside Left"
      : x > zoneRight
        ? "Outside Right"
        : x < zoneCenterX - 0.2
          ? "Left Side"
          : x > zoneCenterX + 0.2
            ? "Right Side"
            : "Middle";

  if (vertical === "Above Zone" || vertical === "Below Zone") {
    return horizontal === "Middle" ? vertical : `${vertical}, ${horizontal}`;
  }

  return horizontal === "Middle" ? `${vertical} Middle` : `${vertical} ${horizontal}`;
}

function resultCategory(pitch: PitchResult) {
  if (pitch.description === "hit_by_pitch") return "hit_by_pitch";
  if (pitch.description?.startsWith("hit_into_play")) return "in_play";
  if (whiffDescriptions.has(pitch.description ?? "")) return "whiff";
  if (pitch.description?.startsWith("foul")) return "foul";
  if (pitch.description === "called_strike") return "strike";
  return "ball";
}

function resultLabel(category: string) {
  const labels: Record<string, string> = {
    ball: "Ball",
    strike: "Called Strike",
    whiff: "Whiff",
    foul: "Foul",
    in_play: "In Play",
    hit_by_pitch: "Hit By Pitch",
  };
  return labels[category] ?? titleCaseCode(category);
}

function contactCategory(pitch: PitchResult) {
  if (pitch.launch_speed === null) return "no_contact";
  if (pitch.launch_speed >= 95) return "hard";
  if (pitch.launch_speed >= 80) return "medium";
  return "soft";
}

function contactLabel(category: string) {
  const labels: Record<string, string> = {
    hard: "Hard Contact",
    medium: "Medium Contact",
    soft: "Soft Contact",
    no_contact: "No Batted Ball",
  };
  return labels[category] ?? titleCaseCode(category);
}

function colorForPitch(pitch: PlottedPitch, colorMode: ColorMode) {
  if (colorMode === "result") return resultColors[resultCategory(pitch)] ?? "#7f92a8";
  if (colorMode === "contact") return contactColors[contactCategory(pitch)] ?? "#7f92a8";
  return pitchColor(pitch.pitch_type);
}

function colorLabelForPitch(pitch: PlottedPitch, colorMode: ColorMode) {
  if (colorMode === "result") return resultLabel(resultCategory(pitch));
  if (colorMode === "contact") return contactLabel(contactCategory(pitch));
  return formatPitchType(pitch.pitch_type);
}

function countMatches(pitch: PlottedPitch, filter: CountFilter) {
  const balls = pitch.balls ?? 0;
  const strikes = pitch.strikes ?? 0;
  if (filter === "ahead") return strikes > balls;
  if (filter === "behind") return balls > strikes;
  if (filter === "even") return balls === strikes;
  if (filter === "two_strikes") return strikes === 2;
  if (filter === "full") return balls === 3 && strikes === 2;
  return true;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function isStrike(pitch: PlottedPitch) {
  return strikeDescriptions.has(pitch.description ?? "");
}

function isWhiff(pitch: PlottedPitch) {
  return whiffDescriptions.has(pitch.description ?? "");
}

function zoneBuckets(): Bucket[] {
  const columns = [
    { label: "Left", min: zoneLeft, max: zoneLeft + (zoneRight - zoneLeft) / 3 },
    {
      label: "Middle",
      min: zoneLeft + (zoneRight - zoneLeft) / 3,
      max: zoneLeft + ((zoneRight - zoneLeft) / 3) * 2,
    },
    { label: "Right", min: zoneLeft + ((zoneRight - zoneLeft) / 3) * 2, max: zoneRight },
  ];
  const rows = [
    { label: "Upper", min: zoneBottom + ((zoneTop - zoneBottom) / 3) * 2, max: zoneTop },
    {
      label: "Middle",
      min: zoneBottom + (zoneTop - zoneBottom) / 3,
      max: zoneBottom + ((zoneTop - zoneBottom) / 3) * 2,
    },
    { label: "Lower", min: zoneBottom, max: zoneBottom + (zoneTop - zoneBottom) / 3 },
  ];

  return rows.flatMap((row, rowIndex) =>
    columns.map((column, columnIndex) => ({
      column: columnIndex,
      row: rowIndex,
      label: row.label === "Middle" ? `${column.label} Middle` : `${row.label} ${column.label}`,
      xMin: column.min,
      xMax: column.max,
      zMin: row.min,
      zMax: row.max,
    })),
  );
}

function pitchInBucket(pitch: PlottedPitch, bucket: Bucket) {
  const x = pitcherViewX(pitch.plate_x);
  return x >= bucket.xMin && x <= bucket.xMax && pitch.plate_z >= bucket.zMin && pitch.plate_z <= bucket.zMax;
}

function topPitchType(pitches: PlottedPitch[]) {
  const counts = pitches.reduce((map, pitch) => {
    const pitchType = pitch.pitch_type ?? "Unknown";
    map.set(pitchType, (map.get(pitchType) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function summarizeBucket(bucket: Bucket, pitches: PlottedPitch[], denominator: number): BucketSummary {
  const bucketPitches = pitches.filter((pitch) => pitchInBucket(pitch, bucket));
  return {
    bucket,
    pitches: bucketPitches,
    count: bucketPitches.length,
    share: denominator ? bucketPitches.length / denominator : 0,
    strikeRate: bucketPitches.length
      ? bucketPitches.filter(isStrike).length / bucketPitches.length
      : null,
    whiffRate: bucketPitches.length
      ? bucketPitches.filter(isWhiff).length / bucketPitches.length
      : null,
    averageExitVelocity: average(
      bucketPitches
        .map((pitch) => pitch.launch_speed)
        .filter((value): value is number => value !== null),
    ),
    topPitchType: topPitchType(bucketPitches),
  };
}

function similarPitches(selectedPitch: PlottedPitch, pitches: PlottedPitch[]) {
  return pitches.filter((pitch) => {
    if (pitch === selectedPitch) return false;
    if (pitch.pitch_type !== selectedPitch.pitch_type) return false;
    if (pitch.balls !== selectedPitch.balls || pitch.strikes !== selectedPitch.strikes) return false;
    const distance = Math.hypot(
      pitcherViewX(pitch.plate_x) - pitcherViewX(selectedPitch.plate_x),
      pitch.plate_z - selectedPitch.plate_z,
    );
    return distance <= 0.45;
  });
}

function summaryRate(pitches: PlottedPitch[], predicate: (pitch: PlottedPitch) => boolean) {
  return pitches.length ? pitches.filter(predicate).length / pitches.length : null;
}

function StrikeZoneChart({ pitches }: StrikeZoneChartProps) {
  const plottedPitches = pitches.filter(hasLocation);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState<PlottedPitch | null>(null);
  const [hoveredPitch, setHoveredPitch] = useState<PlottedPitch | null>(null);
  const [selectedPitchType, setSelectedPitchType] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<BucketSummary | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<BucketSummary | null>(null);
  const [zoom, setZoom] = useState<(typeof zoomLevels)[number]>(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("pitch");
  const [countFilter, setCountFilter] = useState<CountFilter>("all");
  const [batterHand, setBatterHand] = useState<"all" | "L" | "R">("all");
  const [densityMode, setDensityMode] = useState<DensityMode>(
    plottedPitches.length > 150 ? "on" : "off",
  );
  const domain = domainForZoom(zoom);
  const filteredPitches = plottedPitches.filter((pitch) => {
    if (selectedPitchType && pitch.pitch_type !== selectedPitchType) return false;
    if (batterHand !== "all" && pitch.stand !== batterHand) return false;
    return countMatches(pitch, countFilter);
  });
  const tooltipPitch = hoveredPitch ?? selectedPitch;
  const buckets = useMemo(() => zoneBuckets(), []);
  const bucketSummaries = buckets.map((bucket) =>
    summarizeBucket(bucket, filteredPitches, filteredPitches.length),
  );
  const visibleBucketSummary = hoveredBucket ?? selectedBucket;
  const similarPitchSet = selectedPitch ? similarPitches(selectedPitch, filteredPitches) : [];
  const legendItems = useMemo(
    () =>
      Array.from(
        new Set(plottedPitches.map((pitch) => pitch.pitch_type ?? "Unknown")),
      ).sort((a, b) => formatPitchType(a).localeCompare(formatPitchType(b))),
    [plottedPitches],
  );
  const resultLegendItems = ["ball", "strike", "whiff", "foul", "in_play", "hit_by_pitch"];
  const contactLegendItems = ["hard", "medium", "soft", "no_contact"];

  useEffect(() => {
    setSelectedPitch(null);
    setHoveredPitch(null);
    setSelectedBucket(null);
    setHoveredBucket(null);
  }, [pitches, selectedPitchType, countFilter, batterHand]);

  useEffect(() => {
    setDensityMode(plottedPitches.length > 150 ? "on" : "off");
  }, [pitches]);

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPitch(null);
        setSelectedBucket(null);
      }
    }

    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  function pitchPoint(pitch: PlottedPitch) {
    return {
      x: scaleX(pitcherViewX(pitch.plate_x), domain),
      y: scaleZ(pitch.plate_z, domain),
    };
  }

  function tooltipPosition(point: { x: number; y: number }) {
    const tooltipWidth = 190;
    const tooltipHeight = 116;

    return {
      x: Math.min(Math.max(point.x + 14, padding), width - padding - tooltipWidth),
      y: Math.min(Math.max(point.y - tooltipHeight - 10, padding), height - padding - tooltipHeight),
      width: tooltipWidth,
      height: tooltipHeight,
    };
  }

  function renderPitchTooltip(pitch: PlottedPitch) {
    const point = pitchPoint(pitch);
    const tooltip = tooltipPosition(point);

    return (
      <g
        className="chart-tooltip"
        pointerEvents="none"
        transform={`translate(${tooltip.x} ${tooltip.y})`}
      >
        <rect height={tooltip.height} rx="8" width={tooltip.width} />
        <text className="chart-tooltip-title" x="12" y="21">
          {truncateLabel(formatPitchType(pitch.pitch_type))}
        </text>
        <text x="12" y="45">Velo {formatDetail(pitch.release_speed)} | Spin {formatSpin(pitch.release_spin_rate)}</text>
        <text x="12" y="64">Count {pitch.balls ?? "-"}-{pitch.strikes ?? "-"} | {formatPitchResult(pitch)}</text>
        <text x="12" y="83">IVB {formatBreak(pitch.pfx_z)} | HB {formatBreak(pitch.pfx_x)}</text>
        <text x="12" y="102">EV {formatContactNumber(pitch.launch_speed, "mph")}</text>
      </g>
    );
  }

  function renderBucketTooltip(summary: BucketSummary) {
    const x = scaleX((summary.bucket.xMin + summary.bucket.xMax) / 2, domain);
    const y = scaleZ((summary.bucket.zMin + summary.bucket.zMax) / 2, domain);
    const tooltip = tooltipPosition({ x, y });
    return (
      <g
        className="chart-tooltip"
        pointerEvents="none"
        transform={`translate(${tooltip.x} ${tooltip.y})`}
      >
        <rect height={tooltip.height} rx="8" width={tooltip.width} />
        <text className="chart-tooltip-title" x="12" y="21">
          {summary.bucket.label}
        </text>
        <text x="12" y="45">{countLabel(summary.count, "pitch")} | {formatRate(summary.share)} share</text>
        <text x="12" y="64">Strike {formatRate(summary.strikeRate)} | Whiff {formatRate(summary.whiffRate)}</text>
        <text x="12" y="83">Top pitch {truncateLabel(formatPitchType(summary.topPitchType), 18)}</text>
        <text x="12" y="102">Avg EV {formatContactNumber(summary.averageExitVelocity, "mph")}</text>
      </g>
    );
  }

  function renderLegend() {
    if (colorMode === "result") {
      return resultLegendItems.map((item) => (
        <span className="legend-item" key={item}>
          <span className="legend-swatch" style={{ backgroundColor: resultColors[item] }} />
          {resultLabel(item)}
        </span>
      ));
    }

    if (colorMode === "contact") {
      return contactLegendItems.map((item) => (
        <span className="legend-item" key={item}>
          <span className="legend-swatch" style={{ backgroundColor: contactColors[item] }} />
          {contactLabel(item)}
        </span>
      ));
    }

    return legendItems.length > 0 ? (
      legendItems.map((pitchType) => (
        <button
          className={
            selectedPitchType === pitchType
              ? "legend-item legend-button is-active"
              : "legend-item legend-button"
          }
          key={pitchType}
          onClick={() =>
            setSelectedPitchType((current) => (current === pitchType ? null : pitchType))
          }
          type="button"
        >
          <span
            className="legend-swatch"
            style={{ backgroundColor: pitchColor(pitchType) }}
          />
          <span className="legend-label">{formatPitchType(pitchType)}</span>
        </button>
      ))
    ) : (
      <span className="legend-empty">No pitch types</span>
    );
  }

  function colorModeLabel() {
    return colorModes.find((mode) => mode.value === colorMode)?.label ?? "Pitch Type";
  }

  function countFilterLabel() {
    return countFilters.find((filter) => filter.value === countFilter)?.label ?? "All Counts";
  }

  function batterFilterLabel() {
    if (batterHand === "L") return "vs LHH";
    if (batterHand === "R") return "vs RHH";
    return "All Batters";
  }

  return (
    <section
      className={isExpanded ? "chart-panel chart-panel--expanded" : "chart-panel"}
      aria-labelledby="strike-zone-title"
    >
      <div className="chart-heading collapsible-heading">
        <h3 id="strike-zone-title">Strike Zone</h3>
        <div className="section-actions">
          <span>
            {filteredPitches.length} shown in chart from {countLabel(plottedPitches.length, "filtered pitch")}
          </span>
          <button
            aria-label={isCollapsed ? "Expand strike zone chart" : "Collapse strike zone chart"}
            className="disclosure-button"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? "Expand" : "Collapse"}
            type="button"
          >
            <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} />
          </button>
        </div>
      </div>

      <div className="chart-body" hidden={isCollapsed}>
      <div className="strike-zone-toolbar">
        <div className="strike-zone-toolbar-row strike-zone-toolbar-row--primary">
          <div className="lens-group">
            <span className="lens-label">Color</span>
            <div className="zoom-controls" aria-label="Strike zone color controls">
              {colorModes.map((mode) => (
                <button
                  className={colorMode === mode.value ? "zoom-button is-active" : "zoom-button"}
                  key={mode.value}
                  onClick={() => setColorMode(mode.value)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="lens-group">
            <span className="lens-label">Count</span>
            <div className="zoom-controls" aria-label="Count situation filters">
              {countFilters.map((filter) => (
                <button
                  className={countFilter === filter.value ? "zoom-button is-active" : "zoom-button"}
                  key={filter.value}
                  onClick={() => setCountFilter(filter.value)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="lens-group">
            <span className="lens-label">Batter</span>
            <div className="zoom-controls" aria-label="Batter handedness filters">
              {(["all", "L", "R"] as const).map((hand) => (
                <button
                  className={batterHand === hand ? "zoom-button is-active" : "zoom-button"}
                  key={hand}
                  onClick={() => setBatterHand(hand)}
                  type="button"
                >
                  {hand === "all" ? "All" : `${hand}HH`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="strike-zone-toolbar-row strike-zone-toolbar-row--summary">
          <span className="chart-view-note strike-zone-orientation">
            Pitcher Left / Pitcher Right
          </span>
          <span className="strike-zone-state-summary">
            Colored by {colorModeLabel()} | {countFilterLabel()} | {batterFilterLabel()}
          </span>
        </div>

        <div className="strike-zone-toolbar-row strike-zone-toolbar-row--secondary">
          <div className="pitch-legend strike-zone-legend" aria-label="Color legend">
            {renderLegend()}
          </div>
          <div className="strike-zone-actions" aria-label="Strike zone chart actions">
          <div className="lens-group">
            <span className="lens-label">Zoom</span>
            <div className="zoom-controls" aria-label="Strike zone zoom controls">
              {zoomLevels.map((level) => (
                <button
                  className={zoom === level ? "zoom-button is-active" : "zoom-button"}
                  key={level}
                  onClick={() => setZoom(level)}
                  type="button"
                >
                  {level}x
                </button>
              ))}
            </div>
          </div>
          <button
            className={densityMode === "on" ? "secondary-button compact-action-button is-active" : "secondary-button compact-action-button"}
            onClick={() => setDensityMode((current) => (current === "on" ? "off" : "on"))}
            type="button"
          >
            Density
          </button>
          <button
            aria-label="Reset strike zone lens"
            className="secondary-button compact-action-button"
            onClick={() => {
              setSelectedPitchType(null);
              setCountFilter("all");
              setBatterHand("all");
              setColorMode("pitch");
              setDensityMode(plottedPitches.length > 150 ? "on" : "off");
              setSelectedPitch(null);
              setSelectedBucket(null);
            }}
            title="Reset lens"
            type="button"
          >
            <Icon name="reset" />
          </button>
          <button
            aria-label={isExpanded ? "Collapse expanded strike zone chart" : "Expand strike zone chart"}
            className="secondary-button compact-action-button"
            onClick={() => setIsExpanded((current) => !current)}
            title={isExpanded ? "Collapse" : "Expand"}
            type="button"
          >
            <Icon name={isExpanded ? "minimize" : "maximize"} />
          </button>
          </div>
        </div>
      </div>

      <div className="strike-zone-frame">
        <svg
          aria-label="Strike zone pitch location scatter plot"
          className="strike-zone-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <clipPath id="strike-zone-clip">
              <rect
                x={padding}
                y={padding}
                width={width - padding * 2}
                height={height - padding * 2}
              />
            </clipPath>
          </defs>
          <rect
            className="plot-background"
            x={padding}
            y={padding}
            width={width - padding * 2}
            height={height - padding * 2}
          />
          {densityMode === "on" ? (
            <g className="zone-density-layer">
              {bucketSummaries.map((summary) => (
                <rect
                  className="zone-density-cell"
                  height={scaleZ(summary.bucket.zMin, domain) - scaleZ(summary.bucket.zMax, domain)}
                  key={`density-${summary.bucket.label}`}
                  opacity={Math.min(0.42, 0.06 + summary.share * 3.6)}
                  width={scaleX(summary.bucket.xMax, domain) - scaleX(summary.bucket.xMin, domain)}
                  x={scaleX(summary.bucket.xMin, domain)}
                  y={scaleZ(summary.bucket.zMax, domain)}
                />
              ))}
            </g>
          ) : null}
          <line
            className="plot-axis"
            x1={scaleX(0, domain)}
            x2={scaleX(0, domain)}
            y1={padding}
            y2={height - padding}
          />
          <line
            className="plot-axis"
            x1={padding}
            x2={width - padding}
            y1={scaleZ(zoneMiddle, domain)}
            y2={scaleZ(zoneMiddle, domain)}
          />
          <rect
            className="strike-zone-box"
            x={scaleX(zoneLeft, domain)}
            y={scaleZ(zoneTop, domain)}
            width={scaleX(zoneRight, domain) - scaleX(zoneLeft, domain)}
            height={scaleZ(zoneBottom, domain) - scaleZ(zoneTop, domain)}
          />
          <g className="zone-bucket-layer">
            {bucketSummaries.map((summary) => (
              <rect
                className={
                  selectedBucket?.bucket.label === summary.bucket.label
                    ? "zone-bucket is-selected"
                    : "zone-bucket"
                }
                height={scaleZ(summary.bucket.zMin, domain) - scaleZ(summary.bucket.zMax, domain)}
                key={summary.bucket.label}
                onClick={() =>
                  setSelectedBucket((current) =>
                    current?.bucket.label === summary.bucket.label ? null : summary,
                  )
                }
                onMouseEnter={() => setHoveredBucket(summary)}
                onMouseLeave={() => setHoveredBucket(null)}
                width={scaleX(summary.bucket.xMax, domain) - scaleX(summary.bucket.xMin, domain)}
                x={scaleX(summary.bucket.xMin, domain)}
                y={scaleZ(summary.bucket.zMax, domain)}
              />
            ))}
          </g>
          <g clipPath="url(#strike-zone-clip)">
            {filteredPitches.map((pitch, index) => {
              const point = pitchPoint(pitch);

              return (
                <circle
                  className={
                    selectedPitch === pitch
                      ? "pitch-point pitch-point--selected"
                      : "pitch-point"
                  }
                  cx={point.x}
                  cy={point.y}
                  fill={colorForPitch(pitch, colorMode)}
                  key={`${pitch.plate_x}-${pitch.plate_z}-${index}`}
                  onClick={() =>
                    setSelectedPitch((current) => (current === pitch ? null : pitch))
                  }
                  onFocus={() => setHoveredPitch(pitch)}
                  onBlur={() => setHoveredPitch(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedPitch((current) => (current === pitch ? null : pitch));
                    }
                  }}
                  onMouseEnter={() => setHoveredPitch(pitch)}
                  onMouseLeave={() => setHoveredPitch(null)}
                  opacity={colorMode === "pitch" || !selectedPitchType ? 0.88 : 0.58}
                  r="5"
                  tabIndex={0}
                />
              );
            })}
          </g>
          {tooltipPitch ? renderPitchTooltip(tooltipPitch) : null}
          {!tooltipPitch && visibleBucketSummary ? renderBucketTooltip(visibleBucketSummary) : null}
        </svg>

        {filteredPitches.length === 0 ? (
          <p className="chart-empty">No pitch locations match these chart filters.</p>
        ) : null}
      </div>

      {selectedBucket ? (
        <div className="pitch-detail-panel selection-panel">
          <div className="selection-panel-header">
            <span>Selected Zone</span>
            <strong>{selectedBucket.bucket.label}</strong>
          </div>
          <div>
            <span>Pitches</span>
            <strong>{selectedBucket.count}</strong>
          </div>
          <div>
            <span>Share</span>
            <strong>{formatRate(selectedBucket.share)}</strong>
          </div>
          <div>
            <span>Strike Rate</span>
            <strong>{formatRate(selectedBucket.strikeRate)}</strong>
          </div>
          <div>
            <span>Whiff Rate</span>
            <strong>{formatRate(selectedBucket.whiffRate)}</strong>
          </div>
          <div>
            <span>Top Pitch</span>
            <strong>{formatPitchType(selectedBucket.topPitchType)}</strong>
          </div>
          <div>
            <span>Avg EV</span>
            <strong>{formatContactNumber(selectedBucket.averageExitVelocity, "mph")}</strong>
          </div>
          <button
            className="detail-close-button clear-selection-button"
            onClick={() => setSelectedBucket(null)}
            type="button"
          >
            <Icon name="x" />
            <span>Clear Zone</span>
          </button>
        </div>
      ) : null}

      {selectedPitch ? (
        <div className="pitch-detail-panel selection-panel">
          <div className="selection-panel-header">
            <span>Selected Pitch</span>
            <strong>{formatPitchType(selectedPitch.pitch_type)}</strong>
          </div>
          <div>
            <span>Pitch</span>
            <strong>{formatPitchType(selectedPitch.pitch_type)}</strong>
          </div>
          <div>
            <span>Color Group</span>
            <strong>{colorLabelForPitch(selectedPitch, colorMode)}</strong>
          </div>
          <div>
            <span>Velocity</span>
            <strong>{formatDetail(selectedPitch.release_speed)}</strong>
          </div>
          <div>
            <span>Spin</span>
            <strong>{formatSpin(selectedPitch.release_spin_rate)}</strong>
          </div>
          <div>
            <span>IVB</span>
            <strong>{formatBreak(selectedPitch.pfx_z)}</strong>
          </div>
          <div>
            <span>HB</span>
            <strong>{formatBreak(selectedPitch.pfx_x)}</strong>
          </div>
          <div>
            <span>Exit Velo</span>
            <strong>{formatContactNumber(selectedPitch.launch_speed, "mph")}</strong>
          </div>
          <div>
            <span>Launch Angle</span>
            <strong>{formatContactNumber(selectedPitch.launch_angle, "deg", 0)}</strong>
          </div>
          <div>
            <span>Contact</span>
            <strong>{formatBattedBall(selectedPitch.bb_type)}</strong>
          </div>
          <div>
            <span>Count</span>
            <strong>
              {selectedPitch.balls ?? "-"}-{selectedPitch.strikes ?? "-"}
            </strong>
          </div>
          <div>
            <span>Result</span>
            <strong>{formatPitchResult(selectedPitch)}</strong>
          </div>
          <div>
            <span>Location</span>
            <strong>{describePitchLocation(selectedPitch)}</strong>
          </div>
          <div>
            <span>Similar Pitches</span>
            <strong>{similarPitchSet.length}</strong>
          </div>
          <div>
            <span>Similar Whiff</span>
            <strong>{formatRate(summaryRate(similarPitchSet, isWhiff))}</strong>
          </div>
          <div>
            <span>Similar Strike</span>
            <strong>{formatRate(summaryRate(similarPitchSet, isStrike))}</strong>
          </div>
          <button
            className="detail-close-button clear-selection-button"
            onClick={() => setSelectedPitch(null)}
            type="button"
          >
            <Icon name="x" />
            <span>Clear Selection</span>
          </button>
        </div>
      ) : null}
      </div>
    </section>
  );
}

export default StrikeZoneChart;
