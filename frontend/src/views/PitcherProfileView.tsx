import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { CachedPitcher, PitchResult } from "../api";
import Icon from "../components/Icon";
import PitcherCombobox from "../components/PitcherCombobox";
import { formatPitchTypeWithCode } from "../pitchTypes";
import { countLabel } from "../text";

type PitcherProfileViewContext = Record<string, any> & {
  pitchers: CachedPitcher[];
  profilePitcherName: string;
  profileSeason: string;
  profilePitchType: string;
  profilePitches: PitchResult[];
  profileTotalPitchCount: number;
};

type PitcherProfileViewProps = {
  hidden: boolean;
  context: PitcherProfileViewContext;
};

type TrendMetric = "velocity" | "spin" | "ivb" | "hb";

type TrendDatum = {
  date: string;
  count: number;
  velocity: number | null;
  spin: number | null;
  ivb: number | null;
  hb: number | null;
};

const chartWidth = 720;
const chartHeight = 220;
const chartPadding = {
  top: 22,
  right: 24,
  bottom: 34,
  left: 48,
};
const trendMetrics: TrendMetric[] = ["velocity", "spin", "ivb", "hb"];

const strikeDescriptions = new Set([
  "called_strike",
  "foul",
  "foul_bunt",
  "foul_tip",
  "hit_into_play",
  "hit_into_play_no_out",
  "hit_into_play_score",
  "swinging_strike",
  "swinging_strike_blocked",
]);

