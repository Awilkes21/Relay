import { useEffect, useMemo, useState } from "react";
import type { CachedPitcher, ProfileBucketRow, ProfileSummaryResponse } from "../api";
import Icon from "../components/Icon";
import PitcherCombobox from "../components/PitcherCombobox";
import {
  TimeSeriesChart,
  TrendChart,
  formatBucketLabel,
  trendMetrics,
  type TimeBucketMode,
  type TrendMetric,
} from "../components/ProfileTrendCharts";
import { formatPitchTypeWithCode } from "../pitchTypes";
import { countLabel } from "../text";

type PitcherProfileViewContext = Record<string, any> & {
  pitchers: CachedPitcher[];
  profilePitcherName: string;
  profileSeason: string;
  profilePitchType: string;
  profileSummary: ProfileSummaryResponse | null;
  profileTotalPitchCount: number;
};

type PitcherProfileViewProps = {
  hidden: boolean;
  context: PitcherProfileViewContext;
};

const timeSeriesColors = ["#174f78", "#0f766e", "#9a5b13", "#7c3aed", "#b33a31", "#476173"];
const minTrendPitchCount = 5;
const minTrendPitchShare = 0.005;

function filterTrendPitchSummaries<T extends { count: number }>(summaries: T[], totalPitchCount: number) {
  const minimumCount = Math.max(minTrendPitchCount, Math.ceil(totalPitchCount * minTrendPitchShare));
  const filtered = summaries.filter((pitch) => pitch.count >= minimumCount);

  return filtered.length ? filtered : summaries;
}

