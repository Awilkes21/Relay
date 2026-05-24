import { useEffect, useState } from "react";
import MovementChart from "../components/MovementChart";
import PitchHeatmap from "../components/PitchHeatmap";
import StrikeZoneChart from "../components/StrikeZoneChart";
import { formatPitchType } from "../pitchTypes";
import { countLabel } from "../text";

type PitchExplorerViewContext = Record<string, any> & {
  activePitchFilterList: any[];
  arsenalSummary: any[];
  dataQualityMetrics: any[];
  dataQualityPitchCount: number;
  results: any[];
  sortedResults: any[];
};

type PitchExplorerViewProps = {
  hidden: boolean;
  context: PitchExplorerViewContext;
};

function PitchExplorerView({ hidden, context }: PitchExplorerViewProps) {
  const {
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
    dataQualityMetrics,
    dataQualityPitchCount,
    explorerFocus,
    lastAppliedQuery,
    focusedResultTarget
  } = context;
  const hasSearchResults = totalResultCount > 0 || results.length > 0;
  const isFocusedResult = Boolean(focusedResultTarget);
  const activeFocusTarget = explorerFocus?.target || focusedResultTarget;
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    dataQuality: true,
    arsenal: false,
    resultsTable: true,
  });

  useEffect(() => {
    if (hasSearchResults) {
      setIsSearchCollapsed(true);
    } else {
      setIsSearchCollapsed(false);
    }
  }, [hasSearchResults]);

  useEffect(() => {
    if (hasSearchResults) {
      setCollapsedSections((current) => ({
        ...current,
        resultsTable: true,
      }));
    }
  }, [hasSearchResults]);

  useEffect(() => {
    if (!activeFocusTarget || hidden) return;

    const targetMap: Record<string, { id: string; section?: keyof typeof collapsedSections }> = {
      summary: { id: "relay-explorer-results" },
      data_quality: { id: "relay-data-quality", section: "dataQuality" },
      arsenal: { id: "relay-arsenal-summary", section: "arsenal" },
      heatmap: { id: "relay-pitch-heatmap" },
      strike_zone: { id: "relay-strike-zone" },
      movement: { id: "relay-movement" },
      table: { id: "relay-pitch-table", section: "resultsTable" },
    };
    const target = targetMap[activeFocusTarget];
    if (!target) return;

    if (target.section) {
      setCollapsedSections((current) => ({
        ...current,
        [target.section as keyof typeof collapsedSections]: false,
      }));
    }

    window.requestAnimationFrame(() => {
      document.getElementById(target.id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [activeFocusTarget, explorerFocus, hidden]);

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function disclosureIcon(isCollapsed: boolean) {
    return isCollapsed ? ">" : "v";
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

  function qualityScopeLabel(scope: string) {
    return scope === "balls_in_play" ? "BIP" : "pitches";
  }

  function shouldShowResult(targets: string[]) {
    return !isFocusedResult || targets.includes(focusedResultTarget);
  }

  return (
      <section
        className="page-section"
        aria-labelledby="pitch-explorer-title"
        hidden={hidden}
      >
        <div className="section-heading">
          <h2 id="pitch-explorer-title">Pitch Explorer</h2>
        </div>

        {lastAppliedQuery ? (
          <div className="applied-query-context">
            <span>Asked Relay</span>
            <strong>{lastAppliedQuery}</strong>
          </div>
        ) : null}

        {hasSearchResults && !isFocusedResult ? (
          <div className="collapsed-search-bar">
            <div>
              <span>Pitch Explorer Search</span>
              <strong>
                {countLabel(totalResultCount, "matching pitch", "matching pitches")}
                {activePitchFilterList.length > 0 ? ` | ${countLabel(activePitchFilterList.length, "filter")}` : ""}
              </strong>
            </div>
            <button
              className="secondary-button"
              onClick={() => setIsSearchCollapsed((current) => !current)}
              type="button"
            >
              {isSearchCollapsed ? "Edit Search" : "Hide Search"}
            </button>
          </div>
        ) : null}

        <form
          className={isSearchCollapsed ? "filter-panel is-collapsed" : "filter-panel"}
          hidden={isSearchCollapsed || isFocusedResult}
          onSubmit={handleSearch}
        >
          {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
          {pitchOptionsError ? <div className="inline-note">{pitchOptionsError}</div> : null}
          {selectedExplorerPitcher() ? (
            <div className="inline-note">
              Cached range: {formatDate(selectedExplorerPitcher()?.first_game_date)} to{" "}
              {formatDate(selectedExplorerPitcher()?.last_game_date)}
            </div>
          ) : resolvableExplorerPitcher() ? (
            <div className="inline-note pitcher-first-note">
              Press Search or leave the field to use {formatPersonName(resolvableExplorerPitcher()?.player_name)}.
            </div>
          ) : (
            <div className="inline-note pitcher-first-note">
              Choose a cached pitcher to unlock seasons, games, dates, pitch types, counts,
              locations, and outcomes.
            </div>
          )}
          <section className="filter-group compare-step">
            <div className="compare-step-heading">
              <span>1</span>
              <div>
                <h3>Choose Pitcher</h3>
                <p>Select one cached pitcher first so seasons, games, pitch types, and ranges stay valid.</p>
              </div>
            </div>
            <div className="filter-grid explorer-pitcher-grid">
              {renderPitchFilterField(pitchField("pitcher_name"))}
              {renderPitchFilterField(pitchField("season"))}
            </div>
          </section>

          <section className="filter-group compare-step">
            <div className="compare-step-heading">
              <span>2</span>
              <div>
                <h3>Pick Time Window</h3>
                <p>Use a single game for a clean start, or choose a season/date range for a broader sample.</p>
              </div>
            </div>
            <div className="filter-grid explorer-time-grid">
              {renderPitchFilterField(pitchField("single_game"))}
              {renderPitchFilterField(pitchField("start_date"))}
              {renderPitchFilterField(pitchField("end_date"))}
            </div>
          </section>

          <section className="filter-group compare-step">
            <div className="compare-step-heading">
              <span>3</span>
              <div>
                <h3>Filter Pitches</h3>
                <p>Dial in arsenal, velocity, batter side, count, and location context.</p>
              </div>
            </div>
            <div className="filter-grid explorer-pitch-grid">
              {[
                "pitch_type",
                "min_velocity",
                "max_velocity",
                "batter_hand",
                "count",
                "base_state",
                "location_filter",
              ].map((name) => renderPitchFilterField(pitchField(name)))}
            </div>
          </section>

          <section className="filter-group compare-step">
            <div className="compare-step-heading">
              <span>4</span>
              <div>
                <h3>Results & Display</h3>
                <p>Optionally filter by pitch result or plate appearance result, then choose how many pitches to show.</p>
              </div>
            </div>
            <div className="filter-grid explorer-results-grid">
              {[
                "description",
                "events",
                "result_order",
                "limit",
              ].map((name) => renderPitchFilterField(pitchField(name)))}
            </div>
          </section>
          {activePitchFilterList.length > 0 ? (
            <div className="active-filter-bar">
              <span>Active Filters</span>
              {activePitchFilterList.map((filter) => (
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

        {dataQualityPitchCount > 0 && dataQualityMetrics.length > 0 && shouldShowResult(["data_quality"]) ? (
          <section className="chart-panel data-quality-panel focus-scroll-target" id="relay-data-quality">
            <div className="chart-heading collapsible-heading">
              <div>
                <h3>Data Quality</h3>
                <p>
                  Availability across all {countLabel(dataQualityPitchCount, "matching pitch")} for these filters,
                  independent of the display limit.
                </p>
              </div>
              <div className="section-actions">
                <span>These results</span>
                <button
                  aria-label={collapsedSections.dataQuality ? "Expand data quality" : "Collapse data quality"}
                  className="disclosure-button"
                  onClick={() => toggleSection("dataQuality")}
                  title={collapsedSections.dataQuality ? "Expand" : "Collapse"}
                  type="button"
                >
                  {disclosureIcon(collapsedSections.dataQuality)}
                </button>
              </div>
            </div>
            <div className="data-quality-grid" hidden={collapsedSections.dataQuality}>
              {dataQualityMetrics.map((metric) => (
                <div className="data-quality-card" key={metric.key}>
                  <span>{metric.label}</span>
                  <strong>{formatQualityRate(metric.available_rate)}</strong>
                  <small>
                    {metric.available_count} of {metric.denominator_count}{" "}
                    {qualityScopeLabel(metric.denominator)} available
                  </small>
                  {metric.missing_fields.length > 0 ? (
                    <small>Missing column: {metric.missing_fields.join(", ")}</small>
                  ) : (
                    <small>{formatQualityRate(metric.missing_rate)} missing</small>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {shouldShowResult(["summary"]) ? (
        <div className="results-header focus-scroll-target" id="relay-explorer-results">
          <h3>Results</h3>
          <div className="results-header-actions">
            <span>
              {totalResultCount > resultCount
                ? `Showing ${resultCount} of ${countLabel(totalResultCount, "pitch")}`
                : countLabel(resultCount, "pitch")}
            </span>
          </div>
        </div>
        ) : null}
        {results.length > 0 && !isFocusedResult ? (
          <button
            className="secondary-button"
            onClick={() =>
              downloadCsv(
                "relay-pitches.csv",
                results.map((pitch) => ({
                  game_date: formatDate(pitch.game_date),
                  player_name: formatPersonName(pitch.player_name),
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

        {arsenalSummary.length > 0 && shouldShowResult(["arsenal"]) ? (
          <section className="chart-panel focus-scroll-target" id="relay-arsenal-summary">
            <div className="chart-heading collapsible-heading">
              <h3>Arsenal Summary</h3>
              <div className="section-actions">
                <span>These results</span>
                <button
                  aria-label={collapsedSections.arsenal ? "Expand arsenal summary" : "Collapse arsenal summary"}
                  className="disclosure-button"
                  onClick={() => toggleSection("arsenal")}
                  title={collapsedSections.arsenal ? "Expand" : "Collapse"}
                  type="button"
                >
                  {disclosureIcon(collapsedSections.arsenal)}
                </button>
              </div>
            </div>
            <div className="table-wrap compact-table-wrap" hidden={collapsedSections.arsenal}>
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
                  </tr>
                </thead>
                <tbody>
                  {arsenalSummary.map((pitch) => (
                    <tr key={pitch.pitchType}>
                      <td>{formatPitchType(pitch.pitchType)}</td>
                      <td>{pitch.count}</td>
                      <td>{formatRate(pitch.count / results.length)}</td>
                      <td>{formatNumber(averageNumbers(pitch.velocity))}</td>
                      <td>{formatNumber(averageNumbers(pitch.spin), 0)}</td>
                      <td>{formatNumber(averageNumbers(pitch.ivb))}</td>
                      <td>{formatNumber(averageNumbers(pitch.hb))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {shouldShowResult(["heatmap"]) ? (
        <div className="focus-scroll-target" id="relay-pitch-heatmap">
          <PitchHeatmap
            heatmap={heatmap}
            mode={heatmapMode}
            isLoading={isHeatmapLoading}
            onModeChange={updateHeatmapMode}
            pitcherHand={results.find((pitch) => pitch.p_throws)?.p_throws}
          />
        </div>
        ) : null}
        {shouldShowResult(["strike_zone"]) ? (
        <div className="focus-scroll-target" id="relay-strike-zone">
          <StrikeZoneChart pitches={results} />
        </div>
        ) : null}
        {shouldShowResult(["movement"]) ? (
        <div className="focus-scroll-target" id="relay-movement">
          <MovementChart pitches={results} />
        </div>
        ) : null}

        {results.length > 0 && shouldShowResult(["table"]) ? (
          <div className="table-disclosure-bar focus-scroll-target" id="relay-pitch-table">
            <div>
              <span>Pitch Table</span>
              <strong>
                {totalResultCount > resultCount
                  ? `Showing ${resultCount} of ${countLabel(totalResultCount, "pitch")}`
                  : countLabel(resultCount, "pitch")}
              </strong>
            </div>
            <button
              aria-label={collapsedSections.resultsTable ? "Expand pitch table" : "Collapse pitch table"}
              className="disclosure-button"
              onClick={() => toggleSection("resultsTable")}
              title={collapsedSections.resultsTable ? "Expand" : "Collapse"}
              type="button"
            >
              {disclosureIcon(collapsedSections.resultsTable)}
            </button>
          </div>
        ) : null}

        {shouldShowResult(["table"]) ? (
        <div className="table-wrap" hidden={results.length > 0 && collapsedSections.resultsTable && !isFocusedResult}>
          {results.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {renderSortableHeader("game_date", "Date")}
                  {renderSortableHeader("player_name", "Pitcher")}
                  {renderSortableHeader("batter_name", "Batter")}
                  {renderSortableHeader("pitch_type", "Type")}
                  {renderSortableHeader("release_speed", "Velocity (mph)")}
                  {renderSortableHeader("release_spin_rate", "Spin (rpm)")}
                  {renderSortableHeader("pfx_z", "IVB (in)")}
                  {renderSortableHeader("pfx_x", "HB (in)")}
                  {renderSortableHeader("location", "Location")}
                  {renderSortableHeader("bb_type", "Contact")}
                  {renderSortableHeader("launch_speed", "Exit Velo (mph)")}
                  {renderSortableHeader("launch_angle", "Launch Angle (deg)")}
                  {renderSortableHeader("hit_distance_sc", "Distance (ft)")}
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
                    <td>{formatPersonName(pitch.player_name)}</td>
                    <td>{formatBatter(pitch)}</td>
                    <td>{formatPitchType(pitch.pitch_type)}</td>
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
                  : isFocusedResult
                    ? "No pitches matched this query. Try removing or modifying some filters."
                  : selectedExplorerPitcher()
                    ? "Run a search to see cached Statcast pitches."
                    : "Choose a pitcher to begin exploring cached Statcast pitches."}
              </p>
            </div>
          )}
        </div>
        ) : null}
      </section>
  );
}

export default PitchExplorerView;
