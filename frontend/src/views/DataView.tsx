import { useMemo, useState } from "react";
import type { CachedPitcher, CacheMetadataResponse } from "../api";
import { countLabel } from "../text";

type DataViewProps = {
  cacheMetadata: CacheMetadataResponse | null;
  formatDate: (value: string | null | undefined) => string;
  formatPersonName: (value: string | null | undefined) => string;
  hidden: boolean;
  isRefreshing: boolean;
  onOpenPitcherProfile: (pitcher: CachedPitcher) => void;
  onRefresh: () => void;
  pitcherError: string | null;
  pitchers: CachedPitcher[];
};

function formatBytes(value: number | null | undefined) {
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

function denominatorLabel(denominator: string, count: number) {
  if (denominator === "balls_in_play") return countLabel(count, "ball in play", "balls in play");
  return countLabel(count, "pitch");
}

function sourceLabel(source: string | undefined) {
  if (source === "manifest") return "Manifest";
  if (source === "manifest+duckdb") return "Manifest + DuckDB";
  if (source === "duckdb") return "DuckDB";
  return source ?? "-";
}

function DataView({
  cacheMetadata,
  formatDate,
  formatPersonName,
  hidden,
  isRefreshing,
  onOpenPitcherProfile,
  onRefresh,
  pitcherError,
  pitchers,
}: DataViewProps) {
  const [pitcherQuery, setPitcherQuery] = useState("");
  const normalizedPitcherQuery = pitcherQuery.trim().toLowerCase();
  const filteredPitchers = useMemo(
    () =>
      [...pitchers]
        .sort((a, b) => b.pitch_count - a.pitch_count)
        .filter((pitcher) => {
          if (!normalizedPitcherQuery) return true;
          const rawName = pitcher.player_name.toLowerCase();
          const displayName = formatPersonName(pitcher.player_name).toLowerCase();
          return rawName.includes(normalizedPitcherQuery) || displayName.includes(normalizedPitcherQuery);
        })
        .slice(0, 12),
    [formatPersonName, normalizedPitcherQuery, pitchers],
  );
  const seasons = cacheMetadata?.seasons ?? [];
  const pitchTypes = cacheMetadata?.pitch_types ?? [];
  const qualityMetrics = cacheMetadata?.data_quality.metrics ?? [];
  const manifestGeneratedAt = cacheMetadata?.manifest?.generated_at
    ? new Date(cacheMetadata.manifest.generated_at).toLocaleString()
    : "-";

  return (
    <section className="page-section data-view" hidden={hidden} aria-labelledby="data-view-title">
      <div className="section-heading">
        <div>
          <h2 id="data-view-title">Data</h2>
          <p>Understand what Relay can answer from your local Statcast cache.</p>
        </div>
        <button className="secondary-button" disabled={isRefreshing} onClick={onRefresh} type="button">
          {isRefreshing ? "Refreshing..." : "Refresh Cache Status"}
        </button>
      </div>

      {pitcherError ? <div className="error-banner">{pitcherError}</div> : null}

      <section className="data-overview-grid" aria-label="Cache overview">
        <div className="metric-card">
          <span>Pitches</span>
          <strong>{countLabel(cacheMetadata?.pitch_count ?? 0, "pitch")}</strong>
        </div>
        <div className="metric-card">
          <span>Pitchers</span>
          <strong>{countLabel(cacheMetadata?.pitcher_count ?? pitchers.length, "pitcher")}</strong>
        </div>
        <div className="metric-card">
          <span>Cached Range</span>
          <strong>{formatDate(cacheMetadata?.first_game_date)} to {formatDate(cacheMetadata?.last_game_date)}</strong>
        </div>
        <div className="metric-card">
          <span>Cache File</span>
          <strong>{formatBytes(cacheMetadata?.file_size_bytes)}</strong>
        </div>
      </section>

      <section className="data-layout">
        <section className="chart-panel data-cache-panel">
          <div className="chart-heading">
            <div>
              <h3>Cache Coverage</h3>
              <p>{cacheMetadata?.path ?? "No cache metadata loaded."}</p>
            </div>
          </div>
          <div className="data-chip-list" aria-label="Cached seasons">
            {seasons.length ? seasons.map((season) => <span key={season}>{season}</span>) : <span>No seasons found</span>}
          </div>
          <div className="data-cache-facts">
            <div>
              <span>Metadata Source</span>
              <strong>{sourceLabel(cacheMetadata?.source)}</strong>
            </div>
            <div>
              <span>Manifest Updated</span>
              <strong>{manifestGeneratedAt}</strong>
            </div>
            <div>
              <span>Pitch Types</span>
              <strong>{pitchTypes.length ? pitchTypes.slice(0, 10).join(", ") : "-"}</strong>
            </div>
          </div>
        </section>

        <section className="chart-panel data-cache-panel">
          <div className="chart-heading">
            <div>
              <h3>Update Local Data</h3>
              <p>Normal app requests read the existing cache; ingestion still runs from the terminal.</p>
            </div>
          </div>
          <div className="data-command-list">
            <div>
              <span>Install portfolio demo cache</span>
              <code>python scripts/prepare_demo_cache.py --skip-build --install</code>
            </div>
            <div>
              <span>Build or extend cache</span>
              <code>python scripts/ingest_statcast_batch.py --help</code>
            </div>
            <div>
              <span>Build demo from local cache</span>
              <code>python scripts/prepare_demo_cache.py --install</code>
            </div>
          </div>
          <p className="data-helper-copy">
            After ingestion completes, use Refresh Cache Status so Relay reloads pitchers, seasons, and quality metrics.
          </p>
        </section>
      </section>

      <section className="chart-panel data-quality-panel">
        <div className="chart-heading">
          <div>
            <h3>Data Quality</h3>
            <p>Availability for fields used by charts and analysis.</p>
          </div>
        </div>
        <div className="data-quality-grid">
          {qualityMetrics.length ? (
            qualityMetrics.map((metric) => (
              <div className="data-quality-card" key={metric.key}>
                <span>{metric.label}</span>
                <strong>{formatQualityRate(metric.available_rate)}</strong>
                <small>
                  {metric.available_count} of {denominatorLabel(metric.denominator, metric.denominator_count)} available
                </small>
                <small>{formatQualityRate(metric.missing_rate)} missing</small>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No quality metrics were found in cache metadata.</p>
            </div>
          )}
        </div>
      </section>

      <section className="chart-panel data-pitcher-panel">
        <div className="chart-heading">
          <div>
            <h3>Cached Pitchers</h3>
            <p>Search the local pitcher list and jump into a Pitcher Profile.</p>
          </div>
          <label className="data-pitcher-search">
            <span>Search pitchers</span>
            <input
              onChange={(event) => setPitcherQuery(event.target.value)}
              placeholder="Tarik Skubal"
              type="search"
              value={pitcherQuery}
            />
          </label>
        </div>
        <div className="data-pitcher-list">
          {filteredPitchers.length ? (
            filteredPitchers.map((pitcher) => (
              <div className="data-pitcher-row" key={pitcher.pitcher}>
                <div>
                  <strong>{formatPersonName(pitcher.player_name)}</strong>
                  <span>
                    {countLabel(pitcher.pitch_count, "pitch")} | {formatDate(pitcher.first_game_date)} to {formatDate(pitcher.last_game_date)}
                  </span>
                </div>
                <button className="secondary-button" onClick={() => onOpenPitcherProfile(pitcher)} type="button">
                  Open Pitcher Profile
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No cached pitchers matched.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

export default DataView;
