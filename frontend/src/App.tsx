import { useEffect, useState } from "react";
import {
  API_URL,
  type PitchFilters,
  type PitchResult,
  getHealth,
  searchPitches,
} from "./api";
import StrikeZoneChart from "./components/StrikeZoneChart";
import "./App.css";

type BackendStatus = "checking" | "connected" | "error";

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

function formatValue(value: string | number | null) {
  return value ?? "";
}

function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [statusText, setStatusText] = useState("Checking backend...");
  const [filters, setFilters] = useState<PitchFilters>(initialFilters);
  const [results, setResults] = useState<PitchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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
    </main>
  );
}

export default App;
