/* ============================================================
   NBRI GEOTECHNICAL GIS — SOIL & ROCK DEFINITIONS (soil-rock-definitions.js)
   Single source of truth for BS 5930 classifications, rock lithology,
   origin hatch patterns, and weathering grade continuous fade engine.
   ============================================================ */

// ── 1. WEATHERING GRADE DEFINITIONS & FADE RAMP ──────────────
// Colour ramp is built dynamically from the ACTUAL bedrock colour (see
// buildWeatheringColorRamp below) so 'fresh' always matches the plain bedrock
// fill exactly, and lighter grades are tints of that same colour.
const WEATHERING_GRADE_ORDER = ['highly', 'moderately', 'slightly', 'fresh'];

const WEATHERING_GRADE_LABELS = {
  highly: 'Highly Weathered Rock',
  moderately: 'Moderately Weathered Rock',
  slightly: 'Slightly Weathered Rock',
  fresh: 'Fresh Rock'
};

// Fade position (0..1) assigned to each grade anchor along the continuous ramp.
// 'fresh' sits at 1.0 (=100% bedrock colour, 0% lightened).
const WEATHERING_GRADE_FADE_POS = {
  highly: 0.0,
  moderately: 0.42,
  slightly: 0.72,
  fresh: 1.0
};

// Maps raw "Primary Weathering" sheet values to 4 canonical grades.
const WEATHERING_GRADE_MAP = {
  'highly weathered': 'highly',
  'moderately weathered': 'moderately',
  'moderately': 'moderately',
  'slightly weathered': 'slightly',
  'fresh': 'fresh',
  'grade i': 'fresh',
  'grade ii': 'slightly',
  'grade iii': 'moderately',
  'grade iv': 'highly',
  'grade v': 'highly',
  'fresh rock': 'fresh',
  'slw': 'slightly',
  'mw': 'moderately',
  'hw': 'highly',
  'cwr': 'highly'
};

