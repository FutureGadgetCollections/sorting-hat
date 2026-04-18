// Fetches a JSON file from the data repo, GCS first then GitHub Raw.
// Requires window.DATA_CONFIG = { gcsBucket, githubDataRepo }.

async function loadFromGCS(filename) {
  const { gcsBucket } = window.DATA_CONFIG || {};
  if (!gcsBucket) throw new Error('DATA_CONFIG.gcsBucket is not set');
  const url = `https://storage.googleapis.com/${gcsBucket}/${filename}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GCS returned ${res.status} for ${filename}`);
  return res.json();
}

async function loadFromGitHub(filename) {
  const { githubDataRepo } = window.DATA_CONFIG || {};
  if (!githubDataRepo) throw new Error('DATA_CONFIG.githubDataRepo is not set');
  const url = `https://raw.githubusercontent.com/${githubDataRepo}/main/${filename}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub returned ${res.status} for ${filename}`);
  return res.json();
}

async function loadJsonData(filename) {
  try {
    return await loadFromGCS(filename);
  } catch (e) {
    console.warn(`[data-loader] GCS failed for ${filename}, falling back to GitHub:`, e.message);
    return loadFromGitHub(filename);
  }
}

// Loads a JSON file from this site's own static/data dir (served at <base>/data/...).
async function loadLocalJson(path) {
  const base = (window.SITE_BASE || '/').replace(/\/$/, '');
  const url = `${base}/${path.replace(/^\//, '')}?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`local fetch ${res.status} for ${url}`);
  return res.json();
}
