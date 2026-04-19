// Builds a marketplace-specific CSV from a row-set.
//
// Format references:
//   TCGPlayer mass upload:
//     https://help.tcgplayer.com/hc/en-us/articles/115002358027
//     A new SKU row needs Condition + Printing or it parses without
//     adding inventory.
//   Mana Pool TCGPlayer-style upload:
//     https://support.manapool.com/hc/en-us/articles/21894301054487
//     Required columns: TCGplayer Id, Total Quantity, My Store Price
//     (TCG Marketplace Price is optional and overridden by My Store Price).

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// rows: array of {tcgplayer_id, addQty, listPrice, foil?}
// marketplace: 'tcgplayer' or 'manapool'
function buildCsv(rows, marketplace = 'tcgplayer') {
  const isMp = marketplace === 'manapool';
  const headers = isMp
    ? ['TCGplayer Id', 'Total Quantity', 'My Store Price']
    : ['TCGplayer Id', 'Condition', 'Printing', 'Add to Quantity', 'TCG Marketplace Price'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    if (!r.tcgplayer_id || r.addQty <= 0) continue;
    const printing = r.foil ? 'Foil' : 'Normal';
    const condition = r.foil ? 'Near Mint Foil' : 'Near Mint';
    const cells = isMp
      ? [r.tcgplayer_id, r.addQty, r.listPrice ?? '']
      : [r.tcgplayer_id, condition, printing, r.addQty, r.listPrice ?? ''];
    lines.push(cells.map(csvEscape).join(','));
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
