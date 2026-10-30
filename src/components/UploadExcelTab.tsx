import React, { useRef, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Sparkles,
  Search,
  ArrowUpDown,
  Layers,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ParsedExcelDataset,
  parseExcelFileBuffer,
  profileRows,
  exportDatasetToExcelFile,
} from '../utils/excelEngine';

interface UploadExcelTabProps {
  activeDataset: ParsedExcelDataset | null;
  isAnalyzingTrends: boolean;
  onDatasetReady: (dataset: ParsedExcelDataset, triggerAutoAnalysis: boolean) => void;
  onLoadEnterpriseSample: () => void;
  onNavigateAnalyze: () => void;
}

export const UploadExcelTab: React.FC<UploadExcelTabProps> = ({
  activeDataset,
  isAnalyzingTrends,
  onDatasetReady,
  onLoadEnterpriseSample,
  onNavigateAnalyze,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const handleFileSelection = async (file: File) => {
    setParseError(null);
    setIsParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const { workbook, dataset } = await parseExcelFileBuffer(buffer, file.name);
      workbookRef.current = workbook;
      setCurrentPage(1);
      onDatasetReady(dataset, true);
    } catch (err: unknown) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Unable to parse spreadsheet. Please upload a valid .xlsx, .xls, or .csv file.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleSwitchSheet = (sheetName: string) => {
    if (!activeDataset || !workbookRef.current) return;
    const ws = workbookRef.current.Sheets[sheetName];
    if (!ws) return;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: true,
    });
    const normalized = rawRows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = v instanceof Date ? v.toISOString().split('T')[0] : v;
      }
      return out;
    });
    const updated = profileRows(
      normalized,
      activeDataset.fileName,
      activeDataset.sheetNames,
      sheetName
    );
    setCurrentPage(1);
    onDatasetReady(updated, true);
  };

  const filteredAndSortedRows = useMemo(() => {
    if (!activeDataset) return [];
    let list = activeDataset.rows;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      list = list.filter((row) =>
        Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
      );
    }
    if (sortColumn) {
      list = [...list].sort((a, b) => {
        const va = a[sortColumn];
        const vb = b[sortColumn];
        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          return sortAsc ? na - nb : nb - na;
        }
        return sortAsc
          ? String(va ?? '').localeCompare(String(vb ?? ''))
          : String(vb ?? '').localeCompare(String(va ?? ''));
      });
    }
    return list;
  }, [activeDataset, searchQuery, sortColumn, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedRows.slice(start, start + rowsPerPage);
  }, [filteredAndSortedRows, currentPage]);

  const handleSortCol = (colName: string) => {
    if (sortColumn === colName) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColumn(colName);
      setSortAsc(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Header & Primary Upload Excel Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-medium mb-2">
            <span>Excel Ingestion & Statistical Profiler</span>
            <span aria-hidden="true">·</span>
            <span>Supports .XLSX, .XLS & .CSV</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Upload Excel Data & Profile Columns
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Upload your spreadsheet below. YUAI automatically profiles every column, computes
            quartiles and regression slopes across tens of thousands of rows, and extracts deep
            natural-language trends.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelection(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isParsing}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{isParsing ? 'Parsing Workbook...' : 'Upload Excel File'}</span>
          </button>

          <button
            onClick={onLoadEnterpriseSample}
            className="px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Load 12,500-Row Enterprise Excel</span>
          </button>

          {activeDataset && (
            <button
              onClick={() => exportDatasetToExcelFile(activeDataset)}
              className="px-4 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-slate-300 border border-slate-800 font-medium text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>Export .XLSX</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Drag-and-Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFileSelection(f);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-sky-400 bg-sky-500/10'
            : 'border-slate-800 bg-[#0b1120] hover:border-slate-700'
        }`}
      >
        <div className="max-w-lg mx-auto flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
            <FileSpreadsheet className="w-6 h-6 text-sky-400" />
          </div>
          <p className="text-base font-semibold text-white">
            Click the Upload Excel button or drag and drop your workbook here
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Processes massive multi-sheet `.xlsx`, `.xls`, and `.csv` datasets directly in memory
            with instant AI trend extraction and cloud synchronization.
          </p>
        </div>
      </div>

      {parseError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 flex items-center gap-3 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Active Dataset Summary & Column Statistical Profiles */}
      {activeDataset ? (
        <div className="space-y-8">
          {/* Dataset Bar */}
          <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Workbook Indexed & Ready for Natural-Language Interrogation</span>
                {isAnalyzingTrends && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-sky-400">Synthesizing AI Trends...</span>
                  </>
                )}
              </div>
              <h2 className="text-lg font-bold text-white font-mono">
                {activeDataset.fileName}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                <span>{activeDataset.rowCount.toLocaleString()} Rows</span>
                <span aria-hidden="true">·</span>
                <span>{activeDataset.columnCount} Columns</span>
                <span aria-hidden="true">·</span>
                <span>Active Sheet: {activeDataset.activeSheet}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {activeDataset.sheetNames.length > 1 && (
                <div className="flex items-center gap-1 bg-[#070b14] p-1 rounded-lg border border-slate-800">
                  {activeDataset.sheetNames.map((sName) => (
                    <button
                      key={sName}
                      onClick={() => handleSwitchSheet(sName)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeDataset.activeSheet === sName
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sName}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={onNavigateAnalyze}
                className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>View AI Trends & Ask Questions</span>
              </button>
            </div>
          </div>

          {/* Column Statistical Schema Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                01. Automated Column Statistical Profile
              </h3>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {activeDataset.columns.length} Columns Analyzed
              </span>
            </div>

            <div className="bg-[#0b1120] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0f172a]/60">
                    <th className="py-3 px-4 font-medium">Column Name</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium text-right">Valid / Missing</th>
                    <th className="py-3 px-4 font-medium text-right">Unique</th>
                    <th className="py-3 px-4 font-medium text-right">Sum / Range</th>
                    <th className="py-3 px-4 font-medium text-right">Mean / Median</th>
                    <th className="py-3 px-4 font-medium">Distribution / Top Values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {activeDataset.columns.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-medium text-white whitespace-nowrap">
                        {col.name}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-400 capitalize whitespace-nowrap">
                        {col.type}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                        {col.nonNullCount.toLocaleString()} / {col.nullCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                        {col.uniqueCount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-sky-300 whitespace-nowrap">
                        {col.numericStats
                          ? `${col.numericStats.sum.toLocaleString()} (${col.numericStats.min} → ${col.numericStats.max})`
                          : col.dateRange
                          ? `${col.dateRange.minDate} → ${col.dateRange.maxDate}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                        {col.numericStats
                          ? `${col.numericStats.mean.toLocaleString()} / ${col.numericStats.median.toLocaleString()}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-400 max-w-md truncate">
                        {col.numericStats
                          ? `StdDev: ${col.numericStats.stdDev} · IQR: [${col.numericStats.q25}, ${col.numericStats.q75}] · Slope: ${col.numericStats.trendSlope}`
                          : col.topCategories
                              ?.slice(0, 4)
                              .map((c) => `${c.value} (${c.percentage}%)`)
                              .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* High-Density Interactive Spreadsheet Explorer */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">
                  02. High-Density Spreadsheet Row Explorer
                </h3>
                <p className="text-xs text-slate-400">
                  Filter and sort across all {activeDataset.rowCount.toLocaleString()} records in
                  real time. Click any column header to sort.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Filter across all rows..."
                    className="pl-9 pr-4 py-1.5 bg-[#0b1120] border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-64"
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#0b1120] border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0f172a]/60">
                    <th className="py-2.5 px-3 font-mono text-right w-14">#</th>
                    {activeDataset.columns.map((col) => (
                      <th
                        key={col.name}
                        onClick={() => handleSortCol(col.name)}
                        className={`py-2.5 px-3 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap ${
                          col.type === 'numeric' ? 'text-right' : 'text-left'
                        }`}
                      >
                        <div
                          className={`inline-flex items-center gap-1 ${
                            col.type === 'numeric' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <span>{col.name}</span>
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {paginatedRows.map((row, idx) => {
                    const rowNumber = (currentPage - 1) * rowsPerPage + idx + 1;
                    return (
                      <tr key={rowNumber} className="hover:bg-slate-900/60 transition-colors h-9">
                        <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500">
                          {rowNumber}
                        </td>
                        {activeDataset.columns.map((col) => {
                          const val = row[col.name];
                          const isNum = col.type === 'numeric' && typeof val === 'number';
                          return (
                            <td
                              key={col.name}
                              className={`py-2 px-3 whitespace-nowrap ${
                                col.type === 'numeric'
                                  ? 'text-right font-mono tabular-nums text-slate-200'
                                  : 'text-left text-slate-300'
                              }`}
                            >
                              {isNum ? val.toLocaleString() : String(val ?? '—')}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={activeDataset.columns.length + 1}
                        className="py-8 text-center text-slate-500 text-sm"
                      >
                        No rows match your search filter "{searchQuery}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span className="font-mono tabular-nums">
                Showing {paginatedRows.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0}–
                {Math.min(currentPage * rowsPerPage, filteredAndSortedRows.length)} of{' '}
                {filteredAndSortedRows.length.toLocaleString()} matching rows
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-2.5 py-1 bg-[#0b1120] border border-slate-800 rounded-md hover:bg-slate-900 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <span className="font-mono tabular-nums text-slate-300 px-2">
                  Page {currentPage} / {totalPages.toLocaleString()}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1 bg-[#0b1120] border border-slate-800 rounded-md hover:bg-slate-900 disabled:opacity-40 cursor-pointer flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-10 text-center space-y-4">
          <p className="text-base font-medium text-slate-200">
            No Excel workbook is currently loaded in memory.
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Upload your own `.xlsx`, `.xls`, or `.csv` file using the Upload Excel button above, or
            load our 12,500-row Enterprise Global Operations workbook to test instant trend
            discovery.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Upload Excel File
            </button>
            <button
              onClick={onLoadEnterpriseSample}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-xs rounded-lg transition-colors cursor-pointer"
            >
              Load 12,500-Row Sample Workbook
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
