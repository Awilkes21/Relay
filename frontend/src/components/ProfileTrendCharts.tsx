import { useEffect, useRef, useState, type MouseEvent } from "react";
import Icon from "./Icon";
import { countLabel } from "../text";

export type TrendMetric = "velocity" | "spin" | "ivb" | "hb";

export type TrendDatum = {
  date: string;
  count: number;
  velocity: number | null;
  spin: number | null;
  ivb: number | null;
  hb: number | null;
};

export type TimeBucketMode = "game" | "month";

export type TimeSeriesPoint = {
  bucket: string;
  count: number;
  value: number | null;
};

export type TimeSeries = {
  key: string;
  label: string;
  color: string;
  points: TimeSeriesPoint[];
};

export type TimeSeriesDomain = {
  min: number;
  max: number;
};

const chartWidth = 720;
const chartHeight = 220;
const chartPadding = {
  top: 22,
  right: 24,
  bottom: 34,
  left: 48,
};
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const trendMetrics: TrendMetric[] = ["velocity", "spin", "ivb", "hb"];

function formatNullableNumber(value: number | null, digits = 1) {
  return value === null ? "-" : value.toFixed(digits);
}

function formatSignedNumber(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatTrendValue(value: number | null, digits = 1, unit = "") {
  if (value === null) return "-";
  if (unit === "%") return `${(value * 100).toFixed(digits)}%`;
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export function formatBucketLabel(bucket: string, mode: TimeBucketMode, formatShortDate: (value: string) => string) {
  if (!bucket) return "-";
  if (mode === "game") return formatShortDate(bucket);
  const [year, month] = bucket.split("-");
  const monthIndex = Number(month) - 1;
  return `${monthNames[monthIndex] ?? month} ${year}`;
}

function metricConfig(metric: TrendMetric) {
  if (metric === "spin") return { label: "Spin", unit: "rpm", digits: 0, axisUnit: "rpm" };
  if (metric === "ivb") return { label: "IVB", unit: "in", digits: 1, axisUnit: "in" };
  if (metric === "hb") return { label: "HB", unit: "in", digits: 1, axisUnit: "in" };
  return { label: "Velocity", unit: "mph", digits: 1, axisUnit: "mph" };
}

export function TrendChart({
  data,
  metric,
  formatShortDate,
  isLarge = false,
  onToggleFocus,
}: {
  data: TrendDatum[];
  metric: TrendMetric;
  formatShortDate: (value: string) => string;
  isLarge?: boolean;
  onToggleFocus?: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const config = metricConfig(metric);
  const points = data
    .map((datum) => ({ ...datum, value: datum[metric] }))
    .filter((datum): datum is TrendDatum & { value: number } => datum.value !== null);
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const paddedMin = values.length ? min - Math.max((max - min) * 0.12, metric === "spin" ? 30 : 0.5) : 0;
  const paddedMax = values.length ? max + Math.max((max - min) * 0.12, metric === "spin" ? 30 : 0.5) : 1;
  const xSpan = Math.max(points.length - 1, 1);
  const ySpan = paddedMax - paddedMin || 1;
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  function x(index: number) {
    return chartPadding.left + (index / xSpan) * plotWidth;
  }

  function y(value: number) {
    return chartPadding.top + ((paddedMax - value) / ySpan) * plotHeight;
  }

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`)
    .join(" ");
  const latest = points.at(-1);
  const isInspectingPoint = hoveredPointIndex !== null;
  const inspectedPoint =
    hoveredPointIndex === null ? latest : points[hoveredPointIndex] ?? latest;
  const inspectedPointIndex =
    hoveredPointIndex === null ? (latest ? points.length - 1 : -1) : hoveredPointIndex;
  const inspectedLabelAnchor =
    inspectedPointIndex < 0
      ? "end"
      : inspectedPointIndex < points.length / 3
        ? "start"
        : inspectedPointIndex > (points.length * 2) / 3
          ? "end"
          : "middle";
  const seasonAverage =
    points.length && points.some((point) => point.count > 0)
      ? points.reduce((sum, point) => sum + point.value * point.count, 0) /
        points.reduce((sum, point) => sum + point.count, 0)
      : null;
  const inspectedDelta =
    inspectedPoint && seasonAverage !== null ? inspectedPoint.value - seasonAverage : null;

  function inspectNearestPoint(event: MouseEvent<SVGSVGElement>) {
    if (!points.length) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const nearestIndex = points.reduce(
      (nearest, _point, index) =>
        Math.abs(x(index) - pointerX) < Math.abs(x(nearest) - pointerX) ? index : nearest,
      0,
    );
    setHoveredPointIndex(nearestIndex);
  }

  useEffect(() => {
    setHoveredPointIndex(null);
  }, [data, metric]);

  useEffect(() => {
    if (!isLarge) return;

    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [isLarge, metric]);

  return (
    <section
      className={isLarge ? "chart-panel profile-trend-panel profile-trend-panel--large" : "chart-panel profile-trend-panel"}
      ref={panelRef}
      tabIndex={isLarge ? -1 : undefined}
    >
      <div className="chart-heading">
        <div>
          <h3>{config.label} ({config.unit})</h3>
          <p>{isInspectingPoint ? "Nearest game average" : "Latest game average"}</p>
        </div>
        {inspectedPoint ? (
          <div className="profile-trend-stat">
            <span>{formatShortDate(inspectedPoint.date)}</span>
            <strong>{formatNullableNumber(inspectedPoint.value, config.digits)} {config.unit}</strong>
            <em>{countLabel(inspectedPoint.count, "pitch")}</em>
            {inspectedDelta !== null ? (
              <small>
                {Math.abs(inspectedDelta) < 0.05
                  ? "Even vs avg"
                  : `${formatSignedNumber(inspectedDelta, config.digits)} ${config.unit} vs avg`}
              </small>
            ) : null}
          </div>
        ) : null}
        {onToggleFocus ? (
          <button
            aria-label={isLarge ? `Collapse ${config.label} trend chart` : `Expand ${config.label} trend chart`}
            className="icon-action-button profile-trend-expand-button"
            onClick={onToggleFocus}
            title={isLarge ? "Collapse chart" : "Expand chart"}
            type="button"
          >
            <Icon name={isLarge ? "minimize" : "maximize"} />
          </button>
        ) : null}
      </div>
      <svg
        className="profile-trend-chart"
        onMouseLeave={() => setHoveredPointIndex(null)}
        onMouseMove={inspectNearestPoint}
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartPadding.left} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} />
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom} />
        {points.length > 1 ? <path className="profile-trend-line" d={path} /> : null}
        {isInspectingPoint && inspectedPoint && inspectedPointIndex >= 0 ? (
          <line
            className="profile-trend-guide"
            x1={x(inspectedPointIndex)}
            x2={x(inspectedPointIndex)}
            y1={chartPadding.top}
            y2={chartHeight - chartPadding.bottom}
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            aria-label={`${formatShortDate(point.date)}: ${formatNullableNumber(point.value, config.digits)} ${config.unit}`}
            className={isInspectingPoint && index === inspectedPointIndex ? "profile-trend-point is-active" : "profile-trend-point"}
            cx={x(index)}
            cy={y(point.value)}
            key={point.date}
            onBlur={() => setHoveredPointIndex(null)}
            onFocus={() => setHoveredPointIndex(index)}
            r={isInspectingPoint && index === inspectedPointIndex ? "5" : "4"}
            tabIndex={0}
          />
        ))}
        {points.length > 0 ? (
          <>
            <text className="profile-trend-label" x={chartPadding.left} y={16}>
              {formatNullableNumber(paddedMax, config.digits)} {config.axisUnit}
            </text>
            <text className="profile-trend-label" x={chartPadding.left} y={chartHeight - chartPadding.bottom - 8}>
              {formatNullableNumber(paddedMin, config.digits)} {config.axisUnit}
            </text>
            <text
              className="profile-trend-label profile-trend-label--date"
              textAnchor={inspectedLabelAnchor}
              x={inspectedPointIndex >= 0 ? x(inspectedPointIndex) : chartWidth - chartPadding.right}
              y={chartHeight - 7}
            >
              {inspectedPoint ? formatShortDate(inspectedPoint.date) : formatShortDate(points.at(-1)!.date)}
            </text>
          </>
        ) : null}
      </svg>
    </section>
  );
}

export function TimeSeriesChart({
  title,
  subtitle,
  series,
  buckets,
  bucketMode,
  unit,
  digits = 1,
  formatShortDate,
  yDomain,
  onInspectedBucketChange,
}: {
  title: string;
  subtitle: string;
  series: TimeSeries[];
  buckets: string[];
  bucketMode: TimeBucketMode;
  unit: string;
  digits?: number;
  formatShortDate: (value: string) => string;
  yDomain?: TimeSeriesDomain;
  onInspectedBucketChange?: (bucket: string) => void;
}) {
  const [hoveredBucketIndex, setHoveredBucketIndex] = useState<number | null>(null);
  const inspectedBucketIndex =
    hoveredBucketIndex === null ? Math.max(buckets.length - 1, 0) : hoveredBucketIndex;
  const inspectedBucket = buckets[inspectedBucketIndex] ?? "";
  const values = series.flatMap((line) =>
    line.points
      .map((point) => point.value)
      .filter((value): value is number => value !== null),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const isRateMetric = unit === "%";
  const paddedMin = values.length
    ? yDomain
      ? yDomain.min
      : isRateMetric
        ? Math.max(0, min - 0.05)
        : min - Math.max((max - min) * 0.12, 0.5)
    : 0;
  const paddedMax = values.length
    ? yDomain
      ? yDomain.max
      : isRateMetric
        ? Math.min(1, max + 0.05)
        : max + Math.max((max - min) * 0.12, 0.5)
    : 1;
  const xSpan = Math.max(buckets.length - 1, 1);
  const ySpan = paddedMax - paddedMin || 1;
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

  function x(index: number) {
    return chartPadding.left + (index / xSpan) * plotWidth;
  }

  function y(value: number) {
    return chartPadding.top + ((paddedMax - value) / ySpan) * plotHeight;
  }

  function inspectNearestBucket(event: MouseEvent<SVGSVGElement>) {
    if (!buckets.length) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const nearestIndex = buckets.reduce(
      (nearest, _bucket, index) =>
        Math.abs(x(index) - pointerX) < Math.abs(x(nearest) - pointerX) ? index : nearest,
      0,
    );
    setHoveredBucketIndex(nearestIndex);
  }

  function pointForBucket(line: TimeSeries, bucket: string) {
    return line.points.find((point) => point.bucket === bucket);
  }

  function linePath(line: TimeSeries) {
    return line.points
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.value !== null)
      .map(({ point, index }, pathIndex) => {
        const value = point.value!;
        return `${pathIndex === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
      })
      .join(" ");
  }

  useEffect(() => {
    onInspectedBucketChange?.(inspectedBucket);
  }, [inspectedBucket, onInspectedBucketChange]);

  return (
    <section className="chart-panel profile-time-chart">
      <div className="chart-heading profile-time-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="profile-time-inspector">
          <span>{formatBucketLabel(inspectedBucket, bucketMode, formatShortDate)}</span>
          <div>
            {series.map((line) => {
              const point = pointForBucket(line, inspectedBucket);
              return (
                <em key={line.key}>
                  <i style={{ background: line.color }} />
                  {line.label}: {formatTrendValue(point?.value ?? null, digits, unit)}
                </em>
              );
            })}
          </div>
        </div>
      </div>
      <svg
        className="profile-time-series-chart"
        onMouseLeave={() => setHoveredBucketIndex(null)}
        onMouseMove={inspectNearestBucket}
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartPadding.left} y1={chartPadding.top} y2={chartHeight - chartPadding.bottom} />
        <line className="profile-trend-axis" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom} />
        {buckets.length > 0 && hoveredBucketIndex !== null ? (
          <line
            className="profile-trend-guide"
            x1={x(inspectedBucketIndex)}
            x2={x(inspectedBucketIndex)}
            y1={chartPadding.top}
            y2={chartHeight - chartPadding.bottom}
          />
        ) : null}
        {series.map((line) => (
          <g key={line.key}>
            <path className="profile-time-series-line" d={linePath(line)} style={{ stroke: line.color }} />
            {line.points.map((point, index) =>
              point.value !== null ? (
                <circle
                  className={index === inspectedBucketIndex && hoveredBucketIndex !== null ? "profile-trend-point is-active" : "profile-trend-point"}
                  cx={x(index)}
                  cy={y(point.value)}
                  key={point.bucket}
                  r={index === inspectedBucketIndex && hoveredBucketIndex !== null ? "4.8" : "3.5"}
                  style={{ fill: line.color }}
                />
              ) : null,
            )}
          </g>
        ))}
        {values.length > 0 ? (
          <>
            <text className="profile-trend-label" x={chartPadding.left} y={16}>
              {formatTrendValue(paddedMax, digits, unit)}
            </text>
            <text className="profile-trend-label" x={chartPadding.left} y={chartHeight - chartPadding.bottom - 8}>
              {formatTrendValue(paddedMin, digits, unit)}
            </text>
            <text className="profile-trend-label profile-trend-label--date" textAnchor="end" x={chartWidth - chartPadding.right} y={chartHeight - 7}>
              {formatBucketLabel(inspectedBucket, bucketMode, formatShortDate)}
            </text>
          </>
        ) : null}
      </svg>
    </section>
  );
}
