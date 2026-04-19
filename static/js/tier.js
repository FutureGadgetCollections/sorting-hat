// Tier resolution + premium gating UI.
//
// The backend grants premium by setting a Firebase custom claim:
//   tier: "premium"
// (see backend tools/grant_premium.py)
//
// Anyone signed in without that claim — or anyone signed out — sees
// premium UI elements in their "locked" state: visible but greyed out
// with a 🔒 badge. Click anywhere on a locked element opens the
// upgrade modal so free users can see what they're missing.
//
// Usage in HTML / templates:
//   <button data-premium ...>Smart Route</button>
//   <section data-premium>...</section>
//
// Or imperatively from JS:
//   markAsPremium(el)
//
// The lock state is re-applied any time auth state changes and any
// time new DOM is added (call applyTierGating() after dynamic renders).

(function () {
  let CURRENT_TIER = 'free'; // 'free' | 'premium'
  let CURRENT_USER = null;

  window.isPremium = function () { return CURRENT_TIER === 'premium'; };
  window.currentTier = function () { return CURRENT_TIER; };
  window.currentUser = function () { return CURRENT_USER; };
  window.markAsPremium = function (el) {
    if (el && !el.hasAttribute('data-premium')) el.setAttribute('data-premium', '');
    applyTierGating();
  };

  // Re-evaluate every element with [data-premium] against the current tier.
  window.applyTierGating = function () {
    const locked = !window.isPremium();
    document.querySelectorAll('[data-premium]').forEach(el => {
      el.classList.toggle('premium-locked', locked);
      // disable native <button> / <input> when locked so they can't be activated
      if (locked && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
        if (!el.dataset.prevDisabled) el.dataset.prevDisabled = el.disabled ? 'true' : 'false';
        el.disabled = true;
      } else if (!locked && el.dataset.prevDisabled !== undefined) {
        el.disabled = el.dataset.prevDisabled === 'true';
        delete el.dataset.prevDisabled;
      }
    });
  };

  // Bubble click on any locked container -> upgrade modal.
  document.addEventListener('click', e => {
    const locked = e.target.closest('.premium-locked');
    if (!locked) return;
    e.preventDefault();
    e.stopPropagation();
    showUpgradeModal();
  }, true); // capture so it pre-empts inner click handlers

  function showUpgradeModal() {
    let modalEl = document.getElementById('premium-upgrade-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'premium-upgrade-modal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-stars me-2 text-warning"></i>Premium feature</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p>This feature is available on the Premium plan. Premium unlocks:</p>
              <ul class="mb-3">
                <li>TCGPlayer / Mana Pool CSV exports + smart marketplace routing</li>
                <li>Historical EV charts (singles vs sealed price growth)</li>
                <li>Cross-precon analysis + deal hunter (coming soon)</li>
              </ul>
              <p class="text-muted small mb-0">Checkout isn't wired up yet — for now, ask the admin to grant your account premium.</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary" id="upgrade-cta-btn">
                <i class="bi bi-stars me-1"></i>Upgrade (coming soon)
              </button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
      modalEl.querySelector('#upgrade-cta-btn').addEventListener('click', () => {
        showToast('Checkout is in the works — drop us a line for early access.', 'info');
      });
    }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  // ───── Auth state listener ─────
  function onReady() {
    if (!window.firebase || !firebase.auth) {
      // No Firebase loaded — treat everyone as free, gate everything.
      applyTierGating();
      return;
    }
    firebase.auth().onAuthStateChanged(async user => {
      CURRENT_USER = user;
      if (!user) {
        CURRENT_TIER = 'free';
      } else {
        try {
          const token = await user.getIdTokenResult();
          CURRENT_TIER = token.claims.tier === 'premium' ? 'premium' : 'free';
        } catch (e) {
          console.warn('[tier] failed to read claims:', e.message);
          CURRENT_TIER = 'free';
        }
      }
      updateNavbar();
      applyTierGating();
      window.dispatchEvent(new CustomEvent('tierChanged',
        { detail: { tier: CURRENT_TIER, user: user } }));
    });
  }

  function updateNavbar() {
    const emailEl   = document.getElementById('nav-user-email');
    const tierEl    = document.getElementById('nav-tier-badge');
    const loginBtn  = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');
    if (CURRENT_USER) {
      if (emailEl)   emailEl.textContent = CURRENT_USER.email;
      if (loginBtn)  loginBtn.classList.add('d-none');
      if (logoutBtn) logoutBtn.classList.remove('d-none');
      if (tierEl) {
        tierEl.classList.remove('d-none');
        tierEl.textContent = CURRENT_TIER === 'premium' ? 'Premium' : 'Free';
        tierEl.classList.toggle('text-bg-warning', CURRENT_TIER === 'premium');
        tierEl.classList.toggle('text-bg-secondary', CURRENT_TIER !== 'premium');
      }
    } else {
      if (emailEl)   emailEl.textContent = '';
      if (loginBtn)  loginBtn.classList.remove('d-none');
      if (logoutBtn) logoutBtn.classList.add('d-none');
      if (tierEl)    tierEl.classList.add('d-none');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
