import { useEffect, useState } from "react";
import {
  API_URL,
  type CompareFilters,
  type PitcherCompareResponse,
  type PitchFilters,
  type PitchResult,
  comparePitcher,
  getHealth,
  searchPitches,
} from "./api";
import StrikeZoneChart from "./components/StrikeZoneChart";
import "./App.css";

type BackendStatus = "checking" | "connected" | "error";
type ActiveView = "explorer" | "compare";

const initialFilters: PitchFilters = {
  pitcher_id: "",
  pitcher_name: "",
  season: "",
  pitch_type: "",
  balls: "",
  strikes: "",
  min_velocity: "",
  max_velocity: "",
};

const filterFields = [
  { name: "pitcher_id", label: "Pitcher ID", type: "number" },
  { name: "pitcher_name", label: "Pitcher Name", type: "text" },
  { name: "season", label: "Season", type: "number" },
  { name: "pitch_type", label: "Pitch Type", type: "text" },
  { name: "balls", label: "Balls", type: "number" },
  { name: "strikes", label: "Strikes", type: "number" },
  { name: "min_velocity", label: "Min Velocity", type: "number" },
  { name: "max_velocity", label: "Max Velocity", type: "number" },
] as const;

const initialCompareFilters: CompareFilters = {
  pitcher_id: "",
  pitcher_name: "",
  a_start: "",
  a_end: "",
  b_start: "",
  b_end: "",
};

const compareFields = [
  { name: "pitcher_id", label: "Pitcher ID", type: "number", required: false },
  { name: "pitcher_name", label: "Pitcher Name", type: "text", required: false },
  { name: "a_start", label: "Period A Start", type: "date", required: true },
  { name: "a_end", label: "Period A End", type: "date", required: true },
  { name: "b_start", label: "Period B Start", type: "date", required: true },
  { name: "b_end", label: "Period B End", type: "date", required: true },
] as const;

