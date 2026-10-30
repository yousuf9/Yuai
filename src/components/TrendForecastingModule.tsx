import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import {
  ParsedExcelDataset,
  computeTimeSeriesForecast,
  AIForecastCommentary,
} from '../utils/excelEngine';

interface TrendForecastingModuleProps {
  dataset: ParsedExcelDataset;
}

type HorizonOption = {
  id: 'next_quarter' | 'two_quarters' | 'next_year';
  label: string;
  periods: number;
};

const HORIZON_OPTIONS: HorizonOption[] = [
  { id: 'next_quarter', label: 'Next Quarter (+3 Periods)', periods: 3 },
  { id: 'two_quarters', label: 'Next 2 Quarters (+6 Periods)', periods: 6 },
  { id: 'next_year', label: 'Next Year (+12 Periods)', periods: 12 },
];

export const TrendForecastingModule: React.FC<TrendForecastingModuleProps> = ({
  dataset,
}) => {
  const numericCols = useMemo(
    () => dataset.columns.filter((c) => c.type === 'numeric'),
    [dataset]
  );

  const timeCols = useMemo(
    () =>
      dataset.columns.filter(
        (c) =>
          c.type === 'date' ||
          /quarter|date|month|year|period/i.test(c.name) ||
          (c.type === 'categorical' && c.uniqueCount >= 3 && c.uniqueCount <= 36)
      ),
    [dataset]
  );

  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedTimeCol, setSelectedTimeCol] = useState<string>('');
  const [aggMode, setAggMode] = useState<'sum' | 'mean'>('sum');
  const [horizonId, setHorizonId] = useState<HorizonOption['id']>('next_quarter');
  const [confidenceLevel, setConfidenceLevel] = useState<number>(95);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [zoomStartPct, setZoomStartPct] = useState<number>(0);

  // AI Forecast Commentary state
  const [aiCommentary, setAiCommentary] = useState<AIForecastCommentary | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeMetric =
    selectedMetric && numericCols.some((c) => c.name === selectedMetric)
      ? selectedMetric
      : numericCols.find((c) => /revenue|sales|units|margin|amount/i.test(c.name))?.name ||
        numericCols[0]?.name ||
        '';

  const activeTimeCol =
    selectedTimeCol && timeCols.some((c) => c.name === selectedTimeCol)
      ? selectedTimeCol
      : timeCols.find((c) => /quarter|date|month/i.test(c.name))?.name ||
        timeCols[0]?.name ||
        '';

  const activeHorizon =
    HORIZON_OPTIONS.find((h) => h.id === horizonId) || HORIZON_OPTIONS[0];

  // 1. Compute instant statistical forecast & confidence interval fan
  const statisticalForecast = useMemo(() => {
    if (!activeMetric) return null;
    return computeTimeSeriesForecast({
      dataset,
      metricCol: activeMetric,
      timeCol: activeTimeCol,
      aggregationMode: aggMode,
      horizonPeriods: activeHorizon.periods,
      horizonLabel: activeHorizon.label,
      confidenceLevelPct: confidenceLevel,
    });
  }, [
    dataset,
    activeMetric,
    activeTimeCol,
    aggMode,
    activeHorizon,
    confidenceLevel,
  ]);

  // 2. Fetch AI Forecast Assumptions & Confidence Assessment from Gemini backend
  const generateAIForecastReport = useCallback(async () => {
    if (!statisticalForecast) return;
    setIsGeneratingAI(true);
    setAiError(null);
    try {
      const res = await fetch('/api/forecast-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: dataset.fileName,
          rowCount: dataset.rowCount,
          statisticalForecast,
          columnsSummaryText: dataset.columnsSummaryText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to synthesize forecast assumptions.');
      }
      setAiCommentary(data as AIForecastCommentary);
    } catch (err: unknown) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Unable to generate AI forecast commentary.'
      );
    } finally {
      setIsGeneratingAI(false);
    }
  }, [dataset.fileName, dataset.rowCount, dataset.columnsSummaryText, statisticalForecast]);

  // Automatically trigger AI forecast synthesis when dataset or metric/horizon changes
  useEffect(() => {
    if (statisticalForecast) {
      generateAIForecastReport();
    }
  }, [statisticalForecast, generateAIForecastReport]);

  if (!statisticalForecast) {
    return null;
  }

  const allPoints = statisticalForecast.points;
  const startIdx = Math.min(
    Math.max(0, allPoints.length - 4),
    Math.floor((zoomStartPct / 100) * Math.max(1, allPoints.length - 4))
  );
  const visiblePoints = allPoints.slice(startIdx);

  const inspectedPoint =
    hoveredIdx !== null && visiblePoints[hoveredIdx]
      ? visiblePoints[hoveredIdx]
      : visiblePoints[visiblePoints.length - 1];

  return (
    <section className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-1">
            <span>Predictive Econometric & AI Forecasting Engine</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {confidenceLevel}% Confidence Interval Cone
            </span>
          </div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>Future Trend Forecasting, Assumptions & Confidence Intervals</span>
          </h2>
        </div>

        <button
          onClick={generateAIForecastReport}
          disabled={isGeneratingAI}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
          <span>
            {isGeneratingAI ? 'Computing Forecast Model...' : 'Recalculate AI Forecast'}
          </span>
        </button>
      </div>

      {/* Forecasting Controls Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-[#070b14] border border-slate-800/90 rounded-lg p-4 text-xs">
        <div className="space-y-1">
          <label className="text-slate-400 block">Target Key Metric</label>
          <select
            value={activeMetric}
            onChange={(e) => {
              setSelectedMetric(e.target.value);
              setHoveredIdx(null);
            }}
            className="w-full bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
          >
            {numericCols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 block">Time / Period Axis</label>
          <select
            value={activeTimeCol}
            onChange={(e) => {
              setSelectedTimeCol(e.target.value);
              setHoveredIdx(null);
            }}
            className="w-full bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
          >
            {timeCols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 block">Forecast Horizon</label>
          <select
            value={horizonId}
            onChange={(e) => {
              setHorizonId(e.target.value as HorizonOption['id']);
              setHoveredIdx(null);
            }}
            className="w-full bg-[#0b1120] border border-slate-700 rounded-md px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-sky-400"
          >
            {HORIZON_OPTIONS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 block">Confidence Level</label>
          <div className="flex items-center gap-1 bg-[#0b1120] p-1 rounded-md border border-slate-800">
            {[80, 90, 95].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setConfidenceLevel(lvl)}
                className={`flex-1 py-1 rounded text-xs font-mono cursor-pointer ${
                  confidenceLevel === lvl
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lvl}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-slate-400 block">Metric Aggregation</label>
          <div className="flex items-center gap-1 bg-[#0b1120] p-1 rounded-md border border-slate-800">
            {(['sum', 'mean'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setAggMode(m)}
                className={`flex-1 py-1 rounded text-xs capitalize cursor-pointer ${
                  aggMode === m
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'sum' ? 'Total Sum' : 'Average'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key Forecast Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#070b14] border border-slate-800 rounded-lg p-4 space-y-1">
          <div className="text-xs text-slate-400">Projected Horizon Growth</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums ${
              statisticalForecast.projectedGrowthPct >= 0
                ? 'text-emerald-400'
                : 'text-amber-400'
            }`}
          >
            {statisticalForecast.projectedGrowthPct >= 0 ? '+' : ''}
            {statisticalForecast.projectedGrowthPct}%
          </div>
          <div className="text-xs text-slate-500">
            Over {statisticalForecast.horizonLabel}
          </div>
        </div>

        <div className="bg-[#070b14] border border-slate-800 rounded-lg p-4 space-y-1">
          <div className="text-xs text-slate-400">Final Period Forecast</div>
          <div className="text-xl font-bold text-white font-mono tabular-nums">
            {allPoints[allPoints.length - 1]?.forecast.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {confidenceLevel}% Band: [
            {allPoints[allPoints.length - 1]?.lowerBound.toLocaleString()} →{' '}
            {allPoints[allPoints.length - 1]?.upperBound.toLocaleString()}]
          </div>
        </div>

        <div className="bg-[#070b14] border border-slate-800 rounded-lg p-4 space-y-1">
          <div className="text-xs text-slate-400">Model Confidence & Fit</div>
          <div className="text-xl font-bold text-sky-400 font-mono tabular-nums">
            {aiCommentary?.confidenceAssessment
              ? `${aiCommentary.confidenceAssessment.scorePct}% (${aiCommentary.confidenceAssessment.rating})`
              : `R² = ${statisticalForecast.rSquared}`}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Regression R²: {statisticalForecast.rSquared} · Residual Volatility:{' '}
            {statisticalForecast.volatilityPct}%
          </div>
        </div>

        <div className="bg-[#070b14] border border-slate-800 rounded-lg p-4 space-y-1">
          <div className="text-xs text-slate-400">Historical Baseline Growth</div>
          <div className="text-xl font-bold text-slate-200 font-mono tabular-nums">
            {statisticalForecast.historicalGrowthPct >= 0 ? '+' : ''}
            {statisticalForecast.historicalGrowthPct}%
          </div>
          <div className="text-xs text-slate-500">
            Computed across {dataset.rowCount.toLocaleString()} records
          </div>
        </div>
      </div>

      {/* Interactive Forecast Cone SVG Chart */}
      {(() => {
        const svgW = 920;
        const svgH = 350;
        const padL = 78;
        const padR = 32;
        const padT = 28;
        const padB = 56;
        const plotW = svgW - padL - padR;
        const plotH = svgH - padT - padB;

        const allValues: number[] = [];
        for (const p of visiblePoints) {
          if (p.actual !== undefined) allValues.push(p.actual);
          allValues.push(p.forecast, p.lowerBound, p.upperBound);
        }
        const minV = Math.min(...allValues, 0);
        const maxV = Math.max(...allValues, 1);
        const spanV = maxV - minV || 1;

        const getX = (i: number) =>
          padL +
          (visiblePoints.length <= 1
            ? plotW / 2
            : (i / (visiblePoints.length - 1)) * plotW);
        const getY = (v: number) => padT + plotH - ((v - minV) / spanV) * plotH;

        const firstForecastIdx = visiblePoints.findIndex((p) => p.isForecast);
        const transitionIdx = Math.max(0, firstForecastIdx - 1);

        // Confidence Cone Polygon (from last historical point through all forecast points)
        const coneIndices: number[] = [];
        for (let i = transitionIdx; i < visiblePoints.length; i++) {
          coneIndices.push(i);
        }
        const upperConePts = coneIndices
          .map((i) => `${getX(i)},${getY(visiblePoints[i].upperBound)}`)
          .join(' ');
        const lowerConePts = [...coneIndices]
          .reverse()
          .map((i) => `${getX(i)},${getY(visiblePoints[i].lowerBound)}`)
          .join(' ');
        const conePolygon = `${upperConePts} ${lowerConePts}`;

        // Historical Solid Line
        const histPoints = visiblePoints
          .map((p, i) =>
            !p.isForecast && p.actual !== undefined
              ? `${getX(i)},${getY(p.actual)}`
              : null
          )
          .filter(Boolean)
          .join(' ');

        // Forecast Dashed Line (starting at last historical point)
        const forecastLinePts = coneIndices
          .map((i) => {
            const pt = visiblePoints[i];
            const val = !pt.isForecast && pt.actual !== undefined ? pt.actual : pt.forecast;
            return `${getX(i)},${getY(val)}`;
          })
          .join(' ');

        return (
          <div className="space-y-3">
            {/* Hover Readout & Zoom Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#070b14] border border-slate-800 rounded-lg px-4 py-2.5 text-xs">
              {inspectedPoint && (
                <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                  <span className="text-white font-bold">
                    {inspectedPoint.period}{' '}
                    <span
                      className={
                        inspectedPoint.isForecast
                          ? 'text-emerald-400'
                          : 'text-sky-400'
                      }
                    >
                      ({inspectedPoint.isForecast ? 'PROJECTED' : 'ACTUAL'})
                    </span>
                  </span>
                  {inspectedPoint.actual !== undefined && (
                    <span>
                      <span className="text-slate-400">Actual: </span>
                      <strong className="text-sky-400">
                        {inspectedPoint.actual.toLocaleString()}
                      </strong>
                    </span>
                  )}
                  <span>
                    <span className="text-slate-400">
                      {inspectedPoint.isForecast ? 'Forecast: ' : 'Trend Fit: '}
                    </span>
                    <strong className="text-emerald-400">
                      {inspectedPoint.forecast.toLocaleString()}
                    </strong>
                  </span>
                  {inspectedPoint.isForecast && (
                    <span>
                      <span className="text-slate-400">
                        {confidenceLevel}% Interval:{' '}
                      </span>
                      <span className="text-slate-200">
                        [{inspectedPoint.lowerBound.toLocaleString()} →{' '}
                        {inspectedPoint.upperBound.toLocaleString()}]
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomStartPct((z) => Math.min(60, z + 20))}
                  className="px-2.5 py-1 bg-[#0b1120] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded flex items-center gap-1 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Focus Forecast Zone</span>
                </button>
                <button
                  onClick={() => setZoomStartPct((z) => Math.max(0, z - 20))}
                  className="p-1 bg-[#0b1120] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomStartPct(0)}
                  className="p-1 bg-[#0b1120] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded cursor-pointer"
                  title="Reset Full Timeline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="bg-[#070b14] border border-slate-800 rounded-xl p-4 overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto min-w-[640px] select-none"
              >
                {/* Y Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                  const yPos = padT + plotH * (1 - t);
                  const val = minV + t * spanV;
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
                        {val >= 1000000
                          ? `${(val / 1000000).toFixed(1)}M`
                          : val >= 1000
                          ? `${(val / 1000).toFixed(1)}k`
                          : val.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Forecast Horizon Divider Line */}
                {firstForecastIdx > 0 && (
                  <g>
                    <line
                      x1={getX(transitionIdx)}
                      y1={padT}
                      x2={getX(transitionIdx)}
                      y2={padT + plotH}
                      stroke="#10b981"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={getX(transitionIdx) + 8}
                      y={padT + 14}
                      className="fill-emerald-400 text-[10px] font-mono"
                    >
                      Forecast Horizon →
                    </text>
                  </g>
                )}

                {/* Confidence Interval Shaded Fan */}
                {coneIndices.length > 1 && (
                  <polygon
                    points={conePolygon}
                    fill="rgba(16, 185, 129, 0.16)"
                    stroke="rgba(16, 185, 129, 0.35)"
                    strokeWidth="1"
                  />
                )}

                {/* Historical Actuals Solid Line */}
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  points={histPoints}
                />

                {/* Projected Forecast Dashed Line */}
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                  points={forecastLinePts}
                />

                {/* Interactive Points */}
                {visiblePoints.map((pt, i) => {
                  const cx = getX(i);
                  const val =
                    !pt.isForecast && pt.actual !== undefined
                      ? pt.actual
                      : pt.forecast;
                  const cy = getY(val);
                  const isHovered = hoveredIdx === i;
                  const showTick =
                    visiblePoints.length <= 14 ||
                    i % Math.ceil(visiblePoints.length / 10) === 0 ||
                    i === visiblePoints.length - 1;

                  return (
                    <g
                      key={pt.period}
                      onMouseEnter={() => setHoveredIdx(i)}
                      className="cursor-pointer"
                    >
                      {isHovered && (
                        <line
                          x1={cx}
                          y1={padT}
                          x2={cx}
                          y2={padT + plotH}
                          stroke="#94a3b8"
                          strokeWidth="1"
                          strokeDasharray="2 2"
                        />
                      )}
                      <circle cx={cx} cy={cy} r={14} fill="transparent" />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 4}
                        fill={
                          isHovered
                            ? '#ffffff'
                            : pt.isForecast
                            ? '#10b981'
                            : '#38bdf8'
                        }
                        stroke="#070b14"
                        strokeWidth="2"
                      />
                      {showTick && (
                        <text
                          x={cx}
                          y={padT + plotH + 22}
                          textAnchor="middle"
                          className={`text-[10px] font-mono ${
                            pt.isForecast
                              ? 'fill-emerald-400'
                              : 'fill-slate-400'
                          }`}
                        >
                          {pt.period}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex flex-wrap items-center gap-5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-sky-400 inline-block" />
                    <span className="text-slate-300">Historical Actuals</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                    <span className="text-slate-300">Projected Forecast</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 bg-emerald-500/25 border border-emerald-500/50 rounded-xs inline-block" />
                    <span className="text-slate-300">
                      {confidenceLevel}% Confidence Interval Cone
                    </span>
                  </span>
                </div>
                <span className="font-mono text-slate-400">
                  OLS Trend + Damped Residual Decomposition
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Forecast Assumptions, Confidence Rationale & Scenarios */}
      {isGeneratingAI ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
          <div className="h-36 bg-[#070b14] border border-slate-800 rounded-xl animate-pulse p-5" />
          <div className="h-36 bg-[#070b14] border border-slate-800 rounded-xl animate-pulse p-5" />
        </div>
      ) : aiError ? (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-xs text-red-200">
          {aiError}
        </div>
      ) : aiCommentary ? (
        <div className="space-y-6 pt-2">
          {/* Forecast Headline & Confidence Rationale */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-[#070b14] border border-slate-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-sky-400 font-medium">
                <Sparkles className="w-4 h-4" />
                <span>Executive Forecast Synthesis</span>
              </div>
              <p className="text-sm text-slate-100 leading-relaxed">
                {aiCommentary.forecastHeadline}
              </p>
            </div>

            <div className="bg-[#070b14] border border-slate-800 rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confidence Level Methodology</span>
                </span>
                <span className="font-mono font-bold text-white">
                  {aiCommentary.confidenceAssessment.scorePct}% (
                  {aiCommentary.confidenceAssessment.rating})
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {aiCommentary.confidenceAssessment.rationale}
              </p>
            </div>
          </div>

          {/* Explicit Model Assumptions & Scenario Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Explicit Assumptions */}
            <div className="bg-[#070b14] border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">
                  Explicit Forecast Model Assumptions
                </h3>
                <span className="text-xs text-slate-400">
                  Sensitivity & Impact
                </span>
              </div>
              <div className="divide-y divide-slate-800/80">
                {aiCommentary.assumptions.map((item, idx) => (
                  <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">
                        {idx + 1}. {item.assumption}
                      </span>
                      <span className="font-mono text-sky-400">
                        {item.category} · {item.sensitivity} Sensitivity
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {item.impactDescription}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scenario Projections & Risk Factors */}
            <div className="space-y-4">
              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">
                  Multi-Scenario Horizon Targets
                </h3>
                <div className="divide-y divide-slate-800/80">
                  {aiCommentary.scenarios.map((sc, idx) => (
                    <div
                      key={idx}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-slate-200">
                          {sc.name}{' '}
                          <span className="text-slate-500 font-mono">
                            ({sc.probabilityPct}% prob.)
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {sc.conditions}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-xs font-bold text-emerald-400 whitespace-nowrap">
                        {sc.projectedValue}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#070b14] border border-slate-800 rounded-xl p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Variance & Confidence Cone Risk Factors</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
                  {aiCommentary.riskFactors.map((rf, i) => (
                    <li key={i}>{rf}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
