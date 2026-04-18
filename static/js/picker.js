(async function () {
  const gameSel    = document.getElementById('picker-game');
  const setSel     = document.getElementById('picker-set');
  const productSel = document.getElementById('picker-product');
  const goBtn      = document.getElementById('picker-go');

  let catalog;
  try {
    catalog = await loadLocalJson('/data/sets.json');
  } catch (e) {
    showToast(`Failed to load catalog: ${e.message}`, 'danger');
    return;
  }

  // Populate games
  gameSel.innerHTML = '<option value="">Choose…</option>' +
    catalog.games.map(g => `<option value="${g.code}">${g.name}</option>`).join('');
  gameSel.disabled = false;

  function findGame(code) { return catalog.games.find(g => g.code === code); }
  function findSet(game, code) { return game.sets.find(s => s.code === code); }
  function findProduct(set, type) { return set.products.find(p => p.type === type); }

  function updateGoState() {
    goBtn.disabled = !(gameSel.value && setSel.value && productSel.value);
  }

  gameSel.addEventListener('change', () => {
    const game = findGame(gameSel.value);
    setSel.innerHTML = game
      ? '<option value="">Choose…</option>' + game.sets.map(s => `<option value="${s.code}">${s.name}</option>`).join('')
      : '<option value="">Choose a game first</option>';
    setSel.disabled = !game;
    productSel.innerHTML = '<option value="">Choose a set first</option>';
    productSel.disabled = true;
    updateGoState();
  });

  setSel.addEventListener('change', () => {
    const game = findGame(gameSel.value);
    const set  = game && findSet(game, setSel.value);
    productSel.innerHTML = set
      ? '<option value="">Choose…</option>' + set.products.map(p => `<option value="${p.type}">${p.name}</option>`).join('')
      : '<option value="">Choose a set first</option>';
    productSel.disabled = !set;
    updateGoState();
  });

  productSel.addEventListener('change', updateGoState);

  goBtn.addEventListener('click', () => {
    const base = (window.SITE_BASE || '/').replace(/\/$/, '');
    const params = new URLSearchParams({
      game:    gameSel.value,
      set:     setSel.value,
      product: productSel.value,
    });
    window.location.href = `${base}/builder/?${params.toString()}`;
  });
})();
