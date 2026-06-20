import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PitchHeatmapCell, PitchHeatmapResponse } from "../api";
import Icon from "./Icon";
import { formatPitchType } from "../pitchTypes";
import { countLabel } from "../text";

type CompareDeltaHeatmapProps = {
  periodA: PitchHeatmapResponse | null;
  periodB: PitchHeatmapResponse | null;
  isLoading: boolean;
  onLoadHeatmaps?: () => void;
  periodAEnd?: string;
  periodAStart?: string;
  periodBEnd?: string;
  periodBStart?: string;
  pitcherHand?: string | null;
  batterHand?: string | null;
  pitchType?: string | null;
};

type DeltaCell = {
  cell: PitchHeatmapCell;
  aCount: number;
  bCount: number;
  aShare: number;
  bShare: number;
  delta: number;
};

type HoverReadout = {
  key: string;
  x: number;
  y: number;
  cell: DeltaCell;
};

const width = 640;
const height = 460;
const padding = 54;
const zoneLeft = -0.83;
const zoneRight = 0.83;
const zoneTop = 3.5;
const zoneBottom = 1.5;
const zoneMiddle = (zoneTop + zoneBottom) / 2;

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

function scaleX(value: number, heatmap: PitchHeatmapResponse) {
  const { x_min: xMin, x_max: xMax } = heatmap.domain;
  return padding + ((value - xMin) / (xMax - xMin)) * (width - padding * 2);
}

function scaleZ(value: number, heatmap: PitchHeatmapResponse) {
  const { z_min: zMin, z_max: zMax } = heatmap.domain;
  return height - padding - ((value - zMin) / (zMax - zMin)) * (height - padding * 2);
}

function cellKey(cell: PitchHeatmapCell) {
  return `${cell.x_bin}:${cell.z_bin}`;
}

