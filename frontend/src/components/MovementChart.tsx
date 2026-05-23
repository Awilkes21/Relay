import { useEffect, useState } from "react";
import type { PitchResult } from "../api";
import { formatPitchType } from "../pitchTypes";

type MovementChartProps = {
  pitches: PitchResult[];
};

type PlottedMovementPitch = PitchResult & {
  horizontalBreak: number;
  inducedVerticalBreak: number;
  armAngle: number | null;
};

const width = 560;
const height = 560;
const padding = 92;
const minDomainInches = 30;
const domainPaddingInches = 3;

const pitchColors: Record<string, string> = {
  FF: "#1d4f7a",
  SI: "#287271",
  SL: "#b5651d",
  CH: "#7b4ea3",
  CU: "#9a3326",
  FC: "#44633f",
  FS: "#4b5565",
};

function scaleX(value: number, domainMax: number) {
  return padding + ((value + domainMax) / (domainMax * 2)) * (width - padding * 2);
}

function scaleY(value: number, domainMax: number) {
  return height - padding - ((value + domainMax) / (domainMax * 2)) * (height - padding * 2);
}

function pitchColor(pitchType: string | null) {
  return pitchType ? pitchColors[pitchType] ?? "#2f6f9f" : "#7f92a8";
}

function pitcherViewHorizontalBreak(pfxX: number) {
  return pfxX * -12;
}

function pitcherHandedness(pitches: PitchResult[]) {
  const hands = new Set(
    pitches
      .map((pitch) => pitch.p_throws)
      .filter((hand): hand is string => hand === "L" || hand === "R"),
  );
  return hands.size === 1 ? Array.from(hands)[0] : null;
}

function horizontalSideLabels(handedness: string | null) {
  if (handedness === "R") {
    return { left: "Glove Side", right: "Arm Side" };
  }
  if (handedness === "L") {
    return { left: "Arm Side", right: "Glove Side" };
  }
  return { left: "Pitcher Left", right: "Pitcher Right" };
}

function formatArmAngle(angle: number | null) {
  return angle === null ? "Arm angle: unavailable" : `Arm angle: ${angle.toFixed(0)} deg`;
}

function formatDetail(value: string | number | null) {
  return value ?? "-";
}

