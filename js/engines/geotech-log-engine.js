function originHatchKeyOf(rawOrigin) {
  const clean = (rawOrigin || '').trim().toLowerCase();
  if (clean === 'completely weathered rock') return 'completely_weathered_rock';
  if (clean === 'residual') return 'residual';
  return originFamilyOf(rawOrigin);
}

const ORIGIN_HATCH_INFO = {
  made_ground:  { patternId: 'pat-origin-made-ground',  label: 'Made Ground / Engineered Fill' },
  alluvium:     { patternId: 'pat-origin-alluvium',      label: 'Alluvium' },
  colluvium:    { patternId: 'pat-origin-colluvium',     label: 'Colluvium' },
  residual:     { patternId: 'pat-origin-residual',      label: 'Residual Soil' },
  completely_weathered_rock: { patternId: 'pat-origin-cwr', label: 'Completely Weathered Rock' },
};

// ── ROCK LITHOLOGY CONFIG & GEOLOGICAL MAPPING ──
function normalizeRockType(raw) {
  if (!raw) return 'Biotite Gneiss';
  const clean = raw.trim().toLowerCase();
  if (clean.includes('marble') || clean.includes('limestone') || clean.includes('calcit')) return 'Marble';
  if (clean.includes('amphibolite') || clean.includes('metabasite')) return 'Amphibolite';
  if (clean.includes('pegmatite')) return 'Pegmatite';
  if (clean.includes('schist') || clean.includes('mica schist')) return 'Schist';
  if (clean.includes('quartzite')) return 'Quartzite';
  if (clean.includes('garnet')) return 'Garnet Biotite Gneiss';
  if (clean.includes('quartzofeldspathic') || clean.includes('quartzo')) return 'Quartzofeldspathic Gneiss';
  if (clean.includes('granitic') || clean.includes('granite')) return 'Granitic Gneiss';
  if (clean.includes('granulitic') || clean.includes('granulite')) return 'Granulitic Gneiss';
  if (clean.includes('hornblende')) return 'Hornblende Biotite Gneiss';
  if (clean.includes('charnockitic') || clean.includes('charnockite')) return 'Charnockitic Gneiss';
  if (clean.includes('biotite')) return 'Biotite Gneiss';
  return 'Biotite Gneiss';
}

const ROCK_LITHOLOGY_CONFIG = {
  'Biotite Gneiss': { label: 'Biotite Gneiss', patternId: 'pat-rock-bg' },
  'Garnet Biotite Gneiss': { label: 'Garnet Biotite Gneiss', patternId: 'pat-rock-gbg' },
  'Quartzofeldspathic Gneiss': { label: 'Quartzofeldspathic Gneiss', patternId: 'pat-rock-qfg' },
  'Quartzite': { label: 'Quartzite', patternId: 'pat-rock-quartzite' },
  'Granitic Gneiss': { label: 'Granitic Gneiss', patternId: 'pat-rock-granite' },
  'Granulitic Gneiss': { label: 'Granulitic Gneiss', patternId: 'pat-rock-granulite' },
  'Hornblende Biotite Gneiss': { label: 'Hornblende Biotite Gneiss', patternId: 'pat-rock-hbg' },
  'Charnockitic Gneiss': { label: 'Charnockitic Gneiss', patternId: 'pat-rock-charnockite' },
  'Marble': { label: 'Marble / Calc-Gneiss', patternId: 'pat-rock-marble' },
  'Amphibolite': { label: 'Amphibolite', patternId: 'pat-rock-amphibolite' },
  'Pegmatite': { label: 'Pegmatite', patternId: 'pat-rock-pegmatite' },
  'Schist': { label: 'Schist', patternId: 'pat-rock-schist' }
};

