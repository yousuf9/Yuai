import React, { useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Send,
  RefreshCw,
  FileSpreadsheet,
  ArrowUpRight,
  LineChart,
  Compass,
} from 'lucide-react';
import {
  ParsedExcelDataset,
  TrendAnalysisReport,
  NaturalLanguageAnswer,
  buildDynamicQueryContext,
} from '../utils/excelEngine';
import { SyncedQueryLogDoc } from '../firebase';
import { InteractiveVisualizations } from './InteractiveVisualizations';
import { TrendForecastingModule } from './TrendForecastingModule';

export type AnalystSubView = 'all' | 'visualizations' | 'forecasting' | 'qa';

interface TrendsAndAskTabProps {
  activeDataset: ParsedExcelDataset | null;
  trendReport: TrendAnalysisReport | null;
  isAnalyzingTrends: boolean;
  trendError: string | null;
  initialSubView?: AnalystSubView;
  onRefreshTrends: () => void;
  onNavigateUpload: () => void;
  onLoadEnterpriseSample: () => void;
  syncedQueries: SyncedQueryLogDoc[];
  onLogQueryToCloud: (question: string, answer: string) => void;
}

interface QAHistoryItem {
  id: string;
  question: string;
  response: NaturalLanguageAnswer;
  timestamp: string;
}

