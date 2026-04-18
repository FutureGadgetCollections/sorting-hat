(async function () {
  const errorBox  = document.getElementById('builder-error');
  const content   = document.getElementById('builder-content');
  const summary   = document.getElementById('builder-summary');
  const titleEl   = document.getElementById('builder-title');
  const subtitle  = document.getElementById('builder-subtitle');
  const tbody     = document.getElementById('card-rows');
  const btnCsv    = document.getElementById('btn-csv');
  const btnCsvMp  = document.getElementById('btn-csv-manapool');
  const btnRecalc = document.getElementById('btn-recalc');
  const cfgMult   = document.getElementById('cfg-multiplier');
  const cfgMultHint = document.getElementById('cfg-multiplier-hint');
  const cfgStrat  = document.getElementById('cfg-price-strategy');
  const cfgPctWrap = document.getElementById('cfg-price-pct-wrap');
  const cfgPct    = document.getElementById('cfg-price-pct');

  const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
  const RARITY_LABEL = { mythic: 'M', rare: 'R', uncommon: 'U', common: 'C' };

  function fail(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('d-none');
  }

  const game    = qsGet('game');
  const setCode = qsGet('set');
  const product = qsGet('product');
  if (!game || !setCode || !product) {
    fail('Missing game/set/product in URL.');
    return;
  }

  let catalog, singleCards, prices;
  try {
    [catalog, singleCards, prices] = await Promise.all([
      loadLocalJson('/data/sets.json'),
      loadJsonData('data/single-cards.json'),
      loadJsonData('data/tcgplayer-latest-prices.json'),
    ]);
  } catch (e) {
    fail(`Failed to load data: ${e.message}`);
    return;
  }

  const gameDef = catalog.games.find(g => g.code === game);
  const setDef  = gameDef && gameDef.sets.find(s => s.code === setCode);
  const prodDef = setDef && setDef.products.find(p => p.type === product);
  if (!prodDef) { fail('Unknown product selection.'); return; }

  // Collect deck files (single deck OR case with multiple decks)
  const deckRefs = prodDef.kind === 'case'
    ? prodDef.components
    : [{ deck_file: prodDef.deck_file, quantity: 1 }];

  let decks;
  try {
    decks = await Promise.all(
      deckRefs.map(async ref => ({
        quantity: ref.quantity || 1,
        data: await loadLocalJson(`/data/decks/${ref.deck_file}`),
      }))
    );
  } catch (e) {
    fail(`Failed to load deck list(s): ${e.message}`);
    return;
  }

  // Build merged per-card quantities for ONE unit of this product
  // key = card_number
  const perUnitQty = {};
  for (const { quantity, data } of decks) {
    for (const c of data.cards) {
      perUnitQty[c.card_number] = (perUnitQty[c.card_number] || 0) + (c.quantity || 1) * quantity;
    }
  }

  // Index single-cards by (game, set, number)
  const cardKey = (g, s, n) => `${g}|${s}|${n}`;
  const cardsByKey = {};
  for (const c of singleCards) {
    cardsByKey[cardKey(c.game, c.set_code, c.card_number)] = c;
  }

  // Index prices by tcgplayer_id (string)
  const priceById = {};
  for (const p of prices) priceById[String(p.tcgplayer_id)] = p.market_price;

  // Compose row models
  const rows = [];
  for (const [num, qPerUnit] of Object.entries(perUnitQty)) {
    const card = cardsByKey[cardKey(game, setCode, num)];
    if (!card) {
      console.warn(`No single_cards entry for ${game}/${setCode}/${num}`);
      continue;
    }
    const market = card.tcgplayer_id != null ? priceById[String(card.tcgplayer_id)] : null;
    rows.push({
      tcgplayer_id: card.tcgplayer_id,
      number:       card.card_number,
      name:         card.name,
      rarity:       (card.rarity || 'common').toLowerCase(),
      qPerUnit,
      market: market != null ? Number(market) : null,
    });
  }

  rows.sort((a, b) => {
    const r = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
    if (r) return r;
    const an = parseInt(a.number, 10);
    const bn = parseInt(b.number, 10);
    if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
    return String(a.number).localeCompare(String(b.number));
  });

  // Render UI
  titleEl.textContent = prodDef.name;
  subtitle.textContent = `${gameDef.name} · ${setDef.name}`;
  cfgMultHint.textContent = prodDef.kind === 'case'
    ? `Each unit = the full case (${deckRefs.length} decks)`
    : '1 = open one of this product';
  document.title = `${prodDef.name} | ${document.title.split('|').pop().trim()}`;

  function listPriceFor(market) {
    if (market == null) return null;
    if (cfgStrat.value === 'market-pct') {
      const pct = parseFloat(cfgPct.value) || 100;
      return Math.round(market * pct) / 100;
    }
    return Math.round(market * 100) / 100;
  }

  function render() {
    const mult = Math.max(1, parseInt(cfgMult.value, 10) || 1);
    tbody.innerHTML = '';
    let nCards = 0, totalQty = 0, sumMkt = 0, sumListed = 0;
    rows.forEach((r, idx) => {
      const addQty = r.qPerUnit * mult;
      const list   = listPriceFor(r.market);
      const tr = document.createElement('tr');
      tr.className = 'card-row';
      tr.innerHTML = `
        <td><span class="rarity-badge rarity-${r.rarity}">${RARITY_LABEL[r.rarity] || r.rarity}</span></td>
        <td class="text-muted">${r.number}</td>
        <td>${r.name}${r.tcgplayer_id ? '' : ' <span class="badge text-bg-warning ms-1">no TCG ID</span>'}</td>
        <td class="text-end">${r.market != null ? '$' + r.market.toFixed(2) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end">
          <input type="number" min="0" step="0.01" class="form-control form-control-sm text-end js-list-price"
                 data-idx="${idx}" value="${list != null ? list.toFixed(2) : ''}">
        </td>
        <td class="text-end">
          <input type="number" min="0" step="1" class="form-control form-control-sm text-end qty-input ms-auto js-add-qty"
                 data-idx="${idx}" value="${addQty}">
        </td>`;
      tbody.appendChild(tr);
      if (r.tcgplayer_id) nCards += 1;
      totalQty += addQty;
      if (r.market != null) sumMkt += r.market * addQty;
      if (list != null) sumListed += list * addQty;
    });
    document.getElementById('sum-cards').textContent  = nCards;
    document.getElementById('sum-qty').textContent    = totalQty;
    document.getElementById('sum-market').textContent = '$' + sumMkt.toFixed(2);
    document.getElementById('sum-listed').textContent = '$' + sumListed.toFixed(2);
    btnCsv.disabled = nCards === 0;
    btnCsvMp.disabled = nCards === 0;
  }

  function updateSummary() {
    let totalQty = 0, sumMkt = 0, sumListed = 0;
    document.querySelectorAll('tr.card-row').forEach(tr => {
      const qInput = tr.querySelector('.js-add-qty');
      const lInput = tr.querySelector('.js-list-price');
      const idx = parseInt(qInput.dataset.idx, 10);
      const r = rows[idx];
      const q = parseInt(qInput.value, 10) || 0;
      const l = parseFloat(lInput.value);
      totalQty += q;
      if (r.market != null) sumMkt += r.market * q;
      if (!isNaN(l)) sumListed += l * q;
    });
    document.getElementById('sum-qty').textContent    = totalQty;
    document.getElementById('sum-market').textContent = '$' + sumMkt.toFixed(2);
    document.getElementById('sum-listed').textContent = '$' + sumListed.toFixed(2);
  }

  cfgStrat.addEventListener('change', () => {
    cfgPctWrap.hidden = cfgStrat.value !== 'market-pct';
  });
  btnRecalc.addEventListener('click', render);
  cfgMult.addEventListener('change', render);

  tbody.addEventListener('input', e => {
    if (e.target.matches('.js-add-qty, .js-list-price')) updateSummary();
  });

  function collectExportRows() {
    const exportRows = [];
    document.querySelectorAll('tr.card-row').forEach(tr => {
      const qInput = tr.querySelector('.js-add-qty');
      const lInput = tr.querySelector('.js-list-price');
      const idx = parseInt(qInput.dataset.idx, 10);
      const r = rows[idx];
      const addQty = parseInt(qInput.value, 10) || 0;
      if (!r.tcgplayer_id || addQty <= 0) return;
      const listPrice = parseFloat(lInput.value);
      exportRows.push({
        tcgplayer_id: r.tcgplayer_id,
        addQty,
        listPrice: isNaN(listPrice) ? '' : listPrice.toFixed(2),
      });
    });
    return exportRows;
  }

  function exportAs(marketplace) {
    const exportRows = collectExportRows();
    if (exportRows.length === 0) {
      showToast('Nothing to export — every row is qty 0 or missing a TCGplayer Id.', 'warning');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const qtyHeader = marketplace === 'manapool' ? 'Total Quantity' : 'Add to Quantity';
    const filename  = `${marketplace}_${game}_${setCode}_${product}_${stamp}.csv`;
    downloadCsv(filename, buildCsv(exportRows, qtyHeader));
    showToast(`Exported ${exportRows.length} row${exportRows.length === 1 ? '' : 's'} for ${marketplace}.`, 'success');
  }

  btnCsv.addEventListener('click',   () => exportAs('tcgplayer'));
  btnCsvMp.addEventListener('click', () => exportAs('manapool'));

  // Manapool button is MTG-only
  if (game === 'mtg') btnCsvMp.classList.remove('d-none');

  render();
  content.classList.remove('d-none');
  summary.classList.remove('d-none');
})();
