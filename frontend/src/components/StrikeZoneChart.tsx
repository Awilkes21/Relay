import { useEffect, useMemo, useState } from "react";
import type { PitchResult } from "../api";
import { formatPitchType } from "../pitchTypes";

type StrikeZoneChartProps = {
  pitches: PitchResult[];
};

type PlottedPitch = PitchResult & {
  plate_x: number;
  plate_z: number;
};

const width = 560;
const height = 460;
const padding = 46;
const baseXMin = -2.5;
const baseXMax = 2.5;
const baseZMin = 0;
const baseZMax = 5;
const zoneLeft = -0.83;
const zoneRight = 0.83;
const zoneTop = 3.5;
const zoneBottom = 1.5;
const zoneMiddle = (zoneTop + zoneBottom) / 2;
const zoomLevels = [1, 1.5, 2] as const;

const pitchColors: Record<string, string> = {
  FF: "#1d4f7a",
  SI: "#287271",
  SL: "#b5651d",
  CH: "#7b4ea3",
  CU: "#9a3326",
  FC: "#44633f",
  FS: "#4b5565",
};

function scaleX(value: number, domain: PlotDomain) {
  return (
    padding +
    ((value - domain.xMin) / (domain.xMax - domain.xMin)) * (width - padding * 2)
  );
}

function scaleZ(value: number, domain: PlotDomain) {
  return (
    height -
    padding -
    ((value - domain.zMin) / (domain.zMax - domain.zMin)) * (height - padding * 2)
  );
}

function pitchColor(pitchType: string | null) {
  return pitchType ? pitchColors[pitchType] ?? "#2f6f9f" : "#7f92a8";
}

function pitcherViewX(plateX: number) {
  return plateX * -1;
}

function formatTooltip(pitch: PitchResult) {
  const count =
    pitch.balls === null && pitch.strikes === null
      ? "Count: "
      : `Count: ${pitch.balls ?? ""}-${pitch.strikes ?? ""}`;

  return [
    `Pitch: ${formatPitchType(pitch.pitch_type)}`,
    `Velocity: ${formatDetail(pitch.release_speed)}`,
    `Spin: ${formatSpin(pitch.release_spin_rate)}`,
    `Induced vertical break: ${formatBreak(pitch.pfx_z)}`,
    `Horizontal break: ${formatBreak(pitch.pfx_x)}`,
    `Exit velocity: ${formatContactNumber(pitch.launch_speed, "mph")}`,
    `Launch angle: ${formatContactNumber(pitch.launch_angle, "deg", 0)}`,
    `Batted ball: ${formatBattedBall(pitch.bb_type)}`,
    "View: Pitcher",
    `Description: ${pitch.description ?? ""}`,
    count,
  ].join("\n");
}

function formatDetail(value: string | number | null) {
  return value ?? "-";
}

