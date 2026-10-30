import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  Trash2,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  LogIn,
  LogOut,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  User,
  SyncedDatasetDoc,
  signInWithGooglePopup,
  signOutUser,
  deleteDatasetFromCloud,
} from '../firebase';
import { ParsedExcelDataset } from '../utils/excelEngine';

interface CloudSyncTabProps {
  user: User | null;
  authReady: boolean;
  activeDataset: ParsedExcelDataset | null;
  syncedDatasets: SyncedDatasetDoc[];
  isSyncingNow: boolean;
  onManualSyncCurrent: () => Promise<void>;
  onRestoreSyncedDataset: (doc: SyncedDatasetDoc) => void;
  onNavigateUpload: () => void;
}

export const CloudSyncTab: React.FC<CloudSyncTabProps> = ({
  user,
  authReady,
  activeDataset,
  syncedDatasets,
  isSyncingNow,
  onManualSyncCurrent,
  onRestoreSyncedDataset,
  onNavigateUpload,
}) => {
  const [authError, setAuthError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGooglePopup();
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : 'Google Sign-In failed. Please try again.'
      );
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDatasetFromCloud(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium mb-1">
            <span>Zero-Trust Firestore Cloud Sync</span>
            <span aria-hidden="true">·</span>
            <span>Cross-Platform Continuity</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Cloud Synchronization & Cross-Platform Hub
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Synchronize your analyzed Excel statistical profiles, AI trend reports, and natural
            language query logs across desktop, tablet, and mobile sessions with strict per-owner
            Firestore isolation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {activeDataset && (
                <button
                  onClick={onManualSyncCurrent}
                  disabled={isSyncingNow}
                  className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingNow ? 'Synchronizing...' : 'Sync Active Workbook Now'}
                  </span>
                </button>
              )}
              <button
                onClick={() => signOutUser()}
                className="px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out ({user.email?.split('@')[0]})</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={!authReady}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In with Google to Enable Cloud Sync</span>
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-200">
          {authError}
        </div>
      )}

      {/* Cross-Platform Compatibility Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-sky-400">
            <span className="font-medium">Desktop Workstation</span>
            <Monitor className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-white">Full 1440px Spatial & Grid Engine</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Hardware-accelerated WebGL 3D neural core, multi-sheet Excel ingestion, and high-density
            tabular data exploration.
          </p>
        </div>

        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-sky-400">
            <span className="font-medium">Tablet & Executive iPad</span>
            <Tablet className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-white">Touch-Adaptive Orbit & Cohort Views</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Responsive split grids, touch-enabled 3D camera orbit controls, and 1-tap natural
            language executive query prompts.
          </p>
        </div>

        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-sky-400">
            <span className="font-medium">Mobile On-The-Go</span>
            <Smartphone className="w-4 h-4" />
          </div>
          <h3 className="text-base font-bold text-white">Real-Time Cloud Dataset Continuity</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Upload a massive spreadsheet on your workstation and interrogate its synced statistical
            profile from your phone anywhere.
          </p>
        </div>
      </div>

      {/* Cloud Synced Datasets Repository */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-sky-400" />
            <span>Synchronized Cloud Workbooks</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {user ? `${syncedDatasets.length} Workbooks Stored` : 'Authentication Required'}
          </span>
        </div>

        {!user ? (
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-10 text-center space-y-4">
            <ShieldCheck className="w-10 h-10 text-sky-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">
              Sign In to Synchronize Workbooks Across Devices
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              YUAI uses Firebase Authentication and zero-trust Firestore security rules (`ownerId ==
              request.auth.uid`) so only your verified account can read or write your spreadsheet
              intelligence.
            </p>
            <button
              onClick={handleSignIn}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        ) : syncedDatasets.length === 0 ? (
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-10 text-center space-y-4">
            <FileSpreadsheet className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-300 font-medium">
              No Excel datasets have been synchronized to your cloud vault yet.
            </p>
            <div className="flex justify-center gap-3">
              {activeDataset ? (
                <button
                  onClick={onManualSyncCurrent}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  Sync "{activeDataset.fileName}" Now
                </button>
              ) : (
                <button
                  onClick={onNavigateUpload}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  Go to Upload Excel Tab
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {syncedDatasets.map((docItem) => {
              const isCurrent = activeDataset?.id === docItem.id;
              return (
                <div
                  key={docItem.id}
                  className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-sky-400 font-mono">
                        Sheet: {docItem.sheetName}
                      </span>
                      {isCurrent && (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active in Workspace</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white font-mono truncate">
                      {docItem.name}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                      <span>{docItem.rowCount.toLocaleString()} Rows</span>
                      <span aria-hidden="true">·</span>
                      <span>{docItem.columnCount} Columns</span>
                    </div>

                    {docItem.trendsSummary && (
                      <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed pt-1">
                        {docItem.trendsSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <button
                      onClick={() => handleDelete(docItem.id)}
                      disabled={deletingId === docItem.id}
                      className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingId === docItem.id ? 'Removing...' : 'Delete'}</span>
                    </button>

                    <button
                      onClick={() => onRestoreSyncedDataset(docItem)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-sky-500 hover:text-slate-950 text-sky-400 border border-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Load into Q&A Analyst</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
