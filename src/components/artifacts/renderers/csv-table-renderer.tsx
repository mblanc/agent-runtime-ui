"use client";

import { FC, useState, useMemo, useCallback } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Table,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { parseCsv } from "@/lib/artifacts/csv-parser";
import { Button } from "@/components/ui/button";

interface CsvTableRendererProps {
  csv: string;
  filename?: string;
}

export const CsvTableRenderer: FC<CsvTableRendererProps> = ({
  csv,
  filename = "data.csv",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const parsed = useMemo(() => parseCsv(csv), [csv]);

  const handleSort = useCallback(
    (colIndex: number) => {
      if (sortCol === colIndex) {
        if (sortDir === "asc") {
          setSortDir("desc");
        } else {
          setSortCol(null);
          setSortDir("asc");
        }
      } else {
        setSortCol(colIndex);
        setSortDir("asc");
      }
      setCurrentPage(1);
    },
    [sortCol, sortDir]
  );

  const filteredRows = useMemo(() => {
    let result = parsed.rows;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(term))
      );
    }

    if (sortCol !== null && sortCol < parsed.headers.length) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol] ?? "";
        const valB = b[sortCol] ?? "";

        // Attempt numeric comparison
        const numA = parseFloat(valA.replace(/[^0-9.-]/g, ""));
        const numB = parseFloat(valB.replace(/[^0-9.-]/g, ""));

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDir === "asc" ? numA - numB : numB - numA;
        }

        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }

    return result;
  }, [parsed.rows, parsed.headers.length, searchTerm, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const displayedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const handleExportCsv = useCallback(() => {
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      filename.endsWith(".csv") ? filename : `${filename}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [csv, filename]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Table Subheader Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40 text-xs text-muted-foreground gap-3">
        <div className="flex items-center gap-2">
          <Table className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">
            {parsed.totalRows} {parsed.totalRows === 1 ? "row" : "rows"}
          </span>
          <span className="text-muted-foreground/60">•</span>
          <span>{parsed.headers.length} columns</span>
        </div>

        {/* Search & Export Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter records..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-7 w-36 sm:w-48 pl-7 pr-2 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            aria-label="Export CSV"
          >
            <Download className="w-3 h-3" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-muted/80 text-muted-foreground font-semibold sticky top-0 z-10 border-b border-border backdrop-blur-sm">
            <tr>
              <th className="py-2 px-3 w-10 text-center text-[10px] font-mono text-muted-foreground/60">
                #
              </th>
              {parsed.headers.map((header, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(idx)}
                  className="py-2.5 px-3.5 cursor-pointer hover:bg-muted select-none transition-colors"
                >
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="truncate">{header}</span>
                    {sortCol === idx ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="w-3 h-3 text-primary shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-primary shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={parsed.headers.length + 1}
                  className="py-8 text-center text-muted-foreground"
                >
                  {searchTerm ? "No matching records found." : "No data available."}
                </td>
              </tr>
            ) : (
              displayedRows.map((row, rowIdx) => {
                const globalIdx = (currentPage - 1) * pageSize + rowIdx + 1;
                return (
                  <tr
                    key={rowIdx}
                    className="hover:bg-muted/30 transition-colors font-mono text-[11px]"
                  >
                    <td className="py-2 px-3 text-center text-[10px] text-muted-foreground/60 select-none">
                      {globalIdx}
                    </td>
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="py-2 px-3.5 text-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {filteredRows.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground select-none">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-6 px-1.5 text-xs rounded border border-input bg-background text-foreground focus:outline-none"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="h-6 w-6 p-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="h-6 w-6 p-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
