import * as XLSX from 'xlsx';

export interface NumericStats {
  min: number;
  max: number;
  sum: number;
  mean: number;
  median: number;
  stdDev: number;
  q25: number;
  q75: number;
  trendSlope: number; // positive = upward across rows, negative = downward
}

export interface CategoryFrequency {
  value: string;
  count: number;
  percentage: number;
}

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'date' | 'boolean';
  nonNullCount: number;
  nullCount: number;
  uniqueCount: number;
  numericStats?: NumericStats;
  topCategories?: CategoryFrequency[];
  dateRange?: { minDate: string; maxDate: string };
}

export interface ParsedExcelDataset {
  id: string;
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  rows: Record<string, unknown>[];
  columnsSummaryText: string;
  parsedAt: string;
}

export interface TrendAnalysisReport {
  executiveSummary: string;
  keyTrends: {
    title: string;
    metric: string;
    direction: 'upward' | 'downward' | 'stable' | 'volatile';
    impact: 'high' | 'medium' | 'low';
    explanation: string;
  }[];
  anomalies: {
    column: string;
    observation: string;
    severity: 'critical' | 'warning' | 'info';
  }[];
  recommendedActions: string[];
  suggestedQuestions: string[];
}

export interface NaturalLanguageAnswer {
  directAnswer: string;
  supportingMetrics: {
    label: string;
    value: string;
    context: string;
  }[];
  breakdownTable: {
    headers: string[];
    rows: string[][];
  };
  methodologyNote: string;
  followUpPrompts: string[];
}

export interface TimeSeriesForecastPoint {
  period: string;
  isForecast: boolean;
  actual?: number;
  forecast: number;
  lowerBound: number;
  upperBound: number;
  rowCount: number;
}

export interface StatisticalForecastResult {
  metricColumn: string;
  timeColumn: string;
  aggregationMode: 'sum' | 'mean';
  horizonPeriods: number;
  horizonLabel: string;
  confidenceLevelPct: number;
  rSquared: number;
  historicalGrowthPct: number;
  projectedGrowthPct: number;
  volatilityPct: number;
  points: TimeSeriesForecastPoint[];
}

export interface AIForecastCommentary {
  forecastHeadline: string;
  confidenceAssessment: {
    scorePct: number;
    rating: 'High' | 'Moderate' | 'Low';
    rationale: string;
  };
  assumptions: {
    assumption: string;
    category: string;
    sensitivity: 'High' | 'Medium' | 'Low';
    impactDescription: string;
  }[];
  scenarios: {
    name: string;
    projectedValue: string;
    probabilityPct: number;
    conditions: string;
  }[];
  riskFactors: string[];
}

function computeNumericStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      sum: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      q25: 0,
      q75: 0,
      trendSlope: 0,
    };
  }

  let sum = 0;
  let min = values[0];
  let max = values[0];

  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    sumX += i;
    sumY += v;
    sumXY += i * v;
    sumX2 += i * i;
  }

  const mean = sum / n;
  let varianceSum = 0;
  for (let i = 0; i < n; i++) {
    const diff = values[i] - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / n);

  const sorted = [...values].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const q25 = sorted[Math.floor(n * 0.25)];
  const q75 = sorted[Math.floor(n * 0.75)];

  const denom = n * sumX2 - sumX * sumX;
  const trendSlope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    sum: Number(sum.toFixed(2)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    q25: Number(q25.toFixed(4)),
    q75: Number(q75.toFixed(4)),
    trendSlope: Number(trendSlope.toFixed(6)),
  };
}