function formatSpin(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} rpm`;
}

function formatBreak(value: number | null) {
  return value === null ? "-" : `${(value * 12).toFixed(1)} in`;
}

function formatContactNumber(value: number | null, unit: string, digits = 1) {
  return value === null ? "-" : `${value.toFixed(digits)} ${unit}`;
}

function formatBattedBall(value: string | null) {
  if (!value) return "-";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hasLocation(pitch: PitchResult): pitch is PlottedPitch {
  return pitch.plate_x !== null && pitch.plate_z !== null;
}

type PlotDomain = {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
};

function domainForZoom(zoom: number): PlotDomain {
  const xCenter = (baseXMin + baseXMax) / 2;
  const zCenter = (baseZMin + baseZMax) / 2;
  const xRange = (baseXMax - baseXMin) / zoom;
  const zRange = (baseZMax - baseZMin) / zoom;

  return {
    xMin: xCenter - xRange / 2,
    xMax: xCenter + xRange / 2,
    zMin: zCenter - zRange / 2,
    zMax: zCenter + zRange / 2,
  };
}

function StrikeZoneChart({ pitches }: StrikeZoneChartProps) {
  const plottedPitches = pitches.filter(hasLocation);
  const [selectedPitch, setSelectedPitch] = useState<PlottedPitch | null>(null);
  const [zoom, setZoom] = useState<(typeof zoomLevels)[number]>(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const domain = domainForZoom(zoom);
  const legendItems = useMemo(
    () =>
      Array.from(
        new Set(plottedPitches.map((pitch) => pitch.pitch_type ?? "Unknown")),
      ).sort(),
    [plottedPitches],
  );

  useEffect(() => {
    setSelectedPitch(null);
  }, [pitches]);

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPitch(null);
      }
    }

    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  return (
    <section
      className={isExpanded ? "chart-panel chart-panel--expanded" : "chart-panel"}
      aria-labelledby="strike-zone-title"
    >
      <div className="chart-heading">
        <h3 id="strike-zone-title">Strike Zone</h3>
        <span>{plottedPitches.length} plotted pitches | pitcher view</span>
      </div>

      <div className="chart-tools">
        <div className="pitch-legend" aria-label="Pitch type legend">
          {legendItems.length > 0 ? (
            legendItems.map((pitchType) => (
              <span className="legend-item" key={pitchType}>
                <span
                  className="legend-swatch"
                  style={{ backgroundColor: pitchColor(pitchType) }}
                />
                {formatPitchType(pitchType)}
              </span>
            ))
          ) : (
            <span className="legend-empty">No pitch types</span>
          )}
        </div>

        <div className="chart-controls">
          <span className="chart-view-note">Pitcher Left / Pitcher Right</span>
          <div className="zoom-controls" aria-label="Strike zone zoom controls">
            {zoomLevels.map((level) => (
              <button
                className={zoom === level ? "zoom-button is-active" : "zoom-button"}
                key={level}
                onClick={() => setZoom(level)}
                type="button"
              >
                {level}x
              </button>
            ))}
          </div>
          <button
            className="secondary-button"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      <div className="strike-zone-frame">
        <svg
          aria-label="Strike zone pitch location scatter plot"
          className="strike-zone-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <clipPath id="strike-zone-clip">
              <rect
                x={padding}
                y={padding}
                width={width - padding * 2}
                height={height - padding * 2}
              />
            </clipPath>
          </defs>
          <rect
            className="plot-background"
            x={padding}
            y={padding}
            width={width - padding * 2}
            height={height - padding * 2}
          />
          <line
            className="plot-axis"
            x1={scaleX(0, domain)}
            x2={scaleX(0, domain)}
            y1={padding}
            y2={height - padding}
          />
          <line
            className="plot-axis"
            x1={padding}
            x2={width - padding}
            y1={scaleZ(zoneMiddle, domain)}
            y2={scaleZ(zoneMiddle, domain)}
          />
          <rect
            className="strike-zone-box"
            x={scaleX(zoneLeft, domain)}
            y={scaleZ(zoneTop, domain)}
            width={scaleX(zoneRight, domain) - scaleX(zoneLeft, domain)}
            height={scaleZ(zoneBottom, domain) - scaleZ(zoneTop, domain)}
          />
          <g clipPath="url(#strike-zone-clip)">
            {plottedPitches.map((pitch, index) => (
              <circle
                className={
                  selectedPitch === pitch
                    ? "pitch-point pitch-point--selected"
                    : "pitch-point"
                }
                cx={scaleX(pitcherViewX(pitch.plate_x), domain)}
                cy={scaleZ(pitch.plate_z, domain)}
                fill={pitchColor(pitch.pitch_type)}
                key={`${pitch.plate_x}-${pitch.plate_z}-${index}`}
                onClick={() =>
                  setSelectedPitch((current) => (current === pitch ? null : pitch))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedPitch((current) => (current === pitch ? null : pitch));
                  }
                }}
                r="5"
                tabIndex={0}
              >
                <title>{formatTooltip(pitch)}</title>
              </circle>
            ))}
          </g>
        </svg>

        {plottedPitches.length === 0 ? (
          <p className="chart-empty">No pitch locations to plot.</p>
        ) : null}
      </div>

      {selectedPitch ? (
        <div className="pitch-detail-panel selection-panel">
          <div className="selection-panel-header">
            <span>Selected Pitch</span>
            <strong>{formatPitchType(selectedPitch.pitch_type)}</strong>
          </div>
          <div>
            <span>Pitch</span>
            <strong>{formatPitchType(selectedPitch.pitch_type)}</strong>
          </div>
          <div>
            <span>Velocity</span>
            <strong>{formatDetail(selectedPitch.release_speed)}</strong>
          </div>
          <div>
            <span>Spin</span>
            <strong>{formatSpin(selectedPitch.release_spin_rate)}</strong>
          </div>
          <div>
            <span>IVB</span>
            <strong>{formatBreak(selectedPitch.pfx_z)}</strong>
          </div>
          <div>
            <span>HB</span>
            <strong>{formatBreak(selectedPitch.pfx_x)}</strong>
          </div>
          <div>
            <span>Exit Velo</span>
            <strong>{formatContactNumber(selectedPitch.launch_speed, "mph")}</strong>
          </div>
          <div>
            <span>Launch Angle</span>
            <strong>{formatContactNumber(selectedPitch.launch_angle, "deg", 0)}</strong>
          </div>
          <div>
            <span>Contact</span>
            <strong>{formatBattedBall(selectedPitch.bb_type)}</strong>
          </div>
          <div>
            <span>Count</span>
            <strong>
              {selectedPitch.balls ?? "-"}-{selectedPitch.strikes ?? "-"}
            </strong>
          </div>
          <div>
            <span>Description</span>
            <strong>{formatDetail(selectedPitch.description)}</strong>
          </div>
          <div>
            <span>Location</span>
            <strong>Pitcher view</strong>
          </div>
          <button
            className="detail-close-button clear-selection-button"
            onClick={() => setSelectedPitch(null)}
            type="button"
          >
            Clear Selection
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default StrikeZoneChart;
