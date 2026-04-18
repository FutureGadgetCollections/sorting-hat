(async function () {
  const gamesEl    = document.getElementById('picker-games');
  const setsEl     = document.getElementById('picker-sets');
  const productsEl = document.getElementById('picker-products');
  const footerEl   = document.getElementById('picker-footer');
  const goBtn      = document.getElementById('picker-go');

  let catalog;
  try {
    catalog = await loadLocalJson('/data/sets.json');
  } catch (e) {
    showToast(`Failed to load catalog: ${e.message}`, 'danger');
    return;
  }

  const base = (window.SITE_BASE || '/').replace(/\/$/, '');
  const selection = { game: null, set: null, product: null };

  function img(src, alt) {
    if (!src) return `<div class="picker-tile-fallback">${alt}</div>`;
    return `<img class="picker-tile-img" src="${base}${src}" alt="${alt}" loading="lazy"
                 onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'picker-tile-fallback',textContent:this.alt}))">`;
  }

  function tileHtml(opts) {
    // opts: {key, label, image, sublabel?, kind: 'game'|'set'|'product'}
    return `
      <div class="col-6 col-sm-4 col-md-3 col-lg-2">
        <button type="button" class="picker-tile" data-${opts.kind}="${opts.key}">
          <div class="picker-tile-thumb">${img(opts.image, opts.label)}</div>
          <div class="picker-tile-label">${opts.label}</div>
          ${opts.sublabel ? `<div class="picker-tile-sub text-muted small">${opts.sublabel}</div>` : ''}
        </button>
      </div>`;
  }

  function renderGames() {
    gamesEl.innerHTML = catalog.games
      .map(g => tileHtml({ kind: 'game', key: g.code, label: g.name, image: g.image }))
      .join('');
  }

  function renderSets(game) {
    setsEl.innerHTML = (game.sets || [])
      .map(s => tileHtml({
        kind: 'set', key: s.code, label: s.name, image: s.image,
        sublabel: `${(s.products || []).length} product${(s.products || []).length === 1 ? '' : 's'}`,
      }))
      .join('');
    setsEl.closest('.picker-step').classList.remove('d-none');
  }

  function renderProducts(set) {
    productsEl.innerHTML = (set.products || [])
      .map(p => {
        // Strip trailing " — Commander Deck" / " — One of Each ..." for tile label brevity.
        const label = p.name.split(' \u2014 ')[0];
        return tileHtml({
          kind: 'product', key: p.type, label, image: p.image,
          sublabel: p.kind === 'case' ? 'Case' : '',
        });
      })
      .join('');
    productsEl.closest('.picker-step').classList.remove('d-none');
    footerEl.classList.remove('d-none');
  }

  function clearActive(container) {
    container.querySelectorAll('.picker-tile.active').forEach(el => el.classList.remove('active'));
  }

  function pickGame(code) {
    if (selection.game === code) return;
    selection.game = code; selection.set = null; selection.product = null;
    clearActive(gamesEl);
    gamesEl.querySelector(`[data-game="${code}"]`)?.classList.add('active');
    setsEl.innerHTML = ''; productsEl.innerHTML = '';
    setsEl.closest('.picker-step').classList.add('d-none');
    productsEl.closest('.picker-step').classList.add('d-none');
    footerEl.classList.add('d-none');
    const game = catalog.games.find(g => g.code === code);
    if (game) renderSets(game);
    updateGo();
  }

  function pickSet(code) {
    if (selection.set === code) return;
    selection.set = code; selection.product = null;
    clearActive(setsEl);
    setsEl.querySelector(`[data-set="${code}"]`)?.classList.add('active');
    productsEl.innerHTML = '';
    productsEl.closest('.picker-step').classList.add('d-none');
    footerEl.classList.add('d-none');
    const game = catalog.games.find(g => g.code === selection.game);
    const set  = game?.sets.find(s => s.code === code);
    if (set) renderProducts(set);
    updateGo();
  }

  function pickProduct(type) {
    selection.product = type;
    clearActive(productsEl);
    productsEl.querySelector(`[data-product="${type}"]`)?.classList.add('active');
    updateGo();
  }

  function updateGo() {
    goBtn.disabled = !(selection.game && selection.set && selection.product);
  }

  // Event delegation
  gamesEl.addEventListener('click', e => {
    const t = e.target.closest('[data-game]'); if (t) pickGame(t.dataset.game);
  });
  setsEl.addEventListener('click', e => {
    const t = e.target.closest('[data-set]'); if (t) pickSet(t.dataset.set);
  });
  productsEl.addEventListener('click', e => {
    const t = e.target.closest('[data-product]'); if (t) pickProduct(t.dataset.product);
  });

  goBtn.addEventListener('click', () => {
    const params = new URLSearchParams({
      game: selection.game, set: selection.set, product: selection.product,
    });
    window.location.href = `${base}/builder/?${params.toString()}`;
  });

  renderGames();
  // If only one game, auto-pick it.
  if (catalog.games.length === 1) pickGame(catalog.games[0].code);
})();
