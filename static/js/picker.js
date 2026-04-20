(async function () {
  const gamesEl    = document.getElementById('picker-games');
  const setsEl     = document.getElementById('picker-sets');
  const productsEl = document.getElementById('picker-products');
  const footerEl   = document.getElementById('picker-footer');
  const goBtn      = document.getElementById('picker-go');
  const crumbEl    = document.getElementById('picker-breadcrumb');
  const gameStep    = gamesEl.closest('.picker-step');
  const setStep     = setsEl.closest('.picker-step');
  const productStep = productsEl.closest('.picker-step');

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
    setStep.classList.remove('d-none');
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
    productStep.classList.remove('d-none');
    footerEl.classList.remove('d-none');
  }

  function renderBreadcrumb() {
    const crumbs = [];
    if (selection.game) {
      const g = catalog.games.find(x => x.code === selection.game);
      crumbs.push({ level: 'game', label: g?.name || selection.game });
    }
    if (selection.set) {
      const g = catalog.games.find(x => x.code === selection.game);
      const s = g?.sets.find(x => x.code === selection.set);
      crumbs.push({ level: 'set', label: s?.name || selection.set });
    }
    if (crumbs.length === 0) {
      crumbEl.classList.add('d-none');
      crumbEl.innerHTML = '';
      return;
    }
    crumbEl.innerHTML = crumbs.map((c, i) => `
      <span class="picker-crumb">
        <span class="picker-crumb-label">${c.label}</span>
        <button type="button" class="picker-crumb-change btn btn-link btn-sm p-0 ms-1"
                data-level="${c.level}" aria-label="Change ${c.level}">Change</button>
      </span>
      ${i < crumbs.length - 1 ? '<span class="picker-crumb-sep"> › </span>' : ''}
    `).join('');
    crumbEl.classList.remove('d-none');
  }

  // After picking a game, we collapse the game grid so only sets show.
  // Calling resetTo('game') re-opens it and clears everything downstream.
  function applyVisibility() {
    // Game grid: hidden once a game is picked.
    gameStep.classList.toggle('d-none', !!selection.game);
    // Set step: visible only if a game is picked AND no set is picked yet
    //           (once a set is locked in, the set grid collapses too).
    if (!selection.game) {
      setStep.classList.add('d-none');
    } else if (selection.set) {
      setStep.classList.add('d-none');
    } else {
      setStep.classList.remove('d-none');
    }
    // Product step: visible only after a set is picked.
    productStep.classList.toggle('d-none', !selection.set);
    // Footer: visible only after a product is selected.
    footerEl.classList.toggle('d-none', !selection.product);
  }

  function resetTo(level) {
    // Clicking "Change" on a breadcrumb re-opens that step and clears everything below it.
    if (level === 'game') {
      selection.game = null; selection.set = null; selection.product = null;
      setsEl.innerHTML = ''; productsEl.innerHTML = '';
    } else if (level === 'set') {
      selection.set = null; selection.product = null;
      productsEl.innerHTML = '';
      // Re-render sets so the active state reflects the (now cleared) selection.
      const game = catalog.games.find(g => g.code === selection.game);
      if (game) renderSets(game);
    }
    applyVisibility();
    renderBreadcrumb();
    updateGo();
  }

  function pickGame(code) {
    if (selection.game === code) return;
    selection.game = code; selection.set = null; selection.product = null;
    productsEl.innerHTML = '';
    const game = catalog.games.find(g => g.code === code);
    if (game) renderSets(game);
    applyVisibility();
    renderBreadcrumb();
    updateGo();
  }

  function pickSet(code) {
    if (selection.set === code) return;
    selection.set = code; selection.product = null;
    const game = catalog.games.find(g => g.code === selection.game);
    const set  = game?.sets.find(s => s.code === code);
    if (set) renderProducts(set);
    applyVisibility();
    renderBreadcrumb();
    updateGo();
  }

  function pickProduct(type) {
    selection.product = type;
    productsEl.querySelectorAll('.picker-tile.active').forEach(el => el.classList.remove('active'));
    productsEl.querySelector(`[data-product="${type}"]`)?.classList.add('active');
    applyVisibility();
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
  crumbEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-level]');
    if (btn) resetTo(btn.dataset.level);
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
