import { useEffect, useState } from "react";
import CompareDeltaHeatmap from "../components/CompareDeltaHeatmap";
import CompareMovementChart from "../components/CompareMovementChart";
import PitchHeatmap from "../components/PitchHeatmap";
import { formatPitchType, formatPitchTypeWithCode } from "../pitchTypes";
import { countLabel } from "../text";

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
    lastAppliedQuery,
    focusedResultTarget
  } = context;
  const isFocusedResult = Boolean(focusedResultTarget);
  const activeFocusTarget = compareFocus?.target || focusedResultTarget;
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    savedComparisons: true,
    periodHeatmaps: false,
    periodTables: true,
    diffTable: false,
    drilldownPitches: true,
  });

  useEffect(() => {
    if (comparison) {
      setIsSearchCollapsed(true);
    } else {
      setIsSearchCollapsed(false);
    }
  }, [comparison]);

  useEffect(() => {
    if (!activeFocusTarget || hidden) return;

    const targetMap: Record<string, { id: string; section?: keyof typeof collapsedSections }> = {
      summary: { id: "relay-compare-summary" },
      movement: { id: "relay-compare-movement" },
      movement_diff: { id: "relay-compare-movement" },
      heatmap: { id: "relay-period-heatmaps", section: "periodHeatmaps" },
      period_heatmaps: { id: "relay-period-heatmaps", section: "periodHeatmaps" },
      location_delta: { id: "relay-delta-heatmap" },
      table: { id: "relay-comparison-table", section: "diffTable" },
      comparison_table: { id: "relay-comparison-table", section: "diffTable" },
      period_tables: { id: "relay-period-tables", section: "periodTables" },
      drilldown: { id: "relay-drilldown" },
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
  }, [activeFocusTarget, compareFocus, hidden]);

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function disclosureIcon(isCollapsed: boolean) {
    return isCollapsed ? ">" : "v";
  }

  function shouldShowResult(targets: string[]) {
    return !isFocusedResult || targets.includes(focusedResultTarget);
  }

  const selectedScopePitchTypes = compareFilters.pitch_type
    .split(",")
    .map((pitchType: string) => pitchType.trim())
    .filter(Boolean);
  const newPitchTypes = comparison
    ? pitchTypes.filter(
        (pitchType) =>
          (comparison.period_a.metrics.pitch_usage[pitchType]?.count ?? 0) === 0 &&
          (comparison.period_b.metrics.pitch_usage[pitchType]?.count ?? 0) > 0,
      )
    : [];
  const missingPitchTypes = comparison
    ? pitchTypes.filter(
        (pitchType) =>
          (comparison.period_a.metrics.pitch_usage[pitchType]?.count ?? 0) > 0 &&
          (comparison.period_b.metrics.pitch_usage[pitchType]?.count ?? 0) === 0,
      )
    : [];

  function pitchAvailabilityStatus(pitchType: string) {
    if (!comparison) return null;
    const periodACount = comparison.period_a.metrics.pitch_usage[pitchType]?.count ?? 0;
    const periodBCount = comparison.period_b.metrics.pitch_usage[pitchType]?.count ?? 0;

    if (periodACount === 0 && periodBCount > 0) return "New in Period 2";
    if (periodACount > 0 && periodBCount === 0) return "Missing in Period 2";
    return null;
  }

  function largestDeltaWithUnit(
    values: Record<string, number | null | undefined>,
    unit: string,
    digits = 1,
  ) {
    const largest = Object.entries(values)
      .filter((entry): entry is [string, number] => entry[1] !== null && entry[1] !== undefined)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

    return largest ? `${formatPitchType(largest[0])} ${formatDeltaWithUnit(largest[1], "number", unit, digits)}` : "-";
  }

  return (
      <section
        className="page-section"
        aria-labelledby="compare-title"
        hidden={hidden}
      >
          <div className="section-heading">
            <h2 id="compare-title">Pitcher Compare</h2>
          </div>

          {lastAppliedQuery ? (
            <div className="applied-query-context">
              <span>Asked Relay</span>
              <strong>{lastAppliedQuery}</strong>
            </div>
          ) : null}

          {comparison && !isFocusedResult ? (
            <div className="collapsed-search-bar">
              <div>
                <span>Comparison Setup</span>
                <strong>
                  {searchFiltersPitcherName(compareFilters)} |{" "}
                  {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)} vs{" "}
                  {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)}
                </strong>
              </div>
              <button
                className="secondary-button"
                onClick={() => setIsSearchCollapsed((current) => !current)}
                type="button"
              >
                {isSearchCollapsed ? "Edit Comparison" : "Hide Setup"}
              </button>
            </div>
          ) : null}

          <form
            className={isSearchCollapsed ? "filter-panel compare-workflow is-collapsed" : "filter-panel compare-workflow"}
            hidden={isSearchCollapsed || isFocusedResult}
            onSubmit={handleCompare}
          >
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
                <div className="filter-field compare-pitch-scope-field">
                  <span>Pitch Types</span>
                  <div className="compare-pitch-scope-list" aria-label="Pitch type scope">
                    {compareOptions.pitch_types.length > 0 ? (
                      compareOptions.pitch_types.map((pitchType) => {
                        const isSelected = selectedScopePitchTypes.includes(pitchType);
                        return (
                          <button
                            className={
                              isSelected
                                ? "pitch-scope-chip is-active"
                                : "pitch-scope-chip"
                            }
                            disabled={!compareDateRange}
                            key={pitchType}
                            onClick={() => {
                              const nextPitchTypes = isSelected
                                ? selectedScopePitchTypes.filter((value: string) => value !== pitchType)
                                : [...selectedScopePitchTypes, pitchType];
                              updateCompareFilter("pitch_type", nextPitchTypes.join(","));
                            }}
                            type="button"
                          >
                            {formatPitchTypeWithCode(pitchType)}
                          </button>
                        );
                      })
                    ) : (
                      <span className="empty-scope-note">Choose a pitcher first</span>
                    )}
                  </div>
                  <small className="field-help">
                    {selectedScopePitchTypes.length === 0
                      ? "All pitch types"
                      : countLabel(selectedScopePitchTypes.length, "pitch type")}
                  </small>
                </div>
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
                  disabled={!hasComparePresetRange("previous_current_season", compareDateRange)}
                  type="button"
                  onClick={() => setComparePreset("previous_current_season")}
                >
                  Previous Season vs Current Season
                </button>
                <button
                  disabled={!hasComparePresetRange("previous_current_ytd", compareDateRange)}
                  type="button"
                  onClick={() => setComparePreset("previous_current_ytd")}
                >
                  Prior YTD vs Current YTD
                </button>
                <button
                  disabled={!hasComparePresetRange("last30_previous30", compareDateRange)}
                  type="button"
                  onClick={() => setComparePreset("last30_previous30")}
                >
                  Previous 30 vs Last 30
                </button>
                <button
                  disabled={!hasComparePresetRange("latest_month_previous_month", compareDateRange)}
                  type="button"
                  onClick={() => setComparePreset("latest_month_previous_month")}
                >
                  Previous Month vs Latest Month
                </button>
                <button
                  disabled={!hasComparePresetRange("season_first_second", compareDateRange)}
                  type="button"
                  onClick={() => setComparePreset("season_first_second")}
                >
                  First Half vs Second Half
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
                                      countLabel(game.pitch_count, "pitch"),
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
                <div className="collapsible-strip">
                  <div className="collapsible-strip-heading">
                    <div>
                      <span>Saved Comparisons</span>
                      <strong>{countLabel(savedComparisons.length, "saved comparison")}</strong>
                    </div>
                    <button
                      aria-label={
                        collapsedSections.savedComparisons
                          ? "Expand saved comparisons"
                          : "Collapse saved comparisons"
                      }
                      className="disclosure-button"
                      onClick={() => toggleSection("savedComparisons")}
                      title={collapsedSections.savedComparisons ? "Expand" : "Collapse"}
                      type="button"
                    >
                      {disclosureIcon(collapsedSections.savedComparisons)}
                    </button>
                  </div>
                  <div className="saved-row" hidden={collapsedSections.savedComparisons}>
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
                </div>
              ) : null}
              {!isFocusedResult ? (
              <div className="display-pitch-filter-row">
                <div className="display-pitch-filter-heading">
                  <span>Display</span>
                  <strong>{visiblePitchTypes.length} / {pitchTypes.length} pitch types</strong>
                </div>
                <div className="display-pitch-filter-actions">
                  <button
                    className="secondary-button compact-action-button"
                    onClick={() => setComparePitchTypes(pitchTypes)}
                    type="button"
                  >
                    All
                  </button>
                  <button
                    className="secondary-button compact-action-button"
                    onClick={() => setComparePitchTypes([])}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                <div className="display-pitch-chip-row" aria-label="Displayed pitch types">
                  {pitchTypes.map((pitchType) => (
                    <button
                      className={
                        comparePitchTypes.includes(pitchType)
                          ? "pitch-display-chip is-active"
                          : "pitch-display-chip"
                      }
                      key={pitchType}
                      onClick={() => {
                        setComparePitchTypes((current: string[]) =>
                          current.includes(pitchType)
                            ? current.filter((value: string) => value !== pitchType)
                            : [...current, pitchType],
                        );
                      }}
                      type="button"
                    >
                      {formatPitchType(pitchType)}
                    </button>
                  ))}
                </div>
              </div>
              ) : null}
              {shouldShowResult(["summary"]) ? (
              <div className="comparison-summary focus-scroll-target" id="relay-compare-summary">
                <div className="metric-card">
                  <span>Usage Delta</span>
                  <strong>{topUsageDelta}</strong>
                </div>
                <div className="metric-card">
                  <span>Pitch-Type Velo Delta</span>
                  <strong>{largestDeltaWithUnit(comparison.deltas.average_velocity, "mph")}</strong>
                </div>
                <div className="metric-card">
                  <span>Pitch-Type Spin Delta</span>
                  <strong>{largestDeltaWithUnit(comparison.deltas.average_spin_rate, "rpm", 0)}</strong>
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
                  <strong>{formatDeltaWithUnit(comparison.deltas.arm_angle, "number", "deg", 1)}</strong>
                </div>
                <div className="metric-card">
                  <span>Arsenal Changes</span>
                  <strong>
                    {newPitchTypes.length + missingPitchTypes.length === 0
                      ? "None"
                      : `${newPitchTypes.length} new / ${missingPitchTypes.length} missing`}
                  </strong>
                </div>
              </div>
              ) : null}

              {shouldShowResult(["movement", "movement_diff"]) ? (
              <div className="focus-scroll-target" id="relay-compare-movement">
                <CompareMovementChart
                  comparison={comparison}
                  visiblePitchTypes={visiblePitchTypes}
                  periodALabel={`Period 1 (${formatShortDateRange(comparison.period_a.start, comparison.period_a.end)})`}
                  periodBLabel={`Period 2 (${formatShortDateRange(comparison.period_b.start, comparison.period_b.end)})`}
                />
              </div>
              ) : null}

              {shouldShowResult(["heatmap", "period_heatmaps"]) ? (
              <div className="results-header focus-scroll-target" id="relay-period-heatmaps">
                <h3>Period Heatmaps</h3>
                <div className="results-header-actions">
                  <span>
                    {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)} and{" "}
                    {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)}
                  </span>
                  <button
                    aria-label={collapsedSections.periodHeatmaps ? "Expand period heatmaps" : "Collapse period heatmaps"}
                    className="disclosure-button"
                    onClick={() => toggleSection("periodHeatmaps")}
                    title={collapsedSections.periodHeatmaps ? "Expand" : "Collapse"}
                    type="button"
                  >
                    {disclosureIcon(collapsedSections.periodHeatmaps)}
                  </button>
                </div>
              </div>
              ) : null}

              {shouldShowResult(["heatmap", "period_heatmaps"]) ? (
              <div className="comparison-panels" hidden={collapsedSections.periodHeatmaps}>
                <PitchHeatmap
                  collapsible={false}
                  heatmap={compareHeatmapA}
                  mode={compareHeatmapMode}
                  isLoading={isCompareHeatmapLoading}
                  onModeChange={updateCompareHeatmapMode}
                  pitcherHand={comparison.pitcher_hand}
                  subtitle={formatDateRange(comparison.period_a.start, comparison.period_a.end)}
                  title="Period 1 Heatmap"
                />
                <PitchHeatmap
                  collapsible={false}
                  heatmap={compareHeatmapB}
                  mode={compareHeatmapMode}
                  isLoading={isCompareHeatmapLoading}
                  onModeChange={updateCompareHeatmapMode}
                  pitcherHand={comparison.pitcher_hand}
                  subtitle={formatDateRange(comparison.period_b.start, comparison.period_b.end)}
                  title="Period 2 Heatmap"
                />
              </div>
              ) : null}

              {shouldShowResult(["location_delta"]) ? (
              <div className="focus-scroll-target" id="relay-delta-heatmap">
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
              </div>
              ) : null}

              {shouldShowResult(["period_tables"]) ? (
              <div className="results-header focus-scroll-target" id="relay-period-tables">
                <h3>Period Tables</h3>
                <div className="results-header-actions">
                  <span>
                    {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)} and{" "}
                    {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)}
                  </span>
                  <button
                    aria-label={collapsedSections.periodTables ? "Expand period tables" : "Collapse period tables"}
                    className="disclosure-button"
                    onClick={() => toggleSection("periodTables")}
                    title={collapsedSections.periodTables ? "Expand" : "Collapse"}
                    type="button"
                  >
                    {disclosureIcon(collapsedSections.periodTables)}
                  </button>
                </div>
              </div>
              ) : null}

              {shouldShowResult(["period_tables"]) ? (
              <div className="comparison-panels" hidden={collapsedSections.periodTables && !isFocusedResult}>
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
                        <th>Velo (mph)</th>
                        <th>Spin (rpm)</th>
                        <th>IVB (in)</th>
                        <th>HB (in)</th>
                        <th>Arm (deg)</th>
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
                        <th>Velo (mph)</th>
                        <th>Spin (rpm)</th>
                        <th>IVB (in)</th>
                        <th>HB (in)</th>
                        <th>Arm (deg)</th>
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
              ) : null}

              {shouldShowResult(["table", "comparison_table"]) ? (
              <div className="results-header focus-scroll-target" id="relay-comparison-table">
                <h3>Pitch Type Changes</h3>
                <div className="results-header-actions">
                  <span>
                    {formatShortDateRange(comparison.period_b.start, comparison.period_b.end)} minus{" "}
                    {formatShortDateRange(comparison.period_a.start, comparison.period_a.end)}
                  </span>
                  <button
                    aria-label={collapsedSections.diffTable ? "Expand pitch-type diff table" : "Collapse pitch-type diff table"}
                    className="disclosure-button"
                    onClick={() => toggleSection("diffTable")}
                    title={collapsedSections.diffTable ? "Expand" : "Collapse"}
                    type="button"
                  >
                    {disclosureIcon(collapsedSections.diffTable)}
                  </button>
                </div>
              </div>
              ) : null}
              {shouldShowResult(["table", "comparison_table"]) ? (
              <div className="table-wrap" hidden={collapsedSections.diffTable && !isFocusedResult}>
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Pitch</th>
                      <th>Status</th>
                      <th>A Usage</th>
                      <th>B Usage</th>
                      <th>Usage Delta</th>
                      <th>A Velo (mph)</th>
                      <th>B Velo (mph)</th>
                      <th>Velo Delta (mph)</th>
                      <th>Spin Delta (rpm)</th>
                      <th>IVB Delta (in)</th>
                      <th>HB Delta (in)</th>
                      <th>Arm Delta (deg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePitchTypes.map((pitchType) => (
                      <tr
                        className={[
                          "clickable-row",
                          drilldownPitchType === pitchType ? "is-selected" : "",
                          pitchAvailabilityStatus(pitchType) === "New in Period 2"
                            ? "is-new-pitch"
                            : "",
                          pitchAvailabilityStatus(pitchType) === "Missing in Period 2"
                            ? "is-missing-pitch"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={pitchType}
                        onClick={() => loadPitchTypeDrilldown(pitchType)}
                      >
                        <td>{formatPitchType(pitchType)}</td>
                        <td>
                          {pitchAvailabilityStatus(pitchType) ? (
                            <span
                              className={
                                pitchAvailabilityStatus(pitchType) === "New in Period 2"
                                  ? "status-badge status-badge--new"
                                  : "status-badge status-badge--missing"
                              }
                            >
                              {pitchAvailabilityStatus(pitchType)}
                            </span>
                          ) : (
                            <span className="status-badge">Both</span>
                          )}
                        </td>
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
                          {formatNumberWithUnit(
                            comparison.period_a.metrics.average_velocity[
                              pitchType
                            ],
                            "mph",
                          )}
                        </td>
                        <td>
                          {formatNumberWithUnit(
                            comparison.period_b.metrics.average_velocity[
                              pitchType
                            ],
                            "mph",
                          )}
                        </td>
                        <td>
                          {formatDeltaWithUnit(
                            comparison.deltas.average_velocity[pitchType],
                            "number",
                            "mph",
                          )}
                        </td>
                        <td>
                          {formatDeltaWithUnit(
                            comparison.deltas.average_spin_rate[pitchType],
                            "number",
                            "rpm",
                            0,
                          )}
                        </td>
                        <td>
                          {formatDeltaWithUnit(
                            comparison.deltas.average_induced_vertical_break[
                              pitchType
                            ],
                            "number",
                            "in",
                          )}
                        </td>
                        <td>
                          {formatDeltaWithUnit(
                            comparison.deltas.average_horizontal_break[pitchType],
                            "number",
                            "in",
                          )}
                        </td>
                        <td>
                          {formatDeltaWithUnit(
                            comparison.deltas.average_arm_angle[pitchType],
                            "number",
                            "deg",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              ) : null}
              {drilldownPitchType && shouldShowResult(["drilldown"]) ? (
                <section className="chart-panel focus-scroll-target" id="relay-drilldown">
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
                        : `${countLabel(drilldownA.length, "pitch")} in Period 1 | ${countLabel(drilldownB.length, "pitch")} in Period 2`}
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
                        period1: formatNumberWithUnit(
                          comparison.period_a.metrics.average_velocity[
                            drilldownPitchType
                          ],
                          "mph",
                        ),
                        period2: formatNumberWithUnit(
                          comparison.period_b.metrics.average_velocity[
                            drilldownPitchType
                          ],
                          "mph",
                        ),
                        delta: formatDeltaWithUnit(
                          comparison.deltas.average_velocity[drilldownPitchType],
                          "number",
                          "mph",
                        ),
                      },
                      {
                        label: "Avg Spin",
                        period1: formatNumberWithUnit(
                          comparison.period_a.metrics.average_spin_rate[
                            drilldownPitchType
                          ],
                          "rpm",
                          0,
                        ),
                        period2: formatNumberWithUnit(
                          comparison.period_b.metrics.average_spin_rate[
                            drilldownPitchType
                          ],
                          "rpm",
                          0,
                        ),
                        delta: formatDeltaWithUnit(
                          comparison.deltas.average_spin_rate[drilldownPitchType],
                          "number",
                          "rpm",
                          0,
                        ),
                      },
                      {
                        label: "IVB",
                        period1: formatNumberWithUnit(
                          comparison.period_a.metrics
                            .average_induced_vertical_break[drilldownPitchType],
                          "in",
                        ),
                        period2: formatNumberWithUnit(
                          comparison.period_b.metrics
                            .average_induced_vertical_break[drilldownPitchType],
                          "in",
                        ),
                        delta: formatDeltaWithUnit(
                          comparison.deltas.average_induced_vertical_break[
                            drilldownPitchType
                          ],
                          "number",
                          "in",
                        ),
                      },
                      {
                        label: "HB",
                        period1: formatNumberWithUnit(
                          comparison.period_a.metrics.average_horizontal_break[
                            drilldownPitchType
                          ],
                          "in",
                        ),
                        period2: formatNumberWithUnit(
                          comparison.period_b.metrics.average_horizontal_break[
                            drilldownPitchType
                          ],
                          "in",
                        ),
                        delta: formatDeltaWithUnit(
                          comparison.deltas.average_horizontal_break[
                            drilldownPitchType
                          ],
                          "number",
                          "in",
                        ),
                      },
                      {
                        label: "Arm Angle",
                        period1: formatNumberWithUnit(
                          comparison.period_a.metrics.average_arm_angle[
                            drilldownPitchType
                          ],
                          "deg",
                        ),
                        period2: formatNumberWithUnit(
                          comparison.period_b.metrics.average_arm_angle[
                            drilldownPitchType
                          ],
                          "deg",
                        ),
                        delta: formatDeltaWithUnit(
                          comparison.deltas.average_arm_angle[drilldownPitchType],
                          "number",
                          "deg",
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
                  <div className="results-header drilldown-table-header">
                    <h3>Pitch Samples</h3>
                    <div className="results-header-actions">
                      <span>First 25 pitches from each period</span>
                      <button
                        aria-label={collapsedSections.drilldownPitches ? "Expand pitch samples" : "Collapse pitch samples"}
                        className="disclosure-button"
                        onClick={() => toggleSection("drilldownPitches")}
                        title={collapsedSections.drilldownPitches ? "Expand" : "Collapse"}
                        type="button"
                      >
                        {disclosureIcon(collapsedSections.drilldownPitches)}
                      </button>
                    </div>
                  </div>
                  <div className="comparison-panels" hidden={collapsedSections.drilldownPitches}>
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
                        <p>{countLabel(period.pitches.length, "pitch")} loaded</p>
                        <div className="table-wrap compact-table-wrap">
                          <table className="mini-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Batter</th>
                                <th>Velo (mph)</th>
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
                  : isFocusedResult
                    ? "No comparison matched this query. Try removing or modifying some filters."
                  : "Choose two date ranges to compare a pitcher's profile."}
              </p>
            </div>
          )}
      </section>
  );
}

export default CompareView;