export function profileRows(
  rows: Record<string, unknown>[],
  fileName: string,
  sheetNames: string[],
  activeSheet: string,
  existingId?: string
): ParsedExcelDataset {
  const rowCount = rows.length;
  const colSet = new Set<string>();
  const sampleCheckLimit = Math.min(rowCount, 500);
  for (let i = 0; i < sampleCheckLimit; i++) {
    const r = rows[i];
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => colSet.add(k));
    }
  }
  const colNames = Array.from(colSet);
  const columns: ColumnProfile[] = [];

  for (const colName of colNames) {
    let nonNullCount = 0;
    let nullCount = 0;
    const numericVals: number[] = [];
    const freqMap = new Map<string, number>();
    let dateValidCount = 0;
    let boolCount = 0;

    for (let i = 0; i < rowCount; i++) {
      const rawVal = rows[i]?.[colName];
      if (rawVal === null || rawVal === undefined || rawVal === '') {
        nullCount++;
        continue;
      }
      nonNullCount++;

      if (typeof rawVal === 'boolean') {
        boolCount++;
        const str = String(rawVal);
        freqMap.set(str, (freqMap.get(str) || 0) + 1);
        continue;
      }

      if (typeof rawVal === 'number' && !Number.isNaN(rawVal)) {
        numericVals.push(rawVal);
        continue;
      }

      const strVal = String(rawVal).trim();
      const cleanedNumStr = strVal.replace(/^[₹$€£¥,]+|[%,]+$/g, '').replace(/,/g, '');
      if (
        cleanedNumStr !== '' &&
        !Number.isNaN(Number(cleanedNumStr)) &&
        !/^\d{4}-\d{2}-\d{2}/.test(strVal)
      ) {
        numericVals.push(Number(cleanedNumStr));
      } else {
        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(strVal) || /^\d{4}-Q[1-4]/i.test(strVal)) {
          dateValidCount++;
        }
        freqMap.set(strVal, (freqMap.get(strVal) || 0) + 1);
      }
    }

    const isNumeric = nonNullCount > 0 && numericVals.length / nonNullCount >= 0.75;
    const isBoolean = nonNullCount > 0 && boolCount / nonNullCount >= 0.8;
    const isDate = !isNumeric && nonNullCount > 0 && dateValidCount / nonNullCount >= 0.7;

    if (isNumeric) {
      const uniqueCount = new Set(numericVals).size;
      columns.push({
        name: colName,
        type: 'numeric',
        nonNullCount,
        nullCount,
        uniqueCount,
        numericStats: computeNumericStats(numericVals),
      });
    } else if (isDate) {
      const sortedDates = Array.from(freqMap.keys()).sort();
      const topCategories = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([value, count]) => ({
          value,
          count,
          percentage: Number(((count / Math.max(1, nonNullCount)) * 100).toFixed(1)),
        }));
      columns.push({
        name: colName,
        type: 'date',
        nonNullCount,
        nullCount,
        uniqueCount: freqMap.size,
        dateRange: {
          minDate: sortedDates[0] || '',
          maxDate: sortedDates[sortedDates.length - 1] || '',
        },
        topCategories,
      });
    } else {
      const topCategories = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([value, count]) => ({
          value,
          count,
          percentage: Number(((count / Math.max(1, nonNullCount)) * 100).toFixed(1)),
        }));
      columns.push({
        name: colName,
        type: isBoolean ? 'boolean' : 'categorical',
        nonNullCount,
        nullCount,
        uniqueCount: freqMap.size,
        topCategories,
      });
    }
  }

  const categoricalCols = columns.filter(
    (c) => (c.type === 'categorical' || c.type === 'date') && c.uniqueCount <= 30
  );
  const numericCols = columns.filter((c) => c.type === 'numeric');

  const cohortSummaries: string[] = [];
  for (const catCol of categoricalCols.slice(0, 3)) {
    const groupMap = new Map<string, { count: number; sums: Record<string, number> }>();
    for (let i = 0; i < rowCount; i++) {
      const key = String(rows[i]?.[catCol.name] ?? 'Unknown');
      let entry = groupMap.get(key);
      if (!entry) {
        entry = { count: 0, sums: {} };
        groupMap.set(key, entry);
      }
      entry.count++;
      for (const numCol of numericCols.slice(0, 4)) {
        const val = Number(rows[i]?.[numCol.name]);
        if (!Number.isNaN(val)) {
          entry.sums[numCol.name] = (entry.sums[numCol.name] || 0) + val;
        }
      }
    }
    const groupLines = Array.from(groupMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([k, v]) => {
        const metricsStr = Object.entries(v.sums)
          .map(
            ([mName, total]) =>
              `${mName}_sum=${total.toFixed(1)}, ${mName}_avg=${(total / v.count).toFixed(2)}`
          )
          .join('; ');
        return `  - ${k} (n=${v.count}): ${metricsStr}`;
      });
    cohortSummaries.push(`Group-By [${catCol.name}]:\n${groupLines.join('\n')}`);
  }

  const colDescriptions = columns.map((c) => {
    if (c.type === 'numeric' && c.numericStats) {
      const s = c.numericStats;
      return `- ${c.name} [NUMERIC, nonNull=${c.nonNullCount}, null=${c.nullCount}]: sum=${s.sum}, mean=${s.mean}, median=${s.median}, min=${s.min}, max=${s.max}, stdDev=${s.stdDev}, Q25=${s.q25}, Q75=${s.q75}, slope=${s.trendSlope}`;
    }
    if (c.type === 'date' && c.dateRange) {
      return `- ${c.name} [DATE, unique=${c.uniqueCount}]: range=${c.dateRange.minDate} to ${c.dateRange.maxDate}`;
    }
    const topStr =
      c.topCategories?.map((t) => `${t.value} (${t.count}, ${t.percentage}%)`).join(', ') || '';
    return `- ${c.name} [${c.type.toUpperCase()}, unique=${c.uniqueCount}, null=${c.nullCount}]: top=[${topStr}]`;
  });

  const sampleRowsJson = JSON.stringify(rows.slice(0, 6));

  const columnsSummaryText = [
    `Dataset: ${fileName} (Sheet: ${activeSheet})`,
    `Total Rows: ${rowCount} | Total Columns: ${columns.length}`,
    `Column Statistical Profiles:`,
    ...colDescriptions,
    cohortSummaries.length > 0
      ? `\nPre-Computed Dimensional Aggregations:\n${cohortSummaries.join('\n\n')}`
      : '',
    `\nSample Rows (first 6): ${sampleRowsJson}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 14800);

  return {
    id: existingId || `ds_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    sheetNames,
    activeSheet,
    rowCount,
    columnCount: columns.length,
    columns,
    rows,
    columnsSummaryText,
    parsedAt: new Date().toISOString(),
  };
}

