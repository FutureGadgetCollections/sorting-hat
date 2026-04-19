// Firebase config is set as window.FIREBASE_CONFIG by Hugo at build time
// (see partials/head.html). Initializes the SDK + wires the navbar
// sign-in / sign-out buttons + sign-in with Google.
//
// The actual tier (free vs premium) is computed in tier.js, which reads
// the user's custom claims and broadcasts the result via window events.

(function () {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
    console.warn('[firebase-init] FIREBASE_CONFIG not present; auth disabled.');
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
})();

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showToast('Sign-in failed: ' + e.message, 'danger');
    }
  }
}

async function authSignOut() {
  await firebase.auth().signOut();
}

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn  = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout');
  if (loginBtn)  loginBtn.addEventListener('click',  signInWithGoogle);
  if (logoutBtn) logoutBtn.addEventListener('click', authSignOut);
});
