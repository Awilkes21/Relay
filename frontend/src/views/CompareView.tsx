import CompareDeltaHeatmap from "../components/CompareDeltaHeatmap";
import CompareMovementChart from "../components/CompareMovementChart";
import PitchHeatmap from "../components/PitchHeatmap";
import { formatPitchType, formatPitchTypeWithCode } from "../pitchTypes";

type CompareViewContext = Record<string, any> & {
  activeCompareFilterList: any[];
  compareFields: readonly any[];
  compareOptions: {
    batter_hands: any[];
    game_dates: any[];
    pitch_types: any[];
  };
  comparePitchTypes: string[];
  drilldownA: any[];
  drilldownB: any[];
  pitchTypes: string[];
  savedComparisons: any[];
  visiblePitchTypes: string[];
};

type CompareViewProps = {
  hidden: boolean;
  context: CompareViewContext;
};

function CompareView({ hidden, context }: CompareViewProps) {
  const {
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
  } = context;

  return (
      <section
        className="page-section"
        aria-labelledby="compare-title"
        hidden={hidden}
      >
          <div className="section-heading">
            <h2 id="compare-title">Pitcher Compare</h2>
            <span>{API_URL}</span>
          </div>

          <form className="filter-panel compare-workflow" onSubmit={handleCompare}>
            {pitcherError ? <div className="inline-note">{pitcherError}</div> : null}
            {compareDateRange ? (
              <div className="inline-note">
                Cached range: {formatDate(compareDateRange.first_game_date)} to{" "}
                {formatDate(compareDateRange.last_game_date)}
              </div>
            ) : (
              <div className="inline-note pitcher-first-note">
                Choose a cached pitcher to unlock period presets and date ranges.
              </div>
            )}
            <section className="filter-group compare-step">
              <div className="compare-step-heading">
                <span>1</span>
                <div>
                  <h3>Choose Pitcher</h3>
                  <p>Start with one cached pitcher so every period, pitch type, and game option stays valid.</p>
                </div>
              </div>
              <div className="filter-grid compare-filter-grid">
                <label className="filter-field">
                  <span>Pitcher</span>
                  <input
                    list="cached-pitchers"
                    name="pitcher_name"
                    type="text"
                    value={compareFilters.pitcher_name}
                    onBlur={() => {
                      setCompareFilters((currentFilters: any) =>
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
            <section className="filter-group compare-step">
              <div className="compare-step-heading">
                <span>2</span>
                <div>
                  <h3>Set Scope</h3>
                  <p>Narrow the comparison when you want a specific pitch type or batter side.</p>
                </div>
              </div>
              <div className="filter-grid compare-filter-grid">
                <label className="filter-field">
                  <span>Pitch Type</span>
                  <select
                    disabled={!compareDateRange}
                    name="pitch_type"
                    value={compareFilters.pitch_type}
                    onChange={(event) => updateCompareFilter("pitch_type", event.target.value)}
                  >
                    <option value="">All Pitch Types</option>
                    {compareOptions.pitch_types.map((pitchType) => (
                      <option key={pitchType} value={pitchType}>
                        {formatPitchTypeWithCode(pitchType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-field">
                  <span>Batter Side</span>
                  <select
                    disabled={!compareDateRange}
                    name="batter_hand"
                    value={compareFilters.batter_hand}
                    onChange={(event) => updateCompareFilter("batter_hand", event.target.value)}
                  >
                    <option value="">Both</option>
                    {(compareOptions.batter_hands.length ? compareOptions.batter_hands : ["L", "R"]).map((hand) => (
                      <option key={hand} value={hand}>
                        {hand === "L" ? "Left" : hand === "R" ? "Right" : hand}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="filter-group compare-step compare-step--periods">
              <div className="compare-step-heading">
                <span>3</span>
                <div>
                  <h3>Choose Periods</h3>
                  <p>Use presets for common splits, or pick one game or date range for each period.</p>
                </div>
              </div>
              <div className="preset-row compare-preset-row">
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
              <div className="compare-period-layout">
                {(["a", "b"] as const).map((periodKey) => {
                  const periodFields = compareFields.filter((field) =>
                    field.name.startsWith(periodKey),
                  );
                  const periodNumber = periodKey === "a" ? "1" : "2";
                  const start = periodKey === "a" ? compareFilters.a_start : compareFilters.b_start;
                  const end = periodKey === "a" ? compareFilters.a_end : compareFilters.b_end;

                  return (
                    <section className="compare-period-card" key={periodKey}>
                      <div className="compare-period-card-heading">
                        <h4>Period {periodNumber}</h4>
                        <span>{start && end ? formatShortDateRange(start, end) : "Choose dates"}</span>
                      </div>
                      <div className="filter-grid compare-period-grid">
                        {periodFields.map((field) => (
                          <label className="filter-field" key={field.name}>
                            <span>{field.label.replace(`Period ${periodNumber} `, "")}</span>
                            {field.type === "select" ? (
                              <select
                                disabled={!compareDateRange}
                                name={field.name}
                                value={compareFilters[field.name]}
                                onChange={(event) =>
                                  updateCompareFilter(field.name, event.target.value)
                                }
                              >
                                <option value="">Choose Game</option>
                                {compareOptions.game_dates.map((game) => (
                                  <option key={`${field.name}-${game.game_date}`} value={game.game_date}>
                                    {[
                                      formatShortDate(game.game_date),
                                      game.opponent_team
                                        ? `vs ${game.opponent_team}`
                                        : game.away_team && game.home_team
                                          ? `${game.away_team} at ${game.home_team}`
                                          : null,
                                      `${game.pitch_count} pitches`,
                                    ]
                                      .filter(Boolean)
                                      .join(" - ")}
                                  </option>
                                ))}
                              </select>
                            ) : (
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
                            )}
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
            {activeCompareFilterList.length > 0 ? (
              <div className="active-filter-bar">
                <span>Comparison Inputs</span>
                {activeCompareFilterList.map((filter) => (
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
                    {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)} vs{" "}
                    {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)}
                  </h3>
                  <p>
                    Period 2 minus Period 1 for {searchFiltersPitcherName(compareFilters)}
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
                          arm_angle_delta: comparison.deltas.average_arm_angle[pitchType],
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
                <button
                  className="secondary-button compact-action-button"
                  onClick={() => setComparePitchTypes(pitchTypes)}
                  type="button"
                >
                  Show All
                </button>
                <button
                  className="secondary-button compact-action-button"
                  onClick={() => setComparePitchTypes([])}
                  type="button"
                >
                  Clear
                </button>
                {pitchTypes.map((pitchType) => (
                  <label key={pitchType}>
                    <input
                      checked={comparePitchTypes.includes(pitchType)}
                      onChange={(event) => {
                        setComparePitchTypes((current: string[]) =>
                          event.target.checked
                            ? [...current, pitchType]
                            : current.filter((value: string) => value !== pitchType),
                        );
                      }}
                      type="checkbox"
                    />
                    {formatPitchType(pitchType)}
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
                <div className="metric-card">
                  <span>Arm Angle</span>
                  <strong>{formatDelta(comparison.deltas.arm_angle, "number")}</strong>
                </div>
              </div>

              <CompareMovementChart
                comparison={comparison}
                visiblePitchTypes={visiblePitchTypes}
                periodALabel={`Period 1 (${formatShortDateRange(comparison.period_a.start, comparison.period_a.end)})`}
                periodBLabel={`Period 2 (${formatShortDateRange(comparison.period_b.start, comparison.period_b.end)})`}
              />

              <div className="comparison-panels">
                <PitchHeatmap
                  heatmap={compareHeatmapA}
                  mode={compareHeatmapMode}
                  isLoading={isCompareHeatmapLoading}
                  onModeChange={updateCompareHeatmapMode}
                  pitcherHand={comparison.pitcher_hand}
                  subtitle={formatDateRange(comparison.period_a.start, comparison.period_a.end)}
                  title="Period 1 Heatmap"
                />
                <PitchHeatmap
                  heatmap={compareHeatmapB}
                  mode={compareHeatmapMode}
                  isLoading={isCompareHeatmapLoading}
                  onModeChange={updateCompareHeatmapMode}
                  pitcherHand={comparison.pitcher_hand}
                  subtitle={formatDateRange(comparison.period_b.start, comparison.period_b.end)}
                  title="Period 2 Heatmap"
                />
              </div>

              <CompareDeltaHeatmap
                periodA={compareHeatmapA}
                periodB={compareHeatmapB}
                isLoading={isCompareHeatmapLoading}
                periodAStart={comparison.period_a.start}
                periodAEnd={comparison.period_a.end}
                periodBStart={comparison.period_b.start}
                periodBEnd={comparison.period_b.end}
                pitcherHand={comparison.pitcher_hand}
                pitchType={compareFilters.pitch_type}
                batterHand={compareFilters.batter_hand}
              />

              <div className="comparison-panels">
                <section className="comparison-panel">
                  <h3>Period 1</h3>
                  <p>
                    {formatDateRange(comparison.period_a.start, comparison.period_a.end)}
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
                        <th>Arm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{formatPitchType(pitchType)}</td>
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
                          <td>
                            {formatNumber(
                              comparison.period_a.metrics.average_arm_angle[
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
                  <h3>Period 2</h3>
                  <p>
                    {formatDateRange(comparison.period_b.start, comparison.period_b.end)}
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
                        <th>Arm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{formatPitchType(pitchType)}</td>
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
                          <td>
                            {formatNumber(
                              comparison.period_b.metrics.average_arm_angle[
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
                <span>
                  {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)} minus{" "}
                  {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)}
                </span>
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
                      <th>Arm Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePitchTypes.map((pitchType) => (
                      <tr
                        className={
                          drilldownPitchType === pitchType
                            ? "clickable-row is-selected"
                            : "clickable-row"
                        }
                        key={pitchType}
                        onClick={() => loadPitchTypeDrilldown(pitchType)}
                      >
                        <td>{formatPitchType(pitchType)}</td>
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
                        <td>
                          {formatDelta(
                            comparison.deltas.average_arm_angle[pitchType],
                            "number",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {drilldownPitchType ? (
                <section className="chart-panel">
                  <div className="chart-heading">
                    <div>
                      <h3>{formatPitchType(drilldownPitchType)} Pitch Drilldown</h3>
                      <p>
                        Selected pitch type from the diff table. Press Escape or clear selection to close.
                      </p>
                    </div>
                    <span>
                      {isDrilldownLoading
                        ? "Loading pitches..."
                        : `${drilldownA.length} in Period 1 | ${drilldownB.length} in Period 2`}
                    </span>
                  </div>
                  <div className="selection-summary-bar">
                    <span>Selected</span>
                    <strong>{formatPitchType(drilldownPitchType)}</strong>
                    <button
                      className="detail-close-button clear-selection-button"
                      onClick={() => {
                        setDrilldownPitchType(null);
                        setDrilldownA([]);
                        setDrilldownB([]);
                      }}
                      type="button"
                    >
                      Clear Selection
                    </button>
                  </div>
                  <div className="drilldown-summary-grid">
                    {[
                      {
                        label: "Usage",
                        period1: formatRate(
                          comparison.period_a.metrics.pitch_usage[drilldownPitchType]
                            ?.rate,
                        ),
                        period2: formatRate(
                          comparison.period_b.metrics.pitch_usage[drilldownPitchType]
                            ?.rate,
                        ),
                        delta: formatDelta(
                          comparison.deltas.pitch_usage[drilldownPitchType]?.rate,
                          "rate",
                        ),
                      },
                      {
                        label: "Whiff Rate",
                        period1: formatRate(whiffRateFromPitches(drilldownA)),
                        period2: formatRate(whiffRateFromPitches(drilldownB)),
                        delta: formatDelta(
                          rateDelta(
                            whiffRateFromPitches(drilldownA),
                            whiffRateFromPitches(drilldownB),
                          ),
                          "rate",
                        ),
                      },
                      {
                        label: "Zone Rate",
                        period1: formatRate(zoneRateFromPitches(drilldownA)),
                        period2: formatRate(zoneRateFromPitches(drilldownB)),
                        delta: formatDelta(
                          rateDelta(
                            zoneRateFromPitches(drilldownA),
                            zoneRateFromPitches(drilldownB),
                          ),
                          "rate",
                        ),
                      },
                      {
                        label: "Avg Velo",
                        period1: formatNumber(
                          comparison.period_a.metrics.average_velocity[
                            drilldownPitchType
                          ],
                        ),
                        period2: formatNumber(
                          comparison.period_b.metrics.average_velocity[
                            drilldownPitchType
                          ],
                        ),
                        delta: formatDelta(
                          comparison.deltas.average_velocity[drilldownPitchType],
                          "number",
                        ),
                      },
                      {
                        label: "Avg Spin",
                        period1: formatNumber(
                          comparison.period_a.metrics.average_spin_rate[
                            drilldownPitchType
                          ],
                          0,
                        ),
                        period2: formatNumber(
                          comparison.period_b.metrics.average_spin_rate[
                            drilldownPitchType
                          ],
                          0,
                        ),
                        delta: formatDelta(
                          comparison.deltas.average_spin_rate[drilldownPitchType],
                          "number",
                        ),
                      },
                      {
                        label: "IVB",
                        period1: formatNumber(
                          comparison.period_a.metrics
                            .average_induced_vertical_break[drilldownPitchType],
                        ),
                        period2: formatNumber(
                          comparison.period_b.metrics
                            .average_induced_vertical_break[drilldownPitchType],
                        ),
                        delta: formatDelta(
                          comparison.deltas.average_induced_vertical_break[
                            drilldownPitchType
                          ],
                          "number",
                        ),
                      },
                      {
                        label: "HB",
                        period1: formatNumber(
                          comparison.period_a.metrics.average_horizontal_break[
                            drilldownPitchType
                          ],
                        ),
                        period2: formatNumber(
                          comparison.period_b.metrics.average_horizontal_break[
                            drilldownPitchType
                          ],
                        ),
                        delta: formatDelta(
                          comparison.deltas.average_horizontal_break[
                            drilldownPitchType
                          ],
                          "number",
                        ),
                      },
                      {
                        label: "Arm Angle",
                        period1: formatNumber(
                          comparison.period_a.metrics.average_arm_angle[
                            drilldownPitchType
                          ],
                        ),
                        period2: formatNumber(
                          comparison.period_b.metrics.average_arm_angle[
                            drilldownPitchType
                          ],
                        ),
                        delta: formatDelta(
                          comparison.deltas.average_arm_angle[drilldownPitchType],
                          "number",
                        ),
                      },
                    ].map((metric) => (
                      <div className="drilldown-summary-card" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.delta}</strong>
                        <small>
                          Period 1 {metric.period1} | Period 2 {metric.period2}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="comparison-panels">
                    {[
                      {
                        label: `Period 1 (${formatShortDateRange(comparison.period_a.start, comparison.period_a.end)})`,
                        pitches: drilldownA,
                      },
                      {
                        label: `Period 2 (${formatShortDateRange(comparison.period_b.start, comparison.period_b.end)})`,
                        pitches: drilldownB,
                      },
                    ].map((period) => (
                      <section className="comparison-panel" key={period.label}>
                        <h3>{period.label}</h3>
                        <p>{period.pitches.length} pitches loaded</p>
                        <div className="table-wrap compact-table-wrap">
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Batter</th>
                                <th>Velo</th>
                                <th>Count</th>
                                <th>Result</th>
                                <th>PA</th>
                              </tr>
                            </thead>
                            <tbody>
                              {period.pitches.slice(0, 25).map((pitch, index) => (
                                <tr key={`${period.label}-${pitch.game_date}-${index}`}>
                                  <td>{formatDate(pitch.game_date)}</td>
                                  <td>{formatBatter(pitch)}</td>
                                  <td>{formatNumber(pitch.release_speed)}</td>
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
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}
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
  );
}

export default CompareView;
