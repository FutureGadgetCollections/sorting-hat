(async function () {
  const errorBox  = document.getElementById('builder-error');
  const content   = document.getElementById('builder-content');
  const summary   = document.getElementById('builder-summary');
  const titleEl   = document.getElementById('builder-title');
  const subtitle  = document.getElementById('builder-subtitle');
  const tbody     = document.getElementById('card-rows');
  const thead     = document.getElementById('card-thead');
  const colMpMkt  = document.getElementById('col-mp-mkt');
  const colMpList = document.getElementById('col-mp-list');
  const btnCsv    = document.getElementById('btn-csv');
  const btnCsvMp  = document.getElementById('btn-csv-manapool');
  const btnSmart  = document.getElementById('btn-csv-smart');
  const btnRecalc = document.getElementById('btn-recalc');
  const cfgMult   = document.getElementById('cfg-multiplier');
  const cfgMultHint = document.getElementById('cfg-multiplier-hint');
  const cfgStrat  = document.getElementById('cfg-price-strategy');
  const cfgPctWrap = document.getElementById('cfg-price-pct-wrap');
  const cfgPct    = document.getElementById('cfg-price-pct');
  const cfgRoutingWrap = document.getElementById('cfg-routing-wrap');
  const cfgDefaultMkt = document.getElementById('cfg-default-marketplace');
  const cfgThreshold = document.getElementById('cfg-routing-threshold');

  const RARITY_ORDER = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
  const RARITY_LABEL = { mythic: 'M', rare: 'R', uncommon: 'U', common: 'C' };

  // Marketplace fees as decimals. Source: each marketplace's seller fee schedule.
  const TCG_FEE_RATE = 0.1325;
  const MP_FEE_RATE  = 0.079;

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
  const isMtg = game === 'mtg';

  let catalog, singleCards, prices, skuById = {}, mpSkuById = {};
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

  // Marketplace SKU lookups. Both index by TCGPlayer product id since that's
  // the join key we have on every row.
  // - TCGPlayer mass-upload CSV's "TCGplayer Id" column is the SKU id.
  // - Mana Pool's native CSV uses their per-printing UUID + a finish column.
  try {
    const skus = await loadJsonData('data/tcgplayer-skus.json');
    for (const s of skus) skuById[String(s.tcgplayer_id)] = s;
  } catch (e) {
    console.warn('[builder] tcgplayer-skus.json unavailable:', e.message);
  }
  try {
    const mp = await loadJsonData('data/manapool-skus.json');
    for (const s of mp) mpSkuById[String(s.tcgplayer_id)] = s;
  } catch (e) {
    console.warn('[builder] manapool-skus.json unavailable:', e.message);
  }

  // Mana Pool prices are MTG-only; failing soft if the file isn't published yet.
  let manapoolPriceById = {};
  if (isMtg) {
    try {
      const mp = await loadJsonData('data/manapool-latest-prices.json');
      for (const p of mp) {
        if (p.from_price != null) manapoolPriceById[String(p.tcgplayer_id)] = Number(p.from_price);
      }
    } catch (e) {
      console.warn('[builder] Mana Pool prices unavailable:', e.message);
    }
  }
  const hasManapool = isMtg && Object.keys(manapoolPriceById).length > 0;

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

  // Build merged per-card quantities for ONE unit of this product.
  // A deck entry may override its set with a `set` field (e.g. precons that
  // ship reprints from a different set); default is the deck's own set_code.
  // `foil:true` on the entry routes pricing to the foil SKU.
  const perUnitData = {};  // key -> {qty, foil}
  for (const { quantity, data } of decks) {
    const deckSet = data.set_code;
    for (const c of data.cards) {
      const cardSet = c.set || deckSet;
      const k = `${cardSet}|${c.card_number}|${c.foil ? 'F' : 'N'}`;
      const cur = perUnitData[k] || { qty: 0, foil: !!c.foil };
      cur.qty += (c.quantity || 1) * quantity;
      perUnitData[k] = cur;
    }
  }

  const cardKey = (g, s, n) => `${g}|${s}|${n}`;
  const cardsByKey = {};
  for (const c of singleCards) {
    cardsByKey[cardKey(c.game, c.set_code, c.card_number)] = c;
  }

  // Index TCGPlayer prices by id; keep both non-foil (market_price) and
  // foil (market_price_foil, sourced from Scryfall during the data sync).
  const tcgPriceById     = {};
  const tcgPriceFoilById = {};
  for (const p of prices) {
    const id = String(p.tcgplayer_id);
    tcgPriceById[id] = p.market_price;
    if (p.market_price_foil != null) tcgPriceFoilById[id] = p.market_price_foil;
  }

  const rows = [];
  for (const [k, info] of Object.entries(perUnitData)) {
    const [cardSet, num] = k.split('|');
    const card = cardsByKey[cardKey(game, cardSet, num)];
    if (!card) {
      console.warn(`No single_cards entry for ${game}/${cardSet}/${num}`);
      continue;
    }
    const idStr = card.tcgplayer_id != null ? String(card.tcgplayer_id) : null;
    const tcgMktNonfoil = idStr != null ? tcgPriceById[idStr] : null;
    const tcgMktFoil    = idStr != null ? tcgPriceFoilById[idStr] : null;
    // For Mana Pool we only have a single from_price for now (covers both
    // finishes); revisit when we wire up MP foil-specific pricing.
    const mpMkt = idStr != null ? manapoolPriceById[idStr] : null;
    const tcgMkt = info.foil
      ? (tcgMktFoil != null ? tcgMktFoil : tcgMktNonfoil)
      : tcgMktNonfoil;
    rows.push({
      tcgplayer_id: card.tcgplayer_id,
      set:          card.set_code,
      number:       card.card_number,
      name:         card.name,
      rarity:       (card.rarity || 'common').toLowerCase(),
      foil:         !!info.foil,
      qPerUnit:     info.qty,
      tcgMkt: tcgMkt != null ? Number(tcgMkt) : null,
      mpMkt:  mpMkt  != null ? Number(mpMkt)  : null,
    });
  }

  // Sort state — clicking a header toggles direction and re-renders.
  let sortKey = 'default';
  let sortDir = 1;

  function compareRows(a, b) {
    if (sortKey === 'name') {
      return sortDir * a.name.localeCompare(b.name);
    }
    if (sortKey === 'rarity') {
      const r = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
      return sortDir * r;
    }
    if (sortKey === 'number') {
      const an = parseInt(a.number, 10), bn = parseInt(b.number, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return sortDir * (an - bn);
      return sortDir * String(a.number).localeCompare(String(b.number));
    }
    if (sortKey === 'tcgMkt' || sortKey === 'mpMkt') {
      const av = a[sortKey], bv = b[sortKey];
      // Push nulls to the bottom regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir * (av - bv);
    }
    // default: rarity then number ascending
    const r = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
    if (r) return r;
    const an = parseInt(a.number, 10), bn = parseInt(b.number, 10);
    if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
    return String(a.number).localeCompare(String(b.number));
  }

  // Title row + subtitle
  titleEl.textContent = prodDef.name;
  subtitle.textContent = `${gameDef.name} · ${setDef.name}`;
  cfgMultHint.textContent = prodDef.kind === 'case'
    ? `Each unit = the full case (${deckRefs.length} decks)`
    : '1 = open one of this product';
  document.title = `${prodDef.name} | ${document.title.split('|').pop().trim()}`;

  // Show/hide MTG-only UI
  if (isMtg) {
    btnCsvMp.classList.remove('d-none');
    colMpMkt.classList.remove('d-none');
    colMpList.classList.remove('d-none');
    if (hasManapool) {
      btnSmart.classList.remove('d-none');
      cfgRoutingWrap.classList.remove('d-none');
    }
  }

  function listPriceFor(market) {
    if (market == null) return null;
    if (cfgStrat.value === 'market-pct') {
      const pct = parseFloat(cfgPct.value) || 100;
      return Math.round(market * pct) / 100;
    }
    return Math.round(market * 100) / 100;
  }

  function tcgPlayerUrl(id) {
    return id == null ? null : `https://www.tcgplayer.com/product/${id}`;
  }

  function manapoolSlug(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function manapoolUrl(r) {
    if (!isMtg) return null;
    return `https://manapool.com/card/${r.set}/${r.number}/${manapoolSlug(r.name)}`;
  }

  function nameCellHtml(r) {
    const tcg = tcgPlayerUrl(r.tcgplayer_id);
    const mp  = manapoolUrl(r);
    const foilBadge = r.foil
      ? ' <span class="badge text-bg-info ms-1" title="Foil printing — pricing reflects foil SKU">Foil</span>'
      : '';
    const noTcg = r.tcgplayer_id ? '' : ' <span class="badge text-bg-warning ms-1">no TCG ID</span>';
    const tcgLink = tcg
      ? ` <a href="${tcg}" target="_blank" rel="noopener" class="marketplace-link tcg-link" title="View on TCGPlayer" aria-label="TCGPlayer"><i class="bi bi-box-arrow-up-right"></i> TCG</a>`
      : '';
    const mpLink = mp
      ? ` <a href="${mp}" target="_blank" rel="noopener" class="marketplace-link mp-link" title="View on Mana Pool" aria-label="Mana Pool"><i class="bi bi-box-arrow-up-right"></i> MP</a>`
      : '';
    return r.name + foilBadge + noTcg + tcgLink + mpLink;
  }

  function render() {
    const mult = Math.max(1, parseInt(cfgMult.value, 10) || 1);
    rows.sort(compareRows);
    tbody.innerHTML = '';
    let nCards = 0, totalQty = 0, sumMkt = 0, sumListed = 0;
    rows.forEach((r, idx) => {
      const addQty = r.qPerUnit * mult;
      const tcgList = listPriceFor(r.tcgMkt);
      const mpList  = listPriceFor(r.mpMkt);
      const tr = document.createElement('tr');
      tr.className = 'card-row';
      tr.innerHTML = `
        <td><span class="rarity-badge rarity-${r.rarity}">${RARITY_LABEL[r.rarity] || r.rarity}</span></td>
        <td class="text-muted">${r.number}</td>
        <td>${nameCellHtml(r)}</td>
        <td class="text-end">${r.tcgMkt != null ? '$' + r.tcgMkt.toFixed(2) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end col-mp-mkt ${isMtg ? '' : 'd-none'}">${r.mpMkt != null ? '$' + r.mpMkt.toFixed(2) : '<span class="text-muted">—</span>'}</td>
        <td class="text-end">
          <input type="number" min="0" step="0.01" class="form-control form-control-sm text-end js-list-price-tcg"
                 data-idx="${idx}" value="${tcgList != null ? tcgList.toFixed(2) : ''}">
        </td>
        <td class="text-end col-mp-list ${isMtg ? '' : 'd-none'}">
          <input type="number" min="0" step="0.01" class="form-control form-control-sm text-end js-list-price-mp"
                 data-idx="${idx}" value="${mpList != null ? mpList.toFixed(2) : ''}">
        </td>
        <td class="text-end">
          <input type="number" min="0" step="1" class="form-control form-control-sm text-end qty-input ms-auto js-add-qty"
                 data-idx="${idx}" value="${addQty}">
        </td>`;
      tbody.appendChild(tr);
      if (r.tcgplayer_id) nCards += 1;
      totalQty += addQty;
      if (r.tcgMkt != null) sumMkt += r.tcgMkt * addQty;
      if (tcgList != null) sumListed += tcgList * addQty;
    });
    document.getElementById('sum-cards').textContent  = nCards;
    document.getElementById('sum-qty').textContent    = totalQty;
    document.getElementById('sum-market').textContent = '$' + sumMkt.toFixed(2);
    document.getElementById('sum-listed').textContent = '$' + sumListed.toFixed(2);
    btnCsv.disabled = nCards === 0;
    btnCsvMp.disabled = nCards === 0;
    btnSmart.disabled = nCards === 0;
    updateSortIndicators();
    // Re-apply premium gating: dynamic UI may have re-enabled buttons that
    // tier.js had locked, and any [data-premium] elements rendered just now
    // need their lock styling.
    if (window.applyTierGating) window.applyTierGating();
  }

  function updateSummary() {
    let totalQty = 0, sumMkt = 0, sumListed = 0;
    document.querySelectorAll('tr.card-row').forEach(tr => {
      const qInput = tr.querySelector('.js-add-qty');
      const lInput = tr.querySelector('.js-list-price-tcg');
      const idx = parseInt(qInput.dataset.idx, 10);
      const r = rows[idx];
      const q = parseInt(qInput.value, 10) || 0;
      const l = parseFloat(lInput.value);
      totalQty += q;
      if (r.tcgMkt != null) sumMkt += r.tcgMkt * q;
      if (!isNaN(l)) sumListed += l * q;
    });
    document.getElementById('sum-qty').textContent    = totalQty;
    document.getElementById('sum-market').textContent = '$' + sumMkt.toFixed(2);
    document.getElementById('sum-listed').textContent = '$' + sumListed.toFixed(2);
  }

  function updateSortIndicators() {
    thead.querySelectorAll('th[data-sort-key]').forEach(th => {
      const key = th.dataset.sortKey;
      const indicator = th.querySelector('.sort-indicator');
      if (!indicator) return;
      if (sortKey === key) {
        indicator.textContent = sortDir === 1 ? '▲' : '▼';
      } else {
        indicator.textContent = '';
      }
    });
  }

  cfgStrat.addEventListener('change', () => {
    cfgPctWrap.hidden = cfgStrat.value !== 'market-pct';
  });
  btnRecalc.addEventListener('click', render);
  cfgMult.addEventListener('change', render);

  thead.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort-key]');
    if (!th) return;
    const key = th.dataset.sortKey;
    if (sortKey === key) {
      sortDir = -sortDir;
    } else {
      sortKey = key;
      sortDir = 1;
    }
    render();
  });

  tbody.addEventListener('input', e => {
    if (e.target.matches('.js-add-qty, .js-list-price-tcg')) updateSummary();
  });

  function rowExportData() {
    return Array.from(document.querySelectorAll('tr.card-row')).map(tr => {
      const qInput = tr.querySelector('.js-add-qty');
      const tcgInput = tr.querySelector('.js-list-price-tcg');
      const mpInput  = tr.querySelector('.js-list-price-mp');
      const idx = parseInt(qInput.dataset.idx, 10);
      const r = rows[idx];
      const addQty = parseInt(qInput.value, 10) || 0;
      const tcgList = parseFloat(tcgInput.value);
      const mpList  = mpInput ? parseFloat(mpInput.value) : NaN;
      return {
        row: r,
        addQty,
        tcgList: isNaN(tcgList) ? null : tcgList,
        mpList:  isNaN(mpList)  ? null : mpList,
      };
    });
  }

  function downloadStamped(marketplace, csvRows) {
    const stamp = new Date().toISOString().slice(0, 10);
    const filename  = `${marketplace}_${game}_${setCode}_${product}_${stamp}.csv`;
    downloadCsv(filename, buildCsv(csvRows, marketplace));
  }

  // Build a marketplace-specific CSV row object for one card.
  // Returns null if the marketplace can't address this card (missing SKU
  // mapping). For TCGPlayer the keying field is the SKU id; for Mana Pool
  // it's their per-printing UUID + finish code.
  function buildCsvRow(marketplace, row, listPrice, addQty) {
    if (marketplace === 'tcgplayer') {
      const skus = skuById[String(row.tcgplayer_id)];
      if (!skus) return null;
      const skuId = row.foil ? skus.nm_foil_sku : skus.nm_normal_sku;
      if (skuId == null) return null;
      return { tcgplayer_id: skuId, foil: row.foil, addQty, listPrice: listPrice.toFixed(2) };
    }
    if (marketplace === 'manapool') {
      const m = mpSkuById[String(row.tcgplayer_id)];
      if (!m) return null;
      // MP's CSV product_id is the per-(card, finish, condition, language) UUID
      // from products_mtg_single, NOT cardsmtg.uuid. Pick by foil flag.
      const productId = row.foil ? m.fo_product_id : m.nf_product_id;
      if (!productId) return null;
      return {
        mp_product_id: productId,
        name:   m.name   || row.name,
        set:    m.set    || row.set,
        number: m.number || row.number,
        rarity: m.rarity || row.rarity,
        finish: row.foil ? 'FO' : 'NF',
        addQty, listPrice: listPrice.toFixed(2),
      };
    }
    return null;
  }

  function exportSingle(marketplace) {
    const data = rowExportData();
    const csvRows = [];
    let skipMissingSku = 0;
    for (const d of data) {
      if (!d.row.tcgplayer_id || d.addQty <= 0) continue;
      const list = marketplace === 'manapool' ? d.mpList : d.tcgList;
      if (list == null) continue;
      const csvRow = buildCsvRow(marketplace, d.row, list, d.addQty);
      if (csvRow == null) { skipMissingSku += 1; continue; }
      csvRows.push(csvRow);
    }
    if (csvRows.length === 0) {
      showToast('Nothing to export — every row is qty 0 or missing a list price.', 'warning');
      return;
    }
    downloadStamped(marketplace, csvRows);
    const skuNote = skipMissingSku ? ` (${skipMissingSku} skipped — no SKU mapping)` : '';
    showToast(`Exported ${csvRows.length} row${csvRows.length === 1 ? '' : 's'} for ${marketplace}.${skuNote}`, 'success');
  }

  function exportSmart() {
    const data = rowExportData();
    const defaultMkt = cfgDefaultMkt.value; // 'tcgplayer' or 'manapool'
    const thresholdPct = parseFloat(cfgThreshold.value);
    const threshold = (isNaN(thresholdPct) ? 5 : thresholdPct) / 100;

    const tcgRows = [], mpRows = [];
    let routedToOther = 0;

    for (const d of data) {
      if (!d.row.tcgplayer_id || d.addQty <= 0) continue;

      const tcgNet = d.tcgList != null ? d.tcgList * (1 - TCG_FEE_RATE) : null;
      const mpNet  = d.mpList  != null ? d.mpList  * (1 - MP_FEE_RATE)  : null;

      let target = defaultMkt;
      if (defaultMkt === 'tcgplayer') {
        if (tcgNet == null && mpNet != null) target = 'manapool';
        else if (tcgNet != null && mpNet != null && mpNet >= tcgNet * (1 + threshold)) {
          target = 'manapool';
          routedToOther += 1;
        }
      } else {
        if (mpNet == null && tcgNet != null) target = 'tcgplayer';
        else if (mpNet != null && tcgNet != null && tcgNet >= mpNet * (1 + threshold)) {
          target = 'tcgplayer';
          routedToOther += 1;
        }
      }

      if (target === 'tcgplayer' && d.tcgList != null) {
        const csvRow = buildCsvRow('tcgplayer', d.row, d.tcgList, d.addQty);
        if (csvRow != null) tcgRows.push(csvRow);
      } else if (target === 'manapool' && d.mpList != null) {
        const csvRow = buildCsvRow('manapool', d.row, d.mpList, d.addQty);
        if (csvRow != null) mpRows.push(csvRow);
      }
    }

    if (tcgRows.length === 0 && mpRows.length === 0) {
      showToast('Nothing to export — every row is qty 0 or missing both list prices.', 'warning');
      return;
    }
    // Always emit both CSVs (header-only when empty) so it's visually obvious
    // which marketplace the smart route picked nothing for. Brief stagger so
    // browsers don't collapse the second download into the first.
    downloadStamped('tcgplayer', tcgRows);
    setTimeout(() => downloadStamped('manapool', mpRows), 300);
    const feeNote = `(fees applied: TCG ${(TCG_FEE_RATE * 100).toFixed(2)}%, MP ${(MP_FEE_RATE * 100).toFixed(2)}%)`;
    showToast(
      `Smart route: ${tcgRows.length} TCGPlayer + ${mpRows.length} Mana Pool ` +
      (routedToOther ? `(${routedToOther} rerouted from default) ` : '') +
      feeNote,
      'success'
    );
  }

  btnCsv.addEventListener('click',   () => exportSingle('tcgplayer'));
  btnCsvMp.addEventListener('click', () => exportSingle('manapool'));
  btnSmart.addEventListener('click', exportSmart);

  render();
  content.classList.remove('d-none');
  summary.classList.remove('d-none');
})();
