// Builds a TCGPlayer mass-upload CSV from a row-set.
// Format reference: https://help.tcgplayer.com/hc/en-us/articles/115002358027
// Columns mirror the export the user gets from "Export Pricing CSV" so a
// re-import correctly resolves products by TCGplayer Id.

const CSV_HEADERS = [
  'TCGplayer Id',
  'Product Line',
  'Set Name',
  'Product Name',
  'Title',
  'Number',
  'Rarity',
  'Condition',
  'TCG Market Price',
  'TCG Direct Low',
  'TCG Low Price With Shipping',
  'TCG Low Price',
  'Total Quantity',
  'Add to Quantity',
  'TCG Marketplace Price',
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// rows: array of {tcgplayer_id, productLine, setName, productName, title, number, rarity, condition, marketPrice, addQty, listPrice}
function buildCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    if (!r.tcgplayer_id || r.addQty <= 0) continue;
    const row = [
      r.tcgplayer_id,
      r.productLine,
      r.setName,
      r.productName,
      r.title || '',
      r.number,
      r.rarity,
      r.condition,
      r.marketPrice ?? '',
      '', // TCG Direct Low — unknown
      '', // TCG Low Price With Shipping — unknown
      '', // TCG Low Price — unknown
      '', // Total Quantity — leave blank, "Add to Quantity" controls the change
      r.addQty,
      r.listPrice ?? '',
    ];
    lines.push(row.map(csvEscape).join(','));
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