function buildRockLithologyDefs(apparentDipAngle = 45, apparentDipDirectionStr = '→ B') {
  // Rotate gneissic foliation patterns to match structural apparent dip angle & direction
  const rot = Math.round(apparentDipDirectionStr === '← A' ? -apparentDipAngle : (apparentDipDirectionStr === '→ B' ? apparentDipAngle : 0));
  const clampedRot = Math.max(-75, Math.min(75, rot));

  return `
    <pattern id="pat-rock-bg" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Biotite Gneiss: Scaled down foliation lines matching apparent dip -->
      <line x1="0" y1="0" x2="12" y2="0" stroke="#252a2d" stroke-width="0.65" opacity="0.45"/>
      <line x1="0" y1="6" x2="12" y2="6" stroke="#252a2d" stroke-width="0.5" stroke-dasharray="3,1.5" opacity="0.35"/>
    </pattern>
    <pattern id="pat-rock-gbg" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Garnet Biotite Gneiss: Foliation lines + porphyroblast dots -->
      <line x1="0" y1="0" x2="14" y2="0" stroke="#252a2d" stroke-width="0.65" opacity="0.45"/>
      <circle cx="7" cy="7" r="1.1" fill="#1e2326" opacity="0.6"/>
    </pattern>
    <pattern id="pat-rock-qfg" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Quartzofeldspathic Gneiss: Double-line bands matching apparent dip -->
      <line x1="0" y1="0" x2="12" y2="0" stroke="#252a2d" stroke-width="0.75" opacity="0.5"/>
      <line x1="0" y1="3.5" x2="12" y2="3.5" stroke="#252a2d" stroke-width="0.4" opacity="0.35"/>
    </pattern>
    <pattern id="pat-rock-quartzite" width="11" height="11" patternUnits="userSpaceOnUse">
      <!-- Quartzite: Standard rectangular grid -->
      <rect x="0" y="0" width="11" height="11" fill="none" stroke="#252a2d" stroke-width="0.55" opacity="0.4"/>
      <line x1="5.5" y1="0" x2="5.5" y2="11" stroke="#252a2d" stroke-width="0.45" stroke-dasharray="2,1.5" opacity="0.35"/>
    </pattern>
    <pattern id="pat-rock-granite" width="13" height="13" patternUnits="userSpaceOnUse">
      <!-- Granitic Gneiss: Plus / cross igneous structure -->
      <path d="M3.5,1.5 L3.5,5 M1.5,3.5 L5,3.5 M10,8.5 L10,12 M8.5,10 L12,10" stroke="#252a2d" stroke-width="0.65" opacity="0.5"/>
    </pattern>
    <pattern id="pat-rock-granulite" width="10" height="10" patternUnits="userSpaceOnUse">
      <!-- Granulitic Gneiss: Granular stippling dots -->
      <circle cx="2.5" cy="2.5" r="0.7" fill="#252a2d" opacity="0.5"/>
      <circle cx="7.5" cy="7.5" r="0.7" fill="#252a2d" opacity="0.5"/>
    </pattern>
    <pattern id="pat-rock-hbg" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Hornblende Biotite Gneiss: Dense angled needles -->
      <line x1="0" y1="0" x2="12" y2="0" stroke="#252a2d" stroke-width="0.9" opacity="0.5"/>
    </pattern>
    <pattern id="pat-rock-charnockite" width="13" height="13" patternUnits="userSpaceOnUse">
      <!-- Charnockitic Gneiss: Diamond hypersthene pattern -->
      <polygon points="3.5,1 6,3.5 3.5,6 1,3.5" fill="none" stroke="#252a2d" stroke-width="0.65" opacity="0.45"/>
      <polygon points="10,7.5 12.5,10 10,12.5 7.5,10" fill="none" stroke="#252a2d" stroke-width="0.65" opacity="0.45"/>
    </pattern>
    <pattern id="pat-rock-marble" width="14" height="10" patternUnits="userSpaceOnUse">
      <!-- Marble / Calcitic Gneiss: Standard brickwork pattern -->
      <rect x="0" y="0" width="14" height="10" fill="none" stroke="#252a2d" stroke-width="0.6" opacity="0.45"/>
      <line x1="7" y1="0" x2="7" y2="5" stroke="#252a2d" stroke-width="0.5" opacity="0.4"/>
      <line x1="0" y1="5" x2="14" y2="5" stroke="#252a2d" stroke-width="0.6" opacity="0.45"/>
      <line x1="0" y1="10" x2="14" y2="10" stroke="#252a2d" stroke-width="0.6" opacity="0.45"/>
      <line x1="14" y1="5" x2="14" y2="10" stroke="#252a2d" stroke-width="0.5" opacity="0.4"/>
    </pattern>
    <pattern id="pat-rock-amphibolite" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Amphibolite: Dense interlocking prismatic dashes -->
      <line x1="0" y1="2" x2="6" y2="2" stroke="#1e2326" stroke-width="1.1" opacity="0.6"/>
      <line x1="5" y1="7" x2="11" y2="7" stroke="#1e2326" stroke-width="1.1" opacity="0.6"/>
    </pattern>
    <pattern id="pat-rock-pegmatite" width="15" height="15" patternUnits="userSpaceOnUse">
      <!-- Pegmatite: Coarse interlocking angular crystals -->
      <path d="M1,1 L7,4 L3,9 Z M8,8 L14,11 L10,14 Z" fill="none" stroke="#252a2d" stroke-width="0.65" opacity="0.5"/>
    </pattern>
    <pattern id="pat-rock-schist" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(${clampedRot})">
      <!-- Schist: Highly fissile dense wavy foliation -->
      <path d="M0,2 Q3,0 6,2 T12,2 M0,8 Q3,6 6,8 T12,8" fill="none" stroke="#252a2d" stroke-width="0.75" opacity="0.55"/>
    </pattern>`;
}

// Returns the <pattern> element markup for every origin hatch, to be
// concatenated into the SVG's single <defs> block.
function buildOriginHatchDefs() {
  return `
    <pattern id="pat-origin-made-ground" width="16" height="16" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="16" y2="16" stroke="#3a3a3a" stroke-width="0.5" opacity="0.22"/>
      <line x1="16" y1="0" x2="0" y2="16" stroke="#3a3a3a" stroke-width="0.5" opacity="0.22"/>
    </pattern>
    <pattern id="pat-origin-alluvium" width="22" height="10" patternUnits="userSpaceOnUse">
      <path d="M0,5 Q5.5,1 11,5 T22,5" fill="none" stroke="#2a5a7a" stroke-width="1.0" opacity="0.75"/>
    </pattern>
    <pattern id="pat-origin-colluvium" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#6b4a2a" stroke-width="0.6" opacity="0.25"/>
      <line x1="8" y1="8" x2="8" y2="14" stroke="#6b4a2a" stroke-width="0.6" opacity="0.25"/>
    </pattern>
    <pattern id="pat-origin-residual" width="16" height="16" patternUnits="userSpaceOnUse">
      <!-- Residual Soil: Distinctive fine plus / stipple cross markers -->
      <line x1="2" y1="5" x2="6" y2="5" stroke="#5a4632" stroke-width="0.8" opacity="0.45"/>
      <line x1="4" y1="3" x2="4" y2="7" stroke="#5a4632" stroke-width="0.8" opacity="0.45"/>
      <line x1="10" y1="13" x2="14" y2="13" stroke="#5a4632" stroke-width="0.8" opacity="0.45"/>
      <line x1="12" y1="11" x2="12" y2="15" stroke="#5a4632" stroke-width="0.8" opacity="0.45"/>
    </pattern>
    <pattern id="pat-origin-cwr" width="18" height="18" patternUnits="userSpaceOnUse">
      <!-- Completely Weathered Rock (Grade V): Angular rock clasts & corestone fragments -->
      <polygon points="3,3 8,2 7,7 2,6" fill="#8f8578" stroke="#332a1e" stroke-width="0.8" opacity="0.65"/>
      <polygon points="11,10 16,9 15,15 10,14" fill="#8f8578" stroke="#332a1e" stroke-width="0.8" opacity="0.65"/>
      <line x1="3" y1="13" x2="6" y2="16" stroke="#332a1e" stroke-width="0.85" opacity="0.55"/>
      <line x1="12" y1="3" x2="15" y2="6" stroke="#332a1e" stroke-width="0.85" opacity="0.55"/>
    </pattern>`;
}

