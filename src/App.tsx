import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  onAuthStateChanged,
  User,
  SyncedDatasetDoc,
  SyncedQueryLogDoc,
  syncDatasetToCloud,
  updateDatasetTrendsInCloud,
  saveQueryLogToCloud,
  subscribeUserDatasets,
  subscribeDatasetQueries,
} from './firebase';
import {
  ParsedExcelDataset,
  TrendAnalysisReport,
  generateEnterpriseSampleDataset,
} from './utils/excelEngine';
import { FuturisticHome3D } from './components/FuturisticHome3D';
import { UploadExcelTab } from './components/UploadExcelTab';
import { TrendsAndAskTab, AnalystSubView } from './components/TrendsAndAskTab';
import { CloudSyncTab } from './components/CloudSyncTab';

type ActiveTab = 'home' | 'upload' | 'analyze' | 'forecast' | 'cloud';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [analystSubView, setAnalystSubView] = useState<AnalystSubView>('all');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);

  const [activeDataset, setActiveDataset] = useState<ParsedExcelDataset | null>(null);
  const [trendReport, setTrendReport] = useState<TrendAnalysisReport | null>(null);
  const [isAnalyzingTrends, setIsAnalyzingTrends] = useState<boolean>(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [syncedDatasets, setSyncedDatasets] = useState<SyncedDatasetDoc[]>([]);
  const [syncedQueries, setSyncedQueries] = useState<SyncedQueryLogDoc[]>([]);
  const [isSyncingNow, setIsSyncingNow] = useState<boolean>(false);

  // 1. Track Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Subscribe to user's cloud-synced datasets when authenticated
  useEffect(() => {
    if (!authReady || !user) {
      setSyncedDatasets([]);
      return;
    }
    const unsub = subscribeUserDatasets(user.uid, (items) => {
      setSyncedDatasets(items);
    });
    return () => unsub();
  }, [authReady, user]);

  // 3. Subscribe to current dataset's natural-language query logs when authenticated
  useEffect(() => {
    if (!authReady || !user || !activeDataset) {
      setSyncedQueries([]);
      return;
    }
    const unsub = subscribeDatasetQueries(user.uid, activeDataset.id, (queries) => {
      setSyncedQueries(queries);
    });
    return () => unsub();
  }, [authReady, user, activeDataset]);

  // Run automated Gemini trend extraction for a dataset
  const runTrendAnalysis = useCallback(async (dataset: ParsedExcelDataset) => {
    setIsAnalyzingTrends(true);
    setTrendError(null);
    try {
      const res = await fetch('/api/analyze-trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: dataset.fileName,
          sheetName: dataset.activeSheet,
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          columnsSummaryText: dataset.columnsSummaryText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract dataset trends.');
      }
      const report = data as TrendAnalysisReport;
      setTrendReport(report);

      if (auth.currentUser) {
        await updateDatasetTrendsInCloud(dataset.id, report.executiveSummary).catch(() => {});
      }
    } catch (err: unknown) {
      setTrendError(
        err instanceof Error ? err.message : 'Unable to generate automated trend report.'
      );
    } finally {
      setIsAnalyzingTrends(false);
    }
  }, []);

  // Handle when a new Excel workbook is uploaded or selected
  const handleDatasetReady = useCallback(
    async (dataset: ParsedExcelDataset, triggerAutoAnalysis: boolean) => {
      setActiveDataset(dataset);
      setTrendReport(null);

      if (auth.currentUser) {
        setIsSyncingNow(true);
        try {
          await syncDatasetToCloud({
            id: dataset.id,
            name: dataset.fileName,
            sheetName: dataset.activeSheet,
            rowCount: dataset.rowCount,
            columnCount: dataset.columnCount,
            columnsSummary: dataset.columnsSummaryText,
            trendsSummary: 'Analyzing dataset trends...',
          });
        } catch (err) {
          console.error('Cloud sync failed:', err);
        } finally {
          setIsSyncingNow(false);
        }
      }

      if (triggerAutoAnalysis) {
        runTrendAnalysis(dataset);
      }
    },
    [runTrendAnalysis]
  );

  // Load 12,500-Row Enterprise Sample Excel Dataset
  const handleLoadEnterpriseSample = useCallback(() => {
    const sample = generateEnterpriseSampleDataset(12500);
    handleDatasetReady(sample, true);
    setActiveTab('analyze');
    setAnalystSubView('all');
  }, [handleDatasetReady]);

  // Open Chat directly from the futuristic Home Screen Chat button
  const handleOpenChatFromHome = useCallback(() => {
    if (!activeDataset) {
      const sample = generateEnterpriseSampleDataset(12500);
      handleDatasetReady(sample, true);
    }
    setAnalystSubView('qa');
    setActiveTab('analyze');
  }, [activeDataset, handleDatasetReady]);

  // Manual Cloud Sync button handler
  const handleManualSyncCurrent = async () => {
    if (!activeDataset || !auth.currentUser) return;
    setIsSyncingNow(true);
    try {
      await syncDatasetToCloud({
        id: activeDataset.id,
        name: activeDataset.fileName,
        sheetName: activeDataset.activeSheet,
        rowCount: activeDataset.rowCount,
        columnCount: activeDataset.columnCount,
        columnsSummary: activeDataset.columnsSummaryText,
        trendsSummary: trendReport?.executiveSummary || 'Synced from YUAI workspace.',
      });
    } finally {
      setIsSyncingNow(false);
    }
  };

  // Restore a cloud-synced dataset profile into the active analyst workspace
  const handleRestoreSyncedDataset = (docItem: SyncedDatasetDoc) => {
    const restored: ParsedExcelDataset = {
      id: docItem.id,
      fileName: docItem.name,
      sheetNames: [docItem.sheetName],
      activeSheet: docItem.sheetName,
      rowCount: docItem.rowCount,
      columnCount: docItem.columnCount,
      columns: [],
      rows: [],
      columnsSummaryText: docItem.columnsSummary,
      parsedAt: new Date().toISOString(),
    };
    setActiveDataset(restored);
    runTrendAnalysis(restored);
    setActiveTab('analyze');
    setAnalystSubView('all');
  };

  const handleLogQueryToCloud = (question: string, answer: string) => {
    if (!user || !activeDataset) return;
    saveQueryLogToCloud({
      datasetId: activeDataset.id,
      question,
      answer,
    }).catch((err) => console.error('Failed to log query to cloud:', err));
  };

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract: [Zone 1: 1-line Brand] — [Zone 2: 5 single-line Nav Links] — [Zone 3: 1 Primary Action] */}
      <header className="h-[65px] flex items-center justify-between gap-8 px-6 border-b border-slate-800/80 bg-[#050811] sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
          }}
          className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 font-display"
        >
          YUAI
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('home');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'home'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Home 3D
          </a>
          <a
            href="#upload"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('upload');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'upload'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Upload Excel
          </a>
          <a
            href="#analyze"
            onClick={(e) => {
              e.preventDefault();
              setAnalystSubView('all');
              setActiveTab('analyze');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'analyze'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Charts & Q&A
          </a>
          <a
            href="#forecast"
            onClick={(e) => {
              e.preventDefault();
              setAnalystSubView('forecasting');
              setActiveTab('forecast');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'forecast'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Forecasting
          </a>
          <a
            href="#cloud"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('cloud');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeTab === 'cloud'
                ? 'text-white underline underline-offset-8 decoration-sky-400 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Cloud Sync
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => {
              if (activeTab === 'upload') {
                setAnalystSubView('all');
                setActiveTab('analyze');
              } else {
                setActiveTab('upload');
              }
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-500 hover:bg-sky-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {activeTab === 'upload' ? 'Explore Charts & Forecast' : 'Upload Excel'}
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <FuturisticHome3D onOpenChat={handleOpenChatFromHome} />
        )}

        {activeTab === 'upload' && (
          <UploadExcelTab
            activeDataset={activeDataset}
            isAnalyzingTrends={isAnalyzingTrends}
            onDatasetReady={handleDatasetReady}
            onLoadEnterpriseSample={handleLoadEnterpriseSample}
            onNavigateAnalyze={() => {
              setAnalystSubView('all');
              setActiveTab('analyze');
            }}
          />
        )}

        {(activeTab === 'analyze' || activeTab === 'forecast') && (
          <TrendsAndAskTab
            activeDataset={activeDataset}
            trendReport={trendReport}
            isAnalyzingTrends={isAnalyzingTrends}
            trendError={trendError}
            initialSubView={activeTab === 'forecast' ? 'forecasting' : analystSubView}
            onRefreshTrends={() => {
              if (activeDataset) runTrendAnalysis(activeDataset);
            }}
            onNavigateUpload={() => setActiveTab('upload')}
            onLoadEnterpriseSample={handleLoadEnterpriseSample}
            syncedQueries={syncedQueries}
            onLogQueryToCloud={handleLogQueryToCloud}
          />
        )}

        {activeTab === 'cloud' && (
          <CloudSyncTab
            user={user}
            authReady={authReady}
            activeDataset={activeDataset}
            syncedDatasets={syncedDatasets}
            isSyncingNow={isSyncingNow}
            onManualSyncCurrent={handleManualSyncCurrent}
            onRestoreSyncedDataset={handleRestoreSyncedDataset}
            onNavigateUpload={() => setActiveTab('upload')}
          />
        )}
      </main>
    </div>
  );
}
