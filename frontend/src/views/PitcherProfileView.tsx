import { useEffect, useMemo, useState } from "react";
import type { CachedPitcher, PitchResult } from "../api";
import Icon from "../components/Icon";
import PitcherCombobox from "../components/PitcherCombobox";
import {
  TimeSeriesChart,
  TrendChart,
  formatBucketLabel,
  trendMetrics,
  type TimeBucketMode,
  type TimeSeriesDomain,
  type TrendMetric,
} from "../components/ProfileTrendCharts";
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

const timeSeriesColors = ["#174f78", "#0f766e", "#9a5b13", "#7c3aed", "#b33a31", "#476173"];
const minTrendPitchCount = 5;
const minTrendPitchShare = 0.005;

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

function bucketKeyForPitch(pitch: PitchResult, mode: TimeBucketMode) {
  if (!pitch.game_date) return "";
  return mode === "month" ? pitch.game_date.slice(0, 7) : pitch.game_date;
}

function pitchTypeOf(pitch: PitchResult) {
  return pitch.pitch_type ?? "Unknown";
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

function filterTrendPitchSummaries(summaries: ReturnType<typeof pitchSummary>, totalPitchCount: number) {
  const minimumCount = Math.max(minTrendPitchCount, Math.ceil(totalPitchCount * minTrendPitchShare));
  const filtered = summaries.filter((pitch) => pitch.count >= minimumCount);

  return filtered.length ? filtered : summaries;
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

function sortedBucketKeys(pitches: PitchResult[], mode: TimeBucketMode) {
  return Array.from(
    new Set(
      pitches
        .map((pitch) => bucketKeyForPitch(pitch, mode))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function buildPitchTypeBucketSeries({
  pitches,
  pitchTypes,
  buckets,
  mode,
  metric,
}: {
  pitches: PitchResult[];
  pitchTypes: string[];
  buckets: string[];
  mode: TimeBucketMode;
  metric: "usage" | "velocity";
}) {
  return pitchTypes.map((pitchType, seriesIndex) => {
    const points = buckets.map((bucket) => {
      const bucketPitches = pitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
      const pitchTypePitches = bucketPitches.filter((pitch) => pitchTypeOf(pitch) === pitchType);
      if (metric === "usage") {
        return {
          bucket,
          count: pitchTypePitches.length,
          value: bucketPitches.length ? pitchTypePitches.length / bucketPitches.length : null,
        };
      }

      return {
        bucket,
        count: pitchTypePitches.length,
        value: average(
          pitchTypePitches
            .map((pitch) => pitch.release_speed)
            .filter((value): value is number => value !== null),
        ),
      };
    });

    return {
      key: pitchType,
      label: formatPitchTypeWithCode(pitchType),
      color: timeSeriesColors[seriesIndex % timeSeriesColors.length],
      points,
    };
  });
}

function buildSelectedPitchBucketSeries({
  pitches,
  buckets,
  mode,
  selectedPitchType,
  metric,
}: {
  pitches: PitchResult[];
  buckets: string[];
  mode: TimeBucketMode;
  selectedPitchType: string;
  metric: "movement" | "arm" | "outcomes";
}) {
  const selectedPitches = pitches.filter((pitch) => pitchTypeOf(pitch) === selectedPitchType);

  if (metric === "movement") {
    return [
      {
        key: "ivb",
        label: "IVB",
        color: timeSeriesColors[0],
        points: buckets.map((bucket) => {
          const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
          return {
            bucket,
            count: bucketPitches.length,
            value: average(
              bucketPitches
                .map((pitch) => (pitch.pfx_z === null ? null : pitch.pfx_z * 12))
                .filter((value): value is number => value !== null),
            ),
          };
        }),
      },
      {
        key: "hb",
        label: "HB",
        color: timeSeriesColors[1],
        points: buckets.map((bucket) => {
          const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
          return {
            bucket,
            count: bucketPitches.length,
            value: average(
              bucketPitches
                .map((pitch) => (pitch.pfx_x === null ? null : pitch.pfx_x * -12))
                .filter((value): value is number => value !== null),
            ),
          };
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
          const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
          return {
            bucket,
            count: bucketPitches.length,
            value: average(
              bucketPitches
                .map((pitch) => pitch.arm_angle)
                .filter((value): value is number => value !== null),
            ),
          };
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
        const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
        return {
          bucket,
          count: bucketPitches.length,
          value: rateFromPitches(bucketPitches, (pitch) => Boolean(pitch.description && whiffDescriptions.has(pitch.description))),
        };
      }),
    },
    {
      key: "zone",
      label: "Zone",
      color: timeSeriesColors[1],
      points: buckets.map((bucket) => {
        const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
        return {
          bucket,
          count: bucketPitches.length,
          value: zoneRate(bucketPitches),
        };
      }),
    },
    {
      key: "hard-contact",
      label: "Hard Contact",
      color: timeSeriesColors[4],
      points: buckets.map((bucket) => {
        const bucketPitches = selectedPitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
        const contacted = bucketPitches.filter((pitch) => pitch.launch_speed !== null);
        return {
          bucket,
          count: contacted.length,
          value: contacted.length
            ? contacted.filter((pitch) => pitch.launch_speed !== null && pitch.launch_speed >= 95).length / contacted.length
            : null,
        };
      }),
    },
  ];
}

function buildArmAngleDomain(
  pitches: PitchResult[],
  pitchTypes: string[],
  buckets: string[],
  mode: TimeBucketMode,
): TimeSeriesDomain | undefined {
  const values = pitchTypes.flatMap((pitchType) =>
    buckets
      .map((bucket) =>
        average(
          pitches
            .filter((pitch) => pitchTypeOf(pitch) === pitchType && bucketKeyForPitch(pitch, mode) === bucket)
            .map((pitch) => pitch.arm_angle)
            .filter((value): value is number => value !== null),
        ),
      )
      .filter((value): value is number => value !== null),
  );

  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 0.5);

  return {
    min: min - padding,
    max: max + padding,
  };
}

function buildOutcomeBucketContext({
  pitches,
  bucket,
  mode,
  formatShortDate,
}: {
  pitches: PitchResult[];
  bucket: string;
  mode: TimeBucketMode;
  formatShortDate: (value: string) => string;
}) {
  const bucketPitches = pitches.filter((pitch) => bucketKeyForPitch(pitch, mode) === bucket);
  const contacted = bucketPitches.filter((pitch) => pitch.launch_speed !== null);
  const hardContactCount = contacted.filter((pitch) => pitch.launch_speed !== null && pitch.launch_speed >= 95).length;
  const exitVelocities = contacted.map((pitch) => pitch.launch_speed).filter((value): value is number => value !== null);
  const maxExitVelocity = exitVelocities.length
    ? Math.max(...exitVelocities)
    : null;

  return {
    label: bucket ? formatBucketLabel(bucket, mode, formatShortDate) : "-",
    pitchCount: bucketPitches.length,
    contactedCount: contacted.length,
    hardContactRate: contacted.length ? hardContactCount / contacted.length : null,
    averageExitVelocity: average(exitVelocities),
    maxExitVelocity,
    whiffRate: rateFromPitches(bucketPitches, (pitch) => Boolean(pitch.description && whiffDescriptions.has(pitch.description))),
    zoneRate: zoneRate(bucketPitches),
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
  const trendSummaries = useMemo(
    () => filterTrendPitchSummaries(summaries, profilePitches.length),
    [profilePitches.length, summaries],
  );
  const availableSeasons = profileSeasonOptions();
  const activeSeason = profileSeason || availableSeasons[0] || "";
  const isPartialSeasonLoad = profileTotalPitchCount > profilePitches.length;
  const [focusedTrendMetric, setFocusedTrendMetric] = useState<TrendMetric | null>(null);
  const [timeBucketMode, setTimeBucketMode] = useState<TimeBucketMode>("game");
  const [inspectedOutcomeBucket, setInspectedOutcomeBucket] = useState("");
  const selectedTrendSummary = trendSummaries.find((pitch) => pitch.pitchType === profilePitchType) ?? trendSummaries[0];
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
  const timeBuckets = useMemo(() => sortedBucketKeys(profilePitches, timeBucketMode), [profilePitches, timeBucketMode]);
  const timePitchTypes = useMemo(() => trendSummaries.map((pitch) => pitch.pitchType), [trendSummaries]);
  const timeUsageSeries = useMemo(
    () =>
      buildPitchTypeBucketSeries({
        pitches: profilePitches,
        pitchTypes: timePitchTypes,
        buckets: timeBuckets,
        mode: timeBucketMode,
        metric: "usage",
      }),
    [profilePitches, timePitchTypes, timeBuckets, timeBucketMode],
  );
  const timeVelocitySeries = useMemo(
    () =>
      buildPitchTypeBucketSeries({
        pitches: profilePitches,
        pitchTypes: timePitchTypes,
        buckets: timeBuckets,
        mode: timeBucketMode,
        metric: "velocity",
      }),
    [profilePitches, timePitchTypes, timeBuckets, timeBucketMode],
  );
  const timeMovementSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeries({
            pitches: profilePitches,
            buckets: timeBuckets,
            mode: timeBucketMode,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "movement",
          })
        : [],
    [profilePitches, selectedTrendSummary, timeBuckets, timeBucketMode],
  );
  const timeArmSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeries({
            pitches: profilePitches,
            buckets: timeBuckets,
            mode: timeBucketMode,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "arm",
          })
        : [],
    [profilePitches, selectedTrendSummary, timeBuckets, timeBucketMode],
  );
  const timeArmDomain = useMemo(
    () => buildArmAngleDomain(profilePitches, timePitchTypes, timeBuckets, timeBucketMode),
    [profilePitches, timePitchTypes, timeBuckets, timeBucketMode],
  );
  const timeOutcomeSeries = useMemo(
    () =>
      selectedTrendSummary
        ? buildSelectedPitchBucketSeries({
            pitches: profilePitches,
            buckets: timeBuckets,
            mode: timeBucketMode,
            selectedPitchType: selectedTrendSummary.pitchType,
            metric: "outcomes",
          })
        : [],
    [profilePitches, selectedTrendSummary, timeBuckets, timeBucketMode],
  );
  const activeOutcomeBucket = inspectedOutcomeBucket && timeBuckets.includes(inspectedOutcomeBucket)
    ? inspectedOutcomeBucket
    : timeBuckets.at(-1) ?? "";
  const selectedOutcomeContext = useMemo(
    () =>
      selectedTrendSummary
        ? buildOutcomeBucketContext({
            pitches: selectedTrendPitches,
            bucket: activeOutcomeBucket,
            mode: timeBucketMode,
            formatShortDate,
          })
        : null,
    [activeOutcomeBucket, formatShortDate, selectedTrendPitches, selectedTrendSummary, timeBucketMode],
  );
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
                    ? `${formatPitchTypeWithCode(selectedTrendSummary.pitchType)} across ${countLabel(selectedTrendPitches.length, "pitch")}`
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