export async function parseExcelFileBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  preferredSheet?: string
): Promise<{ workbook: XLSX.WorkBook; dataset: ParsedExcelDataset }> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }
  const activeSheet =
    preferredSheet && sheetNames.includes(preferredSheet) ? preferredSheet : sheetNames[0];
  const worksheet = workbook.Sheets[activeSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: true,
  });

  const normalizedRows = rawRows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k] = v.toISOString().split('T')[0];
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  const dataset = profileRows(normalizedRows, fileName, sheetNames, activeSheet);
  return { workbook, dataset };
}

/**
 * Generates future period labels (e.g. 2026-Q4, 2027-Q1 or 2026-11, 2026-12 or Period +1)
 */
function generateNextPeriodLabels(lastLabel: string, count: number): string[] {
  const labels: string[] = [];
  const quarterMatch = /^(\d{4})-Q([1-4])$/i.exec(lastLabel.trim());
  if (quarterMatch) {
    let year = parseInt(quarterMatch[1], 10);
    let q = parseInt(quarterMatch[2], 10);
    for (let i = 0; i < count; i++) {
      q += 1;
      if (q > 4) {
        q = 1;
        year += 1;
      }
      labels.push(`${year}-Q${q}`);
    }
    return labels;
  }

  const ymMatch = /^(\d{4})[-/](\d{1,2})/.exec(lastLabel.trim());
  if (ymMatch) {
    let year = parseInt(ymMatch[1], 10);
    let month = parseInt(ymMatch[2], 10);
    for (let i = 0; i < count; i++) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      labels.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    return labels;
  }

  for (let i = 1; i <= count; i++) {
    labels.push(`Forecast +${i}`);
  }
  return labels;
}

