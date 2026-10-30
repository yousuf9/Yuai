import React, { useState, useMemo } from 'react';
import {
  LineChart,
  BarChart3,
  ScatterChart,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ParsedExcelDataset,
  computeScatterCorrelation,
} from '../utils/excelEngine';

interface InteractiveVisualizationsProps {
  dataset: ParsedExcelDataset;
}

type ChartMode = 'line' | 'bar' | 'scatter';
type AggregationType = 'sum' | 'mean' | 'count';

const CATEGORY_COLORS = [
  '#38bdf8', // sky-400
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#a855f7', // purple-500
  '#f43f5e', // rose-500
  '#eab308', // yellow-500
];

export const InteractiveVisualizations: React.FC<InteractiveVisualizationsProps> = ({
  dataset,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('line');

  const numericCols = useMemo(
    () => dataset.columns.filter((c) => c.type === 'numeric'),
    [dataset]
  );
  const categoricalAndDateCols = useMemo(
    () =>
      dataset.columns.filter(
        (c) => c.type === 'categorical' || c.type === 'date'
      ),
    [dataset]
  );

  // Selected columns for Line & Bar charts
  const [selectedMetricCol, setSelectedMetricCol] = useState<string>('');
  const [selectedDimensionCol, setSelectedDimensionCol] = useState<string>('');
  const [aggType, setAggType] = useState<AggregationType>('sum');
  const [showMovingAvg, setShowMovingAvg] = useState<boolean>(true);

  // Selected columns for Scatter Plot
  const [scatterXCol, setScatterXCol] = useState<string>('');
  const [scatterYCol, setScatterYCol] = useState<string>('');
  const [scatterGroupCol, setScatterGroupCol] = useState<string>('');

  // Zoom state (normalized [startPct, endPct] from 0 to 100)
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, 100]);

  // Hover state
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeMetric =
    selectedMetricCol && numericCols.some((c) => c.name === selectedMetricCol)
      ? selectedMetricCol
      : numericCols[0]?.name || '';

  const defaultTimeOrCatCol = useMemo(() => {
    const qCol = categoricalAndDateCols.find((c) =>
      /quarter|date|month|year|period/i.test(c.name)
    );
    return qCol?.name || categoricalAndDateCols[0]?.name || '';
  }, [categoricalAndDateCols]);

  const activeDimension =
    selectedDimensionCol &&
    categoricalAndDateCols.some((c) => c.name === selectedDimensionCol)
      ? selectedDimensionCol
      : defaultTimeOrCatCol;

  const activeScatterX =
    scatterXCol && numericCols.some((c) => c.name === scatterXCol)
      ? scatterXCol
      : numericCols[0]?.name || '';

  const activeScatterY =
    scatterYCol && numericCols.some((c) => c.name === scatterYCol)
      ? scatterYCol
      : numericCols[1]?.name || numericCols[0]?.name || '';

  const activeScatterGroup =
    scatterGroupCol &&
    categoricalAndDateCols.some((c) => c.name === scatterGroupCol)
      ? scatterGroupCol
      : categoricalAndDateCols[0]?.name || '';

  // 1. Compute aggregated series for Line & Bar charts
  const aggregatedSeries = useMemo(() => {
    if (!activeMetric || dataset.rows.length === 0) return [];

    const map = new Map<
      string,
      { sum: number; count: number; min: number; max: number }
    >();

    for (let i = 0; i < dataset.rows.length; i++) {
      const r = dataset.rows[i];
      let key = activeDimension
        ? String(r[activeDimension] ?? 'Unspecified').trim()
        : `Bucket ${Math.floor(i / Math.max(1, Math.floor(dataset.rows.length / 20))) + 1}`;

      if (!key) key = 'Unspecified';
      // Group daily dates into YYYY-MM when plotting line/bar if too granular
      if (chartMode === 'line' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
        key = key.slice(0, 7);
      }

      const val = Number(r[activeMetric]);
      if (Number.isNaN(val)) continue;

      const existing = map.get(key);
      if (!existing) {
        map.set(key, { sum: val, count: 1, min: val, max: val });
      } else {
        existing.sum += val;
        existing.count += 1;
        if (val < existing.min) existing.min = val;
        if (val > existing.max) existing.max = val;
      }
    }

    let entries = Array.from(map.entries()).map(([label, d]) => {
      const value =
        aggType === 'sum'
          ? d.sum
          : aggType === 'mean'
          ? d.sum / Math.max(1, d.count)
          : d.count;
      return {
        label,
        value: Number(value.toFixed(2)),
        sum: Number(d.sum.toFixed(2)),
        mean: Number((d.sum / Math.max(1, d.count)).toFixed(2)),
        count: d.count,
        min: Number(d.min.toFixed(2)),
        max: Number(d.max.toFixed(2)),
      };
    });

    if (chartMode === 'line') {
      entries.sort((a, b) => a.label.localeCompare(b.label));
    } else {
      entries.sort((a, b) => b.value - a.value);
      entries = entries.slice(0, 24);
    }

    const totalSum = entries.reduce((acc, item) => acc + Math.abs(item.value), 0) || 1;

    // Compute 3-period moving average
    return entries.map((item, idx, arr) => {
      const start = Math.max(0, idx - 2);
      const windowSlice = arr.slice(start, idx + 1);
      const ma =
        windowSlice.reduce((s, x) => s + x.value, 0) / windowSlice.length;
      return {
        ...item,
        movingAvg: Number(ma.toFixed(2)),
        sharePct: Number(((Math.abs(item.value) / totalSum) * 100).toFixed(1)),
      };
    });
  }, [dataset.rows, activeMetric, activeDimension, aggType, chartMode]);

  // Apply zoom window to aggregatedSeries
  const zoomedSeries = useMemo(() => {
    if (aggregatedSeries.length <= 2) return aggregatedSeries;
    const total = aggregatedSeries.length;
    const startIdx = Math.max(0, Math.floor((zoomRange[0] / 100) * (total - 1)));
    const endIdx = Math.min(
      total,
      Math.max(startIdx + 2, Math.ceil((zoomRange[1] / 100) * total))
    );
    return aggregatedSeries.slice(startIdx, endIdx);
  }, [aggregatedSeries, zoomRange]);

  // 2. Compute Scatter Correlation Data
  const scatterData = useMemo(() => {
    if (!activeScatterX || !activeScatterY || dataset.rows.length === 0) {
      return null;
    }
    return computeScatterCorrelation(
      dataset.rows,
      activeScatterX,
      activeScatterY,
      activeScatterGroup,
      360
    );
  }, [dataset.rows, activeScatterX, activeScatterY, activeScatterGroup]);

  // Filter scatter points by zoomRange on X axis
  const zoomedScatterPoints = useMemo(() => {
    if (!scatterData || scatterData.points.length === 0) return [];
    const spanX = scatterData.xMax - scatterData.xMin || 1;
    const minAllowedX = scatterData.xMin + (zoomRange[0] / 100) * spanX;
    const maxAllowedX = scatterData.xMin + (zoomRange[1] / 100) * spanX;
    return scatterData.points.filter(
      (pt) => pt.x >= minAllowedX && pt.x <= maxAllowedX
    );
  }, [scatterData, zoomRange]);

  const handleZoomIn = () => {
    setZoomRange(([start, end]) => {
      const span = end - start;
      if (span <= 20) return [start, end];
      const delta = Math.max(5, Math.round(span * 0.2));
      return [Math.min(end - 15, start + delta), Math.max(start + 15, end - delta)];
    });
    setHoveredIndex(null);
  };

  const handleZoomOut = () => {
    setZoomRange(([start, end]) => [
      Math.max(0, start - 15),
      Math.min(100, end + 15),
    ]);
    setHoveredIndex(null);
  };

  const handleResetZoom = () => {
    setZoomRange([0, 100]);
    setHoveredIndex(null);
  };

  // Distinct categories for scatter color legend
  const scatterCategories = useMemo(() => {
    if (!scatterData) return [];
    return Array.from(new Set(scatterData.points.map((p) => p.category))).slice(
      0,
      6
    );
  }, [scatterData]);

  return (
    <section className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-6">
      {/* Header & Chart Mode Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium mb-1">
            <span>Interactive Visual Analytics Studio</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Hover for Granular Metrics & Zoom into Intervals
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Dynamic Trend Line, Cohort Bar & Correlation Scatter Visualizations
          </h2>
        </div>

        {/* Segmented Chart Mode Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#070b14] p-1.5 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setChartMode('line');
              setHoveredIndex(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'line'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Line Chart (Trends)</span>
          </button>

          <button
            onClick={() => {
              setChartMode('bar');
              setHoveredIndex(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'bar'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Bar Chart (Comparisons)</span>
          </button>

          <button
            onClick={() => {
              setChartMode('scatter');
              setHoveredIndex(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              chartMode === 'scatter'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ScatterChart className="w-3.5 h-3.5" />
            <span>Scatter Plot (Correlations)</span>
          </button>
        </div>
      </div>

      {/* Controls Toolbar: Axis Selectors + Zoom & Brush Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-[#070b14] border border-slate-800/90 rounded-lg p-4">
        {chartMode !== 'scatter' ? (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">X-Axis / Group:</span>
              <select
                value={activeDimension}
                onChange={(e) => {
                  setSelectedDimensionCol(e.target.value);
                  setHoveredIndex(null);
                }}
                className="bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
              >
                {categoricalAndDateCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Y-Axis Metric:</span>
              <select
                value={activeMetric}
                onChange={(e) => {
                  setSelectedMetricCol(e.target.value);
                  setHoveredIndex(null);
                }}
                className="bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
              >
                {numericCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Aggregation:</span>
              <div className="flex items-center gap-1 bg-[#0b1120] p-0.5 rounded-md border border-slate-800">
                {(['sum', 'mean', 'count'] as AggregationType[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAggType(mode)}
                    className={`px-2.5 py-1 rounded text-xs capitalize cursor-pointer ${
                      aggType === mode
                        ? 'bg-slate-800 text-sky-400 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'mean' ? 'Average' : mode}
                  </button>
                ))}
              </div>
            </div>

            {chartMode === 'line' && (
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showMovingAvg}
                  onChange={(e) => setShowMovingAvg(e.target.checked)}
                  className="accent-amber-400 rounded"
                />
                <span>3-Period Moving Avg</span>
              </label>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">X-Axis Variable:</span>
              <select
                value={activeScatterX}
                onChange={(e) => {
                  setScatterXCol(e.target.value);
                  setHoveredIndex(null);
                }}
                className="bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
              >
                {numericCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Y-Axis Variable:</span>
              <select
                value={activeScatterY}
                onChange={(e) => {
                  setScatterYCol(e.target.value);
                  setHoveredIndex(null);
                }}
                className="bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
              >
                {numericCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Color Segment:</span>
              <select
                value={activeScatterGroup}
                onChange={(e) => setScatterGroupCol(e.target.value)}
                className="bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
              >
                {categoricalAndDateCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Interactive Zoom & Focus Range Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span>Zoom Window:</span>
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, zoomRange[1] - 15)}
            value={zoomRange[0]}
            onChange={(e) =>
              setZoomRange([Number(e.target.value), zoomRange[1]])
            }
            aria-label="Zoom Start Percent"
            className="w-20 accent-sky-400 cursor-pointer"
          />
          <span className="font-mono tabular-nums text-slate-300">
            {zoomRange[0]}%–{zoomRange[1]}%
          </span>
          <input
            type="range"
            min={Math.min(100, zoomRange[0] + 15)}
            max={100}
            value={zoomRange[1]}
            onChange={(e) =>
              setZoomRange([zoomRange[0], Number(e.target.value)])
            }
            aria-label="Zoom End Percent"
            className="w-20 accent-sky-400 cursor-pointer"
          />

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-1.5 bg-[#0b1120] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-1.5 bg-[#0b1120] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-md cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            title="Reset Zoom"
            className="px-2.5 py-1 bg-[#0b1120] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-md flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* CHART VIEWPORT 1: DYNAMIC LINE CHART */}
      {chartMode === 'line' && (
        <div className="space-y-4">
          {zoomedSeries.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No numeric records available for this selection.
            </div>
          ) : (
            (() => {
              const svgW = 920;
              const svgH = 340;
              const padL = 76;
              const padR = 30;
              const padT = 28;
              const padB = 54;
              const plotW = svgW - padL - padR;
              const plotH = svgH - padT - padB;

              const vals = zoomedSeries.map((d) => d.value);
              const minVal = Math.min(...vals, 0);
              const maxVal = Math.max(...vals, 1);
              const valSpan = maxVal - minVal || 1;

              const getX = (i: number) =>
                padL +
                (zoomedSeries.length === 1
                  ? plotW / 2
                  : (i / (zoomedSeries.length - 1)) * plotW);
              const getY = (v: number) =>
                padT + plotH - ((v - minVal) / valSpan) * plotH;

              const linePoints = zoomedSeries
                .map((d, i) => `${getX(i)},${getY(d.value)}`)
                .join(' ');
              const areaPoints = `${getX(0)},${padT + plotH} ${linePoints} ${getX(
                zoomedSeries.length - 1
              )},${padT + plotH}`;
              const maPoints = zoomedSeries
                .map((d, i) => `${getX(i)},${getY(d.movingAvg)}`)
                .join(' ');

              const activePoint =
                hoveredIndex !== null && zoomedSeries[hoveredIndex]
                  ? zoomedSeries[hoveredIndex]
                  : zoomedSeries[zoomedSeries.length - 1];

              return (
                <div className="space-y-4">
                  {/* Live Hover Inspection Readout Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#070b14] border border-slate-800 rounded-lg px-4 py-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Inspected Period:</span>
                      <span className="font-mono font-bold text-white text-sm">
                        {activePoint.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums">
                      <span>
                        <span className="text-slate-400">
                          {aggType.toUpperCase()}:{' '}
                        </span>
                        <strong className="text-sky-400">
                          {activePoint.value.toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        <span className="text-slate-400">3-Period Avg: </span>
                        <strong className="text-amber-400">
                          {activePoint.movingAvg.toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        <span className="text-slate-400">Min / Max: </span>
                        <span className="text-slate-200">
                          {activePoint.min.toLocaleString()} →{' '}
                          {activePoint.max.toLocaleString()}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-400">Records: </span>
                        <span className="text-slate-200">
                          {activePoint.count.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Interactive SVG Canvas */}
                  <div className="relative bg-[#070b14] border border-slate-800 rounded-xl p-4 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-auto min-w-[640px] select-none"
                    >
                      <defs>
                        <linearGradient
                          id="yuaiLineAreaGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#38bdf8"
                            stopOpacity="0.28"
                          />
                          <stop
                            offset="100%"
                            stopColor="#38bdf8"
                            stopOpacity="0.0"
                          />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Y Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                        const yPos = padT + plotH * (1 - t);
                        const labelVal = minVal + t * valSpan;
                        return (
                          <g key={idx}>
                            <line
                              x1={padL}
                              y1={yPos}
                              x2={svgW - padR}
                              y2={yPos}
                              stroke="#1e293b"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={padL - 10}
                              y={yPos + 4}
                              textAnchor="end"
                              className="fill-slate-400 text-[10px] font-mono"
                            >
                              {labelVal >= 1000000
                                ? `${(labelVal / 1000000).toFixed(1)}M`
                                : labelVal >= 1000
                                ? `${(labelVal / 1000).toFixed(1)}k`
                                : labelVal.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Area Under Trend Line */}
                      <polygon
                        points={areaPoints}
                        fill="url(#yuaiLineAreaGrad)"
                      />

                      {/* Primary Metric Line */}
                      <polyline
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        points={linePoints}
                      />

                      {/* Optional 3-Period Moving Average Line */}
                      {showMovingAvg && zoomedSeries.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                          points={maPoints}
                        />
                      )}

                      {/* Hover Crosshair & Data Nodes */}
                      {zoomedSeries.map((d, i) => {
                        const cx = getX(i);
                        const cy = getY(d.value);
                        const isHovered = hoveredIndex === i;
                        const showLabel =
                          zoomedSeries.length <= 14 ||
                          i % Math.ceil(zoomedSeries.length / 10) === 0 ||
                          i === zoomedSeries.length - 1;

                        return (
                          <g
                            key={d.label}
                            onMouseEnter={() => setHoveredIndex(i)}
                            className="cursor-pointer"
                          >
                            {isHovered && (
                              <line
                                x1={cx}
                                y1={padT}
                                x2={cx}
                                y2={padT + plotH}
                                stroke="#38bdf8"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                              />
                            )}
                            {/* Invisible larger hit target */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={14}
                              fill="transparent"
                            />
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered ? 6 : 4}
                              fill={isHovered ? '#ffffff' : '#38bdf8'}
                              stroke="#070b14"
                              strokeWidth="2"
                            />
                            {showLabel && (
                              <text
                                x={cx}
                                y={padT + plotH + 22}
                                textAnchor="middle"
                                className="fill-slate-400 text-[10px] font-mono"
                              >
                                {d.label.slice(0, 12)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* CHART VIEWPORT 2: DYNAMIC BAR CHART FOR COMPARISONS */}
      {chartMode === 'bar' && (
        <div className="space-y-4">
          {zoomedSeries.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No comparative categories available.
            </div>
          ) : (
            (() => {
              const svgW = 920;
              const svgH = 340;
              const padL = 76;
              const padR = 30;
              const padT = 28;
              const padB = 64;
              const plotW = svgW - padL - padR;
              const plotH = svgH - padT - padB;

              const maxVal = Math.max(
                1,
                ...zoomedSeries.map((d) => Math.abs(d.value))
              );
              const barSlotW = plotW / zoomedSeries.length;
              const barW = Math.max(8, Math.min(48, barSlotW * 0.68));

              const activeBar =
                hoveredIndex !== null && zoomedSeries[hoveredIndex]
                  ? zoomedSeries[hoveredIndex]
                  : zoomedSeries[0];

              return (
                <div className="space-y-4">
                  {/* Live Hover Inspection Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#070b14] border border-slate-800 rounded-lg px-4 py-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">Hovered Segment:</span>
                      <span className="font-mono font-bold text-white text-sm">
                        {activeBar.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums">
                      <span>
                        <span className="text-slate-400">
                          {aggType.toUpperCase()}:{' '}
                        </span>
                        <strong className="text-sky-400">
                          {activeBar.value.toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        <span className="text-slate-400">Share of Total: </span>
                        <strong className="text-emerald-400">
                          {activeBar.sharePct}%
                        </strong>
                      </span>
                      <span>
                        <span className="text-slate-400">Mean: </span>
                        <span className="text-slate-200">
                          {activeBar.mean.toLocaleString()}
                        </span>
                      </span>
                      <span>
                        <span className="text-slate-400">Row Count: </span>
                        <span className="text-slate-200">
                          {activeBar.count.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Interactive SVG Bar Chart */}
                  <div className="relative bg-[#070b14] border border-slate-800 rounded-xl p-4 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-auto min-w-[640px] select-none"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                        const yPos = padT + plotH * (1 - t);
                        const labelVal = t * maxVal;
                        return (
                          <g key={idx}>
                            <line
                              x1={padL}
                              y1={yPos}
                              x2={svgW - padR}
                              y2={yPos}
                              stroke="#1e293b"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={padL - 10}
                              y={yPos + 4}
                              textAnchor="end"
                              className="fill-slate-400 text-[10px] font-mono"
                            >
                              {labelVal >= 1000000
                                ? `${(labelVal / 1000000).toFixed(1)}M`
                                : labelVal >= 1000
                                ? `${(labelVal / 1000).toFixed(1)}k`
                                : labelVal.toFixed(0)}
                            </text>
                          </g>
                        );
                      })}

                      {zoomedSeries.map((d, i) => {
                        const barH = Math.max(
                          4,
                          (Math.abs(d.value) / maxVal) * plotH
                        );
                        const x = padL + i * barSlotW + (barSlotW - barW) / 2;
                        const y = padT + plotH - barH;
                        const isHovered = hoveredIndex === i;

                        return (
                          <g
                            key={d.label}
                            onMouseEnter={() => setHoveredIndex(i)}
                            className="cursor-pointer"
                          >
                            <rect
                              x={x}
                              y={y}
                              width={barW}
                              height={barH}
                              rx={4}
                              fill={isHovered ? '#38bdf8' : '#0284c7'}
                            />
                            <text
                              x={x + barW / 2}
                              y={y - 6}
                              textAnchor="middle"
                              className="fill-slate-300 text-[9px] font-mono"
                            >
                              {d.sharePct}%
                            </text>
                            <text
                              x={x + barW / 2}
                              y={padT + plotH + 18}
                              textAnchor="middle"
                              className="fill-slate-400 text-[10px] font-mono"
                            >
                              {d.label.slice(0, 12)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* CHART VIEWPORT 3: SCATTER PLOT FOR CORRELATIONS */}
      {chartMode === 'scatter' && scatterData && (
        <div className="space-y-4">
          {zoomedScatterPoints.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              No points in the selected zoom interval. Click Reset Zoom to view all points.
            </div>
          ) : (
            (() => {
              const svgW = 920;
              const svgH = 360;
              const padL = 76;
              const padR = 30;
              const padT = 28;
              const padB = 54;
              const plotW = svgW - padL - padR;
              const plotH = svgH - padT - padB;

              const xs = zoomedScatterPoints.map((p) => p.x);
              const ys = zoomedScatterPoints.map((p) => p.y);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const minY = Math.min(...ys);
              const maxY = Math.max(...ys);
              const spanX = maxX - minX || 1;
              const spanY = maxY - minY || 1;

              const getX = (v: number) => padL + ((v - minX) / spanX) * plotW;
              const getY = (v: number) =>
                padT + plotH - ((v - minY) / spanY) * plotH;

              // Regression trendline endpoints clipped to [minX, maxX]
              const regY1 = scatterData.intercept + scatterData.slope * minX;
              const regY2 = scatterData.intercept + scatterData.slope * maxX;

              const hoveredPt =
                hoveredIndex !== null && zoomedScatterPoints[hoveredIndex]
                  ? zoomedScatterPoints[hoveredIndex]
                  : zoomedScatterPoints[0];

              const absR = Math.abs(scatterData.pearsonR);
              const corrStrength =
                absR >= 0.7
                  ? 'Strong Correlation'
                  : absR >= 0.35
                  ? 'Moderate Correlation'
                  : 'Weak / Independent';

              return (
                <div className="space-y-4">
                  {/* Correlation & Hover Telemetry Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-[#070b14] border border-slate-800 rounded-lg px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <span>
                        <span className="text-slate-400">Pearson r: </span>
                        <strong className="font-mono text-sky-400 text-sm">
                          {scatterData.pearsonR}
                        </strong>
                        <span className="text-slate-400 ml-1.5">
                          ({corrStrength})
                        </span>
                      </span>
                      <span className="font-mono text-slate-300">
                        Linear Fit: y = {scatterData.slope.toFixed(3)}x +{' '}
                        {scatterData.intercept.toFixed(2)}
                      </span>
                    </div>

                    {hoveredPt && (
                      <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                        <span className="text-slate-300">{hoveredPt.label}</span>
                        <span>
                          <span className="text-slate-400">
                            {activeScatterX}:{' '}
                          </span>
                          <strong className="text-white">
                            {hoveredPt.x.toLocaleString()}
                          </strong>
                        </span>
                        <span>
                          <span className="text-slate-400">
                            {activeScatterY}:{' '}
                          </span>
                          <strong className="text-amber-400">
                            {hoveredPt.y.toLocaleString()}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Interactive SVG Scatter Plot */}
                  <div className="relative bg-[#070b14] border border-slate-800 rounded-xl p-4 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-auto min-w-[640px] select-none"
                    >
                      {/* Y Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                        const yPos = padT + plotH * (1 - t);
                        const val = minY + t * spanY;
                        return (
                          <g key={idx}>
                            <line
                              x1={padL}
                              y1={yPos}
                              x2={svgW - padR}
                              y2={yPos}
                              stroke="#1e293b"
                              strokeDasharray="4 4"
                            />
                            <text
                              x={padL - 10}
                              y={yPos + 4}
                              textAnchor="end"
                              className="fill-slate-400 text-[10px] font-mono"
                            >
                              {val >= 1000
                                ? `${(val / 1000).toFixed(1)}k`
                                : val.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}

                      {/* X Grid Labels */}
                      {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                        const xPos = padL + plotW * t;
                        const val = minX + t * spanX;
                        return (
                          <g key={idx}>
                            <text
                              x={xPos}
                              y={padT + plotH + 22}
                              textAnchor="middle"
                              className="fill-slate-400 text-[10px] font-mono"
                            >
                              {val >= 1000
                                ? `${(val / 1000).toFixed(1)}k`
                                : val.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}

                      {/* OLS Regression Trendline */}
                      <line
                        x1={getX(minX)}
                        y1={Math.max(
                          padT,
                          Math.min(padT + plotH, getY(regY1))
                        )}
                        x2={getX(maxX)}
                        y2={Math.max(
                          padT,
                          Math.min(padT + plotH, getY(regY2))
                        )}
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                      />

                      {/* Scatter Data Points */}
                      {zoomedScatterPoints.map((pt, idx) => {
                        const cx = getX(pt.x);
                        const cy = getY(pt.y);
                        const catIdx = Math.max(
                          0,
                          scatterCategories.indexOf(pt.category)
                        );
                        const color =
                          CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];
                        const isHovered = hoveredIndex === idx;

                        return (
                          <circle
                            key={idx}
                            cx={cx}
                            cy={cy}
                            r={isHovered ? 6.5 : 4}
                            fill={color}
                            fillOpacity={isHovered ? 1 : 0.78}
                            stroke={isHovered ? '#ffffff' : 'none'}
                            strokeWidth={isHovered ? 2 : 0}
                            onMouseEnter={() => setHoveredIndex(idx)}
                            className="cursor-pointer transition-transform"
                          />
                        );
                      })}
                    </svg>

                    {/* Category Color Legend */}
                    {scatterCategories.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                        <div className="flex flex-wrap items-center gap-4">
                          {scatterCategories.map((cat, idx) => (
                            <span
                              key={cat}
                              className="inline-flex items-center gap-1.5"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-sm inline-block"
                                style={{
                                  backgroundColor:
                                    CATEGORY_COLORS[
                                      idx % CATEGORY_COLORS.length
                                    ],
                                }}
                              />
                              <span className="text-slate-300">{cat}</span>
                            </span>
                          ))}
                        </div>
                        <span className="font-mono text-amber-400">
                          --- Dashed Line: Linear Regression Fit
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </section>
  );
};