const ORIGIN_FAMILY_MAP = {
  'residual': 'residual',
  'residual soil': 'residual',
  'soil': 'residual',
  'soil horizon': 'residual',
  'completely weathered rock': 'residual',
  'alluvium': 'alluvium',
  'colluvium': 'colluvium',
  'made ground': 'made_ground',
  'engineered fill': 'made_ground',
  'fill': 'made_ground',
};
// Origins whose family uses LENS geometry (rule 3) instead of ordinary
// tabular pinch-out interpolation.
const LENS_ORIGIN_FAMILIES = new Set(['alluvium', 'colluvium', 'made_ground']);

function originFamilyOf(originRaw) {
  const clean = (originRaw || '').trim().toLowerCase();
  if (!clean) return 'unknown';
  return ORIGIN_FAMILY_MAP[clean] || ('other:' + clean); // rule 2 fallback: own family per unique label
}

let profileTestsByBH = {};

function processBHProfileData(data) {
  const grouped = {};
  const weatherGrouped = {};
  const originGrouped = {};
  const testsGrouped = {};

  if (!data || !data.length) return;

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
        const rawRockType = r2;
        const entry = { depth: d2, grade, rockType, rawRockType, rawGrade: w2 };
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

      // Table 4 (Cols 18-28): PointID, Depth, Length, Type, Recovery Length (CR%), RQD Length (RQD%), Return Of Water, Blows 1st, Blows 2nd, Blows 3rd, N Value
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
  if (allRows && allRows.length) render();
}

function fetchBHProfileLog(){
  const localProfUrl = 'CEP 3  Rambukkana-Galagedara - BH Profile.csv';
  
  if (window.EMBEDDED_BH_PROFILE_CSV) {
    try {
      const parsed = Papa.parse(window.EMBEDDED_BH_PROFILE_CSV, { header: false, skipEmptyLines: true });
      if (parsed && parsed.data && parsed.data.length) {
        processBHProfileData(parsed.data);
      }
    } catch(e){}
  }

  parseCsvWithProxy(BH_PROFILE_CSV_URL, (data) => {
    if (data && data.length) {
      if (Array.isArray(data[0])) {
        processBHProfileData(data);
      } else {
        const rawRows = [Object.keys(data[0]), ...data.map(r => Object.values(r))];
        processBHProfileData(rawRows);
      }
    }
  }, () => {
    fetchLocalProfile();
  });

  function fetchLocalProfile() {
    Papa.parse(localProfUrl, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        if (results && results.data && results.data.length) {
          processBHProfileData(results.data);
        }
      },
      error: (err) => {
        console.error('Could not load local BH Profile log:', err);
      }
    });
  }
}

