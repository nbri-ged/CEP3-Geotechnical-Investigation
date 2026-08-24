/* ============================================================
   NBRI GEOTECHNICAL GIS — DATA PIPELINE & RESILIENCE ENGINE (data-pipeline.js)
   Handles multi-tier CSV parsing, proxy fallbacks, coordinate conversions,
   stratigraphic parsing, weathering grade mapping, and offline caching.
   ============================================================ */

/* ── VERSION CHECK & CACHE PURGE ENGINE ── */
function checkAppVersionAndClearCache() {
  const storedVer = localStorage.getItem('nbri_app_version');
  if (storedVer !== APP_VERSION) {
    console.log(`[NBRI System] Upgraded from "${storedVer || 'initial'}" to "${APP_VERSION}". Syncing dataset and cache...`);
    try {
      const oldRows = localStorage.getItem('nbri_allrows_cache');
      if (oldRows) localStorage.setItem('nbri_allrows_cache_backup', oldRows);
      
      const keysToPurge = ['nbri_dates_cache', 'nbri_cache_timestamp'];
      keysToPurge.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
      
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
    } catch(e) {
      console.warn('Cache purge non-fatal error:', e);
    }
    localStorage.setItem('nbri_app_version', APP_VERSION);
    if (storedVer && storedVer !== APP_VERSION) {
      setTimeout(() => {
        showVersionUpdateNotice(storedVer, APP_VERSION);
      }, 800);
    }
  }
}

function autoRefreshCacheOnStartup() {
  try {
    sessionStorage.clear();
    const tempKeys = ['nbri_dates_cache', 'nbri_cache_timestamp'];
    tempKeys.forEach(k => localStorage.removeItem(k));
    if ('caches' in window) {
      caches.keys().then(names => { names.forEach(n => caches.delete(n)); }).catch(() => {});
    }
    console.log('[NBRI System] Cache memory automatically refreshed on startup.');
  } catch(e) {
    console.warn('[NBRI System] Auto-refresh cache note:', e);
  }
}

/* ── MULTI-PROXY CSV FETCHER WITH TIMEOUT & ROBUST FALLBACKS ── */
async function parseCsvWithProxy(url, onComplete, onError) {
  const targetUrl = getBustedUrl(url);

  function parseText(csvText) {
    if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) return false;
    try {
      const res = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      if (res && res.data && res.data.length > 0) {
        onComplete(res.data);
        return true;
      }
    } catch(e) {}
    return false;
  }

  // 1. Direct fetch with timeout
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(targetUrl, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(tid);
    if (resp.ok) {
      const text = await resp.text();
      if (parseText(text)) return;
    }
  } catch(e) {}

  // 2. Direct Papa parse download
  try {
    let parsedOk = false;
    await new Promise((resolve) => {
      Papa.parse(targetUrl, {
        download: true, header: true, skipEmptyLines: true,
        complete: (results) => {
          if (results && results.data && results.data.length > 0) {
            parsedOk = true;
            onComplete(results.data);
          }
          resolve();
        },
        error: () => resolve()
      });
      setTimeout(resolve, 5000);
    });
    if (parsedOk) return;
  } catch(e) {}

  // 3. Proxy 1: AllOrigins JSON API
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(targetUrl);
    const resp = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const json = await resp.json();
      if (json && json.contents && parseText(json.contents)) return;
    }
  } catch(e) {}

  // 4. Proxy 2: AllOrigins Raw API
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
    const resp = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const text = await resp.text();
      if (parseText(text)) return;
    }
  } catch(e) {}

  // 5. Proxy 3: CodeTabs CORS Proxy
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const proxyUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(targetUrl);
    const resp = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const text = await resp.text();
      if (parseText(text)) return;
    }
  } catch(e) {}

  if (onError) onError();
}

