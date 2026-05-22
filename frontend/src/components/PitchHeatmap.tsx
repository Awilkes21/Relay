import { useEffect, useState, type PointerEvent } from "react";
import type { HeatmapMode, PitchHeatmapResponse } from "../api";

type PitchHeatmapProps = {
  heatmap: PitchHeatmapResponse | null;
  mode: HeatmapMode;
  isLoading: boolean;
  onModeChange: (mode: HeatmapMode) => void;
};

type SelectionCircle = {
  cx: number;
  cy: number;
  r: number;
};

type BrushInteraction =
  | {
      type: "draw";
      pointerId: number;
    }
  | {
      type: "move";
      pointerId: number;
      offsetX: number;
      offsetY: number;
    };

const heatmapModes: Array<{ value: HeatmapMode; label: string }> = [
  { value: "all", label: "All Pitches" },
  { value: "whiffs", label: "Whiffs" },
  { value: "hard_contact", label: "Hard Contact" },
  { value: "in_zone", label: "In Zone" },
];

const width = 560;
const height = 460;
const padding = 46;
const zoneLeft = -0.83;
const zoneRight = 0.83;
const zoneTop = 3.5;
const zoneBottom = 1.5;
const zoneMiddle = (zoneTop + zoneBottom) / 2;

function scaleX(value: number, heatmap: PitchHeatmapResponse) {
  const { x_min: xMin, x_max: xMax } = heatmap.domain;
  return padding + ((value - xMin) / (xMax - xMin)) * (width - padding * 2);
}

function scaleZ(value: number, heatmap: PitchHeatmapResponse) {
  const { z_min: zMin, z_max: zMax } = heatmap.domain;
  return height - padding - ((value - zMin) / (zMax - zMin)) * (height - padding * 2);
}

function pitcherViewX(value: number) {
  return value * -1;
}

function interpolateColor(
  start: [number, number, number],
  end: [number, number, number],
  amount: number,
) {
  return start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * amount),
  ) as [number, number, number];
}

function heatColor(density: number) {
  const easedDensity = Math.sqrt(Math.max(0, Math.min(density, 1)));
  const low: [number, number, number] = [222, 179, 151];
  const mid: [number, number, number] = [194, 103, 76];
  const high: [number, number, number] = [142, 43, 36];
  const color =
    easedDensity < 0.5
      ? interpolateColor(low, mid, easedDensity * 2)
      : interpolateColor(mid, high, (easedDensity - 0.5) * 2);
  const alpha = 0.18 + easedDensity * 0.72;
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(2)})`;
}

function cellGeometry(cell: { x_start: number; x_end: number; z_start: number; z_end: number }, heatmap: PitchHeatmapResponse) {
  const xStart = scaleX(pitcherViewX(cell.x_end), heatmap);
  const xEnd = scaleX(pitcherViewX(cell.x_start), heatmap);
  const yTop = scaleZ(cell.z_end, heatmap);
  const yBottom = scaleZ(cell.z_start, heatmap);
  const width = Math.max(xEnd - xStart, 0);
  const height = Math.max(yBottom - yTop, 0);

  return {
    xStart,
    xEnd,
    yTop,
    yBottom,
    width,
    height,
    centerX: xStart + width / 2,
    centerY: yTop + height / 2,
  };
}

function formatNumber(value: number | null, digits = 1) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`;
}

function isCellInZone(cell: PitchHeatmapResponse["cells"][number]) {
  const xCenter = (cell.x_start + cell.x_end) / 2;
  const zCenter = (cell.z_start + cell.z_end) / 2;
  return xCenter >= zoneLeft && xCenter <= zoneRight && zCenter >= zoneBottom && zCenter <= zoneTop;
}

function describeCellLocation(cell: PitchHeatmapResponse["cells"][number]) {
  const pitcherViewCenterX = pitcherViewX((cell.x_start + cell.x_end) / 2);
  const zCenter = (cell.z_start + cell.z_end) / 2;
  const vertical = zCenter > zoneTop ? "Above Zone" : zCenter < zoneBottom ? "Below Zone" : zCenter >= zoneMiddle ? "High" : "Low";
  const horizontal =
    Math.abs(pitcherViewCenterX) < 0.3
      ? "Center"
      : pitcherViewCenterX < 0
        ? "Pitcher Left"
        : "Pitcher Right";

  if (vertical === "Above Zone" || vertical === "Below Zone") {
    return horizontal === "Center" ? vertical : `${vertical}, ${horizontal}`;
  }
  return `${vertical} ${horizontal}`;
}