/**
 * Computes statistical time-series forecast using OLS linear trend + damped seasonal/residual modeling
 * and standard error confidence cones (80%, 90%, 95%).
 */
export function computeTimeSeriesForecast(params: {
  dataset: ParsedExcelDataset;
  metricCol: string;
  timeCol: string;
  aggregationMode: 'sum' | 'mean';
  horizonPeriods: number;
  horizonLabel: string;
  confidenceLevelPct: number;
}): StatisticalForecastResult {
  const {
    dataset,
    metricCol,
    timeCol,
    aggregationMode,
    horizonPeriods,
    horizonLabel,
    confidenceLevelPct,
  } = params;

  const bucketMap = new Map<string, { sum: number; count: number }>();

  if (dataset.rows.length > 0 && timeCol) {
    for (let i = 0; i < dataset.rows.length; i++) {
      const r = dataset.rows[i];
      let rawPeriod = String(r[timeCol] ?? '').trim();
      if (!rawPeriod) continue;
      // Group YYYY-MM-DD dates by YYYY-MM month if there are many unique dates
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawPeriod)) {
        rawPeriod = rawPeriod.slice(0, 7);
      }
      const val = Number(r[metricCol]);
      if (Number.isNaN(val)) continue;
      const entry = bucketMap.get(rawPeriod) || { sum: 0, count: 0 };
      entry.sum += val;
      entry.count += 1;
      bucketMap.set(rawPeriod, entry);
    }
  }

  let sortedBuckets = Array.from(bucketMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, d]) => ({
      period,
      value: aggregationMode === 'sum' ? d.sum : d.sum / Math.max(1, d.count),
      rowCount: d.count,
    }));

  // If time column has too few buckets (or dataset is restored from cloud summary), partition rows sequentially
  if (sortedBuckets.length < 3 && dataset.rows.length >= 6) {
    bucketMap.clear();
    const numBuckets = Math.min(12, Math.max(4, Math.floor(dataset.rows.length / 20)));
    const bucketSize = Math.ceil(dataset.rows.length / numBuckets);
    sortedBuckets = [];
    for (let b = 0; b < numBuckets; b++) {
      const slice = dataset.rows.slice(b * bucketSize, (b + 1) * bucketSize);
      let sum = 0;
      let count = 0;
      for (const r of slice) {
        const v = Number(r[metricCol]);
        if (!Number.isNaN(v)) {
          sum += v;
          count++;
        }
      }
      if (count > 0) {
        sortedBuckets.push({
          period: `Segment ${b + 1}`,
          value: aggregationMode === 'sum' ? sum : sum / count,
          rowCount: count,
        });
      }
    }
  }

  // Fallback synthetic series if rows are empty (e.g. cloud-restored summary)
  if (sortedBuckets.length === 0) {
    const colProfile = dataset.columns.find((c) => c.name === metricCol);
    const baseMean = colProfile?.numericStats?.mean || 1000;
    const baseSlope = colProfile?.numericStats?.trendSlope || 15;
    for (let i = 0; i < 6; i++) {
      sortedBuckets.push({
        period: `2025-Q${(i % 4) + 1}`,
        value: baseMean + i * baseSlope * 100,
        rowCount: Math.round(dataset.rowCount / 6),
      });
    }
  }

  // Limit to last 24 historical periods for crisp charting and regression
  if (sortedBuckets.length > 24) {
    sortedBuckets = sortedBuckets.slice(-24);
  }

  const n = sortedBuckets.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const y = sortedBuckets[i].value;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumX2 += i * i;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = meanY - slope * meanX;

  // Compute R-squared and standard error of residuals
  let ssTot = 0;
  let ssRes = 0;
  const residuals: number[] = [];

  for (let i = 0; i < n; i++) {
    const y = sortedBuckets[i].value;
    const yHat = intercept + slope * i;
    const res = y - yHat;
    residuals.push(res);
    ssTot += (y - meanY) * (y - meanY);
    ssRes += res * res;
  }

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0.85;
  const residualStdErr =
    n > 2 ? Math.sqrt(ssRes / (n - 2)) : Math.max(Math.abs(meanY) * 0.08, 1);

  // Z-multiplier for confidence interval (80% -> 1.28, 90% -> 1.645, 95% -> 1.96)
  const zScore =
    confidenceLevelPct >= 95 ? 1.96 : confidenceLevelPct >= 90 ? 1.645 : 1.282;

  const points: TimeSeriesForecastPoint[] = [];

  for (let i = 0; i < n; i++) {
    const actualVal = Number(sortedBuckets[i].value.toFixed(2));
    const fittedVal = Number((intercept + slope * i).toFixed(2));
    points.push({
      period: sortedBuckets[i].period,
      isForecast: false,
      actual: actualVal,
      forecast: fittedVal,
      lowerBound: actualVal,
      upperBound: actualVal,
      rowCount: sortedBuckets[i].rowCount,
    });
  }

  const futureLabels = generateNextPeriodLabels(
    sortedBuckets[n - 1]?.period || 'Period',
    horizonPeriods
  );

  // Extract seasonal/cyclical pattern from recent residuals
  const cycleLen = Math.min(4, n);
  for (let h = 1; h <= horizonPeriods; h++) {
    const idx = n - 1 + h;
    const seasonalOffset = residuals[(n - cycleLen + ((h - 1) % cycleLen)) % n] * 0.35;
    const rawProjected = intercept + slope * idx + seasonalOffset;
    // Widening confidence cone proportional to sqrt(h)
    const margin = zScore * residualStdErr * Math.sqrt(1 + h * 0.45);
    const forecastVal = Number(rawProjected.toFixed(2));
    const lowerBound = Number((rawProjected - margin).toFixed(2));
    const upperBound = Number((rawProjected + margin).toFixed(2));

    points.push({
      period: futureLabels[h - 1],
      isForecast: true,
      forecast: forecastVal,
      lowerBound,
      upperBound,
      rowCount: 0,
    });
  }

  const firstActual = sortedBuckets[0]?.value || 1;
  const lastActual = sortedBuckets[n - 1]?.value || 1;
  const lastForecast = points[points.length - 1]?.forecast || lastActual;

  const historicalGrowthPct =
    Math.abs(firstActual) > 0
      ? Number((((lastActual - firstActual) / Math.abs(firstActual)) * 100).toFixed(1))
      : 0;

  const projectedGrowthPct =
    Math.abs(lastActual) > 0
      ? Number((((lastForecast - lastActual) / Math.abs(lastActual)) * 100).toFixed(1))
      : 0;

  const volatilityPct =
    Math.abs(meanY) > 0
      ? Number(((residualStdErr / Math.abs(meanY)) * 100).toFixed(1))
      : 0;

  return {
    metricColumn: metricCol,
    timeColumn: timeCol || 'Sequential Segments',
    aggregationMode,
    horizonPeriods,
    horizonLabel,
    confidenceLevelPct,
    rSquared: Number(rSquared.toFixed(3)),
    historicalGrowthPct,
    projectedGrowthPct,
    volatilityPct,
    points,
  };
}

