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

// TCGPlayer rows: {tcgplayer_id (=SKU id), addQty, listPrice, foil?}
// Mana Pool rows: {mp_card_id, name, set, number, rarity, finish, addQty, listPrice}
function buildCsv(rows, marketplace = 'tcgplayer') {
  if (marketplace === 'manapool') return buildManapoolCsv(rows);
  return buildTcgplayerCsv(rows);
}

function buildTcgplayerCsv(rows) {
  // TCGPlayer's "Export Pricing CSV" format: Condition column carries the
  // "Foil" suffix; no separate Printing column. The TCGplayer Id column is
  // the SKU id (per condition+variant+language), not the product id.
  const headers = ['TCGplayer Id', 'Condition', 'Add to Quantity', 'TCG Marketplace Price'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    if (!r.tcgplayer_id || r.addQty <= 0) continue;
    const condition = r.foil ? 'Near Mint Foil' : 'Near Mint';
    lines.push([r.tcgplayer_id, condition, r.addQty, r.listPrice ?? ''].map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function buildManapoolCsv(rows) {
  // Mana Pool's seller-export native format. product_id is MP's UUID per
  // printing; finish (NF | FO) selects the SKU. Market columns are
  // informational and may be left blank.
  const headers = ['product_type','product_id','name','set','number','rarity',
                   'language','finish','condition','price','market_low',
                   'market_price','market_price_foil','quantity','exported_at'];
  const lines = [headers.join(',')];
  const stamp = new Date().toISOString();
  for (const r of rows) {
    if (!r.mp_card_id || r.addQty <= 0) continue;
    lines.push([
      'mtg_single', r.mp_card_id, r.name, (r.set || '').toUpperCase(), r.number,
      r.rarity || '', 'EN', r.finish, 'NM', r.listPrice ?? '',
      '', '', '', r.addQty, stamp,
    ].map(csvEscape).join(','));
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
