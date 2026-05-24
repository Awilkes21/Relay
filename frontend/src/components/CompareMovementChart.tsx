import { useEffect, useMemo, useState } from "react";
import type { PitcherCompareResponse } from "../api";
import { formatPitchType } from "../pitchTypes";
import { countLabel } from "../text";

type CompareMovementChartProps = {
  comparison: PitcherCompareResponse;
  periodALabel: string;
  periodBLabel: string;
  visiblePitchTypes: string[];
};

type ChartMode = "overlay" | "side_by_side";

type MovementPoint = {
  pitchType: string;
  period: "A" | "B";
  horizontalBreak: number;
  inducedVerticalBreak: number;
  count: number;
};

type MovementPair = {
  pitchType: string;
  a: MovementPoint | null;
  b: MovementPoint | null;
  distance: number | null;
  lowSample: boolean;
  status: "both" | "new" | "missing";
};

const width = 900;
const height = 680;
const padding = 84;
const tightDomainPaddingInches = 2;
const domainPaddingInches = 3;
const lowSampleThreshold = 10;
const insetSize = 132;
const insetPaddingInches = 1;
const minInsetDomainInches = 2;

const pitchColors: Record<string, string> = {
  FF: "#1d4f7a",
  SI: "#287271",
  SL: "#b5651d",
  CH: "#7b4ea3",
  CU: "#9a3326",
  FC: "#44633f",
  FS: "#4b5565",
};

