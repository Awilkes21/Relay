import MovementChart from "../components/MovementChart";
import PitchHeatmap from "../components/PitchHeatmap";
import StrikeZoneChart from "../components/StrikeZoneChart";
import { formatPitchType } from "../pitchTypes";

type PitchExplorerViewContext = Record<string, any> & {
  activePitchFilterList: any[];
  arsenalSummary: any[];
  results: any[];
  sortedResults: any[];
};

type PitchExplorerViewProps = {
  hidden: boolean;
  context: PitchExplorerViewContext;
};

function PitchExplorerView({ hidden, context }: PitchExplorerViewProps) {
  const {
    API_URL,
    pitcherError,
    pitchOptionsError,
    selectedExplorerPitcher,
    formatDate,
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
    formatEvent
  } = context;

  return (
      <section
        className="page-section"
        aria-labelledby="pitch-explorer-title"
        hidden={hidden}
      >
        <div className="section-heading">
          <h2 id="pitch-explorer-title">Pitch Explorer</h2>
          <span>{API_URL}</span>
        </div>

        <form className="filter-panel" onSubmit={handleSearch}>
          {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
          {pitchOptionsError ? <div className="inline-note">{pitchOptionsError}</div> : null}
          {selectedExplorerPitcher() ? (
            <div className="inline-note">
              Cached range: {formatDate(selectedExplorerPitcher()?.first_game_date)} to{" "}
              {formatDate(selectedExplorerPitcher()?.last_game_date)}
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
        <PitchHeatmap
          heatmap={heatmap}
          mode={heatmapMode}
          isLoading={isHeatmapLoading}
          onModeChange={updateHeatmapMode}
          pitcherHand={results.find((pitch) => pitch.p_throws)?.p_throws}
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
                  : selectedExplorerPitcher()
                    ? "Run a search to see cached Statcast pitches."
                    : "Choose a pitcher to begin exploring cached Statcast pitches."}
              </p>
            </div>
          )}
        </div>
      </section>
  );
}

export default PitchExplorerView;
