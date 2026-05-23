import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { HeatmapMode, PitchHeatmapResponse } from "../api";
import { formatPitchType } from "../pitchTypes";

type PitchHeatmapProps = {
  heatmap: PitchHeatmapResponse | null;
  mode: HeatmapMode;
  isLoading: boolean;
  onModeChange: (mode: HeatmapMode) => void;
  pitcherHand?: string | null;
  subtitle?: string;
  title?: string;
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
      type: "resize";
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
const resizeHitWidth = 9;

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

function horizontalSideLabels(pitcherHand?: string | null) {
  if (pitcherHand === "L") {
    return { left: "Arm Side", right: "Glove Side" };
  }

  if (pitcherHand === "R") {
    return { left: "Glove Side", right: "Arm Side" };
  }

  return { left: "Glove Side", right: "Arm Side" };
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

function heatRgb(density: number) {
  const easedDensity = Math.pow(Math.max(0, Math.min(density, 1)), 0.72);
  const low: [number, number, number] = [126, 156, 201];
  const mid: [number, number, number] = [239, 226, 222];
  const high: [number, number, number] = [190, 48, 54];

  return easedDensity < 0.5
    ? interpolateColor(low, mid, easedDensity * 2)
    : interpolateColor(mid, high, (easedDensity - 0.5) * 2);
}

function cellGeometry(
  cell: { x_start: number; x_end: number; z_start: number; z_end: number },
  heatmap: PitchHeatmapResponse,
) {
  const xStart = scaleX(pitcherViewX(cell.x_end), heatmap);
  const xEnd = scaleX(pitcherViewX(cell.x_start), heatmap);
  const yTop = scaleZ(cell.z_end, heatmap);
  const yBottom = scaleZ(cell.z_start, heatmap);
  const cellWidth = Math.max(xEnd - xStart, 0);
  const cellHeight = Math.max(yBottom - yTop, 0);

  return {
    xStart,
    xEnd,
    yTop,
    yBottom,
    width: cellWidth,
    height: cellHeight,
    centerX: xStart + cellWidth / 2,
    centerY: yTop + cellHeight / 2,
  };
}

function formatNumber(value: number | null, digits = 1) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawHeatmapCanvas(
  canvas: HTMLCanvasElement,
  heatmap: PitchHeatmapResponse,
  mode: HeatmapMode,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const pixelRatio = window.devicePixelRatio || 1;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, padding, 0, height - padding);
  background.addColorStop(0, "#fbfcfd");
  background.addColorStop(1, "#f0f4f7");
  context.fillStyle = background;
  context.fillRect(padding, padding, plotWidth, plotHeight);
  context.strokeStyle = "#d9dee7";
  context.lineWidth = 1;
  context.strokeRect(padding, padding, plotWidth, plotHeight);

  if (heatmap.cells.length === 0) return;

  const sampleWidth = 260;
  const sampleHeight = 210;
  const field = new Float32Array(sampleWidth * sampleHeight);
  const binWidth = plotWidth / heatmap.x_bins;
  const binHeight = plotHeight / heatmap.z_bins;
  const baseSigma = Math.max(binWidth, binHeight);
  const sigma = baseSigma * (mode === "hard_contact" || mode === "whiffs" ? 1.25 : 1.45);
  const influenceRadius = sigma * 2.8;
  const points = heatmap.cells.map((cell) => {
    const geometry = cellGeometry(cell, heatmap);
    return { x: geometry.centerX, y: geometry.centerY, weight: cell.count };
  });
  let maxValue = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    const canvasY = padding + (y / (sampleHeight - 1)) * plotHeight;
    for (let x = 0; x < sampleWidth; x += 1) {
      const canvasX = padding + (x / (sampleWidth - 1)) * plotWidth;
      let value = 0;

      for (const point of points) {
        const dx = canvasX - point.x;
        const dy = canvasY - point.y;
        if (Math.abs(dx) > influenceRadius || Math.abs(dy) > influenceRadius) continue;
        value += point.weight * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      }

      const index = y * sampleWidth + x;
      field[index] = value;
      maxValue = Math.max(maxValue, value);
    }
  }

  if (maxValue <= 0) return;

  const image = new ImageData(sampleWidth, sampleHeight);
  for (let index = 0; index < field.length; index += 1) {
    const normalized = field[index] / maxValue;
    const cutoff = mode === "hard_contact" || mode === "whiffs" ? 0.09 : 0.065;
    const visibleValue = normalized <= cutoff ? 0 : (normalized - cutoff) / (1 - cutoff);
    const color = heatRgb(visibleValue);
    const alpha =
      visibleValue <= 0
        ? 0
        : Math.min(232, 18 + Math.pow(visibleValue, 0.92) * 210);
    const imageIndex = index * 4;

    image.data[imageIndex] = color[0];
    image.data[imageIndex + 1] = color[1];
    image.data[imageIndex + 2] = color[2];
    image.data[imageIndex + 3] = alpha;
  }

  const fieldCanvas = document.createElement("canvas");
  fieldCanvas.width = sampleWidth;
  fieldCanvas.height = sampleHeight;
  const fieldContext = fieldCanvas.getContext("2d");
  if (!fieldContext) return;

  fieldContext.putImageData(image, 0, 0);
  context.save();
  context.beginPath();
  if (mode === "in_zone") {
    context.rect(
      scaleX(zoneLeft, heatmap),
      scaleZ(zoneTop, heatmap),
      scaleX(zoneRight, heatmap) - scaleX(zoneLeft, heatmap),
      scaleZ(zoneBottom, heatmap) - scaleZ(zoneTop, heatmap),
    );
  } else {
    context.rect(padding, padding, plotWidth, plotHeight);
  }
  context.clip();
  context.imageSmoothingEnabled = true;
  context.drawImage(fieldCanvas, padding, padding, plotWidth, plotHeight);
  context.restore();
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

function PitchHeatmap({
  heatmap,
  mode,
  isLoading,
  onModeChange,
  pitcherHand,
  subtitle,
  title = "Pitch Heatmap",
}: PitchHeatmapProps) {
  const cells = heatmap?.cells ?? [];
  const modeLabel = heatmapModes.find((item) => item.value === mode)?.label ?? "All Pitches";
  const sideLabels = horizontalSideLabels(pitcherHand);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectionCircle, setSelectionCircle] = useState<SelectionCircle | null>(null);
  const [draftCircle, setDraftCircle] = useState<SelectionCircle | null>(null);
  const [brushInteraction, setBrushInteraction] = useState<BrushInteraction | null>(null);
  const activeCircle = draftCircle ?? selectionCircle;
  const selectedCells =
    heatmap && selectionCircle
      ? cells.filter((cell) => cellInCircle(cell, heatmap, selectionCircle))
      : [];
  const selectedSummary = summarizeSelectedArea(selectedCells);
  const hasSelectedPitches = selectedSummary.pitchCount > 0;

  useEffect(() => {
    setSelectionCircle(null);
    setDraftCircle(null);
    setBrushInteraction(null);
  }, [heatmap]);

  useEffect(() => {
    if (!canvasRef.current || !heatmap) return;
    drawHeatmapCanvas(canvasRef.current, heatmap, mode);
  }, [heatmap, mode]);

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectionCircle(null);
        setDraftCircle(null);
        setBrushInteraction(null);
      }
    }

    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  function pointerPoint(event: PointerEvent<SVGElement>) {
    const svg =
      event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * width, padding, width - padding),
      y: clamp(((event.clientY - rect.top) / rect.height) * height, padding, height - padding),
    };
  }

  function startSelection(event: PointerEvent<SVGElement>) {
    const point = pointerPoint(event);
    if (!point) return;

    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    if (selectionCircle) {
      const distanceFromCenter = Math.hypot(
        point.x - selectionCircle.cx,
        point.y - selectionCircle.cy,
      );
      const isOnBorder = Math.abs(distanceFromCenter - selectionCircle.r) <= resizeHitWidth;

      if (isOnBorder) {
        setBrushInteraction({ type: "resize", pointerId: event.pointerId });
        return;
      }

      if (distanceFromCenter < selectionCircle.r) {
        setBrushInteraction({
          type: "move",
          pointerId: event.pointerId,
          offsetX: point.x - selectionCircle.cx,
          offsetY: point.y - selectionCircle.cy,
        });
        return;
      }
    }

    setBrushInteraction({ type: "draw", pointerId: event.pointerId });
    setSelectionCircle(null);
    setDraftCircle({ cx: point.x, cy: point.y, r: 0 });
  }

  function updateSelection(event: PointerEvent<SVGElement>) {
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

    if (brushInteraction.type === "resize" && selectionCircle && heatmap) {
      setSelectionCircle(
        constrainCircle({
          ...selectionCircle,
          r: Math.max(
            Math.hypot(point.x - selectionCircle.cx, point.y - selectionCircle.cy),
            minBrushRadius(heatmap),
          ),
        }),
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

  function finishSelection(event: PointerEvent<SVGElement>) {
    if (!brushInteraction) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
        <div>
          <h3 id="heatmap-title">{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
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
          <div className="heatmap-canvas-wrap">
            <canvas
              aria-hidden="true"
              className="heatmap-canvas"
              height={height}
              ref={canvasRef}
              width={width}
            />
            <svg
              aria-label="Pitch location heatmap"
              className="heatmap-overlay"
              onPointerCancel={cancelSelection}
              onPointerMove={updateSelection}
              onPointerUp={finishSelection}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              <rect
                aria-label="Draw a circular heatmap selection"
                className={
                  selectionCircle
                    ? "heatmap-brush-target has-selection"
                    : "heatmap-brush-target"
                }
                height={height - padding * 2}
                onPointerDown={startSelection}
                width={width - padding * 2}
                x={padding}
                y={padding}
              />
              {activeCircle ? (
                <>
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
                  {!draftCircle ? (
                    <circle
                      aria-label="Move or resize heatmap selection"
                      className="heatmap-selection-hit-ring"
                      cx={activeCircle.cx}
                      cy={activeCircle.cy}
                      onPointerDown={startSelection}
                      r={activeCircle.r}
                    />
                  ) : null}
                </>
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
              <text className="plot-label heatmap-side-label" x={padding} y={height - 14}>
                {sideLabels.left}
              </text>
              <text
                className="plot-label heatmap-side-label heatmap-side-label--right"
                x={width - padding}
                y={height - 14}
              >
                {sideLabels.right}
              </text>
            </svg>
          </div>
        ) : null}

        {!isLoading && cells.length === 0 ? (
          <p className="chart-empty">No located pitches for this heatmap.</p>
        ) : null}
      </div>

      {selectionCircle ? (
        <div
          className={
            hasSelectedPitches
              ? "pitch-detail-panel selection-panel heatmap-selection-panel"
              : "pitch-detail-panel selection-panel heatmap-selection-panel heatmap-selection-panel--empty"
          }
        >
          <div className="selection-panel-header">
            <span>Selected Area</span>
            <strong>
              {hasSelectedPitches ? `${selectedSummary.pitchCount} pitches` : "No pitches"}
            </strong>
          </div>
          <div>
            <span>Selection</span>
            <strong>
              {hasSelectedPitches ? `${selectedSummary.pitchCount} pitches` : "No pitches"}
            </strong>
          </div>
          <div>
            <span>Radius</span>
            <strong>{selectionCircle.r.toFixed(0)} px</strong>
          </div>
          {hasSelectedPitches ? (
            <>
              <div>
                <span>Share</span>
                <strong>{formatRate(selectedSummary.share)}</strong>
              </div>
              <div>
                <span>Top Pitch</span>
                <strong>
                  {formatPitchType(selectedSummary.topPitchType)} ({formatRate(selectedSummary.topPitchShare)})
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
            </>
          ) : (
            <div className="heatmap-empty-selection-message">
              <span>Readout</span>
              <strong>No actual pitches fall inside the circle. Faint color nearby is smoothed density.</strong>
            </div>
          )}
          <div>
            <span>Mode</span>
            <strong>{modeLabel}</strong>
          </div>
          <button
            className="detail-close-button clear-selection-button"
            onClick={() => setSelectionCircle(null)}
            type="button"
          >
            Clear Selection
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default PitchHeatmap;