function buildDeltaCells(
  periodA: PitchHeatmapResponse,
  periodB: PitchHeatmapResponse,
): DeltaCell[] {
  const cellsByBin = new Map<
    string,
    {
      cell: PitchHeatmapCell;
      a?: PitchHeatmapCell;
      b?: PitchHeatmapCell;
    }
  >();

  periodA.cells.forEach((cell) => {
    cellsByBin.set(cellKey(cell), { cell, a: cell });
  });

  periodB.cells.forEach((cell) => {
    const key = cellKey(cell);
    const existing = cellsByBin.get(key);
    cellsByBin.set(key, existing ? { ...existing, b: cell } : { cell, b: cell });
  });

  return Array.from(cellsByBin.values()).map(({ cell, a, b }) => {
    const aShare = a?.share ?? 0;
    const bShare = b?.share ?? 0;

    return {
      cell,
      aCount: a?.count ?? 0,
      bCount: b?.count ?? 0,
      aShare,
      bShare,
      delta: bShare - aShare,
    };
  });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPointDelta(value: number) {
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(1)} pts`;
}

function formatScope(pitchType?: string | null, batterHand?: string | null) {
  const pitchTypes = pitchType
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parts = [
    pitchTypes && pitchTypes.length > 0
      ? pitchTypes.map((value) => formatPitchType(value)).join(", ")
      : "All pitches",
    batterHand === "L" ? "vs LHH" : batterHand === "R" ? "vs RHH" : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

function formatReadableDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatPeriod(start?: string, end?: string) {
  return start && end
    ? `${formatReadableDate(start)} to ${formatReadableDate(end)}`
    : "selected period";
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

function deltaRgb(value: number) {
  const neutral: [number, number, number] = [239, 242, 246];
  const red: [number, number, number] = [190, 48, 54];
  const blue: [number, number, number] = [54, 95, 150];
  const clamped = Math.max(-1, Math.min(value, 1));

  return clamped > 0
    ? interpolateColor(neutral, red, Math.pow(clamped, 0.72))
    : interpolateColor(neutral, blue, Math.pow(Math.abs(clamped), 0.72));
}

function cellGeometry(cell: PitchHeatmapCell, heatmap: PitchHeatmapResponse) {
  const xStart = scaleX(pitcherViewX(cell.x_end), heatmap);
  const xEnd = scaleX(pitcherViewX(cell.x_start), heatmap);
  const yTop = scaleZ(cell.z_end, heatmap);
  const yBottom = scaleZ(cell.z_start, heatmap);

  return {
    x: xStart,
    y: yTop,
    width: Math.max(xEnd - xStart, 0),
    height: Math.max(yBottom - yTop, 0),
  };
}

function cellContainsPoint(
  deltaCell: DeltaCell,
  heatmap: PitchHeatmapResponse,
  point: { x: number; y: number },
) {
  const geometry = cellGeometry(deltaCell.cell, heatmap);

  return (
    point.x >= geometry.x &&
    point.x <= geometry.x + geometry.width &&
    point.y >= geometry.y &&
    point.y <= geometry.y + geometry.height
  );
}

function drawDeltaCanvas(
  canvas: HTMLCanvasElement,
  heatmap: PitchHeatmapResponse,
  cells: DeltaCell[],
  maxAbsDelta: number,
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

  const rootStyles = getComputedStyle(document.documentElement);
  context.fillStyle =
    rootStyles.getPropertyValue("--relay-surface-soft").trim() || "#f7f9fb";
  context.fillRect(padding, padding, plotWidth, plotHeight);
  context.strokeStyle =
    rootStyles.getPropertyValue("--relay-border").trim() || "#d9dee7";
  context.lineWidth = 1;
  context.strokeRect(padding, padding, plotWidth, plotHeight);

  if (cells.length === 0 || maxAbsDelta <= 0) return;

  const sampleWidth = Math.round(plotWidth);
  const sampleHeight = Math.round(plotHeight);
  const field = new Float32Array(sampleWidth * sampleHeight);
  const binWidth = plotWidth / heatmap.x_bins;
  const binHeight = plotHeight / heatmap.z_bins;
  const sigma = Math.max(binWidth, binHeight) * 1.05;
  const influenceRadius = sigma * 2.45;
  const points = cells
    .filter((cell) => Math.abs(cell.delta) > 0.0001)
    .map((cell) => {
      const geometry = cellGeometry(cell.cell, heatmap);
      const support = Math.min(1, (cell.aCount + cell.bCount) / 8);
      return {
        x: geometry.x + geometry.width / 2,
        y: geometry.y + geometry.height / 2,
        weight: cell.delta * support,
      };
    });
  let maxValue = 0;

  for (let y = 0; y < sampleHeight; y += 1) {
    const canvasY = padding + y + 0.5;
    for (let x = 0; x < sampleWidth; x += 1) {
      const canvasX = padding + x + 0.5;
      let value = 0;

      for (const point of points) {
        const dx = canvasX - point.x;
        const dy = canvasY - point.y;
        if (Math.abs(dx) > influenceRadius || Math.abs(dy) > influenceRadius) continue;
        value += point.weight * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      }

      const index = y * sampleWidth + x;
      field[index] = value;
      maxValue = Math.max(maxValue, Math.abs(value));
    }
  }

  if (maxValue <= 0) return;

  const image = new ImageData(sampleWidth, sampleHeight);
  for (let index = 0; index < field.length; index += 1) {
    const normalized = field[index] / maxValue;
    const magnitude = Math.abs(normalized);
    const cutoff = 0.22;
    const visibleValue = magnitude <= cutoff ? 0 : (magnitude - cutoff) / (1 - cutoff);
    const color = deltaRgb(Math.sign(normalized) * visibleValue);
    const imageIndex = index * 4;

    image.data[imageIndex] = color[0];
    image.data[imageIndex + 1] = color[1];
    image.data[imageIndex + 2] = color[2];
    image.data[imageIndex + 3] =
      visibleValue <= 0 ? 0 : Math.min(238, 44 + Math.pow(visibleValue, 0.72) * 194);
  }

  const fieldCanvas = document.createElement("canvas");
  fieldCanvas.width = sampleWidth;
  fieldCanvas.height = sampleHeight;
  const fieldContext = fieldCanvas.getContext("2d");
  if (!fieldContext) return;

  fieldContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(fieldCanvas, padding, padding, plotWidth, plotHeight);
}

function CompareDeltaHeatmap({
  periodA,
  periodB,
  isLoading,
  periodAEnd,
  periodAStart,
  periodBEnd,
  periodBStart,
  onLoadHeatmaps,
  pitcherHand,
  batterHand,
  pitchType,
}: CompareDeltaHeatmapProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverReadout, setHoverReadout] = useState<HoverReadout | null>(null);
  const baseHeatmap = periodB ?? periodA;
  const hasPeriodDates = Boolean(periodAStart && periodAEnd && periodBStart && periodBEnd);
  const isMissingHeatmaps = hasPeriodDates && (!periodA || !periodB);
  const sideLabels = horizontalSideLabels(pitcherHand);
  const deltaCells = useMemo(
    () => (periodA && periodB ? buildDeltaCells(periodA, periodB) : []),
    [periodA, periodB],
  );
  const maxAbsDelta = useMemo(
    () => deltaCells.reduce((max, cell) => Math.max(max, Math.abs(cell.delta)), 0),
    [deltaCells],
  );
  const biggestIncrease = useMemo(
    () =>
      deltaCells.reduce<DeltaCell | null>(
        (current, cell) => (!current || cell.delta > current.delta ? cell : current),
        null,
      ),
    [deltaCells],
  );
  const biggestDecrease = useMemo(
    () =>
      deltaCells.reduce<DeltaCell | null>(
        (current, cell) => (!current || cell.delta < current.delta ? cell : current),
        null,
      ),
    [deltaCells],
  );

  useEffect(() => {
    if (!canvasRef.current || !baseHeatmap) return;
    drawDeltaCanvas(canvasRef.current, baseHeatmap, deltaCells, maxAbsDelta);
  }, [baseHeatmap, deltaCells, maxAbsDelta]);

  useEffect(() => {
    let frameId: number | null = null;
    let timeoutId: number | null = null;

    function redrawForTheme() {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      frameId = window.requestAnimationFrame(() => {
        timeoutId = window.setTimeout(() => {
          if (!canvasRef.current || !baseHeatmap) return;
          drawDeltaCanvas(canvasRef.current, baseHeatmap, deltaCells, maxAbsDelta);
        }, 0);
      });
    }

    window.addEventListener("relay-theme-change", redrawForTheme);
    return () => {
      window.removeEventListener("relay-theme-change", redrawForTheme);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [baseHeatmap, deltaCells, maxAbsDelta]);

  function updateHover(event: PointerEvent<SVGSVGElement>) {
    if (!baseHeatmap) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
    const hoveredCell = deltaCells.find((cell) =>
      cellContainsPoint(cell, baseHeatmap, point),
    );
    const hoveredKey = hoveredCell ? cellKey(hoveredCell.cell) : null;

    if (hoveredKey && hoverReadout?.key === hoveredKey) {
      return;
    }

    setHoverReadout(
      hoveredCell
        ? (() => {
            const geometry = cellGeometry(hoveredCell.cell, baseHeatmap);
            const centerX = geometry.x + geometry.width / 2;
            const centerY = geometry.y + geometry.height / 2;

            return {
              key: hoveredKey ?? "",
              x: Math.min(centerX + 14, width - 274),
              y: Math.max(centerY - 70, 18),
              cell: hoveredCell,
            };
          })()
        : null,
    );
  }

  return (
    <section className="chart-panel delta-heatmap-panel" aria-labelledby="delta-heatmap-title">
      <div className="chart-heading collapsible-heading">
        <div>
          <h3 id="delta-heatmap-title">Location Share Delta</h3>
          <p>
            Period 2 ({formatPeriod(periodBStart, periodBEnd)}) minus Period 1 (
            {formatPeriod(periodAStart, periodAEnd)}) | {formatScope(pitchType, batterHand)} |
            color scaled within this comparison
          </p>
        </div>
        <div className="section-actions">
          <span>
            {isLoading
              ? "Loading..."
              : `${countLabel(periodA?.total_count ?? 0, "located Period 1 pitch")} | ${countLabel(periodB?.total_count ?? 0, "located Period 2 pitch")}`}
          </span>
          <button
            aria-label={isCollapsed ? "Expand location share delta" : "Collapse location share delta"}
            className="disclosure-button"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? "Expand" : "Collapse"}
            type="button"
          >
            <Icon name={isCollapsed ? "chevronRight" : "chevronDown"} />
          </button>
        </div>
      </div>

      <div className="chart-body" hidden={isCollapsed}>
      <div className="delta-heatmap-tools">
        <div className="delta-heatmap-legend" aria-label="Delta heatmap legend">
          <span>Period 2 lower</span>
          <div className="delta-heatmap-gradient" />
          <span>Period 2 higher</span>
        </div>
        <div className="delta-heatmap-callouts">
          <span>
            Biggest increase{" "}
            <strong>{biggestIncrease ? formatPointDelta(biggestIncrease.delta) : "-"}</strong>
          </span>
          <span>
            Biggest decrease{" "}
            <strong>{biggestDecrease ? formatPointDelta(biggestDecrease.delta) : "-"}</strong>
          </span>
        </div>
      </div>

      <div className="delta-heatmap-frame">
        {baseHeatmap ? (
          <div className="delta-heatmap-canvas-wrap">
            <canvas
              aria-hidden="true"
              className="delta-heatmap-canvas"
              height={height}
              ref={canvasRef}
              width={width}
            />
            <svg
              aria-label="Comparison pitch location delta heatmap"
              className="delta-heatmap-overlay"
              onPointerLeave={() => setHoverReadout(null)}
              onPointerMove={updateHover}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              <rect
                className="delta-heatmap-hover-surface"
                height={height - padding * 2}
                width={width - padding * 2}
                x={padding}
                y={padding}
              />
              <line
                className="plot-axis"
                x1={scaleX(0, baseHeatmap)}
                x2={scaleX(0, baseHeatmap)}
                y1={padding}
                y2={height - padding}
              />
              <line
                className="plot-axis"
                x1={padding}
                x2={width - padding}
                y1={scaleZ(zoneMiddle, baseHeatmap)}
                y2={scaleZ(zoneMiddle, baseHeatmap)}
              />
              <rect
                className="strike-zone-box"
                height={scaleZ(zoneBottom, baseHeatmap) - scaleZ(zoneTop, baseHeatmap)}
                width={scaleX(zoneRight, baseHeatmap) - scaleX(zoneLeft, baseHeatmap)}
                x={scaleX(zoneLeft, baseHeatmap)}
                y={scaleZ(zoneTop, baseHeatmap)}
              />
              <text className="plot-label delta-heatmap-label" x={padding} y={height - 18}>
                {sideLabels.left}
              </text>
              <text
                className="plot-label delta-heatmap-label delta-heatmap-label--right"
                x={width - padding}
                y={height - 18}
              >
                {sideLabels.right}
              </text>
              <text className="delta-heatmap-direction-label" x={padding + 12} y={padding + 20}>
                Blue: Period 2 lower share
              </text>
              <text
                className="delta-heatmap-direction-label delta-heatmap-direction-label--right"
                x={width - padding - 12}
                y={padding + 20}
              >
                Red: Period 2 higher share
              </text>
              {hoverReadout ? (
                <g className="delta-heatmap-readout">
                  <rect
                    height="72"
                    rx="6"
                    width="260"
                    x={hoverReadout.x}
                    y={hoverReadout.y}
                  />
                  <text x={hoverReadout.x + 10} y={hoverReadout.y + 20}>
                    Period 2 - Period 1 {formatPointDelta(hoverReadout.cell.delta)}
                  </text>
                  <text x={hoverReadout.x + 10} y={hoverReadout.y + 42}>
                    Period 1 {hoverReadout.cell.aCount} ({formatPercent(hoverReadout.cell.aShare)})
                  </text>
                  <text x={hoverReadout.x + 10} y={hoverReadout.y + 60}>
                    Period 2 {hoverReadout.cell.bCount} ({formatPercent(hoverReadout.cell.bShare)})
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        ) : null}
        {!isLoading && deltaCells.length === 0 ? (
          <div className="chart-empty">
            <p>
              {isMissingHeatmaps
                ? "Load period heatmaps to see location deltas."
                : "Run a comparison to see location deltas."}
            </p>
            {isMissingHeatmaps && onLoadHeatmaps ? (
              <button className="secondary-button compact-action-button" onClick={onLoadHeatmaps} type="button">
                Load Heatmaps
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      </div>
    </section>
  );
}

export default CompareDeltaHeatmap;
