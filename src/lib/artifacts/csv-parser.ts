/**
 * Robust CSV/TSV parser supporting quoted strings, commas, tabs, semicolons, and escaped characters.
 */
export interface ParsedCsvData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export function parseCsv(raw: string): ParsedCsvData {
  if (!raw || !raw.trim()) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  // Detect delimiter: comma, tab, or semicolon
  const firstLine = raw.split("\n")[0] || "";
  let delimiter = ",";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = "\t";
  } else if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ";";
  }

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let wasQuoted = false;
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        wasQuoted = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(wasQuoted ? currentField : currentField.trim());
        currentField = "";
        wasQuoted = false;
        i++;
        continue;
      } else if (char === "\r") {
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(wasQuoted ? currentField : currentField.trim());
        if (currentRow.some((field) => field.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        wasQuoted = false;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Flush last field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(wasQuoted ? currentField : currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = lines[0];
  const rows = lines.slice(1);

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}
