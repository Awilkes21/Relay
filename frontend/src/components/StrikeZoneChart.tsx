import type { PitchResult } from "../api";

type StrikeZoneChartProps = {
  pitches: PitchResult[];
};

type PlottedPitch = PitchResult & {
  plate_x: number;
  plate_z: number;
};

const width = 420;
const height = 360;
const padding = 36;
const xMin = -2.5;
const xMax = 2.5;
const zMin = 0;
const zMax = 5;
const zoneLeft = -0.83;
const zoneRight = 0.83;
const zoneTop = 3.5;
const zoneBottom = 1.5;

const pitchColors: Record<string, string> = {
  FF: "#1d4f7a",
  SI: "#287271",
  SL: "#b5651d",
  CH: "#7b4ea3",
  CU: "#9a3326",
  FC: "#44633f",
  FS: "#4b5565",
};

function scaleX(value: number) {
  return padding + ((value - xMin) / (xMax - xMin)) * (width - padding * 2);
}

function scaleZ(value: number) {
  return height - padding - ((value - zMin) / (zMax - zMin)) * (height - padding * 2);
}

function pitchColor(pitchType: string | null) {
  return pitchType ? pitchColors[pitchType] ?? "#2f6f9f" : "#7f92a8";
}

function formatTooltip(pitch: PitchResult) {
  const count =
    pitch.balls === null && pitch.strikes === null
      ? "Count: "
      : `Count: ${pitch.balls ?? ""}-${pitch.strikes ?? ""}`;

  return [
    `Pitch: ${pitch.pitch_type ?? ""}`,
    `Velocity: ${pitch.release_speed ?? ""}`,
    `Description: ${pitch.description ?? ""}`,
    count,
  ].join("\n");
}

function hasLocation(pitch: PitchResult): pitch is PlottedPitch {
  return pitch.plate_x !== null && pitch.plate_z !== null;
}

function StrikeZoneChart({ pitches }: StrikeZoneChartProps) {
  const plottedPitches = pitches.filter(hasLocation);

  return (
    <section className="chart-panel" aria-labelledby="strike-zone-title">
      <div className="chart-heading">
        <h3 id="strike-zone-title">Strike Zone</h3>
        <span>{plottedPitches.length} plotted pitches</span>
      </div>

      <div className="strike-zone-frame">
        <svg
          aria-label="Strike zone pitch location scatter plot"
          className="strike-zone-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <rect
            className="plot-background"
            x={padding}
            y={padding}
            width={width - padding * 2}
            height={height - padding * 2}
          />
          <line
            className="plot-axis"
            x1={scaleX(0)}
            x2={scaleX(0)}
            y1={padding}
            y2={height - padding}
          />
          <line
            className="plot-axis"
            x1={padding}
            x2={width - padding}
            y1={scaleZ(zoneBottom)}
            y2={scaleZ(zoneBottom)}
          />
          <rect
            className="strike-zone-box"
            x={scaleX(zoneLeft)}
            y={scaleZ(zoneTop)}
            width={scaleX(zoneRight) - scaleX(zoneLeft)}
            height={scaleZ(zoneBottom) - scaleZ(zoneTop)}
          />
          {plottedPitches.map((pitch, index) => (
            <circle
              className="pitch-point"
              cx={scaleX(pitch.plate_x)}
              cy={scaleZ(pitch.plate_z)}
              fill={pitchColor(pitch.pitch_type)}
              key={`${pitch.plate_x}-${pitch.plate_z}-${index}`}
              r="5"
            >
              <title>{formatTooltip(pitch)}</title>
            </circle>
          ))}
        </svg>

        {plottedPitches.length === 0 ? (
          <p className="chart-empty">No pitch locations to plot.</p>
        ) : null}
      </div>
    </section>
  );
}

export default StrikeZoneChart;
