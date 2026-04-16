const prisma = require('./prisma');

/**
 * In-memory settings cache. Refreshes every 5 minutes.
 * Avoids DB hit on every request that needs a config value.
 */
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadAll() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;

  try {
    const rows = await prisma.systemSetting.findMany();
    _cache = Object.fromEntries(rows.map(r => [r.key, r.value]));
    _cacheAt = now;
  } catch {
    // If DB fails, return stale cache or empty
    if (!_cache) _cache = {};
  }
  return _cache;
}

/** Get a single setting value (string). Returns defaultValue if not found. */
async function getSetting(key, defaultValue = null) {
  const all = await loadAll();
  return all[key] !== undefined ? all[key] : defaultValue;
}

/** Get a setting as a number. */
async function getSettingNum(key, defaultValue = 0) {
  const val = await getSetting(key);
  if (val === null) return defaultValue;
  const n = Number(val);
  return isNaN(n) ? defaultValue : n;
}

/** Get a setting as a boolean. */
async function getSettingBool(key, defaultValue = false) {
  const val = await getSetting(key);
  if (val === null) return defaultValue;
  return val === 'true' || val === '1';
}

/** Get all settings in a category as an object. */
async function getCategory(category) {
  const all = await loadAll();
  const prefix = `${category}.`;
  const result = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) {
      result[k.slice(prefix.length)] = v;
    }
  }
  return result;
}

/** Bust cache (call after settings update). */
function clearCache() {
  _cache = null;
  _cacheAt = 0;
}

module.exports = { getSetting, getSettingNum, getSettingBool, getCategory, clearCache };