function pitchColor(pitchType: string) {
  return pitchColors[pitchType] ?? "#2f6f9f";
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

function formatNumber(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? "-" : value.toFixed(digits);
}

function compactPeriodLabel(label: string) {
  const match = label.match(/^Period\s+([AB12])/i);
  return match ? `P${match[1].toUpperCase()}` : label;
}

function scaleFromCenter(value: number, center: number, radius: number, domainMax: number) {
  return center + (value / domainMax) * radius;
}

function scaleYFromCenter(value: number, center: number, radius: number, domainMax: number) {
  return center - (value / domainMax) * radius;
}

function movementDistance(a: MovementPoint | null, b: MovementPoint | null) {
  if (!a || !b) return null;
  return Math.hypot(
    b.horizontalBreak - a.horizontalBreak,
    b.inducedVerticalBreak - a.inducedVerticalBreak,
  );
}

function movementPoint(
  comparison: PitcherCompareResponse,
  pitchType: string,
  period: "A" | "B",
): MovementPoint | null {
  const metrics =
    period === "A" ? comparison.period_a.metrics : comparison.period_b.metrics;
  const rawHorizontal = metrics.average_horizontal_break[pitchType];
  const vertical = metrics.average_induced_vertical_break[pitchType];

  if (rawHorizontal === undefined || vertical === undefined) return null;

  return {
    pitchType,
    period,
    horizontalBreak: rawHorizontal * -1,
    inducedVerticalBreak: vertical,
    count: metrics.pitch_usage[pitchType]?.count ?? 0,
  };
}

function compareMovementClass(pair: MovementPair, selected: boolean) {
  return [
    "compare-movement-pair",
    selected ? "is-selected" : "",
    pair.lowSample ? "is-low-sample" : "",
    pair.status === "new" ? "is-new-pitch" : "",
    pair.status === "missing" ? "is-missing-pitch" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function connectorEndpoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pointGap = 11,
) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance <= pointGap) return end;

  return {
    x: end.x - ((end.x - start.x) / distance) * pointGap,
    y: end.y - ((end.y - start.y) / distance) * pointGap,
  };
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

function niceDomain(maxMovement: number) {
  const padded = Math.ceil(maxMovement + tightDomainPaddingInches);
  return Math.max(20, Math.ceil(padded / 5) * 5);
}

function ringValuesForDomain(domainMax: number) {
  return [5, 10, 15, 20, 25, 30, 35, 40].filter((value) => value < domainMax);
}

function insetDomain(pair: MovementPair) {
  const points = [pair.a, pair.b].filter((point): point is MovementPoint => Boolean(point));
  if (points.length === 0) {
    return {
      centerX: 0,
      centerY: 0,
      radius: minInsetDomainInches,
    };
  }

  const centerX = points.reduce((sum, point) => sum + point.horizontalBreak, 0) / points.length;
  const centerY =
    points.reduce((sum, point) => sum + point.inducedVerticalBreak, 0) / points.length;
  const radius = points.reduce(
    (currentMax, point) =>
      Math.max(
        currentMax,
        Math.abs(point.horizontalBreak - centerX),
        Math.abs(point.inducedVerticalBreak - centerY),
      ),
    0,
  );

  return {
    centerX,
    centerY,
    radius: Math.max(minInsetDomainInches, Math.ceil(radius + insetPaddingInches)),
  };
}

function CompareMovementChart({
  comparison,
  periodALabel,
  periodBLabel,
  visiblePitchTypes,
}: CompareMovementChartProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedPitchType, setSelectedPitchType] = useState<string | null>(null);
  const [hoveredPitchType, setHoveredPitchType] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("overlay");
  const periodACompactLabel = compactPeriodLabel(periodALabel);
  const periodBCompactLabel = compactPeriodLabel(periodBLabel);
  const sideLabels = horizontalSideLabels(comparison.pitcher_hand);
  const movementPairs = useMemo(
    () =>
      visiblePitchTypes
        .map((pitchType): MovementPair => {
          const a = movementPoint(comparison, pitchType, "A");
          const b = movementPoint(comparison, pitchType, "B");
          const aCount = comparison.period_a.metrics.pitch_usage[pitchType]?.count ?? 0;
          const bCount = comparison.period_b.metrics.pitch_usage[pitchType]?.count ?? 0;
          const counts = [a?.count, b?.count].filter(
            (count): count is number => count !== undefined,
          );

          return {
            pitchType,
            a,
            b,
            distance: movementDistance(a, b),
            lowSample: counts.some((count) => count > 0 && count < lowSampleThreshold),
            status: aCount === 0 && bCount > 0 ? "new" : aCount > 0 && bCount === 0 ? "missing" : "both",
          };
        })
        .filter((pair) => pair.a || pair.b),
    [comparison, visiblePitchTypes],
  );
  const largestMover = movementPairs
    .filter((pair) => pair.distance !== null)
    .sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0))[0];
  const maxMovement = movementPairs.reduce((currentMax, pair) => {
    const points = [pair.a, pair.b].filter((point): point is MovementPoint => Boolean(point));
    return points.reduce(
      (pointMax, point) =>
        Math.max(pointMax, Math.abs(point.horizontalBreak), Math.abs(point.inducedVerticalBreak)),
      currentMax,
    );
  }, 0);
  const domainMax = Math.max(
    niceDomain(maxMovement),
    Math.ceil(maxMovement + domainPaddingInches),
  );
  const overlayCenterX = width / 2;
  const overlayCenterY = height / 2;
  const overlayRadius = (height - padding * 2) / 2;
  const sideRadius = 142;
  const sideCenterY = height / 2;
  const sideCenters = { A: width * 0.29, B: width * 0.71 };
  const ringValues = ringValuesForDomain(domainMax);
  const selectedPair =
    movementPairs.find((pair) => pair.pitchType === selectedPitchType) ?? null;
  const periodAArmLine = armAngleLine(
    comparison.period_a.metrics.arm_angle,
    comparison.pitcher_hand,
    chartMode === "overlay" ? overlayCenterX : sideCenters.A,
    sideCenterY,
    chartMode === "overlay" ? overlayRadius : sideRadius,
  );
  const periodBArmLine = armAngleLine(
    comparison.period_b.metrics.arm_angle,
    comparison.pitcher_hand,
    chartMode === "overlay" ? overlayCenterX : sideCenters.B,
    sideCenterY,
    chartMode === "overlay" ? overlayRadius : sideRadius,
  );

  useEffect(() => {
    function clearSelection(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedPitchType(null);
      }
    }

    window.addEventListener("keydown", clearSelection);
    return () => window.removeEventListener("keydown", clearSelection);
  }, []);

  function pointX(point: MovementPoint, period: "A" | "B" = point.period) {
    const center = chartMode === "overlay" ? overlayCenterX : sideCenters[period];
    const radius = chartMode === "overlay" ? overlayRadius : sideRadius;
    return scaleFromCenter(point.horizontalBreak, center, radius, domainMax);
  }

  function pointY(point: MovementPoint) {
    const radius = chartMode === "overlay" ? overlayRadius : sideRadius;
    return scaleYFromCenter(point.inducedVerticalBreak, sideCenterY, radius, domainMax);
  }

  function tooltipPosition(point: { x: number; y: number }) {
    const tooltipWidth = 190;
    const tooltipHeight = 108;

    return {
      x: Math.min(Math.max(point.x + 14, 24), width - 24 - tooltipWidth),
      y: Math.min(Math.max(point.y - tooltipHeight - 10, 24), height - 24 - tooltipHeight),
      width: tooltipWidth,
      height: tooltipHeight,
    };
  }

  function renderPairTooltip(pair: MovementPair | null) {
    if (!pair) return null;
    const anchor = pair.b ?? pair.a;
    if (!anchor) return null;

    const point = {
      x: pointX(anchor, anchor.period),
      y: pointY(anchor),
    };
    const tooltip = tooltipPosition(point);

    return (
      <g
        className="chart-tooltip"
        pointerEvents="none"
        transform={`translate(${tooltip.x} ${tooltip.y})`}
      >
        <rect height={tooltip.height} rx="8" width={tooltip.width} />
        <text className="chart-tooltip-title" x="12" y="21">
          {formatPitchType(pair.pitchType)}
        </text>
        <text x="12" y="43">{periodACompactLabel}: {countLabel(pair.a?.count ?? 0, "pitch")} | HB {formatNumber(pair.a?.horizontalBreak)}</text>
        <text x="12" y="61">{periodBCompactLabel}: {countLabel(pair.b?.count ?? 0, "pitch")} | HB {formatNumber(pair.b?.horizontalBreak)}</text>
        <text x="12" y="79">
          {pair.status === "new"
            ? "New in Period 2"
            : pair.status === "missing"
              ? "Missing in Period 2"
              : `Shape change ${formatNumber(pair.distance)}"`}
        </text>
        <text x="12" y="79">Move {formatNumber(pair.distance)}" | IVB {formatNumber(pair.b?.inducedVerticalBreak)}</text>
        <text x="12" y="97">Click to pin</text>
      </g>
    );
  }

  function renderMovementFrame(centerX: number, radius: number, label?: string) {
    const outerLabelY = sideCenterY - radius - 10;
    return (
      <g>
        <circle className="movement-plot-background" cx={centerX} cy={sideCenterY} r={radius} />
        {ringValues.map((ringValue) => {
          const ringRadius = (ringValue / domainMax) * radius;
          return (
            <g key={`${label ?? "overlay"}-${ringValue}`}>
              <circle
                className="movement-ring"
                cx={centerX}
                cy={sideCenterY}
                r={ringRadius}
              />
              <text
                className="plot-label movement-ring-label"
                x={centerX + ringRadius}
                y={sideCenterY}
              >
                {ringValue}"
              </text>
              <text
                className="plot-label movement-ring-label"
                x={centerX}
                y={sideCenterY - ringRadius}
              >
                {ringValue}"
              </text>
            </g>
          );
        })}
        <text
          className="plot-label movement-ring-label movement-ring-label--outer"
          x={centerX}
          y={outerLabelY}
        >
          +/-{domainMax}"
        </text>
        <line
          className="plot-axis"
          x1={centerX}
          x2={centerX}
          y1={sideCenterY - radius}
          y2={sideCenterY + radius}
        />
        <line
          className="plot-axis"
          x1={centerX - radius}
          x2={centerX + radius}
          y1={sideCenterY}
          y2={sideCenterY}
        />
        {label ? (
          <text className="plot-label compare-movement-period-label" x={centerX} y={padding - 32}>
            {label}
          </text>
        ) : null}
      </g>
    );
  }

  function renderInset(pair: MovementPair) {
    const domain = insetDomain(pair);
    const x = width - insetSize - 44;
    const y = 92;
    const centerX = x + insetSize / 2;
    const centerY = y + insetSize / 2;
    const radius = insetSize / 2 - 24;
    const aX = pair.a
      ? centerX + ((pair.a.horizontalBreak - domain.centerX) / domain.radius) * radius
      : null;
    const aY = pair.a
      ? centerY - ((pair.a.inducedVerticalBreak - domain.centerY) / domain.radius) * radius
      : null;
    const bX = pair.b
      ? centerX + ((pair.b.horizontalBreak - domain.centerX) / domain.radius) * radius
      : null;
    const bY = pair.b
      ? centerY - ((pair.b.inducedVerticalBreak - domain.centerY) / domain.radius) * radius
      : null;
    const connectorEnd =
      aX !== null && aY !== null && bX !== null && bY !== null
        ? connectorEndpoint({ x: aX, y: aY }, { x: bX, y: bY }, 9)
        : null;
    const color = pitchColor(pair.pitchType);

    return (
      <g className="compare-movement-inset">
        <rect
          className="compare-movement-inset-background"
          height={insetSize}
          rx="8"
          width={insetSize}
          x={x}
          y={y}
        />
        <text className="plot-label compare-movement-inset-title" x={x + 12} y={y + 20}>
          {formatPitchType(pair.pitchType)} detail
        </text>
        <text className="plot-label compare-movement-inset-scale" x={x + 12} y={y + insetSize - 12}>
          +/-{domain.radius}" window
        </text>
        {selectedPitchType ? (
          <g
            className="compare-movement-inset-close"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedPitchType(null);
            }}
            tabIndex={0}
          >
            <rect height="20" rx="10" width="46" x={x + insetSize - 58} y={y + 6} />
            <text x={x + insetSize - 35} y={y + 16}>
              Clear
            </text>
          </g>
        ) : null}
        <line
          className="movement-ring"
          x1={centerX}
          x2={centerX}
          y1={centerY - radius}
          y2={centerY + radius}
        />
        <line
          className="movement-ring"
          x1={centerX - radius}
          x2={centerX + radius}
          y1={centerY}
          y2={centerY}
        />
        {aX !== null && aY !== null && connectorEnd ? (
          <line
            className="compare-movement-connector"
            markerEnd="url(#compare-movement-arrowhead)"
            stroke={color}
            x1={aX}
            x2={connectorEnd.x}
            y1={aY}
            y2={connectorEnd.y}
          />
        ) : null}
        {aX !== null && aY !== null ? (
          <circle
            className="compare-movement-point compare-movement-point--a"
            cx={aX}
            cy={aY}
            r="5"
            stroke={color}
          />
        ) : null}
        {bX !== null && bY !== null ? (
          <circle
            className="compare-movement-point compare-movement-point--b"
            cx={bX}
            cy={bY}
            fill={color}
            r="5"
          />
        ) : null}
      </g>
    );
  }

  return (
    <section className="chart-panel" aria-labelledby="compare-movement-title">
      <div className="chart-heading collapsible-heading">
        <h3 id="compare-movement-title">Movement Diff</h3>
        <div className="section-actions">
          <span>{countLabel(movementPairs.length, "pitch type")} | period averages</span>
          <button
            aria-label={isCollapsed ? "Expand movement diff chart" : "Collapse movement diff chart"}
            className="disclosure-button"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? "Expand" : "Collapse"}
            type="button"
          >
            {isCollapsed ? "+" : "-"}
          </button>
        </div>
      </div>

      <div className="chart-body" hidden={isCollapsed}>
      <div className="strike-zone-toolbar movement-toolbar">
        <div className="strike-zone-toolbar-row">
          <span className="chart-view-note strike-zone-orientation">
            {sideLabels.left} / {sideLabels.right} | {periodBCompactLabel} minus {periodACompactLabel}
          </span>
          {largestMover ? (
            <span className="movement-mover-callout">
              Move: {formatPitchType(largestMover.pitchType)} {formatNumber(largestMover.distance)}"
            </span>
          ) : null}
          <div className="lens-group">
            <span className="lens-label">View</span>
            <div className="zoom-controls" aria-label="Movement diff view">
              <button
                className={chartMode === "overlay" ? "zoom-button is-active" : "zoom-button"}
                onClick={() => setChartMode("overlay")}
                type="button"
              >
                Overlay
              </button>
              <button
                className={chartMode === "side_by_side" ? "zoom-button is-active" : "zoom-button"}
                onClick={() => setChartMode("side_by_side")}
                type="button"
              >
                A/B
              </button>
            </div>
          </div>
        </div>
        <div className="strike-zone-toolbar-row strike-zone-toolbar-row--secondary">
          <div className="movement-period-legend" aria-label="Movement period legend">
            <span title={periodALabel}><i className="movement-period-dot movement-period-dot--a" />{periodACompactLabel}</span>
            <span title={periodBLabel}><i className="movement-period-dot movement-period-dot--b" />{periodBCompactLabel}</span>
          </div>
          <div className="pitch-legend movement-pitch-legend strike-zone-legend" aria-label="Pitch type colors">
            {movementPairs.map((pair) => (
              <span className="legend-item" key={pair.pitchType}>
                <i
                  className="legend-swatch"
                  style={{ backgroundColor: pitchColor(pair.pitchType) }}
                />
                {formatPitchType(pair.pitchType)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="strike-zone-frame">
        <svg
          aria-label="Pitch movement comparison chart"
          className="strike-zone-chart compare-movement-chart"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <marker
              id="compare-movement-arrowhead"
              markerHeight="6"
              markerWidth="6"
              orient="auto"
              refX="5.6"
              refY="3"
              viewBox="0 0 6 6"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
            </marker>
          </defs>

          {chartMode === "overlay" ? (
            renderMovementFrame(overlayCenterX, overlayRadius)
          ) : (
            <>
              {renderMovementFrame(sideCenters.A, sideRadius, periodALabel)}
              {renderMovementFrame(sideCenters.B, sideRadius, periodBLabel)}
            </>
          )}

          <text className="plot-label movement-label movement-label--top" x={overlayCenterX} y={padding - 58}>
            Rise
          </text>
          <text className="plot-label movement-label movement-label--bottom" x={overlayCenterX} y={height - padding + 46}>
            Drop
          </text>
          <text className="plot-label movement-label movement-label--left" x={28} y={sideCenterY}>
            {sideLabels.left}
          </text>
          <text className="plot-label movement-label movement-label--right" x={width - 28} y={sideCenterY}>
            {sideLabels.right}
          </text>
          {periodAArmLine ? (
            <line
              className="movement-arm-angle-line movement-arm-angle-line--a"
              x1={chartMode === "overlay" ? overlayCenterX : sideCenters.A}
              x2={periodAArmLine.x2}
              y1={sideCenterY}
              y2={periodAArmLine.y2}
            />
          ) : null}
          {periodBArmLine ? (
            <line
              className="movement-arm-angle-line movement-arm-angle-line--b"
              x1={chartMode === "overlay" ? overlayCenterX : sideCenters.B}
              x2={periodBArmLine.x2}
              y1={sideCenterY}
              y2={periodBArmLine.y2}
            />
          ) : null}
          {periodBArmLine ? (
            <text
              className="plot-label movement-arm-angle-label"
              x={periodBArmLine.x2}
              y={periodBArmLine.y2 - 8}
            >
              Arm {formatNumber(comparison.period_b.metrics.arm_angle, 0)} deg
            </text>
          ) : null}

          {movementPairs.map((pair) => {
            const color = pitchColor(pair.pitchType);
            const isSelected = selectedPitchType === pair.pitchType;
            const aX = pair.a ? pointX(pair.a, "A") : null;
            const aY = pair.a ? pointY(pair.a) : null;
            const bX = pair.b ? pointX(pair.b, "B") : null;
            const bY = pair.b ? pointY(pair.b) : null;
            const connectorEnd =
              aX !== null && aY !== null && bX !== null && bY !== null
                ? connectorEndpoint({ x: aX, y: aY }, { x: bX, y: bY })
                : null;

            return (
              <g
                className={compareMovementClass(pair, isSelected)}
                key={pair.pitchType}
                onClick={() =>
                  setSelectedPitchType((current) =>
                    current === pair.pitchType ? null : pair.pitchType,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelectedPitchType((current) =>
                      current === pair.pitchType ? null : pair.pitchType,
                    );
                  }
                }}
                onMouseEnter={() => setHoveredPitchType(pair.pitchType)}
                onMouseLeave={() => setHoveredPitchType(null)}
                tabIndex={0}
              >
                {chartMode === "overlay" && aX !== null && aY !== null && connectorEnd ? (
                  <line
                    className="compare-movement-connector"
                    markerEnd="url(#compare-movement-arrowhead)"
                    stroke={color}
                    x1={aX}
                    x2={connectorEnd.x}
                    y1={aY}
                    y2={connectorEnd.y}
                  />
                ) : null}
                {aX !== null && aY !== null ? (
                  <circle
                    className={
                      chartMode === "side_by_side"
                        ? "compare-movement-point compare-movement-point--a compare-movement-point--filled"
                        : "compare-movement-point compare-movement-point--a"
                    }
                    cx={aX}
                    cy={aY}
                    style={chartMode === "side_by_side" ? { fill: color } : undefined}
                    r="6"
                    stroke={color}
                  />
                ) : null}
                {bX !== null && bY !== null ? (
                  <circle
                    className="compare-movement-point compare-movement-point--b"
                    cx={bX}
                    cy={bY}
                    fill={color}
                    r="6"
                  />
                ) : null}
              </g>
            );
          })}
          {hoveredPitchType || selectedPitchType
            ? renderPairTooltip(
                movementPairs.find(
                  (pair) => pair.pitchType === (hoveredPitchType ?? selectedPitchType),
                ) ?? null,
              )
            : null}
          {selectedPair ? renderInset(selectedPair) : null}
        </svg>
        {movementPairs.length === 0 ? (
          <p className="chart-empty">No movement averages to compare.</p>
        ) : null}
      </div>

      {selectedPair ? (
        <div className="pitch-detail-panel selection-panel">
          <div className="selection-panel-header">
            <span>Selected Pitch Type</span>
            <strong>{formatPitchType(selectedPair.pitchType)}</strong>
          </div>
          <div>
            <span>Pitch</span>
            <strong>{formatPitchType(selectedPair.pitchType)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>
              {selectedPair.status === "new"
                ? "New in Period 2"
                : selectedPair.status === "missing"
                  ? "Missing in Period 2"
                  : "Both periods"}
            </strong>
          </div>
          <div>
            <span>{periodALabel} Count</span>
            <strong>{selectedPair.a?.count ?? 0}</strong>
          </div>
          <div>
            <span>{periodBLabel} Count</span>
            <strong>{selectedPair.b?.count ?? 0}</strong>
          </div>
          <div>
            <span>{periodALabel} Shape</span>
            <strong>
              {formatNumber(selectedPair.a?.horizontalBreak)} HB / {formatNumber(selectedPair.a?.inducedVerticalBreak)} IVB
            </strong>
          </div>
          <div>
            <span>{periodBLabel} Shape</span>
            <strong>
              {formatNumber(selectedPair.b?.horizontalBreak)} HB / {formatNumber(selectedPair.b?.inducedVerticalBreak)} IVB
            </strong>
          </div>
          <div>
            <span>Shape Change</span>
            <strong>{formatNumber(selectedPair.distance)} in</strong>
          </div>
          <div>
            <span>Arm Angle Delta</span>
            <strong>{formatNumber(comparison.deltas.arm_angle)} deg</strong>
          </div>
          {selectedPair.lowSample ? (
            <div>
              <span>Sample</span>
              <strong>Small sample</strong>
            </div>
          ) : null}
          <button
            className="detail-close-button clear-selection-button"
            onClick={() => setSelectedPitchType(null)}
            type="button"
          >
            Clear Selection
          </button>
        </div>
      ) : null}
      </div>
    </section>
  );
}

export default CompareMovementChart;