function getBHTests(rOrName) {
  if (!rOrName) return [];
  if (!profileTestsByBH) return [];
  if (typeof rOrName === 'string') {
    const rawKey = rOrName.trim();
    const normKey = cleanBHKey(rawKey);
    return profileTestsByBH[rawKey] || (normKey && profileTestsByBH[normKey]) || [];
  }
  const candidates = [
    rOrName['BH Name'],
    rOrName['PointID'],
    rOrName['Point ID'],
    rOrName['BH_ID'],
    rOrName['BH ID'],
    rOrName['Old BH ID'],
    rOrName['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());

  for (const c of candidates) {
    if (profileTestsByBH[c]) return profileTestsByBH[c];
    const norm = cleanBHKey(c);
    if (norm && profileTestsByBH[norm]) return profileTestsByBH[norm];
  }
  return [];
}

function getBHLayers(rOrName) {
  if (!rOrName) return null;
  if (typeof rOrName === 'string') {
    const raw = rOrName.trim();
    const norm = cleanBHKey(raw);
    return profileLayersByBH[raw] || profileLayersByBH[norm] || null;
  }
  const r = rOrName;
  const candidates = [
    r['BH Name'],
    r['PointID'],
    r['Point ID'],
    r['BH_ID'],
    r['BH ID'],
    r['Old BH ID'],
    r['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());

  for (const c of candidates) {
    if (profileLayersByBH[c]) return profileLayersByBH[c];
    const norm = cleanBHKey(c);
    if (profileLayersByBH[norm]) return profileLayersByBH[norm];
  }
  return null;
}


// Same name-resolution strategy as getBHLayers, for the weathering point log.
function getBHWeathering(rOrName) {
  if (!rOrName) return null;
  if (typeof rOrName === 'string') {
    const raw = rOrName.trim();
    const norm = cleanBHKey(raw);
    return profileWeatheringByBH[raw] || profileWeatheringByBH[norm] || null;
  }
  const r = rOrName;
  const candidates = [
    r['BH Name'], r['PointID'], r['Point ID'], r['BH_ID'], r['BH ID'],
    r['Old BH ID'], r['New BH ID']
  ].filter(Boolean).map(s => String(s).trim());
  for (const c of candidates) {
    if (profileWeatheringByBH[c]) return profileWeatheringByBH[c];
    const norm = cleanBHKey(c);
    if (profileWeatheringByBH[norm]) return profileWeatheringByBH[norm];
  }
  return null;
}
function fetchLogDates(){
  Papa.parse(LOG_SHEET_CSV_URL, {
    download: true, header: true, skipEmptyLines: true,
    complete: (results) => {
      const map = {};
      results.data.forEach(raw => {
        const row = normalizeRow(raw);
        const status = (row['Status of the Borehole'] || '').trim();
        const bhId = (row['Borehole ID'] || '').trim();
        if (!bhId || status !== 'Completed') return;
        map[bhId] = {
          commence: (row['Borehole Commence Date'] || '').trim(),
          completed: (row['Date'] || '').trim()
        };
      });
      bhDatesLookup = map;
      if(allRows.length > 0) initTimelineSlider();
    },
    error: (err) => console.error('Could not load log matrix profiles:', err)
  });
}

function fetchProgressSeries(){
  if (!PROGRESS_SHEET_CSV_URL || PROGRESS_SHEET_CSV_URL.indexOf('PASTE_') === 0){
    console.warn('PROGRESS_SHEET_CSV_URL not set yet — timeline slider will stay disabled.');
    return;
  }
  Papa.parse(PROGRESS_SHEET_CSV_URL, {
    download: true, header: true, skipEmptyLines: true,
    complete: (results) => {
      const series = [];
      results.data.forEach(raw => {
        const row = normalizeRow(raw);
        const dateVal = row['Date'];
        const cumVal = row['Cummalative'];
        const pctVal = row['Progress Percentage'];
        if (dateVal === undefined || cumVal === undefined) return;
        const d = parseDateFlexible(dateVal);
        const cum = toNum(cumVal);
        if (!d || cum === null) return;
        series.push({ date: d, cumulative: cum, percentage: toNum(pctVal) });
      });
      series.sort((a,b) => a.date - b.date);
      progressSeries = series;
      if (allRows.length > 0) initTimelineSlider();
    },
    error: (err) => console.error('Could not load progress series:', err)
  });
}

function convertToLatLon(easting, northing){
  try {
    const [lon, lat] = proj4('EPSG:5235', 'WGS84', [easting, northing]);
    return { lat, lon };
  } catch(e){ return null; }
}

function colorFor(status){ return STATUS_COLORS[status] || STATUS_COLORS.default; }

const PACKAGE_PALETTE = ['#4c6ef5', '#e8590c', '#2b8a3e', '#c2255c', '#5f3dc4', '#0c8599', '#e67700', '#495057', '#087f5b', '#a61e4d'];
function colorForPackage(pkg){
  const s = (pkg || '').trim(); if (!s) return '#8a8370';
  let hash = 0; for (let i = 0; i < s.length; i++){ hash = (hash * 31 + s.charCodeAt(i)) | 0; }
  return PACKAGE_PALETTE[Math.abs(hash) % PACKAGE_PALETTE.length];
}

function makeIcon(status, pkg) {
  const statusColor = colorFor(status);
  const pkgColor = colorForPackage(pkg);
  const opacity = (status === "Cancelled") ? "0.5" : "1.0";
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:18px;height:18px;">
        <div class="bh-dot-package" style="position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:${pkgColor}; border:2px solid #ffffff; box-shadow:0 0 0 2px ${pkgColor}, 0 2px 5px rgba(0,0,0,0.4); opacity:${opacity};"></div>
        <div class="bh-dot-status" style="position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:${statusColor}; border:2px solid #ffffff; box-shadow:0 0 0 2px ${statusColor}, 0 2px 5px rgba(0,0,0,0.4); opacity:${opacity};"></div>
      </div>`,
    iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -9]
  });
}

function computeBHLevels(row){
  const elevation = toNum(row['Elevation']);
  const termDepth = toNum(row['Termination Depth']);
  const rockCoring = toNum(row['Rock Coring']);
  const gwDepth = toNum(row['Groundwater Level']);
  const overburden = (termDepth !== null && rockCoring !== null) ? Math.max(termDepth - rockCoring, 0) : null;
  const rockLevel = (elevation !== null && overburden !== null) ? (elevation - overburden) : null;
  const terminationLevel = (elevation !== null && termDepth !== null) ? (elevation - termDepth) : null;
  const gwLevel = (elevation !== null && gwDepth !== null) ? (elevation - gwDepth) : null;
  return { elevation, termDepth, rockCoring, gwDepth, overburden, rockLevel, terminationLevel, gwLevel };
}

function rockLevelDisplay(levels){
  if (levels.overburden === null) return '—';
  return `Depth ${levels.overburden.toFixed(2)} m`;
}

function formatTitleCase(str) {
  if (!str) return '';
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function formatWeatheringGradeLabel(gradeRaw) {
  if (!gradeRaw) return '';
  const clean = gradeRaw.trim().toLowerCase();
  if (clean.includes('fresh')) return 'Fresh';
  if (clean.includes('slightly') || clean === 'slw') return 'Slightly Weathered';
  if (clean.includes('moderately') || clean === 'mw') return 'Moderately Weathered';
  if (clean.includes('highly') || clean === 'hw') return 'Highly Weathered';
  if (clean.includes('completely') || clean === 'cwr') return 'Completely Weathered';
  return formatTitleCase(gradeRaw);
}

function formatSoilLayerDisplay(layer) {
  const code = (layer.graphic || '').trim().toUpperCase();
  const bscsEntry = GRAPHIC_CODE_INFO[code];
  let baseLabel = bscsEntry ? bscsEntry.label : (code ? code : 'Soil Layer');
  const consistency = layer.consistency ? formatTitleCase(layer.consistency) : '';
  let title = baseLabel;
  if (consistency) {
    title = `${consistency} ${baseLabel}`;
  }
  if (code && !title.includes(`(${code})`) && !title.endsWith(code)) {
    title = `${title} (${code})`;
  }
  const origin = layer.origin ? formatTitleCase(layer.origin) : 'Soil Horizon';
  const subtitle = `${origin} (${layer.depth.toFixed(2)}–${layer.bottom.toFixed(2)}m)`;
  return { title, subtitle };
}

function formatRockLayerDisplay(layer, bhRow, allWeatherReadings) {
  let rockName = layer.rawRockType || layer.rockType;
  let grade = layer.grade || layer.rawGrade;
  
  if (!rockName && allWeatherReadings && allWeatherReadings.length) {
    let best = null, bestDist = Infinity;
    allWeatherReadings.forEach(w => {
      const d = Math.abs(w.depth - layer.depth);
      if (d < bestDist) { bestDist = d; best = w; }
    });
    if (best) {
      rockName = best.rawRockType || best.rockType;
      if (!grade) grade = best.grade || best.rawGrade;
    }
  }
  
  if (!rockName && bhRow) {
    rockName = bhRow['Rock Type Name'] || bhRow['Rock Type'] || bhRow['Lithology'] || bhRow['Bedrock Lithology'];
  }
  
  rockName = rockName ? formatTitleCase(rockName) : 'Bedrock';
  const gradeLabel = formatWeatheringGradeLabel(grade);
  let title = rockName;
  if (gradeLabel) {
    if (!rockName.toLowerCase().includes(gradeLabel.toLowerCase())) {
      title = `${gradeLabel} ${rockName}`;
    }
  }
  
  const subtitle = `Bedrock Core (${layer.depth.toFixed(2)}–${layer.bottom.toFixed(2)}m)`;
  return { title, subtitle };
}

function buildBoreholeLogSvg(levels, layers, row){
  const { elevation, termDepth, overburden, gwDepth, rockLevel, terminationLevel, gwLevel } = levels;
  const effectiveTermDepth = (layers && layers.length)
    ? Math.max(...layers.map(l => l.bottom))
    : (termDepth || 15);
  if (effectiveTermDepth === null || effectiveTermDepth <= 0) return '';

  const colH = 310, colW = 26, x0 = 50, y0 = 25;
  const scale = colH / effectiveTermDepth;
  const gwPx = (gwDepth !== null) ? Math.min(Math.max(gwDepth * scale, 0), colH) : null;
  const rkPx = (overburden !== null) ? Math.min(Math.max(overburden * scale, 0), colH) : null;

  const POPUP_BEDROCK_COLOR = '#8f8f95';
  let fadeProfile = null;
  let rockDepthTopForFade = null;
  let readings = null;
  if (row) {
    readings = getBHWeathering(row);
    if (readings && readings.length) {
      const rockLayer = (layers && layers.length) ? layers.find(l => getGraphicInfo(l.graphic).isRock) : null;
      rockDepthTopForFade = rockLayer ? rockLayer.depth : (overburden !== null ? overburden : 0);
      fadeProfile = buildSingleBHFadeProfile(readings, rockDepthTopForFade, effectiveTermDepth);
    }
  }

  // Unified single column bounds for tests (SPT N & RQD / Core Recovery)
  const testColLeft = 320, testColWidth = 100, testColRight = testColLeft + testColWidth;
  const testColMid = testColLeft + testColWidth / 2;

  let svg = `<svg width="455" height="${colH + 45}" viewBox="0 0 455 ${colH + 45}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Geological Patterns matching Profile -->
      <pattern id="pat-alluvium" width="20" height="10" patternUnits="userSpaceOnUse">
        <path d="M0,5 Q5,1 10,5 T20,5" fill="none" stroke="#1e3a8a" stroke-width="1.1" opacity="0.65"/>
      </pattern>
      <pattern id="pat-residual" width="14" height="14" patternUnits="userSpaceOnUse">
        <line x1="2" y1="5" x2="6" y2="5" stroke="#451a03" stroke-width="0.85" opacity="0.5"/>
        <line x1="4" y1="3" x2="4" y2="7" stroke="#451a03" stroke-width="0.85" opacity="0.5"/>
        <line x1="9" y1="12" x2="13" y2="12" stroke="#451a03" stroke-width="0.85" opacity="0.5"/>
        <line x1="11" y1="10" x2="11" y2="14" stroke="#451a03" stroke-width="0.85" opacity="0.5"/>
      </pattern>
      <pattern id="pat-cwr" width="16" height="16" patternUnits="userSpaceOnUse">
        <polygon points="2,2 6,1 5,5 1,4" fill="#78716c" stroke="#292524" stroke-width="0.75" opacity="0.65"/>
        <polygon points="10,9 14,8 13,13 9,12" fill="#78716c" stroke="#292524" stroke-width="0.75" opacity="0.65"/>
      </pattern>
      <pattern id="pat-rock" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="12" y2="0" stroke="#0f172a" stroke-width="0.65" opacity="0.45"/>
        <circle cx="6" cy="6" r="1.0" fill="#0f172a" opacity="0.6"/>
      </pattern>
    </defs>

    <!-- COLUMN HEADERS -->
    <text x="32" y="14" font-size="7.5" font-weight="700" fill="#475569" text-anchor="middle">DEPTH (m)</text>
    <text x="63" y="14" font-size="7.5" font-weight="700" fill="#475569" text-anchor="middle">COLUMN</text>
    <text x="180" y="14" font-size="7.5" font-weight="700" fill="#475569" text-anchor="middle">LITHOLOGY &amp; STRATA</text>

    <!-- Unified Single Column Header for SPT & RQD/Recovery -->
    <text x="${testColMid}" y="10" font-size="7.5" font-weight="700" fill="#0f172a" text-anchor="middle">FIELD TESTS &amp; RQD %</text>
    <line x1="${testColLeft}" y1="13" x2="${testColRight}" y2="13" stroke="#cbd5e1" stroke-width="0.8"/>
    <text x="${testColLeft}" y="21" font-size="6" font-weight="700" fill="#dc2626" text-anchor="start">0</text>
    <text x="${testColMid}" y="21" font-size="6" font-weight="600" fill="#64748b" text-anchor="middle">25 | 50%</text>
    <text x="${testColRight}" y="21" font-size="6" font-weight="700" fill="#0284c7" text-anchor="end">50+ | 100%</text>

    <!-- Vertical Grid Lines for Merged Column -->
    <line x1="${testColLeft}" y1="23" x2="${testColLeft}" y2="${y0+colH}" stroke="#e2e8f0" stroke-width="1"/>
    <line x1="${testColMid}" y1="23" x2="${testColMid}" y2="${y0+colH}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="2,2"/>
    <line x1="${testColRight}" y1="23" x2="${testColRight}" y2="${y0+colH}" stroke="#e2e8f0" stroke-width="1"/>
  `;

  // Depth Axis Ticks
  const depthTicks = new Set([0, effectiveTermDepth]);
  if (layers && layers.length) {
    layers.forEach(l => { depthTicks.add(l.depth); depthTicks.add(l.bottom); });
  } else if (overburden !== null) {
    depthTicks.add(overburden);
  }

  Array.from(depthTicks).sort((a,b) => a - b).forEach(d => {
    const y = y0 + Math.min(d * scale, colH);
    const isTerm = Math.abs(d - effectiveTermDepth) < 0.05;
    const isRockHead = (overburden !== null && Math.abs(d - overburden) < 0.05);
    const strokeCol = isTerm ? '#0f172a' : (isRockHead ? '#b91c1c' : '#64748b');
    const strokeW = (isTerm || isRockHead) ? 1.2 : 0.8;
    svg += `<line x1="42" y1="${y.toFixed(1)}" x2="50" y2="${y.toFixed(1)}" stroke="${strokeCol}" stroke-width="${strokeW}"/>`;
    svg += `<text x="39" y="${(y + 2.8).toFixed(1)}" font-size="7.5" font-weight="${(isTerm||isRockHead)?'800':'600'}" fill="${strokeCol}" text-anchor="end">${d.toFixed(1)}</text>`;
  });

  // GWT Indicator Line
  if (gwPx !== null) {
    const gwY = y0 + gwPx;
    svg += `<line x1="12" y1="${gwY.toFixed(1)}" x2="${x0+colW+4}" y2="${gwY.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="3,2"/>`;
    svg += `<polygon points="26,${gwY.toFixed(1)} 20,${(gwY-5).toFixed(1)} 32,${(gwY-5).toFixed(1)}" fill="#2563eb"/>`;
    svg += `<text x="18" y="${(gwY-3).toFixed(1)}" font-size="6.5" font-weight="800" fill="#2563eb" text-anchor="end">GWT</text>`;
    svg += `<text x="18" y="${(gwY+5).toFixed(1)}" font-size="6.5" font-weight="700" fill="#2563eb" text-anchor="end">${gwDepth.toFixed(1)}m</text>`;
  }

  // Rockhead Indicator Line
  if (rkPx !== null && rkPx > 0 && rkPx < colH) {
    const rkY = y0 + rkPx;
    svg += `<line x1="12" y1="${rkY.toFixed(1)}" x2="${x0+colW+4}" y2="${rkY.toFixed(1)}" stroke="#b91c1c" stroke-width="1.2" stroke-dasharray="3,2"/>`;
    svg += `<text x="18" y="${(rkY-4).toFixed(1)}" font-size="6.5" font-weight="800" fill="#b91c1c" text-anchor="end">ROCK</text>`;
    svg += `<text x="18" y="${(rkY+4).toFixed(1)}" font-size="6.5" font-weight="800" fill="#b91c1c" text-anchor="end">HEAD</text>`;
  }

  // Borehole Column Stratigraphy & Dynamic Detailed Lithology Labels
  if (layers && layers.length) {
    let lastLabelBot = y0 - 10;
    layers.forEach(layer => {
      const info = getGraphicInfo(layer.graphic);
      const isRock = info.isRock || isRockCode(layer.graphic);
      const isBld = info.isBoulder || isBoulderCode(layer.graphic);
      const yTop = y0 + Math.min(layer.depth * scale, colH);
      const yBot = y0 + Math.min(layer.bottom * scale, colH);
      const h = Math.max(yBot - yTop, 0.5);
      let fillColor = info.color;

      if (isBld) {
        // Dedicated Boulder / Corestone Feature Marker in the borehole column
        const cx = x0 + colW / 2;
        const cy = (yTop + yBot) / 2;
        const rx = (colW / 2) - 2.5;
        const ry = Math.max(Math.min(h / 2 - 1.5, 9), 3.5);
        svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="#ded8cd" stroke="#5a5247" stroke-width="0.8" rx="2"/>`;
        svg += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#b8aea0" stroke="#4a4237" stroke-width="1.0"/>`;
        svg += `<ellipse cx="${(cx - 2).toFixed(1)}" cy="${(cy - 1).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.45).toFixed(1)}" fill="#f5f0e6" opacity="0.75"/>`;

        // Format Boulder callout with leader line
        const midY = (yTop + yBot) / 2;
        let labelY = Math.max(midY, lastLabelBot + 14);
        lastLabelBot = labelY + 12;

        svg += `<line x1="${x0+colW}" y1="${midY.toFixed(1)}" x2="${x0+colW+8}" y2="${labelY.toFixed(1)}" stroke="#78716c" stroke-width="0.8" stroke-dasharray="2,2"/>`;
        svg += `<circle cx="${x0+colW}" cy="${midY.toFixed(1)}" r="1.5" fill="#78716c"/>`;
        
        svg += `<text x="${x0+colW+12}" y="${(labelY-2).toFixed(1)}" font-size="8" font-weight="800" fill="#78350f">🪨 Boulder / Corestone Obstruction</text>`;
        svg += `<text x="${x0+colW+12}" y="${(labelY+7).toFixed(1)}" font-size="7" font-weight="600" fill="#64748b">Isolated Clast (${layer.depth.toFixed(2)}–${layer.bottom.toFixed(2)}m)</text>`;
        return;
      }

      if (isRock) {
        if (fadeProfile) {
          const midDepth = (layer.depth + layer.bottom) / 2;
          const fade = evalSingleBHFade(fadeProfile, midDepth - rockDepthTopForFade);
          fillColor = colorAtFadePosition(fade, POPUP_BEDROCK_COLOR);
        } else {
          fillColor = POPUP_BEDROCK_COLOR;
        }
      }

      // Column fill
      svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="${fillColor}" stroke="#574c38" stroke-width="0.4"/>`;

      // Geological Hatch pattern
      const hKey = originHatchKeyOf(layer.origin);
      if (hKey === 'alluvium') {
        svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="url(#pat-alluvium)" stroke="none"/>`;
      } else if (hKey === 'residual' || hKey === 'colluvium') {
        svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="url(#pat-residual)" stroke="none"/>`;
      } else if (hKey === 'completely_weathered_rock' || hKey === 'cwr') {
        svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="url(#pat-cwr)" stroke="none"/>`;
      } else if (isRock) {
        svg += `<rect x="${x0}" y="${yTop.toFixed(1)}" width="${colW}" height="${h.toFixed(1)}" fill="url(#pat-rock)" stroke="none"/>`;
      }

      // Foliation lines in rock
      if (isRock) {
        for (let hy = yTop + 6; hy < yBot - 2; hy += 10) {
          svg += `<line x1="${x0}" y1="${hy.toFixed(1)}" x2="${x0+colW}" y2="${hy.toFixed(1)}" stroke="#1e293b" stroke-width="0.4" opacity="0.35"/>`;
        }
      }

      // Format layer label dynamically using Google Sheet lithology / soil metadata
      const formatted = isRock
        ? formatRockLayerDisplay(layer, row, readings)
        : formatSoilLayerDisplay(layer);

      // Label with leader line
      const midY = (yTop + yBot) / 2;
      let labelY = Math.max(midY, lastLabelBot + 14);
      lastLabelBot = labelY + 12;

      svg += `<line x1="${x0+colW}" y1="${midY.toFixed(1)}" x2="${x0+colW+8}" y2="${labelY.toFixed(1)}" stroke="#94a3b8" stroke-width="0.7"/>`;
      svg += `<circle cx="${x0+colW}" cy="${midY.toFixed(1)}" r="1.5" fill="#475569"/>`;
      
      svg += `<text x="${x0+colW+12}" y="${(labelY-2).toFixed(1)}" font-size="8" font-weight="700" fill="#0f172a">${formatted.title}</text>`;
      svg += `<text x="${x0+colW+12}" y="${(labelY+7).toFixed(1)}" font-size="7" font-weight="500" fill="#64748b">${formatted.subtitle}</text>`;
    });
  } else {
    // Simple Overburden + Bedrock model
    const overburdenPx = overburden !== null ? Math.min(overburden * scale, colH) : colH;
    const rockPx = colH - overburdenPx;
    svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${overburdenPx.toFixed(1)}" fill="#c9a84e" stroke="#574c38" stroke-width="0.4"/>`;
    svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${overburdenPx.toFixed(1)}" fill="url(#pat-residual)" stroke="none"/>`;
    if (rockPx > 0.3) {
      svg += `<rect x="${x0}" y="${(y0+overburdenPx).toFixed(1)}" width="${colW}" height="${rockPx.toFixed(1)}" fill="${POPUP_BEDROCK_COLOR}" stroke="#574c38" stroke-width="0.4"/>`;
      svg += `<rect x="${x0}" y="${(y0+overburdenPx).toFixed(1)}" width="${colW}" height="${rockPx.toFixed(1)}" fill="url(#pat-rock)" stroke="none"/>`;
    }
    svg += `<text x="${x0+colW+12}" y="${y0+15}" font-size="8" font-weight="700" fill="#0f172a">Soil Overburden</text>`;
    svg += `<text x="${x0+colW+12}" y="${y0+24}" font-size="7" font-weight="500" fill="#64748b">Thickness ${overburden !== null ? overburden.toFixed(2)+'m' : '—'}</text>`;
    if (rockPx > 0.3) {
      let rockName = 'Bedrock';
      if (row) {
        const rawName = row['Rock Type Name'] || row['Rock Type'] || row['Lithology'];
        if (rawName) rockName = formatTitleCase(rawName);
      }
      svg += `<text x="${x0+colW+12}" y="${(y0+overburdenPx+18).toFixed(1)}" font-size="8" font-weight="700" fill="#0f172a">${rockName}</text>`;
      svg += `<text x="${x0+colW+12}" y="${(y0+overburdenPx+27).toFixed(1)}" font-size="7" font-weight="500" fill="#64748b">Cored ${levels.rockCoring !== null ? levels.rockCoring.toFixed(2)+'m' : '—'}</text>`;
    }
  }

  // Column outer border
  svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${colH.toFixed(1)}" fill="none" stroke="#0f172a" stroke-width="1.3"/>`;

  // Plot SPT Tests & RQD/CR Tests in Consolidated Single Column
  const tests = row ? getBHTests(row) : [];
  if (tests && tests.length) {
    tests.forEach(t => {
      const ty = y0 + Math.min(t.depth * scale, colH);
      
      // SPT Test rendering
      if (t.nVal !== null && t.nVal !== undefined) {
        const val = t.nVal;
        const bw = Math.min(val / 50, 1) * testColWidth;
        const isRefusal = val >= 50;
        const barFill = isRefusal ? '#ef4444' : (val > 25 ? '#f59e0b' : '#10b981');
        svg += `<rect x="${testColLeft}" y="${(ty-3.5).toFixed(1)}" width="${bw.toFixed(1)}" height="7" fill="${barFill}" rx="1"/>`;
        svg += `<text x="${(testColLeft+bw+3).toFixed(1)}" y="${(ty+2.2).toFixed(1)}" font-size="6.8" font-weight="800" fill="${isRefusal?'#b91c1c':'#1e293b'}">${isRefusal ? '50★' : 'N=' + val}</text>`;
      }
      
      // Rock Coring / RQD Test rendering
      if (t.rqd !== null || t.cr !== null) {
        const th = Math.max((t.length || 1.0) * scale, 7.5);
        if (t.cr !== null && t.cr !== undefined) {
          const crW = Math.min(t.cr / 100, 1) * testColWidth;
          svg += `<rect x="${testColLeft}" y="${ty.toFixed(1)}" width="${crW.toFixed(1)}" height="${th.toFixed(1)}" fill="#e0f2fe" stroke="#38bdf8" stroke-width="0.4" opacity="0.9" rx="1"/>`;
        }
        if (t.rqd !== null && t.rqd !== undefined) {
          const rqdW = Math.min(t.rqd / 100, 1) * testColWidth;
          svg += `<rect x="${testColLeft}" y="${ty.toFixed(1)}" width="${rqdW.toFixed(1)}" height="${th.toFixed(1)}" fill="#0284c7" fill-opacity="0.85" stroke="#0369a1" stroke-width="0.4" rx="1"/>`;
        }
        
        let lbl = '';
        if (t.rqd !== null && t.cr !== null) {
          lbl = `RQD ${Math.round(t.rqd)}% (CR ${Math.round(t.cr)}%)`;
        } else if (t.rqd !== null) {
          lbl = `RQD ${Math.round(t.rqd)}%`;
        } else if (t.cr !== null) {
          lbl = `CR ${Math.round(t.cr)}%`;
        }
        
        if (lbl) {
          const textColor = (t.rqd && t.rqd > 35) ? '#ffffff' : '#0369a1';
          svg += `<text x="${testColLeft + 3}" y="${(ty + th/2 + 2.2).toFixed(1)}" font-size="6.2" font-weight="700" fill="${textColor}">${lbl}</text>`;
        }
      }
    });
  }

  // Bottom Summary Text
  const termRLStr = terminationLevel !== null ? ` (RL +${terminationLevel.toFixed(2)}m MSL)` : '';
  svg += `<text x="${x0+colW+8}" y="${y0+colH+16}" font-size="9" font-weight="700" fill="#0f172a">Terminated @ ${effectiveTermDepth.toFixed(2)}m${termRLStr}</text>`;
  svg += `</svg>`;
  return svg;
}

function buildLayerLegendHtml(layers, row){
  if (!layers || !layers.length) return '';
  const seen = {};
  let hasBoulder = false;
  layers.forEach(l => {
    const info = getGraphicInfo(l.graphic);
    if (info.isBoulder) {
      hasBoulder = true;
    } else if (!info.isRock) {
      seen[info.label] = info.color;
    }
  });
  let html = Object.keys(seen).map(label =>
    `<span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
      <span style="width:9px; height:9px; background:${seen[label]}; border:1px solid #999; display:inline-block; border-radius:2px;"></span>${label}
    </span>`
  ).join('');

  if (hasBoulder) {
    html += `<span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#78350f; font-weight:700;">
      <span style="width:11px; height:8px; background:#b8aea0; border:1px solid #4a4237; display:inline-block; border-radius:3px;"></span>🪨 Boulder / Corestone
    </span>`;
  }
  
  const readings = row ? getBHWeathering(row) : null;
  if (readings && readings.length) {
    const POPUP_BEDROCK_COLOR = '#8f8f95';
    html += WEATHERING_GRADE_ORDER.map(g => {
      const col = colorAtFadePosition(WEATHERING_GRADE_FADE_POS[g], POPUP_BEDROCK_COLOR);
      return `<span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
        <span style="width:9px; height:9px; background:${col}; border:1px solid #999; display:inline-block; border-radius:2px;"></span>${WEATHERING_GRADE_LABELS[g]}
      </span>`;
    }).join('');
  } else {
    const hasRock = layers.some(l => getGraphicInfo(l.graphic).isRock);
    if (hasRock) {
      let rockLabel = 'Bedrock';
      if (row) {
        const rawName = row['Rock Type Name'] || row['Rock Type'] || row['Lithology'];
        if (rawName) rockLabel = formatTitleCase(rawName);
      }
      html += `<span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
        <span style="width:9px; height:9px; background:#8f8f95; border:1px solid #999; display:inline-block; border-radius:2px;"></span>${rockLabel}
      </span>`;
    }
  }

  // Add field test indicators in legend
  html += `
    <span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
      <span style="width:9px; height:7px; background:#10b981; border-radius:1px; display:inline-block;"></span>SPT N
    </span>
    <span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
      <span style="width:9px; height:7px; background:#ef4444; border-radius:1px; display:inline-block;"></span>N=50★ (Refusal)
    </span>
    <span style="display:inline-flex; align-items:center; gap:3px; margin-right:8px; font-size:10px; color:#6b6459;">
      <span style="width:9px; height:7px; background:#0284c7; border-radius:1px; display:inline-block;"></span>RQD %
    </span>
  `;

  return html;
}

function buildBoreholeLogMarkup(levels, layers, row){
  const svg = buildBoreholeLogSvg(levels, layers, row); if (!svg) return '';
  const overburdenTxt = levels.overburden !== null ? ('Overburden: ' + levels.overburden.toFixed(2) + 'm') : '';
  const rockTxt = levels.rockCoring !== null ? ('Rock Coring: ' + levels.rockCoring.toFixed(2) + 'm') : '';
  const rlTxt = levels.elevation !== null ? ('GL ' + levels.elevation.toFixed(2) + 'm') : '';
  const captionParts = [rlTxt, overburdenTxt, rockTxt].filter(Boolean).join(' &middot; ');
  const legendHtml = buildLayerLegendHtml(layers, row);
  const legendRow = legendHtml ? `<div style="margin-top:4px;">${legendHtml}</div>` : '';
  
  return `
    <div class="bh-log-wrap">
      <div style="font-size:10.5px; font-weight:800; text-transform:uppercase; color:#334155; margin-bottom:2px;">STRATIGRAPHIC &amp; GEOTECHNICAL LOG</div>
      <div style="font-size:10px; color:#64748b; margin-bottom:6px;">${captionParts}</div>
      <div class="bh-log-row" style="overflow-x:auto;">${svg}</div>
      ${legendRow}
    </div>`;
}

function popupHtml(row, rowIdx){
  const levels = computeBHLevels(row);
  const bhName = (row['BH Name'] || '').trim();
  const logDates = bhDatesLookup[bhName] || {};
  const commenceDate = formatDateDMY(getFirst(row, ['Borehole Commence Date','Commence Date','Date Commenced','Commencement Date','Start Date','Started Date']) || logDates.commence || '');
  const completedDate = formatDateDMY(getFirst(row, ['Borehole Completed Date','Completed Date','Completion Date','Date Completed','Finish Date','End Date']) || logDates.completed || '');
  
  const rows = [
    ['Commence Date', commenceDate], ['Completed Date', completedDate],
    ['Easting', row['Easting']], ['Northing', row['Northing']], ['Elevation (m)', row['Elevation']],
    ['Contractor', row['Contractor Done'] || row['Contractor']], ['Lot', row['Lot']], ['Package', row['Package']],
    ['Termination Depth (m)', row['Termination Depth']], ['Rock Level (m)', rockLevelDisplay(levels)],
    ['Groundwater Level (m)', row['Groundwater Level']]
  ].filter(([k,v]) => v !== undefined && v !== null && String(v).trim() !== '');
  
  const tableRows = rows.map(([k,v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join('');
  const pdfUrl = (row['PDF Link'] || row['Log PDF'] || row['Borehole Log'] || '').trim();
  const pdfButton = pdfUrl ? `<a href="${pdfUrl}" target="_blank" rel="noopener" class="pdf-link-btn" style="margin-top:6px;">📄 View Borehole Log PDF</a>` : '';
  const profileBtn = `<button onclick="toggleProfileSelection(${rowIdx})" style="width:100%; margin-top:8px; padding:7px; background:linear-gradient(135deg, var(--accent), var(--accent-2)); color:#fff; border:none; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.15);">📐 Add / Remove from 2D Profile</button>`;
  
  const logHtml = buildBoreholeLogMarkup(levels, getBHLayers(row), row);
  
  return `
    <div class="bh-popup-grid">
      <div class="bh-popup-left">
        <div>
          <div class="popup-title">${bhName} <span class="status-pill" style="background:${colorFor(row['Status'])}">${row['Status'] || 'Planned'}</span></div>
          <table class="popup-table">${tableRows}</table>
        </div>
        <div style="margin-top:10px;">
          ${pdfButton}
          ${profileBtn}
        </div>
      </div>
      <div class="bh-popup-right">
        ${logHtml}