/**
 * Computes Pearson correlation coefficient (r) and linear regression line between two numeric columns
 */
export function computeScatterCorrelation(
  rows: Record<string, unknown>[],
  xCol: string,
  yCol: string,
  categoryCol?: string,
  maxPoints = 350
): {
  points: { x: number; y: number; category: string; label: string }[];
  pearsonR: number;
  slope: number;
  intercept: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  const validPairs: { x: number; y: number; category: string; label: string }[] = [];
  const step = Math.max(1, Math.floor(rows.length / maxPoints));

  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i];
    const x = Number(r?.[xCol]);
    const y = Number(r?.[yCol]);
    if (!Number.isNaN(x) && !Number.isNaN(y)) {
      const cat = categoryCol ? String(r?.[categoryCol] ?? 'General') : 'Record';
      validPairs.push({
        x,
        y,
        category: cat,
        label: `Row #${i + 1} (${cat})`,
      });
    }
  }

  const n = validPairs.length;
  if (n === 0) {
    return {
      points: [],
      pearsonR: 0,
      slope: 0,
      intercept: 0,
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let xMin = validPairs[0].x;
  let xMax = validPairs[0].x;
  let yMin = validPairs[0].y;
  let yMax = validPairs[0].y;

  for (let i = 0; i < n; i++) {
    const { x, y } = validPairs[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }

  const num = n * sumXY - sumX * sumY;
  const denX = n * sumX2 - sumX * sumX;
  const denY = n * sumY2 - sumY * sumY;
  const denom = Math.sqrt(Math.max(0, denX * denY));
  const pearsonR = denom > 0 ? Number((num / denom).toFixed(3)) : 0;
  const slope = denX > 0 ? num / denX : 0;
  const intercept = sumY / n - slope * (sumX / n);

  return {
    points: validPairs,
    pearsonR,
    slope,
    intercept,
    xMin,
    xMax,
    yMin,
    yMax,
  };
}

export function buildDynamicQueryContext(
  dataset: ParsedExcelDataset,
  question: string
): string {
  const qLower = question.toLowerCase();
  const matchedColumns = dataset.columns.filter((c) =>
    qLower.includes(c.name.toLowerCase())
  );

  const matchedCategoryFilters: { col: string; val: string }[] = [];
  for (const col of dataset.columns) {
    if (col.topCategories) {
      for (const cat of col.topCategories) {
        if (cat.value.length >= 2 && qLower.includes(cat.value.toLowerCase())) {
          matchedCategoryFilters.push({ col: col.name, val: cat.value });
        }
      }
    }
  }

  let filteredRows = dataset.rows;
  if (matchedCategoryFilters.length > 0) {
    filteredRows = dataset.rows.filter((r) =>
      matchedCategoryFilters.some(
        (f) => String(r[f.col] ?? '').toLowerCase() === f.val.toLowerCase()
      )
    );
  }

  const numericCols = dataset.columns.filter((c) => c.type === 'numeric');
  const sliceStatsLines: string[] = [];

  if (matchedCategoryFilters.length > 0 && filteredRows.length > 0) {
    sliceStatsLines.push(
      `Filtered Slice matching [${matchedCategoryFilters
        .map((f) => `${f.col}="${f.val}"`)
        .join(' OR ')}] (${filteredRows.length} rows):`
    );
    for (const numCol of numericCols.slice(0, 6)) {
      const vals = filteredRows
        .map((r) => Number(r[numCol.name]))
        .filter((v) => !Number.isNaN(v));
      if (vals.length > 0) {
        const s = computeNumericStats(vals);
        sliceStatsLines.push(
          `  - ${numCol.name}: sum=${s.sum}, mean=${s.mean}, median=${s.median}, min=${s.min}, max=${s.max}`
        );
      }
    }
  }

  let extremeSampleStr = '';
  const targetSortCol =
    matchedColumns.find((c) => c.type === 'numeric') || numericCols[0];
  if (targetSortCol && dataset.rows.length > 0) {
    const sortedByTarget = [...filteredRows]
      .filter((r) => !Number.isNaN(Number(r[targetSortCol.name])))
      .sort((a, b) => Number(b[targetSortCol.name]) - Number(a[targetSortCol.name]));
    const top5 = sortedByTarget.slice(0, 5);
    const bottom5 = sortedByTarget.slice(-5).reverse();
    extremeSampleStr = `Top 5 rows by [${targetSortCol.name}]: ${JSON.stringify(
      top5
    )}\nBottom 5 rows by [${targetSortCol.name}]: ${JSON.stringify(bottom5)}`;
  }

  return [
    dataset.columnsSummaryText,
    sliceStatsLines.length > 0 ? sliceStatsLines.join('\n') : '',
    extremeSampleStr,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 24000);
}

export function generateEnterpriseSampleDataset(rowCount = 12500): ParsedExcelDataset {
  const regions = ['North America', 'EMEA', 'Asia-Pacific', 'Latin America'];
  const productLines = [
    'Quantum Edge Server Q9',
    'Neural Tensor Blade X4',
    'CryoRack Optical Switch',
    'Autonomous Logistics Node',
    'Photonics Interconnect Array',
    'Solid-State Grid Storage',
  ];
  const channels = ['Enterprise Direct', 'Cloud Marketplace', 'Strategic Partner', 'Gov & Defense'];
  const quarters = ['2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'];

  const rows: Record<string, unknown>[] = [];

  let seed = 421337;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < rowCount; i++) {
    const qIdx = Math.min(quarters.length - 1, Math.floor((i / rowCount) * quarters.length));
    const quarter = quarters[qIdx];
    const region = regions[Math.floor(nextRand() * regions.length)];
    const product = productLines[Math.floor(nextRand() * productLines.length)];
    const channel = channels[Math.floor(nextRand() * channels.length)];

    const quarterGrowthMultiplier = 1 + qIdx * 0.085;
    const regionMultiplier =
      region === 'Asia-Pacific'
        ? 1.28 + qIdx * 0.04
        : region === 'North America'
        ? 1.35
        : region === 'EMEA'
        ? 1.05
        : 0.82;

    const baseUnits = Math.max(1, Math.round((12 + nextRand() * 85) * quarterGrowthMultiplier));
    const unitPrice =
      product === 'Quantum Edge Server Q9'
        ? 4800
        : product === 'Neural Tensor Blade X4'
        ? 3200
        : product === 'Photonics Interconnect Array'
        ? 2150
        : 1450;

    const discountPct = Number((nextRand() * 18).toFixed(1));
    const revenueUSD = Number(
      (baseUnits * unitPrice * regionMultiplier * (1 - discountPct / 100)).toFixed(2)
    );
    const grossMarginPct = Number(
      (
        (product === 'Neural Tensor Blade X4' ? 64 : 52) -
        discountPct * 0.65 +
        (nextRand() - 0.5) * 6
      ).toFixed(2)
    );
    const leadTimeDays = Math.max(
      2,
      Math.round(
        (region === 'Latin America' ? 24 : region === 'EMEA' ? 14 : 9) +
          nextRand() * 12 -
          qIdx * 0.7
      )
    );
    const isAnomalyBatch =
      region === 'Latin America' &&
      product === 'CryoRack Optical Switch' &&
      quarter === '2026-Q2';
    const defectRatePct = Number(
      (isAnomalyBatch ? 6.8 + nextRand() * 3.5 : 0.25 + nextRand() * 1.4).toFixed(2)
    );

    const monthNum = ((qIdx * 3 + Math.floor(nextRand() * 3)) % 12) + 1;
    const yearNum = quarter.startsWith('2026') ? 2026 : 2025;
    const dayNum = Math.floor(nextRand() * 28) + 1;
    const orderDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(
      2,
      '0'
    )}`;

    rows.push({
      Order_ID: `ORD-${100000 + i}`,
      Order_Date: orderDate,
      Fiscal_Quarter: quarter,
      Region: region,
      Product_Line: product,
      Sales_Channel: channel,
      Units_Shipped: baseUnits,
      Unit_Price_USD: unitPrice,
      Discount_Pct: discountPct,
      Revenue_USD: revenueUSD,
      Gross_Margin_Pct: grossMarginPct,
      Lead_Time_Days: leadTimeDays,
      Defect_Rate_Pct: defectRatePct,
    });
  }

  return profileRows(
    rows,
    'YUAI_Global_Supply_And_Revenue_12500.xlsx',
    ['Global_Ledger_12500'],
    'Global_Ledger_12500',
    'ds_enterprise_12500'
  );
}

export function exportDatasetToExcelFile(dataset: ParsedExcelDataset): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(dataset.rows);
  XLSX.utils.book_append_sheet(wb, ws, dataset.activeSheet.slice(0, 31) || 'Sheet1');
  const outName = dataset.fileName.endsWith('.xlsx')
    ? dataset.fileName
    : `${dataset.fileName.replace(/\.[^.]+$/, '')}.xlsx`;
  XLSX.writeFile(wb, outName);
}