function formatValue(value: string | number | null | undefined) {
  return value ?? "";
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? "-" : value.toFixed(digits);
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

function collectPitchTypes(comparison: PitcherCompareResponse) {
  return Array.from(
    new Set([
      ...Object.keys(comparison.period_a.metrics.pitch_usage),
      ...Object.keys(comparison.period_b.metrics.pitch_usage),
      ...Object.keys(comparison.deltas.pitch_usage),
      ...Object.keys(comparison.period_a.metrics.average_velocity),
      ...Object.keys(comparison.period_b.metrics.average_velocity),
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

  return largest ? `${largest[0]} ${formatDelta(largest[1], kind)}` : "-";
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState("Checking backend...");
  const [activeView, setActiveView] = useState<ActiveView>("explorer");
  const [filters, setFilters] = useState<PitchFilters>(initialFilters);
  const [results, setResults] = useState<PitchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [compareFilters, setCompareFilters] = useState<CompareFilters>(
    initialCompareFilters,
  );
  const [comparison, setComparison] = useState<PitcherCompareResponse | null>(
    null,
  );
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

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

  function updateFilter(name: keyof PitchFilters, value: string) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  }

  function updateCompareFilter(name: keyof CompareFilters, value: string) {
    setCompareFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await searchPitches(filters);
      setResults(response.results);
      setResultCount(response.count);
    } catch (error) {
      setResults([]);
      setResultCount(0);
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleCompare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!compareFilters.pitcher_id.trim() && !compareFilters.pitcher_name.trim()) {
      setCompareError("Enter a pitcher ID or pitcher name.");
      return;
    }

    setIsComparing(true);
    setCompareError(null);

    try {
      const response = await comparePitcher(compareFilters);
      setComparison(response);
    } catch (error) {
      setComparison(null);
      setCompareError(
        error instanceof Error ? error.message : "Comparison failed",
      );
    } finally {
      setIsComparing(false);
    }
  }

  const pitchTypes = comparison ? collectPitchTypes(comparison) : [];
  const topUsageDelta = comparison
    ? largestDeltaLabel(
        Object.fromEntries(
          Object.entries(comparison.deltas.pitch_usage).map(([pitchType, metric]) => [
            pitchType,
            metric.rate,
          ]),
        ),
        "rate",
      )
    : "-";
  const topVelocityDelta = comparison
    ? largestDeltaLabel(comparison.deltas.average_velocity, "number")
    : "-";

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

      {activeView === "explorer" ? (
        <section className="page-section" aria-labelledby="pitch-explorer-title">
        <div className="section-heading">
          <h2 id="pitch-explorer-title">Pitch Explorer</h2>
          <span>{API_URL}</span>
        </div>

        <form className="filter-panel" onSubmit={handleSearch}>
          <div className="filter-grid">
            {filterFields.map((field) => (
              <label className="filter-field" key={field.name}>
                <span>{field.label}</span>
                <input
                  inputMode={field.type === "number" ? "numeric" : "text"}
                  name={field.name}
                  type={field.type}
                  step={
                    field.name === "min_velocity" ||
                    field.name === "max_velocity"
                      ? "0.1"
                      : "1"
                  }
                  value={filters[field.name]}
                  onChange={(event) =>
                    updateFilter(field.name, event.target.value)
                  }
                />
              </label>
            ))}
          </div>
          <button className="search-button" disabled={isSearching} type="submit">
            {isSearching ? "Searching..." : "Search"}
          </button>
        </form>

        {searchError ? <div className="error-banner">{searchError}</div> : null}

        <div className="results-header">
          <h3>Results</h3>
          <span>{resultCount} pitches</span>
        </div>

        <StrikeZoneChart pitches={results} />

        <div className="table-wrap">
          {results.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pitcher</th>
                  <th>Pitcher ID</th>
                  <th>Batter</th>
                  <th>Type</th>
                  <th>Velocity</th>
                  <th>Plate X</th>
                  <th>Plate Z</th>
                  <th>Count</th>
                  <th>Description</th>
                  <th>Events</th>
                </tr>
              </thead>
              <tbody>
                {results.map((pitch, index) => (
                  <tr
                    key={`${pitch.game_date}-${pitch.pitcher}-${pitch.batter}-${index}`}
                  >
                    <td>{formatValue(pitch.game_date)}</td>
                    <td>{formatValue(pitch.player_name)}</td>
                    <td>{formatValue(pitch.pitcher)}</td>
                    <td>{formatValue(pitch.batter)}</td>
                    <td>{formatValue(pitch.pitch_type)}</td>
                    <td>{formatValue(pitch.release_speed)}</td>
                    <td>{formatValue(pitch.plate_x)}</td>
                    <td>{formatValue(pitch.plate_z)}</td>
                    <td>
                      {pitch.balls ?? ""}
                      {pitch.balls !== null || pitch.strikes !== null ? "-" : ""}
                      {pitch.strikes ?? ""}
                    </td>
                    <td>{formatValue(pitch.description)}</td>
                    <td>{formatValue(pitch.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p>
                {isSearching
                  ? "Loading pitches..."
                  : "Run a search to see cached Statcast pitches."}
              </p>
            </div>
          )}
        </div>
      </section>
      ) : (
        <section className="page-section" aria-labelledby="compare-title">
          <div className="section-heading">
            <h2 id="compare-title">Pitcher Compare</h2>
            <span>{API_URL}</span>
          </div>

          <form className="filter-panel" onSubmit={handleCompare}>
            <div className="filter-grid compare-filter-grid">
              {compareFields.map((field) => (
                <label className="filter-field" key={field.name}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    type={field.type}
                    value={compareFilters[field.name]}
                    onChange={(event) =>
                      updateCompareFilter(field.name, event.target.value)
                    }
                    required={field.required}
                  />
                </label>
              ))}
            </div>
            <button
              className="search-button"
              disabled={isComparing}
              type="submit"
            >
              {isComparing ? "Comparing..." : "Compare"}
            </button>
          </form>

          {compareError ? <div className="error-banner">{compareError}</div> : null}

          {comparison ? (
            <>
              <div className="comparison-summary">
                <div className="metric-card">
                  <span>Usage Delta</span>
                  <strong>{topUsageDelta}</strong>
                </div>
                <div className="metric-card">
                  <span>Velocity Delta</span>
                  <strong>{topVelocityDelta}</strong>
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
              </div>

              <div className="comparison-panels">
                <section className="comparison-panel">
                  <h3>Period A</h3>
                  <p>
                    {comparison.period_a.start} to {comparison.period_a.end}
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
                      </tr>
                    </thead>
                    <tbody>
                      {pitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{pitchType}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section className="comparison-panel">
                  <h3>Period B</h3>
                  <p>
                    {comparison.period_b.start} to {comparison.period_b.end}
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
                      </tr>
                    </thead>
                    <tbody>
                      {pitchTypes.map((pitchType) => (
                        <tr key={pitchType}>
                          <td>{pitchType}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              <div className="results-header">
                <h3>Pitch Mix Diff</h3>
                <span>Period B minus Period A</span>
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
                    </tr>
                  </thead>
                  <tbody>
                    {pitchTypes.map((pitchType) => (
                      <tr key={pitchType}>
                        <td>{pitchType}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      )}
    </main>
  );
}

export default App;