function profileSummaryPitchRows(summary: ProfileSummaryResponse | null) {
  return (summary?.arsenal ?? []).map((pitch) => ({
    pitchType: pitch.pitch_type,
    count: pitch.count,
    velocity: pitch.velocity === null ? [] : [pitch.velocity],
    spin: pitch.spin === null ? [] : [pitch.spin],
    ivb: pitch.ivb === null ? [] : [pitch.ivb],
    hb: pitch.hb === null ? [] : [pitch.hb],
    whiffs: pitch.whiffs,
    strikes: pitch.strikes,
    locatedCount: pitch.located_count,
    zoneCount: pitch.zone_count,
  }));
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function rowsForMode(summary: ProfileSummaryResponse | null, mode: TimeBucketMode) {
  return summary?.bucketed[mode] ?? [];
}

function sortedBucketKeysFromRows(rows: ProfileBucketRow[]) {
  return Array.from(new Set(rows.map((row) => row.bucket).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildTrendDataFromRows(rows: ProfileBucketRow[], selectedPitchType: string) {
  return rows
    .filter((row) => row.pitch_type === selectedPitchType)
    .map((row) => ({
      date: row.bucket,
      count: row.count,
      velocity: row.velocity,
      spin: row.spin,
      ivb: row.ivb,
      hb: row.hb,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildPitchTypeBucketSeriesFromRows({
  rows,
  pitchTypes,
  buckets,
  metric,
}: {
  rows: ProfileBucketRow[];
  pitchTypes: string[];
  buckets: string[];
  metric: "usage" | "velocity";
}) {
  const bucketTotals = new Map<string, number>();
  rows.forEach((row) => {
    bucketTotals.set(row.bucket, (bucketTotals.get(row.bucket) ?? 0) + row.count);
  });

  return pitchTypes.map((pitchType, seriesIndex) => ({
    key: pitchType,
    label: formatPitchTypeWithCode(pitchType),
    color: timeSeriesColors[seriesIndex % timeSeriesColors.length],
    points: buckets.map((bucket) => {
      const row = rows.find((candidate) => candidate.bucket === bucket && candidate.pitch_type === pitchType);
      if (metric === "usage") {
        const total = bucketTotals.get(bucket) ?? 0;
        return {
          bucket,
          count: row?.count ?? 0,
          value: row && total ? row.count / total : null,
        };
      }

      return {
        bucket,
        count: row?.count ?? 0,
        value: row?.velocity ?? null,
      };
    }),
  }));
}

function buildSelectedPitchBucketSeriesFromRows({
  rows,
  buckets,
  selectedPitchType,
  metric,
}: {
  rows: ProfileBucketRow[];
  buckets: string[];
  selectedPitchType: string;
  metric: "movement" | "arm" | "outcomes";
}) {
  const selectedRows = rows.filter((row) => row.pitch_type === selectedPitchType);

  if (metric === "movement") {
    return [
      {
        key: "ivb",
        label: "IVB",
        color: timeSeriesColors[0],
        points: buckets.map((bucket) => {
          const row = selectedRows.find((candidate) => candidate.bucket === bucket);
          return { bucket, count: row?.count ?? 0, value: row?.ivb ?? null };
        }),
      },
      {
        key: "hb",
        label: "HB",
        color: timeSeriesColors[1],
        points: buckets.map((bucket) => {
          const row = selectedRows.find((candidate) => candidate.bucket === bucket);
          return { bucket, count: row?.count ?? 0, value: row?.hb ?? null };
        }),
      },
    ];
  }

  if (metric === "arm") {
    return [
      {
        key: "arm-angle",
        label: "Arm Angle",
        color: timeSeriesColors[3],
        points: buckets.map((bucket) => {
          const row = selectedRows.find((candidate) => candidate.bucket === bucket);
          return { bucket, count: row?.count ?? 0, value: row?.arm_angle ?? null };
        }),
      },
    ];
  }

  return [
    {
      key: "whiff",
      label: "Whiff",
      color: timeSeriesColors[0],
      points: buckets.map((bucket) => {
        const row = selectedRows.find((candidate) => candidate.bucket === bucket);
        return { bucket, count: row?.count ?? 0, value: row ? rate(row.whiffs, row.count) : null };
      }),
    },
    {
      key: "zone",
      label: "Zone",
      color: timeSeriesColors[1],
      points: buckets.map((bucket) => {
        const row = selectedRows.find((candidate) => candidate.bucket === bucket);
        return { bucket, count: row?.count ?? 0, value: row ? rate(row.zone_count, row.located_count) : null };
      }),
    },
    {
      key: "hard-contact",
      label: "Hard Contact",
      color: timeSeriesColors[4],
      points: buckets.map((bucket) => {
        const row = selectedRows.find((candidate) => candidate.bucket === bucket);
        return { bucket, count: row?.contacted_count ?? 0, value: row ? rate(row.hard_contact_count, row.contacted_count) : null };
      }),
    },
  ];
}

function buildArmAngleDomainFromRows(rows: ProfileBucketRow[], pitchTypes: string[]) {
  const values = rows
    .filter((row) => pitchTypes.includes(row.pitch_type) && row.arm_angle !== null)
    .map((row) => row.arm_angle!);

  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 0.5);

  return { min: min - padding, max: max + padding };
}

function buildOutcomeBucketContextFromRows({
  rows,
  bucket,
  mode,
  formatShortDate,
}: {
  rows: ProfileBucketRow[];
  bucket: string;
  mode: TimeBucketMode;
  formatShortDate: (value: string) => string;
}) {
  const row = rows.find((candidate) => candidate.bucket === bucket);

  return {
    label: bucket ? formatBucketLabel(bucket, mode, formatShortDate) : "-",
    pitchCount: row?.count ?? 0,
    contactedCount: row?.contacted_count ?? 0,
    hardContactRate: row ? rate(row.hard_contact_count, row.contacted_count) : null,
    averageExitVelocity: row?.average_exit_velocity ?? null,
    maxExitVelocity: row?.max_exit_velocity ?? null,
    whiffRate: row ? rate(row.whiffs, row.count) : null,
    zoneRate: row ? rate(row.zone_count, row.located_count) : null,
  };
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
    profileSummary,
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
    copyCurrentUrl,
    shareNotice,
  } = context;
  const selectedPitcher = selectedProfilePitcher() ?? resolvableProfilePitcher();
  const summaries = useMemo(
    () => profileSummaryPitchRows(profileSummary),
    [profileSummary],
  );
  const trendSummaries = useMemo(
    () => filterTrendPitchSummaries(summaries, profileTotalPitchCount),
    [profileTotalPitchCount, summaries],
  );
  const availableSeasons = profileSeasonOptions();
  const activeSeason = profileSeason || availableSeasons[0] || "";
  const hasProfileData = Boolean(profileSummary && profileTotalPitchCount > 0);
  const [focusedTrendMetric, setFocusedTrendMetric] = useState<TrendMetric | null>(null);
  const [timeBucketMode, setTimeBucketMode] = useState<TimeBucketMode>("game");
  const [inspectedOutcomeBucket, setInspectedOutcomeBucket] = useState("");
  const selectedTrendSummary = trendSummaries.find((pitch) => pitch.pitchType === profilePitchType) ?? trendSummaries[0];
  const timeRows = useMemo(() => rowsForMode(profileSummary, timeBucketMode), [profileSummary, timeBucketMode]);
  const selectedTrendRows = useMemo(
    () =>
      selectedTrendSummary
        ? timeRows.filter((row) => row.pitch_type === selectedTrendSummary.pitchType)
        : [],
    [timeRows, selectedTrendSummary],
  );
  const trendData = useMemo(
    () => buildTrendDataFromRows(rowsForMode(profileSummary, "game"), selectedTrendSummary?.pitchType ?? ""),
    [profileSummary, selectedTrendSummary],
  );
  const selectedTrendGameCount = useMemo(
    () => new Set(rowsForMode(profileSummary, "game").filter((row) => row.pitch_type === selectedTrendSummary?.pitchType).map((row) => row.bucket)).size,
    [profileSummary, selectedTrendSummary],
  );
  const selectedTrendUsage = selectedTrendSummary ? selectedTrendSummary.count / profileTotalPitchCount : null;
  const selectedTrendVelocity = selectedTrendSummary ? averageNumbers(selectedTrendSummary.velocity) : null;
  const selectedTrendSpin = selectedTrendSummary ? averageNumbers(selectedTrendSummary.spin) : null;
  const selectedTrendIvb = selectedTrendSummary ? averageNumbers(selectedTrendSummary.ivb) : null;
  const selectedTrendHb = selectedTrendSummary ? averageNumbers(selectedTrendSummary.hb) : null;
  const selectedTrendStrikeRate = selectedTrendSummary ? selectedTrendSummary.strikes / selectedTrendSummary.count : null;
  const selectedTrendWhiffRate = selectedTrendSummary ? selectedTrendSummary.whiffs / selectedTrendSummary.count : null;
  const selectedTrendZoneRate = selectedTrendSummary ? rate(selectedTrendSummary.zoneCount, selectedTrendSummary.locatedCount) : null;
  const timeBuckets = useMemo(() => sortedBucketKeysFromRows(timeRows), [timeRows]);
  const timePitchTypes = useMemo(() => trendSummaries.map((pitch) => pitch.pitchType), [trendSummaries]);
  const timeUsageSeries = useMemo(
    () =>
      buildPitchTypeBucketSeriesFromRows({
        rows: timeRows,
        pitchTypes: timePitchTypes,
        buckets: timeBuckets,
        metric: "usage",
      }),
    [timeRows, timePitchTypes, timeBuckets],
  );
  const timeVelocitySeries = useMemo(
    () =>
      buildPitchTypeBucketSeriesFromRows({
        rows: timeRows,
        pitchTypes: timePitchTypes,
        buckets: timeBuckets,
        metric: "velocity",
      }),
    [timeRows, timePitchTypes, timeBuckets],
  );
  const timeMovementSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeriesFromRows({
            rows: timeRows,
            buckets: timeBuckets,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "movement",
          })
        : [],
    [timeRows, selectedTrendSummary, timeBuckets],
  );
  const timeArmSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeriesFromRows({
            rows: timeRows,
            buckets: timeBuckets,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "arm",
          })
        : [],
    [timeRows, selectedTrendSummary, timeBuckets],
  );
  const timeArmDomain = useMemo(
    () => buildArmAngleDomainFromRows(timeRows, timePitchTypes),
    [timeRows, timePitchTypes],
  );
  const timeOutcomeSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeriesFromRows({
            rows: timeRows,
            buckets: timeBuckets,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "outcomes",
          })
        : [],
    [timeRows, selectedTrendSummary, timeBuckets],
  );
  const activeOutcomeBucket = inspectedOutcomeBucket && timeBuckets.includes(inspectedOutcomeBucket)
    ? inspectedOutcomeBucket
    : timeBuckets.at(-1) ?? "";
  const selectedOutcomeContext = useMemo(
    () =>
      selectedTrendSummary
        ? buildOutcomeBucketContextFromRows({
            rows: selectedTrendRows,
            bucket: activeOutcomeBucket,
            mode: timeBucketMode,
            formatShortDate,
          })
        : null,
    [activeOutcomeBucket, formatShortDate, selectedTrendRows, selectedTrendSummary, timeBucketMode],
  );
  const averageVelocity = profileSummary?.metrics.average_velocity ?? null;
  const averageSpin = profileSummary?.metrics.average_spin ?? null;
  const strikeRate = profileSummary?.metrics.strike_rate ?? null;
  const whiffRate = profileSummary?.metrics.whiff_rate ?? null;
  const inZoneRate = profileSummary?.metrics.zone_rate ?? null;
  const profileCacheProgress =
    isProfileLoading && profileLoadingSeasonCount > 0
      ? `Caching seasons ${Math.min(profileLoadedSeasonCount, profileLoadingSeasonCount)} of ${profileLoadingSeasonCount}`
      : "";

  useEffect(() => {
    if (trendSummaries.length === 0) {
      if (profilePitchType) setProfilePitchType("");
      return;
    }

    if (!trendSummaries.some((pitch) => pitch.pitchType === profilePitchType)) {
      setProfilePitchType(trendSummaries[0].pitchType);
    }
  }, [profilePitchType, setProfilePitchType, trendSummaries]);

  useEffect(() => {
    setInspectedOutcomeBucket("");
  }, [selectedTrendSummary?.pitchType, timeBucketMode, activeSeason]);

  function chooseTrendPitchType(pitchType: string) {
    setProfilePitchType(pitchType);
    setFocusedTrendMetric(null);
    setInspectedOutcomeBucket("");
  }

  function renderProfileSkeleton() {
    return (
      <div className="loading-skeleton-stack" aria-label="Loading pitcher profile">
        <section className="skeleton-panel">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-metric-grid">
            {Array.from({ length: 5 }, (_unused, index) => (
              <div className="skeleton-metric" key={index}>
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line--short" />
              </div>
            ))}
          </div>
        </section>
        <section className="skeleton-panel skeleton-panel--chart">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-chart" />
        </section>
      </div>
    );
  }

  return (
    <section className="page-section" aria-labelledby="pitcher-profile-title" hidden={hidden}>
      <div className="section-heading">
        <div>
          <h2 id="pitcher-profile-title">Pitcher Profile</h2>
          {selectedPitcher ? (
            <p>
              {formatDate(selectedPitcher.first_game_date)} to {formatDate(selectedPitcher.last_game_date)}
            </p>
          ) : (
            <p>Open a cached pitcher profile and share the exact season and pitch selection.</p>
          )}
        </div>
        <div className="section-heading-actions">
          {shareNotice ? <span>{shareNotice}</span> : null}
          <button className="secondary-button compact-action-button" onClick={copyCurrentUrl} type="button">
            Copy Link
          </button>
        </div>
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
                <strong>{countLabel(profileTotalPitchCount, "pitch")}</strong>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {isProfileLoading && !hasProfileData ? renderProfileSkeleton() : null}

      {hasProfileData ? (
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
                      <td>{formatRate(pitch.count / profileTotalPitchCount)}</td>
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

          <section className="profile-time-section" aria-label="What changed over time">
            <div className="profile-time-heading">
              <div>
                <h3>Arsenal Trends</h3>
                <p>
                  Track the meaningful mix and velocity bands by {timeBucketMode === "game" ? "game" : "month"}.
                </p>
              </div>
              <div className="profile-time-controls">
                <div className="profile-time-toggle" aria-label="Trend bucket">
                  <button
                    className={timeBucketMode === "game" ? "profile-time-toggle-button is-active" : "profile-time-toggle-button"}
                    onClick={() => setTimeBucketMode("game")}
                    type="button"
                  >
                    Game
                  </button>
                  <button
                    className={timeBucketMode === "month" ? "profile-time-toggle-button is-active" : "profile-time-toggle-button"}
                    onClick={() => setTimeBucketMode("month")}
                    type="button"
                  >
                    Month
                  </button>
                </div>
              </div>
            </div>
            <div className="profile-time-grid profile-time-grid--arsenal">
              <TimeSeriesChart
                bucketMode={timeBucketMode}
                buckets={timeBuckets}
                digits={0}
                formatShortDate={formatShortDate}
                series={timeUsageSeries}
                subtitle="Share of total pitches in each bucket"
                title="Pitch Mix"
                unit="%"
              />
              <TimeSeriesChart
                bucketMode={timeBucketMode}
                buckets={timeBuckets}
                formatShortDate={formatShortDate}
                series={timeVelocitySeries}
                subtitle="Average velocity for every pitch type"
                title="Velocity"
                unit="mph"
              />
            </div>
          </section>

          <section className="profile-trends-section" aria-label="Pitch-specific game trends">
            <div className="profile-trends-heading">
              <div>
                <h3>Pitch Trends</h3>
                <p>
                  {selectedTrendSummary
                    ? `${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} across ${countLabel(selectedTrendSummary.count, "pitch")}`
                    : "Choose a pitch type"}
                </p>
              </div>
              <div className="profile-trend-controls" aria-label="Trend pitch type">
                {trendSummaries.map((pitch) => (
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
                  <strong>{countLabel(selectedTrendSummary.count, "pitch")}</strong>
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
            {selectedTrendSummary ? (
              <section className="profile-time-selected-block" aria-label="Selected pitch changes over time">
                <div className="profile-time-selected-heading">
                  <div>
                    <h4>Selected Pitch Over Time</h4>
                    <p>{formatPitchTypeWithCode(selectedTrendSummary.pitchType)} shape, slot, and results by {timeBucketMode === "game" ? "game" : "month"}</p>
                  </div>
                </div>
                <div className="profile-time-grid profile-time-grid--selected">
                  <TimeSeriesChart
                    bucketMode={timeBucketMode}
                    buckets={timeBuckets}
                    formatShortDate={formatShortDate}
                    series={timeMovementSeries}
                    subtitle={`${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} movement drift`}
                    title="Movement"
                    unit="in"
                  />
                  <TimeSeriesChart
                    bucketMode={timeBucketMode}
                    buckets={timeBuckets}
                    formatShortDate={formatShortDate}
                    series={timeArmSeries}
                    subtitle={`${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} release slot`}
                    title="Arm Angle"
                    unit="deg"
                    yDomain={timeArmDomain}
                  />
                  <TimeSeriesChart
                    bucketMode={timeBucketMode}
                    buckets={timeBuckets}
                    digits={0}
                    formatShortDate={formatShortDate}
                    series={timeOutcomeSeries}
                    subtitle={`${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} whiff, zone, and hard-contact rates`}
                    title="Outcomes"
                    unit="%"
                    onInspectedBucketChange={setInspectedOutcomeBucket}
                  />
                  <section className="chart-panel profile-outcome-context">
                    <div className="chart-heading">
                      <div>
                        <h3>{timeBucketMode === "game" ? "Selected Game" : "Selected Month"}</h3>
                        <p>{selectedOutcomeContext?.label ?? "-"}</p>
                      </div>
                    </div>
                    <div className="profile-outcome-context-grid">
                      <div>
                        <span>Pitch Sample</span>
                        <strong>{countLabel(selectedOutcomeContext?.pitchCount ?? 0, "pitch")}</strong>
                        <em>{countLabel(selectedOutcomeContext?.contactedCount ?? 0, "ball in play", "balls in play")}</em>
                      </div>
                      <div>
                        <span>Command / Finish</span>
                        <strong>{formatRate(selectedOutcomeContext?.zoneRate ?? null)} zone</strong>
                        <em>{formatRate(selectedOutcomeContext?.whiffRate ?? null)} whiff</em>
                      </div>
                      <div>
                        <span>Hard Hit</span>
                        <strong>{formatRate(selectedOutcomeContext?.hardContactRate ?? null)}</strong>
                        <em>{countLabel(selectedOutcomeContext?.contactedCount ?? 0, "tracked ball in play", "tracked balls in play")}</em>
                      </div>
                      <div>
                        <span>Exit Velocity</span>
                        <strong>{formatNumber(selectedOutcomeContext?.averageExitVelocity ?? null)} mph</strong>
                        <em>max {formatNumber(selectedOutcomeContext?.maxExitVelocity ?? null)} mph</em>
                      </div>
                    </div>
                  </section>
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
      ) : !isProfileLoading ? (
        <div className="empty-state profile-empty-state">
          <p>
            {selectedPitcher
                ? "Profile data will appear after Relay matches the selected cached pitcher."
                : "Choose a cached pitcher to begin."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export default PitcherProfileView;