function formatNumber(value: number | null, digits = 1) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatSpin(value: number | null) {
  return value === null ? "-" : `${Math.round(value)} rpm`;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function armAngleLine(
  angle: number | null,
  handedness: string | null,
  centerX: number,
  centerY: number,
  radius: number,
) {
  if (angle === null) return null;
  const direction = handedness === "L" ? -1 : 1;
  const radians = (angle * Math.PI) / 180;
  return {
    x2: centerX + Math.cos(radians) * radius * direction,
    y2: centerY - Math.sin(radians) * radius,
  };
}

function MovementChart({ pitches }: MovementChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState<PlottedMovementPitch | null>(null);
  const [hoveredPitch, setHoveredPitch] = useState<PlottedMovementPitch | null>(null);
  const handedness = pitcherHandedness(pitches);
  const sideLabels = horizontalSideLabels(handedness);
  const plottedPitches = pitches
    .filter((pitch) => pitch.pfx_x !== null && pitch.pfx_z !== null)
    .map((pitch): PlottedMovementPitch => ({
      ...pitch,
      horizontalBreak: pitcherViewHorizontalBreak(pitch.pfx_x ?? 0),
      inducedVerticalBreak: (pitch.pfx_z ?? 0) * 12,
      armAngle: pitch.arm_angle,
    }));
  const maxMovement = plottedPitches.reduce(
    (currentMax, pitch) =>
      Math.max(
        currentMax,
        Math.abs(pitch.horizontalBreak),
        Math.abs(pitch.inducedVerticalBreak),
      ),
    0,
  );
  const domainMax = Math.max(minDomainInches, Math.ceil(maxMovement + domainPaddingInches));
  const centerX = scaleX(0, domainMax);
  const centerY = scaleY(0, domainMax);
  const plotRadius = (width - padding * 2) / 2;
  const ringValues = [10, 20, 30].filter((value) => value < domainMax);
  const ringValuesWithOuter = [...ringValues, domainMax];
  const averageArmSlot = average(
    plottedPitches
      .map((pitch) => pitch.armAngle)
      .filter((angle): angle is number => angle !== null),
  );
  const armSlotLine = armAngleLine(
    averageArmSlot,
    handedness,
    centerX,
    centerY,
    plotRadius,
  );
  const plottedPitchTypes = Array.from(
    new Set(plottedPitches.map((pitch) => pitch.pitch_type).filter(Boolean)),
  ).sort((a, b) => formatPitchType(a).localeCompare(formatPitchType(b)));
  const tooltipPitch = hoveredPitch ?? selectedPitch;

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

  function movementPoint(pitch: PlottedMovementPitch) {
    return {
      x: scaleX(pitch.horizontalBreak, domainMax),
      y: scaleY(pitch.inducedVerticalBreak, domainMax),
    };
  }

  function tooltipPosition(point: { x: number; y: number }) {
    const tooltipWidth = 196;
    const tooltipHeight = 100;

    return {
      x: Math.min(Math.max(point.x + 14, padding), width - padding - tooltipWidth),
      y: Math.min(Math.max(point.y - tooltipHeight - 10, padding), height - padding - tooltipHeight),
      width: tooltipWidth,
      height: tooltipHeight,
    };
  }

  function renderPitchTooltip(pitch: PlottedMovementPitch) {
    const point = movementPoint(pitch);
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
        <text x="12" y="64">HB {pitch.horizontalBreak.toFixed(1)}" | IVB {pitch.inducedVerticalBreak.toFixed(1)}"</text>
        <text x="12" y="83">{formatArmAngle(pitch.armAngle)} | Throws {formatDetail(pitch.p_throws)}</text>
      </g>
    );
  }

  return (
    <section
      className={isExpanded ? "chart-panel chart-panel--expanded" : "chart-panel"}
      aria-labelledby="movement-title"
    >
      <div className="chart-heading">
        <h3 id="movement-title">Movement</h3>
        <span>{plottedPitches.length} plotted pitches | pitcher view</span>
      </div>

      <div className="chart-tools">
        <span className="chart-view-note">
          {sideLabels.left} / {sideLabels.right} | Rise / Drop
        </span>
        <div className="chart-controls">
          <div className="pitch-legend movement-pitch-legend" aria-label="Pitch type colors">
            {plottedPitchTypes.map((pitchType) => (
              <span className="legend-item" key={pitchType}>
                <i
                  className="legend-swatch"
                  style={{ backgroundColor: pitchColor(pitchType) }}
                />
                {formatPitchType(pitchType)}
              </span>
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
          aria-label="Pitch movement scatter plot"
          className="strike-zone-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <circle
            className="movement-plot-background"
            cx={centerX}
            cy={centerY}
            r={plotRadius}
          />
          {plottedPitches.length > 0
            ? ringValuesWithOuter.map((ringValue) => {
                const radius = (ringValue / domainMax) * plotRadius;
                const labelPositions = [
                  [centerX - radius, centerY],
                  [centerX + radius, centerY],
                  [centerX, centerY - radius],
                  [centerX, centerY + radius],
                ];
                return (
                  <g key={ringValue}>
                    <circle
                      className="movement-ring"
                      cx={centerX}
                      cy={centerY}
                      r={radius}
                    />
                    {labelPositions.map(([x, y]) => (
                      <text
                        className="plot-label movement-ring-label"
                        key={`${ringValue}-${x}-${y}`}
                        x={x}
                        y={y}
                      >
                        {ringValue}"
                      </text>
                    ))}
                  </g>
                );
              })
            : null}
          <line
            className="plot-axis"
            x1={centerX}
            x2={centerX}
            y1={centerY - plotRadius}
            y2={centerY + plotRadius}
          />
          <line
            className="plot-axis"
            x1={centerX - plotRadius}
            x2={centerX + plotRadius}
            y1={centerY}
            y2={centerY}
          />
          <text className="plot-label movement-label movement-label--top" x={centerX} y={padding - 28}>
            Rise
          </text>
          <text className="plot-label movement-label movement-label--bottom" x={centerX} y={height - padding + 46}>
            Drop
          </text>
          <text className="plot-label movement-label movement-label--left" x={8} y={centerY}>
            {sideLabels.left}
          </text>
          <text className="plot-label movement-label movement-label--right" x={width - 8} y={centerY}>
            {sideLabels.right}
          </text>
          {armSlotLine ? (
            <g>
              <line
                className="movement-arm-angle-line"
                x1={centerX}
                x2={armSlotLine.x2}
                y1={centerY}
                y2={armSlotLine.y2}
              />
              <text
                className="plot-label movement-arm-angle-label"
                x={armSlotLine.x2}
                y={armSlotLine.y2 - 8}
              >
                Arm {formatNumber(averageArmSlot, 0)} deg
              </text>
            </g>
          ) : null}
          {plottedPitches.map((pitch, index) => {
            const point = movementPoint(pitch);
            return (
              <g key={`${pitch.horizontalBreak}-${pitch.inducedVerticalBreak}-${index}`}>
                <circle
                  className={
                    selectedPitch === pitch
                      ? "pitch-point pitch-point--selected"
                      : "pitch-point"
                  }
                  cx={point.x}
                  cy={point.y}
                  fill={pitchColor(pitch.pitch_type)}
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
              </g>
            );
          })}
          {tooltipPitch ? renderPitchTooltip(tooltipPitch) : null}
        </svg>
        {plottedPitches.length === 0 ? (
          <p className="chart-empty">No movement values to plot.</p>
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
            <span>Horizontal</span>
            <strong>{selectedPitch.horizontalBreak.toFixed(1)} in</strong>
          </div>
          <div>
            <span>Vertical</span>
            <strong>{selectedPitch.inducedVerticalBreak.toFixed(1)} in</strong>
          </div>
          <div>
            <span>Arm Angle</span>
            <strong>
              {selectedPitch.armAngle === null
                ? "Unavailable"
                : `${formatNumber(selectedPitch.armAngle, 0)} deg`}
            </strong>
          </div>
          <div>
            <span>Throws</span>
            <strong>{formatDetail(selectedPitch.p_throws)}</strong>
          </div>
          <div>
            <span>View</span>
            <strong>Pitcher</strong>
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

export default MovementChart;
