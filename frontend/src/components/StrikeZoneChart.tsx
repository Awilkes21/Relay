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
const zoneCenterX = (zoneLeft + zoneRight) / 2;
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

const descriptionLabels: Record<string, string> = {
  ball: "Ball",
  called_strike: "Called Strike",
  blocked_ball: "Blocked Ball",
  swinging_strike: "Swinging Strike",
  swinging_strike_blocked: "Swinging Strike, Blocked",
  foul: "Foul",
  foul_tip: "Foul Tip",
  foul_bunt: "Foul Bunt",
  missed_bunt: "Missed Bunt",
  hit_by_pitch: "Hit By Pitch",
  hit_into_play: "Ball In Play",
  hit_into_play_no_out: "Ball In Play, No Out",
  hit_into_play_score: "Ball In Play, Run Scores",
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

function formatDetail(value: string | number | null) {
  return value ?? "-";
}

function titleCaseCode(value: string | null | undefined) {
  if (!value) return "-";
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDescription(value: string | null | undefined) {
  if (!value) return "-";
  return descriptionLabels[value] ?? titleCaseCode(value);
}

function formatEvent(value: string | null | undefined) {
  return titleCaseCode(value);
}

function formatPitchResult(pitch: PitchResult) {
  return pitch.events ? formatEvent(pitch.events) : formatDescription(pitch.description);
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
  return titleCaseCode(value);
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

function describePitchLocation(pitch: PlottedPitch) {
  const x = pitcherViewX(pitch.plate_x);
  const z = pitch.plate_z;
  const vertical =
    z > zoneTop
      ? "Above Zone"
      : z < zoneBottom
        ? "Below Zone"
        : z >= zoneMiddle
          ? "Upper"
          : "Lower";
  const horizontal =
    x < zoneLeft
      ? "Outside Left"
      : x > zoneRight
        ? "Outside Right"
        : x < zoneCenterX - 0.2
          ? "Left Side"
          : x > zoneCenterX + 0.2
            ? "Right Side"
            : "Middle";

  if (vertical === "Above Zone" || vertical === "Below Zone") {
    return horizontal === "Middle" ? vertical : `${vertical}, ${horizontal}`;
  }

  return horizontal === "Middle" ? `${vertical} Middle` : `${vertical} ${horizontal}`;
}

function StrikeZoneChart({ pitches }: StrikeZoneChartProps) {
  const plottedPitches = pitches.filter(hasLocation);
  const [selectedPitch, setSelectedPitch] = useState<PlottedPitch | null>(null);
  const [hoveredPitch, setHoveredPitch] = useState<PlottedPitch | null>(null);
  const [zoom, setZoom] = useState<(typeof zoomLevels)[number]>(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const domain = domainForZoom(zoom);
  const tooltipPitch = hoveredPitch ?? selectedPitch;
  const legendItems = useMemo(
    () =>
      Array.from(
        new Set(plottedPitches.map((pitch) => pitch.pitch_type ?? "Unknown")),
      ).sort(),
    [plottedPitches],
  );

  useEffect(() => {
    setSelectedPitch(null);
    setHoveredPitch(null);
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

  function pitchPoint(pitch: PlottedPitch) {
    return {
      x: scaleX(pitcherViewX(pitch.plate_x), domain),
      y: scaleZ(pitch.plate_z, domain),
    };
  }

  function tooltipPosition(point: { x: number; y: number }) {
    const tooltipWidth = 190;
    const tooltipHeight = 116;

    return {
      x: Math.min(Math.max(point.x + 14, padding), width - padding - tooltipWidth),
      y: Math.min(Math.max(point.y - tooltipHeight - 10, padding), height - padding - tooltipHeight),
      width: tooltipWidth,
      height: tooltipHeight,
    };
  }

  function renderPitchTooltip(pitch: PlottedPitch) {
    const point = pitchPoint(pitch);
    const tooltip = tooltipPosition(point);

    return (
      <g
        className="chart-tooltip"
        pointerEvents="none"
        transform={`translate(${tooltip.x} ${tooltip.y})`}
      >
        <rect height={tooltip.height} rx="8" width={tooltip.width} />
        <text className="chart-tooltip-title" x="12" y="21">
          {formatPitchType(pitch.pitch_type)}
        </text>
        <text x="12" y="45">Velo {formatDetail(pitch.release_speed)} | Spin {formatSpin(pitch.release_spin_rate)}</text>
        <text x="12" y="64">Count {pitch.balls ?? "-"}-{pitch.strikes ?? "-"} | {formatPitchResult(pitch)}</text>
        <text x="12" y="83">IVB {formatBreak(pitch.pfx_z)} | HB {formatBreak(pitch.pfx_x)}</text>
        <text x="12" y="102">EV {formatContactNumber(pitch.launch_speed, "mph")}</text>
      </g>
    );
  }

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
            {plottedPitches.map((pitch, index) => {
              const point = pitchPoint(pitch);

              return (
                <circle
                  className={
                    selectedPitch === pitch
                      ? "pitch-point pitch-point--selected"
                      : "pitch-point"
                  }
                  cx={point.x}
                  cy={point.y}
                  fill={pitchColor(pitch.pitch_type)}
                  key={`${pitch.plate_x}-${pitch.plate_z}-${index}`}
                  onClick={() =>
                    setSelectedPitch((current) => (current === pitch ? null : pitch))
                  }
                  onFocus={() => setHoveredPitch(pitch)}
                  onBlur={() => setHoveredPitch(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedPitch((current) => (current === pitch ? null : pitch));
                    }
                  }}
                  onMouseEnter={() => setHoveredPitch(pitch)}
                  onMouseLeave={() => setHoveredPitch(null)}
                  r="5"
                  tabIndex={0}
                />
              );
            })}
          </g>
          {tooltipPitch ? renderPitchTooltip(tooltipPitch) : null}
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
            <span>Result</span>
            <strong>{formatPitchResult(selectedPitch)}</strong>
          </div>
          <div>
            <span>Location</span>
            <strong>{describePitchLocation(selectedPitch)}</strong>
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