/* ── DATA NORMALIZATION & STRATIGRAPHY PROCESSING ── */
function toNum(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getFirst(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseDateFlexible(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  let d = null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mo, yyyy] = m;
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    d = new Date(parseInt(yyyy, 10), parseInt(mo, 10) - 1, parseInt(dd, 10));
  } else {
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

function formatDateDMY(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  const d = parseDateFlexible(s);
  if (!d) return s;
  return `${String(d.getDate()).padStart(2,'0')} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizeRow(row) {
  const out = {};
  for (const k in row) {
    out[k.replace(/\s+/g, ' ').trim()] = row[k];
  }
  return out;
}

function cleanBHKey(key) {
  return (key || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

function colorFor(status) {
  if (!status) return STATUS_COLORS.default;
  const s = status.trim();
  return STATUS_COLORS[s] || STATUS_COLORS.default;
}

function colorForPackage(pkg) {
  if (!pkg) return PACKAGE_COLORS.default;
  const p = pkg.trim();
  return PACKAGE_COLORS[p] || PACKAGE_COLORS.default;
}

/* ── COORDINATE CONVERSION: EPSG:5235 (SLD99) -> WGS84 ── */
function convertToLatLon(easting, northing) {
  if (easting === null || northing === null || isNaN(easting) || isNaN(northing)) return null;
  try {
    const result = proj4("EPSG:5235", "EPSG:4326", [easting, northing]);
    if (!result || isNaN(result[0]) || isNaN(result[1])) return null;
    return { lon: result[0], lat: result[1] };
  } catch (err) {
    console.error('Projection conversion error:', err);
    return null;
  }
}

/* ── GEOTECHNICAL LEVEL CALCULATIONS ── */
function computeBHLevels(row) {
  const elev = toNum(row['Elevation']);
  const termDepth = toNum(row['Termination Depth']);
  const rockCoring = toNum(row['Rock Coring']);
  const gwtDepth = toNum(row['Groundwater Level']);

  let overburden = null;
  let rockLevel = null;
  let termLevel = null;
  let gwtLevel = null;

  if (elev !== null && termDepth !== null) {
    termLevel = elev - termDepth;
    if (rockCoring !== null && rockCoring > 0 && rockCoring <= termDepth) {
      overburden = termDepth - rockCoring;
      rockLevel = elev - overburden;
    }
  }

  if (elev !== null && gwtDepth !== null && gwtDepth >= 0) {
    gwtLevel = elev - gwtDepth;
  }

  return {
    elevation: elev,
    termDepth: termDepth,
    rockCoring: rockCoring,
    overburden: overburden,
    rockLevel: rockLevel,
    termLevel: termLevel,
    gwtDepth: gwtDepth,
    gwtLevel: gwtLevel
  };
}

function rockLevelDisplay(levels) {
  if (levels.rockLevel !== null) return levels.rockLevel.toFixed(2) + ' m MSL';
  if (levels.rockCoring === 0 || levels.rockCoring === null) return 'No Rock Encountered';
  return '—';
}

function extractBoreholeChainage(row, bhName) {
  if (!row && !bhName) return '';
  const clean = (bhName || '').trim();
  const m = clean.match(/(\d+)\+(\d+)/);
  if (m) return `Ch. ${m[1]}+${m[2]}`;
  const chRaw = row ? (row['Chainage'] || row['Station'] || '') : '';
  if (chRaw) return `Ch. ${chRaw}`;
  return '';
}

/* ── SPATIAL AUTO-SORTING OF BOREHOLES ALONG SECTION ── */
function sortBoreholesByMapPosition(rows) {
  if (!rows || rows.length < 2) return rows || [];
  
  const pts = rows.map((r, i) => {
    const e = toNum(r['Easting']), n = toNum(r['Northing']);
    return { idx: i, e: e !== null ? e : 0, n: n !== null ? n : 0, row: r };
  });

  const validPts = pts.filter(p => p.e !== 0 && p.n !== 0);
  if (validPts.length < 2) return rows;

  const origin = validPts[0];
  const last = validPts[validPts.length - 1];
  const dx = last.e - origin.e;
  const dy = last.n - origin.n;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;

  pts.forEach(p => {
    p.proj = (p.e - origin.e) * ux + (p.n - origin.n) * uy;
  });

  pts.sort((a, b) => a.proj - b.proj);
  return pts.map(p => p.row);
}

/* ── PROCESS STRATIGRAPHIC & WEATHERING PROFILES (BH Profile.csv) ── */
function processBHProfileData(data) {
  if (!data || !data.length) return;
  const grouped = {};
  const weatherGrouped = {};
  const originGrouped = {};
  const testsGrouped = {};
  const is2D = Array.isArray(data[0]);

  data.forEach((row, rowIdx) => {
    if (is2D) {
      if (rowIdx === 0 && ((row[0]||'').toLowerCase().includes('pointid') || (row[0]||'').toLowerCase().includes('point id'))) return;

      // Table 1 (Cols 0-3): PointID, Depth, Bottom, Graphic
      const p1 = (row[0] || '').trim();
      const d1 = toNum(row[1]);
      const b1 = toNum(row[2]);
      const g1 = (row[3] || '').trim();
      if (p1 && d1 !== null && b1 !== null) {
        const rawKey = p1;
        const normKey = cleanBHKey(p1);
        if (!grouped[rawKey]) grouped[rawKey] = [];
        grouped[rawKey].push({ depth: d1, bottom: b1, graphic: g1 });
        if (normKey && normKey !== rawKey) {
          if (!grouped[normKey]) grouped[normKey] = [];
          grouped[normKey].push({ depth: d1, bottom: b1, graphic: g1 });
        }
      }

      // Table 2 (Cols 6-9): PointID, Depth, Primary Weathering, Rock Type Name
      const p2 = (row[6] || '').trim();
      const d2 = toNum(row[7]);
      const w2 = (row[8] || '').trim();
      const r2 = (row[9] || '').trim();
      if (p2 && d2 !== null && (w2 || r2)) {
        const grade = normalizeWeatheringGrade(w2);
        const rockType = normalizeRockType(r2);
        const entry = { depth: d2, grade, rockType, rawRockType: r2, rawGrade: w2 };
        const wRawKey = p2;
        const wNormKey = cleanBHKey(p2);
        if (!weatherGrouped[wRawKey]) weatherGrouped[wRawKey] = [];
        weatherGrouped[wRawKey].push(entry);
        if (wNormKey && wNormKey !== wRawKey) {
          if (!weatherGrouped[wNormKey]) weatherGrouped[wNormKey] = [];
          weatherGrouped[wNormKey].push(entry);
        }
      }

      // Table 3 (Cols 12-16): PointID, Depth, Primary Consistency, Soil Origin, BSCS
      const p3 = (row[12] || '').trim();
      const d3 = toNum(row[13]);
      const c3 = (row[14] || '').trim();
      const o3 = (row[15] || '').trim();
      if (p3 && d3 !== null && (o3 || c3)) {
        const entry = { depth: d3, origin: o3, consistency: c3 };
        const oRawKey = p3;
        const oNormKey = cleanBHKey(p3);
        if (!originGrouped[oRawKey]) originGrouped[oRawKey] = [];
        originGrouped[oRawKey].push(entry);
        if (oNormKey && oNormKey !== oRawKey) {
          if (!originGrouped[oNormKey]) originGrouped[oNormKey] = [];
          originGrouped[oNormKey].push(entry);
        }
      }

      // Table 4 (Cols 18-28): PointID, Depth, Length, Type, Recovery Length (CR%), RQD Length (RQD%), N Value
      const p4 = (row[18] || '').trim();
      const d4 = toNum(row[19]);
      const len4 = toNum(row[20]) || 0.45;
      const type4 = (row[21] || '').trim().toUpperCase();
      const cr4 = toNum(row[22]);
      const rqd4 = toNum(row[23]);
      const nVal4 = toNum(row[28]);
      if (p4 && d4 !== null && (nVal4 !== null || cr4 !== null || rqd4 !== null || type4)) {
        const entry = { depth: d4, length: len4, type: type4, cr: cr4, rqd: rqd4, nVal: nVal4 };
        const tRawKey = p4;
        const tNormKey = cleanBHKey(p4);
        if (!testsGrouped[tRawKey]) testsGrouped[tRawKey] = [];
        testsGrouped[tRawKey].push(entry);
        if (tNormKey && tNormKey !== tRawKey) {
          if (!testsGrouped[tNormKey]) testsGrouped[tNormKey] = [];
          testsGrouped[tNormKey].push(entry);
        }
      }
    } else {
      const rowNorm = normalizeRow(row);
      const pointId = (rowNorm['PointID'] || rowNorm['Point ID'] || rowNorm['BH_ID'] || rowNorm['BH ID'] || rowNorm['BH Name'] || '').trim();
      const depth = toNum(rowNorm['Depth']);
      const bottom = toNum(rowNorm['Bottom']);
      const graphic = (rowNorm['Graphic'] || '').trim();

      const weatherRaw = rowNorm['Primary Weathering'];
      const rockTypeRaw = (rowNorm['Rock Type Name'] || rowNorm['Rock Type'] || rowNorm['Lithology'] || '').trim();
      if (pointId && depth !== null && ((weatherRaw !== undefined && String(weatherRaw).trim() !== '') || rockTypeRaw)) {
        const grade = normalizeWeatheringGrade(weatherRaw);
        const rockType = normalizeRockType(rockTypeRaw);
        const entry = { depth, grade, rockType, rawRockType: rockTypeRaw, rawGrade: weatherRaw };
        const wRawKey = pointId;
        const wNormKey = cleanBHKey(pointId);
        if (!weatherGrouped[wRawKey]) weatherGrouped[wRawKey] = [];
        weatherGrouped[wRawKey].push(entry);
        if (wNormKey && wNormKey !== wRawKey) {
          if (!weatherGrouped[wNormKey]) weatherGrouped[wNormKey] = [];
          weatherGrouped[wNormKey].push(entry);
        }
      }

      const originRaw = rowNorm['Soil Origin'];
      const consistencyRaw = rowNorm['Primary Consistency'];
      if (pointId && depth !== null && ((originRaw !== undefined && String(originRaw).trim() !== '') || (consistencyRaw !== undefined && String(consistencyRaw).trim() !== ''))) {
        const entry = { depth, origin: (originRaw || '').trim(), consistency: (consistencyRaw || '').trim() };
        const oRawKey = pointId;
        const oNormKey = cleanBHKey(pointId);
        if (!originGrouped[oRawKey]) originGrouped[oRawKey] = [];
        originGrouped[oRawKey].push(entry);
        if (oNormKey && oNormKey !== oRawKey) {
          if (!originGrouped[oNormKey]) originGrouped[oNormKey] = [];
          originGrouped[oNormKey].push(entry);
        }
      }

      const nRaw = rowNorm['N Value'] !== undefined ? toNum(rowNorm['N Value']) : null;
      const crRaw = rowNorm['Recovery Length'] !== undefined ? toNum(rowNorm['Recovery Length']) : null;
      const rqdRaw = rowNorm['RQD Length'] !== undefined ? toNum(rowNorm['RQD Length']) : null;
      const typeRaw = (rowNorm['Type'] || '').trim().toUpperCase();
      const lenRaw = toNum(rowNorm['Length']) || 0.45;
      if (pointId && depth !== null && (nRaw !== null || crRaw !== null || rqdRaw !== null || typeRaw)) {
        const entry = { depth, length: lenRaw, type: typeRaw, cr: crRaw, rqd: rqdRaw, nVal: nRaw };
        const tRawKey = pointId;
        const tNormKey = cleanBHKey(pointId);
        if (!testsGrouped[tRawKey]) testsGrouped[tRawKey] = [];
        testsGrouped[tRawKey].push(entry);
        if (tNormKey && tNormKey !== tRawKey) {
          if (!testsGrouped[tNormKey]) testsGrouped[tNormKey] = [];
          testsGrouped[tNormKey].push(entry);
        }
      }

      if (!pointId || depth === null || bottom === null) return;

      const rawKey = pointId;
      const normKey = cleanBHKey(pointId);
      if (!grouped[rawKey]) grouped[rawKey] = [];
      grouped[rawKey].push({ depth, bottom, graphic });
      if (normKey && normKey !== rawKey) {
        if (!grouped[normKey]) grouped[normKey] = [];
        grouped[normKey].push({ depth, bottom, graphic });
      }
    }
  });

  Object.keys(grouped).forEach(k => grouped[k].sort((a,b) => a.depth - b.depth));
  Object.keys(weatherGrouped).forEach(k => weatherGrouped[k].sort((a,b) => a.depth - b.depth));
  Object.keys(originGrouped).forEach(k => originGrouped[k].sort((a,b) => a.depth - b.depth));
  Object.keys(testsGrouped).forEach(k => testsGrouped[k].sort((a,b) => a.depth - b.depth));

  // Attach origin/consistency and rockType/weathering to each layer
  Object.keys(grouped).forEach(k => {
    const origins = originGrouped[k];
    const weathers = weatherGrouped[k];
    grouped[k].forEach(layer => {
      const isRock = isRockCode(layer.graphic);
      if (origins && origins.length) {
        let best = null, bestDist = Infinity;
        origins.forEach(o => {
          const d = Math.abs(o.depth - layer.depth);
          if (d < bestDist) { bestDist = d; best = o; }
        });
        if (best && bestDist <= 0.8) {
          layer.origin = best.origin;
          layer.consistency = best.consistency;
        }
      }
      if (weathers && weathers.length) {
        let bestW = null, bestDistW = Infinity;
        weathers.forEach(w => {
          const d = Math.abs(w.depth - layer.depth);
          if (d < bestDistW) { bestDistW = d; bestW = w; }
        });
        if (bestW && (bestDistW <= 1.2 || isRock)) {
          layer.rockType = bestW.rockType;
          layer.rawRockType = bestW.rawRockType || bestW.rockType;
          layer.grade = bestW.grade;
          layer.rawGrade = bestW.rawGrade;
        }
      }
    });
  });

  profileLayersByBH = grouped;
  profileWeatheringByBH = weatherGrouped;
  profileTestsByBH = testsGrouped;
  if (typeof render === 'function' && allRows && allRows.length) render();
}

function getBHTests(rOrName) {
  if (!rOrName || !profileTestsByBH) return [];
  if (typeof rOrName === 'string') {
    const rawKey = rOrName.trim();
    const normKey = cleanBHKey(rawKey);
    return profileTestsByBH[rawKey] || (normKey && profileTestsByBH[normKey]) || [];
  }
  const candidates = [
    rOrName['BH Name'], rOrName['PointID'], rOrName['Point ID'],
    rOrName['BH_ID'], rOrName['BH ID'], rOrName['Old BH ID'], rOrName['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());

  for (const c of candidates) {
    if (profileTestsByBH[c]) return profileTestsByBH[c];
    const norm = cleanBHKey(c);
    if (norm && profileTestsByBH[norm]) return profileTestsByBH[norm];
  }
  return [];
}

function getBHLayers(rOrName) {
  if (!rOrName || !profileLayersByBH) return null;
  if (typeof rOrName === 'string') {
    const raw = rOrName.trim();
    const norm = cleanBHKey(raw);
    return profileLayersByBH[raw] || profileLayersByBH[norm] || null;
  }
  const r = rOrName;
  const candidates = [
    r['BH Name'], r['PointID'], r['Point ID'],
    r['BH_ID'], r['BH ID'], r['Old BH ID'], r['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());

  for (const c of candidates) {
    if (profileLayersByBH[c]) return profileLayersByBH[c];
    const norm = cleanBHKey(c);
    if (profileLayersByBH[norm]) return profileLayersByBH[norm];
  }
  return null;
}

function getBHWeathering(rOrName) {
  if (!rOrName || !profileWeatheringByBH) return null;
  if (typeof rOrName === 'string') {
    const raw = rOrName.trim();
    const norm = cleanBHKey(raw);
    return profileWeatheringByBH[raw] || profileWeatheringByBH[norm] || null;
  }
  const r = rOrName;
  const candidates = [
    r['BH Name'], r['PointID'], r['Point ID'],
    r['BH_ID'], r['BH ID'], r['Old BH ID'], r['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());

  for (const c of candidates) {
    if (profileWeatheringByBH[c]) return profileWeatheringByBH[c];
    const norm = cleanBHKey(c);
    if (profileWeatheringByBH[norm]) return profileWeatheringByBH[norm];
  }
  return null;
}
