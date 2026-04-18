// Toast helper — Bootstrap-based
function showToast(message, variant = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  container.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 4000 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// Title-case a kebab-cased product slug, e.g. "commander-deck-counter-blitz-final-fantasy-x"
function humanizeSlug(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b([ivx]+)\b/gi, m => m.toUpperCase())
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Read a query-string value
function qsGet(name) {
  return new URLSearchParams(window.location.search).get(name);
}