function cellTooltip(cell: PitchHeatmapResponse["cells"][number], modeLabel: string) {
  return [
    `${cell.count} pitches`,
    `${formatRate(cell.share)} of filtered pitches`,
    `${describeCellLocation(cell)} | ${isCellInZone(cell) ? "In Zone" : "Out of Zone"}`,
    `Mode: ${modeLabel}`,
    `Hotness: ${formatRate(cell.density)} of max cell`,
    `Average velocity: ${formatNumber(cell.average_velocity)} mph`,
    `Top pitch: ${cell.top_pitch_type ?? "-"} (${formatRate(cell.top_pitch_share)})`,
    `Average exit velocity: ${formatNumber(cell.average_exit_velocity)} mph`,
    `Max exit velocity: ${formatNumber(cell.max_exit_velocity)} mph`,
  ].join("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cellInCircle(
  cell: PitchHeatmapResponse["cells"][number],
  heatmap: PitchHeatmapResponse,
  circle: SelectionCircle,
) {
  const geometry = cellGeometry(cell, heatmap);
  const distance = Math.hypot(geometry.centerX - circle.cx, geometry.centerY - circle.cy);
  return distance <= circle.r;
}

function weightedAverage(
  cells: PitchHeatmapResponse["cells"],
  field: "average_velocity" | "average_exit_velocity",
) {
  const totals = cells.reduce(
    (current, cell) => {
      const value = cell[field];
      if (value === null) return current;
      return {
        weighted: current.weighted + value * cell.count,
        count: current.count + cell.count,
      };
    },
    { weighted: 0, count: 0 },
  );
  return totals.count ? totals.weighted / totals.count : null;
}

function summarizeSelectedArea(cells: PitchHeatmapResponse["cells"]) {
  const pitchCount = cells.reduce((sum, cell) => sum + cell.count, 0);
  const share = cells.reduce((sum, cell) => sum + cell.share, 0);
  const maxExitVelocity = cells.reduce<number | null>(
    (current, cell) =>
      cell.max_exit_velocity === null
        ? current
        : current === null
          ? cell.max_exit_velocity
          : Math.max(current, cell.max_exit_velocity),
    null,
  );
  const topPitchCounts = cells.reduce((counts, cell) => {
    if (cell.top_pitch_type && cell.top_pitch_count) {
      counts.set(
        cell.top_pitch_type,
        (counts.get(cell.top_pitch_type) ?? 0) + cell.top_pitch_count,
      );
    }
    return counts;
  }, new Map<string, number>());
  const topPitch = Array.from(topPitchCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    pitchCount,
    share,
    averageVelocity: weightedAverage(cells, "average_velocity"),
    averageExitVelocity: weightedAverage(cells, "average_exit_velocity"),
    maxExitVelocity,
    topPitchType: topPitch?.[0] ?? null,
    topPitchShare: topPitch && pitchCount ? topPitch[1] / pitchCount : null,
    cellCount: cells.length,
  };
}

function minBrushRadius(heatmap: PitchHeatmapResponse) {
  return Math.max(
    (width - padding * 2) / heatmap.x_bins,
    (height - padding * 2) / heatmap.z_bins,
  );
}

function constrainCircle(circle: SelectionCircle) {
  const maxRadius = Math.min(
    circle.cx - padding,
    width - padding - circle.cx,
    circle.cy - padding,
    height - padding - circle.cy,
  );
  const r = clamp(circle.r, 0, Math.max(maxRadius, 0));

  return {
    cx: clamp(circle.cx, padding + r, width - padding - r),
    cy: clamp(circle.cy, padding + r, height - padding - r),
    r,
  };
}

function constrainMovedCircle(cx: number, cy: number, r: number) {
  return {
    cx: clamp(cx, padding + r, width - padding - r),
    cy: clamp(cy, padding + r, height - padding - r),
    r,
  };
}

function pointInsideCircle(point: { x: number; y: number }, circle: SelectionCircle) {
  return Math.hypot(point.x - circle.cx, point.y - circle.cy) <= circle.r;
}

function PitchHeatmap({ heatmap, mode, isLoading, onModeChange }: PitchHeatmapProps) {
  const cells = heatmap?.cells ?? [];
  const cellByBin = new Map(cells.map((cell) => [`${cell.x_bin}-${cell.z_bin}`, cell]));
  const gridCells = heatmap
    ? Array.from({ length: heatmap.x_bins * heatmap.z_bins }, (_, index) => {
        const xBin = index % heatmap.x_bins;
        const zBin = Math.floor(index / heatmap.x_bins);
        return {
          x_bin: xBin,
          z_bin: zBin,
          x_start:
            heatmap.domain.x_min +
            (xBin / heatmap.x_bins) * (heatmap.domain.x_max - heatmap.domain.x_min),
          x_end:
            heatmap.domain.x_min +
            ((xBin + 1) / heatmap.x_bins) * (heatmap.domain.x_max - heatmap.domain.x_min),
          z_start:
            heatmap.domain.z_min +
            (zBin / heatmap.z_bins) * (heatmap.domain.z_max - heatmap.domain.z_min),
          z_end:
            heatmap.domain.z_min +
            ((zBin + 1) / heatmap.z_bins) * (heatmap.domain.z_max - heatmap.domain.z_min),
        };
      })
    : [];
  const modeLabel = heatmapModes.find((item) => item.value === mode)?.label ?? "All Pitches";
  const [selectionCircle, setSelectionCircle] = useState<SelectionCircle | null>(null);
  const [draftCircle, setDraftCircle] = useState<SelectionCircle | null>(null);
  const [brushInteraction, setBrushInteraction] = useState<BrushInteraction | null>(null);
  const activeCircle = draftCircle ?? selectionCircle;
  const selectedCells =
    heatmap && selectionCircle
      ? cells.filter((cell) => cellInCircle(cell, heatmap, selectionCircle))
      : [];
  const selectedSummary = summarizeSelectedArea(selectedCells);

  useEffect(() => {
    setSelectionCircle(null);
    setDraftCircle(null);
    setBrushInteraction(null);
  }, [heatmap]);

  function pointerPoint(event: PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * width, padding, width - padding),
      y: clamp(((event.clientY - rect.top) / rect.height) * height, padding, height - padding),
    };
  }

  function startSelection(event: PointerEvent<SVGRectElement>) {
    const point = pointerPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    if (selectionCircle && pointInsideCircle(point, selectionCircle)) {
      setBrushInteraction({
        type: "move",
        pointerId: event.pointerId,
        offsetX: point.x - selectionCircle.cx,
        offsetY: point.y - selectionCircle.cy,
      });
      return;
    }

    setBrushInteraction({ type: "draw", pointerId: event.pointerId });
    setSelectionCircle(null);
    setDraftCircle({ cx: point.x, cy: point.y, r: 0 });
  }

  function updateSelection(event: PointerEvent<SVGRectElement>) {
    if (!brushInteraction) return;
    const point = pointerPoint(event);
    if (!point) return;

    if (brushInteraction.type === "move" && selectionCircle) {
      setSelectionCircle(
        constrainMovedCircle(
          point.x - brushInteraction.offsetX,
          point.y - brushInteraction.offsetY,
          selectionCircle.r,
        ),
      );
      return;
    }

    if (brushInteraction.type === "draw" && draftCircle) {
      setDraftCircle(
        constrainCircle({
          ...draftCircle,
          r: Math.hypot(point.x - draftCircle.cx, point.y - draftCircle.cy),
        }),
      );
    }
  }

  function finishSelection(event: PointerEvent<SVGRectElement>) {
    if (!brushInteraction) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    if (brushInteraction.type === "draw" && draftCircle && heatmap) {
      setSelectionCircle(
        constrainCircle({ ...draftCircle, r: Math.max(draftCircle.r, minBrushRadius(heatmap)) }),
      );
      setDraftCircle(null);
    }
    setBrushInteraction(null);
  }

  function cancelSelection() {
    setDraftCircle(null);
    setBrushInteraction(null);
  }

  return (
    <section className="chart-panel" aria-labelledby="heatmap-title">
      <div className="chart-heading">
        <h3 id="heatmap-title">Pitch Heatmap</h3>
        <span>
          {isLoading
            ? "Loading..."
            : `${heatmap?.total_count ?? 0} located pitches | ${modeLabel.toLowerCase()}`}
        </span>
      </div>

      <div className="heatmap-tools">
        <div className="heatmap-mode-controls" aria-label="Heatmap mode">
          {heatmapModes.map((item) => (
            <button
              className={
                mode === item.value
                  ? "heatmap-mode-button is-active"
                  : "heatmap-mode-button"
              }
              key={item.value}
              onClick={() => onModeChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="heatmap-legend" aria-label="Heatmap intensity legend">
          <span>Less</span>
          <div className="heatmap-gradient" />
          <span>More</span>
        </div>
      </div>

      <div className="strike-zone-frame">
        {heatmap ? (
          <svg
            aria-label="Pitch location heatmap"
            className="strike-zone-chart heatmap-chart"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            <defs>
              <linearGradient id="heatmap-background-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fbfcfd" />
                <stop offset="100%" stopColor="#f0f4f7" />
              </linearGradient>
              <filter id="heatmap-soften">
                <feGaussianBlur stdDeviation="1.4" />
              </filter>
            </defs>
            <rect
              className="heatmap-background"
              x={padding}
              y={padding}
              width={width - padding * 2}
              height={height - padding * 2}
            />
            <g className="heatmap-grid-layer" aria-hidden="true">
              {gridCells.map((cell) => {
                const geometry = cellGeometry(cell, heatmap);
                const hasPitch = cellByBin.has(`${cell.x_bin}-${cell.z_bin}`);

                return (
                  <rect
                    className={hasPitch ? "heatmap-grid-cell has-data" : "heatmap-grid-cell"}
                    height={geometry.height}
                    key={`${cell.x_bin}-${cell.z_bin}`}
                    width={geometry.width}
                    x={geometry.xStart}
                    y={geometry.yTop}
                  />
                );
              })}
            </g>
            <g className="heatmap-density-layer" filter="url(#heatmap-soften)" pointerEvents="none">
              {cells.map((cell) => {
                const geometry = cellGeometry(cell, heatmap);
                const radiusScale = 1.05 + Math.sqrt(cell.density) * 0.5;

                return (
                  <ellipse
                    fill={heatColor(cell.density)}
                    cx={geometry.centerX}
                    cy={geometry.centerY}
                    key={`${cell.x_bin}-${cell.z_bin}`}
                    opacity="0.88"
                    rx={(geometry.width / 2) * radiusScale}
                    ry={(geometry.height / 2) * radiusScale}
                  />
                );
              })}
            </g>
            <rect
              aria-label="Draw a circular heatmap selection"
              className={
                selectionCircle
                  ? "heatmap-brush-target has-selection"
                  : "heatmap-brush-target"
              }
              height={height - padding * 2}
              onPointerCancel={cancelSelection}
              onPointerDown={startSelection}
              onPointerMove={updateSelection}
              onPointerUp={finishSelection}
              width={width - padding * 2}
              x={padding}
              y={padding}
            />
            {activeCircle ? (
              <circle
                className={
                  draftCircle
                    ? "heatmap-selection-circle is-drawing"
                    : "heatmap-selection-circle"
                }
                cx={activeCircle.cx}
                cy={activeCircle.cy}
                r={activeCircle.r}
              />
            ) : null}
            <line
              className="plot-axis"
              x1={scaleX(0, heatmap)}
              x2={scaleX(0, heatmap)}
              y1={padding}
              y2={height - padding}
            />
            <line
              className="plot-axis"
              x1={padding}
              x2={width - padding}
              y1={scaleZ(zoneMiddle, heatmap)}
              y2={scaleZ(zoneMiddle, heatmap)}
            />
            <rect
              className="strike-zone-box"
              x={scaleX(zoneLeft, heatmap)}
              y={scaleZ(zoneTop, heatmap)}
              width={scaleX(zoneRight, heatmap) - scaleX(zoneLeft, heatmap)}
              height={scaleZ(zoneBottom, heatmap) - scaleZ(zoneTop, heatmap)}
            />
          </svg>
        ) : null}

        {!isLoading && cells.length === 0 ? (
          <p className="chart-empty">No located pitches for this heatmap.</p>
        ) : null}
      </div>

      {selectionCircle ? (
        <div className="pitch-detail-panel">
          <div>
            <span>Selection</span>
            <strong>{selectedSummary.cellCount} cells</strong>
          </div>
          <div>
            <span>Radius</span>
            <strong>{selectionCircle.r.toFixed(0)} px</strong>
          </div>
          <div>
            <span>Pitches</span>
            <strong>{selectedSummary.pitchCount}</strong>
          </div>
          <div>
            <span>Share</span>
            <strong>{formatRate(selectedSummary.share)}</strong>
          </div>
          <div>
            <span>Top Pitch</span>
            <strong>
              {selectedSummary.topPitchType ?? "-"} ({formatRate(selectedSummary.topPitchShare)})
            </strong>
          </div>
          <div>
            <span>Avg Velo</span>
            <strong>{formatNumber(selectedSummary.averageVelocity)} mph</strong>
          </div>
          <div>
            <span>Avg EV</span>
            <strong>{formatNumber(selectedSummary.averageExitVelocity)} mph</strong>
          </div>
          <div>
            <span>Max EV</span>
            <strong>{formatNumber(selectedSummary.maxExitVelocity)} mph</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{modeLabel}</strong>
          </div>
          <button
            className="detail-close-button"
            onClick={() => setSelectionCircle(null)}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default PitchHeatmap;