const whiffDescriptions = new Set(["swinging_strike", "swinging_strike_blocked"]);

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatNullableNumber(value: number | null, digits = 1) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatSignedNumber(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function rateFromPitches(pitches: PitchResult[], predicate: (pitch: PitchResult) => boolean) {
  return pitches.length ? pitches.filter(predicate).length / pitches.length : null;
}

function zoneRate(pitches: PitchResult[]) {
  const located = pitches.filter((pitch) => pitch.plate_x !== null && pitch.plate_z !== null);
  if (!located.length) return null;

  return located.filter(
    (pitch) =>
      pitch.plate_x !== null &&
      pitch.plate_z !== null &&
      Math.abs(pitch.plate_x) <= 0.83 &&
      pitch.plate_z >= 1.5 &&
      pitch.plate_z <= 3.5,
  ).length / located.length;
}

function pitchSummary(pitches: PitchResult[]) {
  const byPitch = pitches.reduce((groups, pitch) => {
    const pitchType = pitch.pitch_type ?? "Unknown";
    const current = groups.get(pitchType) ?? {
      pitchType,
      count: 0,
      velocity: [] as number[],
      spin: [] as number[],
      ivb: [] as number[],
      hb: [] as number[],
      whiffs: 0,
      strikes: 0,
    };
    current.count += 1;
    if (pitch.release_speed !== null) current.velocity.push(pitch.release_speed);
    if (pitch.release_spin_rate !== null) current.spin.push(pitch.release_spin_rate);
    if (pitch.pfx_z !== null) current.ivb.push(pitch.pfx_z * 12);
    if (pitch.pfx_x !== null) current.hb.push(pitch.pfx_x * -12);
    if (pitch.description && whiffDescriptions.has(pitch.description)) current.whiffs += 1;
    if (pitch.description && strikeDescriptions.has(pitch.description)) current.strikes += 1;
    groups.set(pitchType, current);
    return groups;
  }, new Map<string, {
    pitchType: string;
    count: number;
    velocity: number[];
    spin: number[];
    ivb: number[];
    hb: number[];
    whiffs: number;
    strikes: number;
  }>());

  return Array.from(byPitch.values()).sort((a, b) => b.count - a.count);
}

function buildTrendData(pitches: PitchResult[]) {
  const byDate = pitches.reduce((groups, pitch) => {
    if (!pitch.game_date) return groups;
    const current = groups.get(pitch.game_date) ?? {
      velocity: [] as number[],
      spin: [] as number[],
      ivb: [] as number[],
      hb: [] as number[],
      count: 0,
    };
    current.count += 1;
    if (pitch.release_speed !== null) current.velocity.push(pitch.release_speed);
    if (pitch.release_spin_rate !== null) current.spin.push(pitch.release_spin_rate);
    if (pitch.pfx_z !== null) current.ivb.push(pitch.pfx_z * 12);
    if (pitch.pfx_x !== null) current.hb.push(pitch.pfx_x * -12);
    groups.set(pitch.game_date, current);
    return groups;
  }, new Map<string, { count: number; velocity: number[]; spin: number[]; ivb: number[]; hb: number[] }>());

  return Array.from(byDate.entries())
    .map(([date, values]) => ({
      date,
      count: values.count,
      velocity: average(values.velocity),
      spin: average(values.spin),
      ivb: average(values.ivb),
      hb: average(values.hb),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricConfig(metric: TrendMetric) {
  if (metric === "spin") return { label: "Spin", unit: "rpm", digits: 0, axisUnit: "rpm" };
  if (metric === "ivb") return { label: "IVB", unit: "in", digits: 1, axisUnit: "in" };
  if (metric === "hb") return { label: "HB", unit: "in", digits: 1, axisUnit: "in" };
  return { label: "Velocity", unit: "mph", digits: 1, axisUnit: "mph" };
}

function TrendChart({
  data,
  metric,
  formatShortDate,
  isLarge = false,
  onToggleFocus,
}: {
  data: TrendDatum[];
  metric: TrendMetric;
  formatShortDate: (value: string) => string;
  isLarge?: boolean;
  onToggleFocus?: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const config = metricConfig(metric);
  const points = data
    .map((datum) => ({ ...datum, value: datum[metric] }))
    .filter((datum): datum is TrendDatum & { value: number } => datum.value !== null);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const paddedMin = values.length ? min - Math.max((max - min) * 0.12, metric === "spin" ? 30 : 0.5) : 0;
  const paddedMax = values.length ? max + Math.max((max - min) * 0.12, metric === "spin" ? 30 : 0.5) : 1;
  const xSpan = Math.max(points.length - 1, 1);
  const ySpan = paddedMax - paddedMin || 1;
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  function x(index: number) {
    return chartPadding.left + (index / xSpan) * plotWidth;
  }

  function y(value: number) {
    return chartPadding.top + ((paddedMax - value) / ySpan) * plotHeight;
  }

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`)
    .join(" ");
  const latest = points.at(-1);
  const isInspectingPoint = hoveredPointIndex !== null;
  const inspectedPoint =
    hoveredPointIndex === null ? latest : points[hoveredPointIndex] ?? latest;
  const inspectedPointIndex =
    hoveredPointIndex === null ? (latest ? points.length - 1 : -1) : hoveredPointIndex;
  const inspectedLabelAnchor =
    inspectedPointIndex < 0
      ? "end"
      : inspectedPointIndex < points.length / 3
        ? "start"
        : inspectedPointIndex > (points.length * 2) / 3
          ? "end"
          : "middle";
  const seasonAverage =
    points.length && points.some((point) => point.count > 0)
      ? points.reduce((sum, point) => sum + point.value * point.count, 0) /
        points.reduce((sum, point) => sum + point.count, 0)
      : null;
  const inspectedDelta =
    inspectedPoint && seasonAverage !== null ? inspectedPoint.value - seasonAverage : null;
  function inspectNearestPoint(event: MouseEvent<SVGSVGElement>) {
    if (!points.length) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const nearestIndex = points.reduce(
      (nearest, _point, index) =>
        Math.abs(x(index) - pointerX) < Math.abs(x(nearest) - pointerX) ? index : nearest,
      0,
    );
    setHoveredPointIndex(nearestIndex);
  }

  useEffect(() => {
    setHoveredPointIndex(null);
  }, [data, metric]);

  useEffect(() => {
    if (!isLarge) return;

    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [isLarge, metric]);

  return (
    <section
      className={isLarge ? "chart-panel profile-trend-panel profile-trend-panel--large" : "chart-panel profile-trend-panel"}
      ref={panelRef}
      tabIndex={isLarge ? -1 : undefined}
    >
      <div className="chart-heading">
        <div>
          <h3>{config.label} ({config.unit})</h3>
          <p>{isInspectingPoint ? "Nearest game average" : "Latest game average"}</p>
        </div>
        {inspectedPoint ? (
          <div className="profile-trend-stat">
            <span>{formatShortDate(inspectedPoint.date)}</span>
            <strong>{formatNullableNumber(inspectedPoint.value, config.digits)} {config.unit}</strong>
            <em>{countLabel(inspectedPoint.count, "pitch")}</em>
            {inspectedDelta !== null ? (
              <small>
                {Math.abs(inspectedDelta) < 0.05
                  ? "Even vs avg"
                  : `${formatSignedNumber(inspectedDelta, config.digits)} ${config.unit} vs avg`}
              </small>
            ) : null}
          </div>
        ) : null}
        {onToggleFocus ? (
          <button
            aria-label={isLarge ? `Collapse ${config.label} trend chart` : `Expand ${config.label} trend chart`}
            className="icon-action-button profile-trend-expand-button"
            onClick={onToggleFocus}
            title={isLarge ? "Collapse chart" : "Expand chart"}
            type="button"
          >
            <Icon name={isLarge ? "minimize" : "maximize"} />
          </button>
        ) : null}
      </div>
      <svg
        className="profile-trend-chart"
        onMouseLeave={() => setHoveredPointIndex(null)}
        onMouseMove={inspectNearestPoint}
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartPadding.left} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} />
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom} />
        {points.length > 1 ? <path className="profile-trend-line" d={path} /> : null}
        {isInspectingPoint && inspectedPoint && inspectedPointIndex >= 0 ? (
          <line
            className="profile-trend-guide"
            x1={x(inspectedPointIndex)}
            x2={x(inspectedPointIndex)}
            y1={chartPadding.top}
            y2={chartHeight - chartPadding.bottom}
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            aria-label={`${formatShortDate(point.date)}: ${formatNullableNumber(point.value, config.digits)} ${config.unit}`}
            className={isInspectingPoint && index === inspectedPointIndex ? "profile-trend-point is-active" : "profile-trend-point"}
            cx={x(index)}
            cy={y(point.value)}
            key={point.date}
            onBlur={() => setHoveredPointIndex(null)}
            onFocus={() => setHoveredPointIndex(index)}
            r={isInspectingPoint && index === inspectedPointIndex ? "5" : "4"}
            tabIndex={0}
          />
        ))}
        {points.length > 0 ? (
          <>
            <text className="profile-trend-label" x={chartPadding.left} y={16}>
              {formatNullableNumber(paddedMax, config.digits)} {config.axisUnit}
            </text>
            <text className="profile-trend-label" x={chartPadding.left} y={chartHeight - chartPadding.bottom - 8}>
              {formatNullableNumber(paddedMin, config.digits)} {config.axisUnit}
            </text>
            <text
              className="profile-trend-label profile-trend-label--date"
              textAnchor={inspectedLabelAnchor}
              x={inspectedPointIndex >= 0 ? x(inspectedPointIndex) : chartWidth - chartPadding.right}
              y={chartHeight - 7}
            >
              {inspectedPoint ? formatShortDate(inspectedPoint.date) : formatShortDate(points.at(-1)!.date)}
            </text>
          </>
        ) : null}
      </svg>
    </section>
  );
}

function PitcherProfileView({ hidden, context }: PitcherProfileViewProps) {
  const {
    pitcherError,
    pitchers,
    profilePitcherName,
    profileSeason,
    profilePitchType,
    setProfilePitchType,
    profileSeasonOptions,
    updateProfileSeason,
    selectProfilePitcher,
    updateProfilePitcher,
    resolveAndLoadProfilePitcher,
    selectedProfilePitcher,
    resolvableProfilePitcher,
    isProfileLoading,
    profileLoadedSeasonCount,
    profileLoadingSeasonCount,
    profileError,
    profilePitches,
    profileTotalPitchCount,
    formatDate,
    formatShortDate,
    formatPersonName,
    formatNumber,
    formatRate,
    formatBreak,
    averageNumbers,
    openProfileInExplorer,
    openProfileInCompare,
  } = context;
  const selectedPitcher = selectedProfilePitcher() ?? resolvableProfilePitcher();
  const summaries = useMemo(() => pitchSummary(profilePitches), [profilePitches]);
  const availableSeasons = profileSeasonOptions();
  const activeSeason = profileSeason || availableSeasons[0] || "";
  const isPartialSeasonLoad = profileTotalPitchCount > profilePitches.length;
  const [focusedTrendMetric, setFocusedTrendMetric] = useState<TrendMetric | null>(null);
  const selectedTrendSummary = summaries.find((pitch) => pitch.pitchType === profilePitchType) ?? summaries[0];
  const selectedTrendPitches = useMemo(
    () =>
      selectedTrendSummary
        ? profilePitches.filter((pitch) => (pitch.pitch_type ?? "Unknown") === selectedTrendSummary.pitchType)
        : [],
    [profilePitches, selectedTrendSummary],
  );
  const trendData = useMemo(() => buildTrendData(selectedTrendPitches), [selectedTrendPitches]);
  const selectedTrendGameCount = useMemo(
    () => new Set(selectedTrendPitches.map((pitch) => pitch.game_date).filter(Boolean)).size,
    [selectedTrendPitches],
  );
  const selectedTrendUsage = selectedTrendPitches.length / profilePitches.length;
  const selectedTrendVelocity = selectedTrendSummary ? averageNumbers(selectedTrendSummary.velocity) : null;
  const selectedTrendSpin = selectedTrendSummary ? averageNumbers(selectedTrendSummary.spin) : null;
  const selectedTrendIvb = selectedTrendSummary ? averageNumbers(selectedTrendSummary.ivb) : null;
  const selectedTrendHb = selectedTrendSummary ? averageNumbers(selectedTrendSummary.hb) : null;
  const selectedTrendStrikeRate = rateFromPitches(selectedTrendPitches, (pitch) => Boolean(pitch.description && strikeDescriptions.has(pitch.description)));
  const selectedTrendWhiffRate = rateFromPitches(selectedTrendPitches, (pitch) => Boolean(pitch.description && whiffDescriptions.has(pitch.description)));
  const selectedTrendZoneRate = zoneRate(selectedTrendPitches);
  const averageVelocity = averageNumbers(profilePitches.map((pitch) => pitch.release_speed).filter((value): value is number => value !== null));
  const averageSpin = averageNumbers(profilePitches.map((pitch) => pitch.release_spin_rate).filter((value): value is number => value !== null));
  const strikeRate = rateFromPitches(profilePitches, (pitch) => Boolean(pitch.description && strikeDescriptions.has(pitch.description)));
  const whiffRate = rateFromPitches(profilePitches, (pitch) => Boolean(pitch.description && whiffDescriptions.has(pitch.description)));
  const inZoneRate = zoneRate(profilePitches);
  const profileCacheProgress =
    isProfileLoading && profileLoadingSeasonCount > 0
      ? `Caching seasons ${Math.min(profileLoadedSeasonCount, profileLoadingSeasonCount)} of ${profileLoadingSeasonCount}`
      : "";

  useEffect(() => {
    if (summaries.length === 0) {
      if (profilePitchType) setProfilePitchType("");
      return;
    }

    if (!summaries.some((pitch) => pitch.pitchType === profilePitchType)) {
      setProfilePitchType(summaries[0].pitchType);
    }
  }, [profilePitchType, setProfilePitchType, summaries]);

  function chooseTrendPitchType(pitchType: string) {
    setProfilePitchType(pitchType);
    setFocusedTrendMetric(null);
  }

  return (
    <section className="page-section" aria-labelledby="pitcher-profile-title" hidden={hidden}>
      <div className="section-heading">
        <h2 id="pitcher-profile-title">Pitcher Profile</h2>
        {selectedPitcher ? (
          <span>
            {formatDate(selectedPitcher.first_game_date)} to {formatDate(selectedPitcher.last_game_date)}
          </span>
        ) : null}
      </div>

      <section className="filter-panel profile-filter-panel">
        {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
        <label className="filter-field profile-pitcher-field">
          <span>Pitcher</span>
          <PitcherCombobox
            formatDate={formatShortDate}
            formatPersonName={formatPersonName}
            id="profile-pitcher-search"
            onBlur={resolveAndLoadProfilePitcher}
            onChange={updateProfilePitcher}
            onSelect={selectProfilePitcher}
            pitchers={pitchers}
            placeholder="Choose a cached pitcher"
            value={profilePitcherName}
          />
        </label>
        <div className="form-actions">
          <button className="secondary-button" disabled={!resolvableProfilePitcher()} onClick={openProfileInExplorer} type="button">
            Open Explorer
          </button>
          <button className="secondary-button" disabled={!resolvableProfilePitcher()} onClick={openProfileInCompare} type="button">
            Open Compare
          </button>
        </div>
      </section>

      {profileError ? <div className="error-banner">{profileError}</div> : null}
      {profileCacheProgress ? <div className="inline-note profile-cache-progress">{profileCacheProgress}</div> : null}

      {selectedPitcher ? (
        <section className="profile-hero">
          <div>
            <span>Cached Pitcher</span>
            <h3>{formatPersonName(selectedPitcher.player_name)}{activeSeason ? ` | ${activeSeason}` : ""}</h3>
          </div>
          <div className="profile-hero-side">
            <div className="profile-season-switcher" aria-label="Profile season">
              <span>Season</span>
              <div>
                {availableSeasons.map((season: string) => (
                  <button
                    className={season === activeSeason ? "profile-season-button is-active" : "profile-season-button"}
                    disabled={isProfileLoading}
                    key={season}
                    onClick={() => updateProfileSeason(season)}
                    type="button"
                  >
                    {season}
                  </button>
                ))}
              </div>
            </div>
            <div className="profile-hero-metrics">
              <div>
                <span>Cached Range</span>
                <strong>{selectedPitcher.first_game_date.slice(0, 4)}-{selectedPitcher.last_game_date.slice(0, 4)}</strong>
              </div>
              <div>
                <span>Season Pitches</span>
                <strong>{countLabel(profileTotalPitchCount || profilePitches.length, "pitch")}</strong>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {profilePitches.length > 0 ? (
        <>
          <section className="profile-metric-grid">
            <div className="metric-card">
              <span>Average Velocity</span>
              <strong>{formatNumber(averageVelocity)} mph</strong>
            </div>
            <div className="metric-card">
              <span>Average Spin</span>
              <strong>{formatNumber(averageSpin, 0)} rpm</strong>
            </div>
            <div className="metric-card">
              <span>Strike Rate</span>
              <strong>{formatRate(strikeRate)}</strong>
            </div>
            <div className="metric-card">
              <span>Whiff Rate</span>
              <strong>{formatRate(whiffRate)}</strong>
            </div>
            <div className="metric-card">
              <span>Zone Rate</span>
              <strong>{formatRate(inZoneRate)}</strong>
            </div>
          </section>
          {isPartialSeasonLoad ? (
            <div className="inline-note">
              Showing {countLabel(profilePitches.length, "pitch")} of {countLabel(profileTotalPitchCount, "pitch")} returned for this season.
            </div>
          ) : null}

          <section className="chart-panel">
            <div className="chart-heading">
              <h3>Arsenal</h3>
              <span>{countLabel(summaries.length, "pitch type")}</span>
            </div>
            <div className="table-wrap compact-table-wrap">
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>Pitch</th>
                    <th>Count</th>
                    <th>Usage</th>
                    <th>Velo (mph)</th>
                    <th>Spin (rpm)</th>
                    <th>IVB (in)</th>
                    <th>HB (in)</th>
                    <th>Strike</th>
                    <th>Whiff</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((pitch) => (
                    <tr
                      className={
                        pitch.pitchType === selectedTrendSummary?.pitchType
                          ? "profile-arsenal-row is-active"
                          : "profile-arsenal-row"
                      }
                      key={pitch.pitchType}
                      onClick={() => chooseTrendPitchType(pitch.pitchType)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          chooseTrendPitchType(pitch.pitchType);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>{formatPitchTypeWithCode(pitch.pitchType)}</td>
                      <td>{pitch.count}</td>
                      <td>{formatRate(pitch.count / profilePitches.length)}</td>
                      <td>{formatNumber(averageNumbers(pitch.velocity))}</td>
                      <td>{formatNumber(averageNumbers(pitch.spin), 0)}</td>
                      <td>{formatNumber(averageNumbers(pitch.ivb))}</td>
                      <td>{formatNumber(averageNumbers(pitch.hb))}</td>
                      <td>{formatRate(pitch.strikes / pitch.count)}</td>
                      <td>{formatRate(pitch.whiffs / pitch.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="profile-trends-section" aria-label="Pitch-specific game trends">
            <div className="profile-trends-heading">
              <div>
                <h3>Pitch Trends</h3>
                <p>
                  {selectedTrendSummary
                    ? `${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} across ${countLabel(selectedTrendPitches.length, "pitch")}`
                    : "Choose a pitch type"}
                </p>
              </div>
              <div className="profile-trend-controls" aria-label="Trend pitch type">
                {summaries.map((pitch) => (
                  <button
                    className={
                      pitch.pitchType === selectedTrendSummary?.pitchType
                        ? "profile-trend-button is-active"
                        : "profile-trend-button"
                    }
                    key={pitch.pitchType}
                    onClick={() => chooseTrendPitchType(pitch.pitchType)}
                    type="button"
                  >
                    {formatPitchTypeWithCode(pitch.pitchType)}
                  </button>
                ))}
              </div>
            </div>
            {selectedTrendSummary ? (
              <section className="selected-pitch-summary-grid" aria-label="Selected pitch summary">
                <div className="selected-pitch-summary-card">
                  <span>Sample</span>
                  <strong>{countLabel(selectedTrendPitches.length, "pitch")}</strong>
                  <em>
                    {countLabel(selectedTrendGameCount, "game")} | {formatRate(selectedTrendUsage)} usage
                  </em>
                </div>
                <div className="selected-pitch-summary-card">
                  <span>Shape Snapshot</span>
                  <strong>{formatNumber(selectedTrendVelocity)} mph</strong>
                  <em>
                    {formatNumber(selectedTrendSpin, 0)} rpm | IVB {formatNumber(selectedTrendIvb)} in | HB {formatNumber(selectedTrendHb)} in
                  </em>
                </div>
                <div className="selected-pitch-summary-card">
                  <span>Command / Finish</span>
                  <strong>{formatRate(selectedTrendZoneRate)} zone</strong>
                  <em>
                    {formatRate(selectedTrendStrikeRate)} strikes | {formatRate(selectedTrendWhiffRate)} whiffs
                  </em>
                </div>
              </section>
            ) : null}
            {focusedTrendMetric ? (
              <TrendChart
                data={trendData}
                formatShortDate={formatShortDate}
                isLarge
                metric={focusedTrendMetric}
                onToggleFocus={() => setFocusedTrendMetric(null)}
              />
            ) : null}
            <div className="profile-trend-grid">
              {trendMetrics.map((metric) => (
                <TrendChart
                  data={trendData}
                  formatShortDate={formatShortDate}
                  key={metric}
                  metric={metric}
                  onToggleFocus={() => setFocusedTrendMetric(metric)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state profile-empty-state">
          <p>
            {isProfileLoading
              ? "Loading pitcher profile..."
              : selectedPitcher
                ? "Profile data will appear after Relay matches the selected cached pitcher."
                : "Choose a cached pitcher to begin."}
          </p>
        </div>
      )}
    </section>
  );
}

export default PitcherProfileView;
