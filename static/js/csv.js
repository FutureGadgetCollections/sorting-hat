// Builds a TCGPlayer mass-upload CSV from a row-set.
// Format reference: https://help.tcgplayer.com/hc/en-us/articles/115002358027
// Columns mirror the export the user gets from "Export Pricing CSV" so a
// re-import correctly resolves products by TCGplayer Id.

const CSV_HEADERS = [
  'TCGplayer Id',
  'Add to Quantity',
  'TCG Marketplace Price',
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// rows: array of {tcgplayer_id, addQty, listPrice}
function buildCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    if (!r.tcgplayer_id || r.addQty <= 0) continue;
    lines.push([r.tcgplayer_id, r.addQty, r.listPrice ?? ''].map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
