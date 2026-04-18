// Placeholder for future Firebase auth + paywall.
// When ready: load firebase-app-compat + firebase-auth-compat in scripts.html,
// initialize here with window.FIREBASE_CONFIG, and gate the builder route on
// auth state + a custom claim like `paid: true`.
//
// For now this is a no-op so the page works without any Firebase config.
(function () {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) return;
  // Auth wiring will be added when we ship the paywall.
})();