export const TrendsAndAskTab: React.FC<TrendsAndAskTabProps> = ({
  activeDataset,
  trendReport,
  isAnalyzingTrends,
  trendError,
  initialSubView = 'all',
  onRefreshTrends,
  onNavigateUpload,
  onLoadEnterpriseSample,
  syncedQueries,
  onLogQueryToCloud,
}) => {
  const [subView, setSubView] = useState<AnalystSubView>(initialSubView);
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [qaHistory, setQaHistory] = useState<QAHistoryItem[]>([]);

  React.useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  const handleAskQuestion = async (rawQuestion?: string) => {
    const qText = (rawQuestion ?? questionInput).trim();
    if (!qText || !activeDataset || isAsking) return;

    setAskError(null);
    setIsAsking(true);
    if (!rawQuestion) setQuestionInput('');

    try {
      const queryContext = buildDynamicQueryContext(activeDataset, qText);
      const chatHistory = qaHistory.slice(-4).map((item) => ({
        question: item.question,
        answer: item.response.directAnswer,
      }));

      const res = await fetch('/api/ask-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: qText,
          fileName: activeDataset.fileName,
          rowCount: activeDataset.rowCount,
          queryContext,
          chatHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze question.');
      }

      const newEntry: QAHistoryItem = {
        id: `qa_${Date.now()}`,
        question: qText,
        response: data as NaturalLanguageAnswer,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setQaHistory((prev) => [newEntry, ...prev]);
      onLogQueryToCloud(qText, data.directAnswer);
    } catch (err: unknown) {
      setAskError(
        err instanceof Error
          ? err.message
          : 'Unable to process natural language query.'
      );
    } finally {
      setIsAsking(false);
    }
  };

  if (!activeDataset) {
    return (
      <div className="max-w-[1440px] mx-auto px-6 py-16">
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <FileSpreadsheet className="w-10 h-10 text-sky-400 mx-auto" />
          <h2 className="text-2xl font-bold text-white">
            Upload an Excel Workbook to Launch Visual Charts, Forecasting & Q&A
          </h2>
          <p className="text-sm text-slate-400">
            Navigate to the dedicated Upload Excel tab to load your `.xlsx`, `.xls`, or `.csv`
            dataset, or load our 12,500-row Enterprise dataset immediately.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={onNavigateUpload}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
            >
              Go to Upload Excel Tab
            </button>
            <button
              onClick={onLoadEnterpriseSample}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer"
            >
              Load 12,500-Row Enterprise Sample
            </button>
          </div>
        </div>
      </div>
    );
  }

  const defaultPrompts =
    trendReport?.suggestedQuestions && trendReport.suggestedQuestions.length > 0
      ? trendReport.suggestedQuestions
      : [
          `What are the most significant upward and downward trends across all ${activeDataset.rowCount.toLocaleString()} rows?`,
          `Which segment or category drives the highest total value and how does it compare to the average?`,
          `Are there any anomalies, outliers, or unexpected drops that require immediate attention?`,
          `Provide a ranked breakdown table of the top performing groups with their averages and totals.`,
        ];

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Top Dataset Context & Module Filter Bar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium mb-1">
            <span>YUAI Intelligence Suite</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{activeDataset.fileName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {activeDataset.rowCount.toLocaleString()} Rows
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Interactive Visualizations, Trend Forecasting & Human-Language Q&A
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sub-module Segmented Filter */}
          <div className="flex items-center gap-1 bg-[#0b1120] p-1 rounded-lg border border-slate-800">
            {(
              [
                { id: 'all', label: 'All Suite Modules' },
                { id: 'visualizations', label: 'Interactive Charts' },
                { id: 'forecasting', label: 'Trend Forecasting' },
                { id: 'qa', label: 'Natural Language Q&A' },
              ] as { id: AnalystSubView; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubView(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  subView === tab.id
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={onRefreshTrends}
            disabled={isAnalyzingTrends}
            className="px-3.5 py-2 bg-[#0f172a] hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingTrends ? 'animate-spin' : ''}`} />
            <span>{isAnalyzingTrends ? 'Analyzing...' : 'Refresh Insights'}</span>
          </button>
        </div>
      </div>

      {/* MODULE 1: INTERACTIVE DATA VISUALIZATION STUDIO (Line, Bar, Scatter with Hover & Zoom) */}
      {(subView === 'all' || subView === 'visualizations') && (
        <InteractiveVisualizations dataset={activeDataset} />
      )}

      {/* MODULE 2: PREDICTIVE TREND FORECASTING ENGINE (Next Quarter / Year, Confidence Cones & Assumptions) */}
      {(subView === 'all' || subView === 'forecasting') && (
        <TrendForecastingModule dataset={activeDataset} />
      )}

      {/* MODULE 3: ASK ANYTHING IN PLAIN HUMAN LANGUAGE */}
      {(subView === 'all' || subView === 'qa') && (
        <section className="space-y-5">
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-sky-400" />
                  <span>Ask Anything About Your Excel Data</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type any question in everyday human language. YUAI computes exact slice statistics
                  across {activeDataset.rowCount.toLocaleString()} rows and returns data-backed
                  answers and tables.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion();
              }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                placeholder={`e.g., "Which region had the highest revenue and what was its average gross margin?"`}
                disabled={isAsking}
                className="flex-1 px-4 py-3 bg-[#070b14] border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
              />
              <button
                type="submit"
                disabled={isAsking || !questionInput.trim()}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{isAsking ? 'Computing Answer...' : 'Ask YUAI'}</span>
              </button>
            </form>

            {/* Suggested 1-Click Human-Language Prompts */}
            <div className="space-y-2 pt-1">
              <span className="text-xs text-slate-400">
                Suggested questions tailored to {activeDataset.fileName}:
              </span>
              <div className="flex flex-wrap gap-2">
                {defaultPrompts.map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskQuestion(promptText)}
                    disabled={isAsking}
                    className="text-left text-xs px-3 py-1.5 bg-[#070b14] hover:bg-slate-900 text-slate-300 hover:text-sky-300 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{promptText}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {askError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200">
                {askError}
              </div>
            )}
          </div>

          {/* Active Q&A Responses */}
          {qaHistory.length > 0 && (
            <div className="space-y-6">
              {qaHistory.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-5"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="text-xs text-sky-400 font-medium mb-1">
                        Human-Language Query · <span className="font-mono">{item.timestamp}</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">{item.question}</h3>
                    </div>
                  </div>

                  <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                    {item.response.directAnswer}
                  </div>

                  {item.response.supportingMetrics &&
                    item.response.supportingMetrics.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {item.response.supportingMetrics.map((m, idx) => (
                          <div
                            key={idx}
                            className="bg-[#070b14] border border-slate-800/90 rounded-lg p-4 space-y-1"
                          >
                            <div className="text-xs text-slate-400">{m.label}</div>
                            <div className="text-xl font-bold text-white font-mono tabular-nums">
                              {m.value}
                            </div>
                            <div className="text-xs text-slate-500">{m.context}</div>
                          </div>
                        ))}
                      </div>
                    )}

                  {item.response.breakdownTable &&
                    item.response.breakdownTable.headers?.length > 0 &&
                    item.response.breakdownTable.rows?.length > 0 && (
                      <div className="border border-slate-800 rounded-lg overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#0f172a] border-b border-slate-800 text-slate-400">
                              {item.response.breakdownTable.headers.map((h, i) => (
                                <th key={i} className="py-2.5 px-4 font-medium whitespace-nowrap">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {item.response.breakdownTable.rows.map((r, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-900/40">
                                {r.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="py-2 px-4 font-mono tabular-nums text-slate-200 whitespace-nowrap"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                    <span>Methodology: {item.response.methodologyNote}</span>
                    {item.response.followUpPrompts?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.response.followUpPrompts.slice(0, 2).map((fp, i) => (
                          <button
                            key={i}
                            onClick={() => handleAskQuestion(fp)}
                            className="text-sky-400 hover:text-sky-300 underline cursor-pointer text-left"
                          >
                            Ask: "{fp}"
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MODULE 4: AUTOMATED EXECUTIVE TREND & ANOMALY REPORT */}
      {subView === 'all' && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              Executive Trend Discovery & Anomaly Report
            </h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {activeDataset.rowCount.toLocaleString()} Records Evaluated
            </span>
          </div>

          {isAnalyzingTrends ? (
            <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-8 space-y-4">
              <div className="h-4 w-48 bg-slate-800 rounded animate-pulse" />
              <div className="h-16 w-full bg-slate-900 rounded animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-28 bg-slate-900 rounded animate-pulse" />
                <div className="h-28 bg-slate-900 rounded animate-pulse" />
              </div>
            </div>
          ) : trendError ? (
            <div className="bg-[#0b1120] border border-red-800/60 rounded-xl p-6 text-sm text-red-200 flex items-center justify-between">
              <span>{trendError}</span>
              <button
                onClick={onRefreshTrends}
                className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-white text-xs rounded-lg cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : trendReport ? (
            <div className="space-y-6">
              <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6">
                <div className="text-xs text-sky-400 font-medium mb-2">
                  Executive Synthesis · {activeDataset.fileName}
                </div>
                <p className="text-base text-slate-100 leading-relaxed">
                  {trendReport.executiveSummary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {trendReport.keyTrends.map((trend, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 font-medium text-slate-300">
                          {trend.direction === 'upward' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                          ) : trend.direction === 'downward' ? (
                            <TrendingDown className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Activity className="w-4 h-4 text-sky-400" />
                          )}
                          <span className="capitalize">{trend.direction} Trajectory</span>
                        </span>
                        <span className="font-mono tabular-nums text-sky-400">
                          {trend.metric}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white">{trend.title}</h3>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {trend.explanation}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
                      <span>Impact Level: {trend.impact.toUpperCase()}</span>
                      <button
                        onClick={() => {
                          setSubView('qa');
                          handleAskQuestion(
                            `Deep dive into "${trend.title}": what are the underlying drivers and numbers?`
                          );
                        }}
                        className="text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        Interrogate Trend →
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Statistical Outliers & Anomalies Detected</span>
                  </div>
                  <div className="divide-y divide-slate-800/70">
                    {trendReport.anomalies.map((anom, i) => (
                      <div key={i} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold text-amber-300">
                            {anom.column}
                          </span>
                          <span className="text-slate-400 uppercase">{anom.severity}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {anom.observation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 space-y-4">
                  <div className="text-sm font-semibold text-white">
                    Recommended Quantitative Actions
                  </div>
                  <ol className="space-y-3 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                    {trendReport.recommendedActions.map((act, i) => (
                      <li key={i} className="pl-1">
                        {act}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Cloud-Synchronized Query Log History */}
      {(subView === 'all' || subView === 'qa') && syncedQueries.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white">
            Cloud-Synchronized Natural Language Query Log
          </h2>
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl divide-y divide-slate-800">
            {syncedQueries.slice(0, 6).map((qDoc) => (
              <div key={qDoc.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-sky-400">
                  <span className="font-medium">Q: {qDoc.question}</span>
                  <button
                    onClick={() => handleAskQuestion(qDoc.question)}
                    className="text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Re-run Query
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{qDoc.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