function normalizeWeatheringGrade(raw) {
  const clean = (raw || '').trim().toLowerCase();
  if (!clean) return 'fresh';
  return WEATHERING_GRADE_MAP[clean] || 'fresh';
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

// Lightens `hex` toward white by `amount` (0 = unchanged/full colour, 1 = white).
function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

// Linearly blends between two hex colours at fraction t (0=colorA, 1=colorB).
function blendColors(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const tt = Math.max(0, Math.min(1, t));
  return rgbToHex(a.r + (b.r - a.r) * tt, a.g + (b.g - a.g) * tt, a.b + (b.b - a.b) * tt);
}

// Builds the {highly, moderately, slightly, fresh} colour map as tints of the real bedrock colour.
function buildWeatheringColorRamp(bedrockColor) {
  const maxLighten = 0.62;
  const out = {};
  WEATHERING_GRADE_ORDER.forEach(g => {
    const fadePos = WEATHERING_GRADE_FADE_POS[g];
    out[g] = lightenColor(bedrockColor, (1 - fadePos) * maxLighten);
  });
  return out;
}

// Interpolates a colour at continuous fade position t (0=highly..1=fresh).
function colorAtFadePosition(t, bedrockColor) {
  const maxLighten = 0.62;
  const amount = Math.max(0, Math.min(1, (1 - t) * maxLighten));
  return lightenColor(bedrockColor, amount);
}

// Builds a single borehole's piecewise-linear fade profile
function buildSingleBHFadeProfile(readings, rockDepthTop, termDepthAbs) {
  if (!readings || !readings.length) return null;
  const pts = readings
    .map(pt => ({ depthBelowRock: pt.depth - rockDepthTop, fade: WEATHERING_GRADE_FADE_POS[pt.grade] }))
    .filter(p => p.depthBelowRock >= -0.01)
    .sort((a, b) => a.depthBelowRock - b.depthBelowRock);
  if (!pts.length) return null;
  const anchors = [{ depth: 0, fade: pts[0].fade }];
  pts.forEach(p => {
    const last = anchors[anchors.length - 1];
    if (p.depthBelowRock > last.depth) anchors.push({ depth: p.depthBelowRock, fade: p.fade });
    else last.fade = p.fade;
  });
  const rockSpan = Math.max(termDepthAbs - rockDepthTop, 0.1);
  const last = anchors[anchors.length - 1];
  if (last.depth < rockSpan) anchors.push({ depth: rockSpan, fade: 1.0 });
  return { anchors, rockSpan };
}

function evalSingleBHFade(profile, depthBelowRock) {
  if (!profile || !profile.anchors || !profile.anchors.length) return 1.0;
  const a = profile.anchors;
  if (depthBelowRock <= a[0].depth) return a[0].fade;
  if (depthBelowRock >= a[a.length - 1].depth) return a[a.length - 1].fade;
  for (let k = 0; k < a.length - 1; k++) {
    if (depthBelowRock >= a[k].depth && depthBelowRock <= a[k + 1].depth) {
      const span = a[k + 1].depth - a[k].depth;
      const t = span > 0 ? (depthBelowRock - a[k].depth) / span : 0;
      return a[k].fade + (a[k + 1].fade - a[k].fade) * t;
    }
  }
  return 1.0;
}


// ── 2. SOIL ORIGIN & GENETIC FAMILIES ─────────────────────────
const ORIGIN_FAMILY_MAP = {
  'residual': 'residual',
  'residual soil': 'residual',
  'soil': 'residual',
  'soil horizon': 'residual',
  'completely weathered rock': 'residual',
  'cwr': 'residual',
  'alluvium': 'alluvium',
  'alluvial': 'alluvium',
  'colluvium': 'colluvium',
  'colluvial': 'colluvium',
  'made ground': 'made_ground',
  'engineered fill': 'made_ground',
  'fill': 'made_ground'
};

function originFamilyOf(rawOrigin) {
  const clean = (rawOrigin || '').trim().toLowerCase();
  return ORIGIN_FAMILY_MAP[clean] || ('other:' + clean);
}

function originHatchKeyOf(rawOrigin) {
  const clean = (rawOrigin || '').trim().toLowerCase();
  if (clean === 'completely weathered rock' || clean === 'cwr') return 'completely_weathered_rock';
  if (clean === 'residual' || clean === 'residual soil') return 'residual';
  return originFamilyOf(rawOrigin);
}

function originFamilyStackPriority(fam) {
  if (fam === 'made_ground') return 1;
  if (fam === 'alluvium' || fam === 'colluvium') return 2;
  if (fam && fam.startsWith('other:')) return 3;
  if (fam === 'residual') return 4;
  return 5;
}

const ORIGIN_HATCH_INFO = {
  made_ground:  { patternId: 'pat-origin-made-ground',  label: 'Made Ground / Engineered Fill' },
  alluvium:     { patternId: 'pat-origin-alluvium',      label: 'Alluvium' },
  colluvium:    { patternId: 'pat-origin-colluvium',     label: 'Colluvium' },
  residual:     { patternId: 'pat-origin-residual',      label: 'Residual Soil' },
  completely_weathered_rock: { patternId: 'pat-origin-cwr', label: 'Completely Weathered Rock' }
};

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
      <polygon points="11,10 16,9 15,15 10,14" fill="#8f8578" stroke="#332a1e" stroke-width="0.65"/>
      <line x1="3" y1="13" x2="6" y2="16" stroke="#332a1e" stroke-width="0.85" opacity="0.55"/>
      <line x1="12" y1="3" x2="15" y2="6" stroke="#332a1e" stroke-width="0.85" opacity="0.55"/>
    </pattern>`;
}


// ── 3. ROCK LITHOLOGY & FOLIATION PATTERNS ────────────────────
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


// ── 4. BS 5930 GRAPHIC CODE TABLE & HELPERS ──────────────────
const BS5930_GRAPHICS = {
  // Fine-grained soils
  'CL': { label: 'Clay (Low Plasticity)', color: '#d4a373', isRock: false },
  'CI': { label: 'Clay (Intermediate Plasticity)', color: '#c99663', isRock: false },
  'CH': { label: 'Clay (High Plasticity)', color: '#bc8a5f', isRock: false },
  'CV': { label: 'Clay (Very High Plasticity)', color: '#af7d50', isRock: false },
  'CE': { label: 'Clay (Extremely High Plasticity)', color: '#a27041', isRock: false },
  'ML': { label: 'Silt (Low Plasticity)', color: '#e0c9a6', isRock: false },
  'MI': { label: 'Silt (Intermediate Plasticity)', color: '#d9be9b', isRock: false },
  'MH': { label: 'Silt (High Plasticity)', color: '#d2b48c', isRock: false },
  'MV': { label: 'Silt (Very High Plasticity)', color: '#cbaa7d', isRock: false },
  'ME': { label: 'Silt (Extremely High Plasticity)', color: '#c4a06e', isRock: false },
  'CS': { label: 'Sandy Clay', color: '#c99663', isRock: false },
  'MG': { label: 'Gravelly Silt', color: '#d2b48c', isRock: false },
  
  // Coarse-grained soils
  'SC': { label: 'Clayey Sand', color: '#e9c46a', isRock: false },
  'SM': { label: 'Silty Sand', color: '#f4a261', isRock: false },
  'SW': { label: 'Well Graded Sand', color: '#e76f51', isRock: false },
  'SP': { label: 'Poorly Graded Sand', color: '#f4a261', isRock: false },
  'GC': { label: 'Clayey Gravel', color: '#dda15e', isRock: false },
  'GM': { label: 'Silty Gravel', color: '#bc6c25', isRock: false },
  'GW': { label: 'Well Graded Gravel', color: '#a77644', isRock: false },
  'GP': { label: 'Poorly Graded Gravel', color: '#8f5c2c', isRock: false },
  
  // Made Ground, Organics, Rock
  'MG_FILL': { label: 'Made Ground / Engineered Fill', color: '#94a3b8', isRock: false },
  'PT': { label: 'Peat / Organic Soil', color: '#582f0e', isRock: false },
  'Topsoil': { label: 'Topsoil', color: '#656d4a', isRock: false },
  'Rock': { label: 'Bedrock', color: '#71717a', isRock: true },
  'Boulder': { label: 'Boulder / Corestone', color: '#b8aea0', isBoulder: true, isRock: false }
};

function isBoulderCode(code) {
  if (!code) return false;
  const c = code.toLowerCase();
  return c.includes('boulder') || c.includes('corestone') || c === 'bld';
}

function isRockCode(code) {
  if (!code) return false;
  const c = code.toLowerCase();
  return c.includes('rock') || c.includes('gneiss') || c.includes('granite') || c.includes('charnockite') || c.includes('marble') || c.includes('quartzite');
}

function getGraphicInfo(code) {
  if (!code) return { label: 'Soil Stratum', color: '#d4a373', isRock: false };
  if (BS5930_GRAPHICS[code]) return BS5930_GRAPHICS[code];
  if (isBoulderCode(code)) return { label: 'Boulder / Corestone', color: '#b8aea0', isBoulder: true, isRock: false };
  if (isRockCode(code)) return { label: formatTitleCase(code), color: '#71717a', isRock: true };
  return { label: formatTitleCase(code), color: graphicHashColor(code), isRock: false };
}

function graphicHashColor(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = code.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 65%)`;
}

function formatTitleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}
