import { useEffect, useState } from "react";
import type { PitchResult } from "../api";

type MovementChartProps = {
  pitches: PitchResult[];
};

type PlottedMovementPitch = PitchResult & {
  horizontalBreak: number;
  inducedVerticalBreak: number;
  armSlot: number | null;
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

function estimateArmSlot(pitch: PitchResult) {
  if (pitch.release_pos_x === null || pitch.release_pos_z === null) return null;
  return (Math.atan2(Math.abs(pitch.release_pos_x), pitch.release_pos_z) * 180) / Math.PI;
}

function formatArmSlot(angle: number | null) {
  return angle === null ? "Arm slot: unavailable" : `Arm slot: ${angle.toFixed(0)} deg est.`;
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

function MovementChart({ pitches }: MovementChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState<PlottedMovementPitch | null>(null);
  const handedness = pitcherHandedness(pitches);
  const sideLabels = horizontalSideLabels(handedness);
  const plottedPitches = pitches
    .filter((pitch) => pitch.pfx_x !== null && pitch.pfx_z !== null)
    .map((pitch): PlottedMovementPitch => ({
      ...pitch,
      horizontalBreak: pitcherViewHorizontalBreak(pitch.pfx_x ?? 0),
      inducedVerticalBreak: (pitch.pfx_z ?? 0) * 12,
      armSlot: estimateArmSlot(pitch),
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

  useEffect(() => {
    setSelectedPitch(null);
  }, [pitches]);

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
        <button
          className="secondary-button"
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
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
          {plottedPitches.map((pitch, index) => {
            return (
              <circle
                className={
                  selectedPitch === pitch
                    ? "pitch-point pitch-point--selected"
                    : "pitch-point"
                }
                cx={scaleX(pitch.horizontalBreak, domainMax)}
                cy={scaleY(pitch.inducedVerticalBreak, domainMax)}
                fill={pitchColor(pitch.pitch_type)}
                key={`${pitch.horizontalBreak}-${pitch.inducedVerticalBreak}-${index}`}
                onClick={() => setSelectedPitch(pitch)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedPitch(pitch);
                  }
                }}
                r="5"
                tabIndex={0}
              >
                <title>
                  {[
                    `Pitch: ${pitch.pitch_type ?? ""}`,
                    `Horizontal: ${pitch.horizontalBreak.toFixed(1)} in (pitcher view)`,
                    `Vertical: ${pitch.inducedVerticalBreak.toFixed(1)} in`,
                    `Velocity: ${pitch.release_speed ?? ""}`,
                    `Throws: ${pitch.p_throws ?? ""}`,
                    formatArmSlot(pitch.armSlot),
                  ].join("\n")}
                </title>
              </circle>
            );
          })}
        </svg>
        {plottedPitches.length === 0 ? (
          <p className="chart-empty">No movement values to plot.</p>
        ) : null}
      </div>

      {selectedPitch ? (
        <div className="pitch-detail-panel">
          <div>
            <span>Pitch</span>
            <strong>{formatDetail(selectedPitch.pitch_type)}</strong>
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
            <span>Arm Slot</span>
            <strong>
              {selectedPitch.armSlot === null
                ? "Unavailable"
                : `${formatNumber(selectedPitch.armSlot, 0)} deg est.`}
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
            className="detail-close-button"
            onClick={() => setSelectedPitch(null)}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default MovementChart;
