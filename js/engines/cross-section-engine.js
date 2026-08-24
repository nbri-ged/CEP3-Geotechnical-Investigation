function toggleProfileSelection(rowIdx) {
  if (typeof rowIdx !== 'number' || isNaN(rowIdx)) return;
  const idx = profileSelectedIdx.indexOf(rowIdx);
  const row = allRows[rowIdx];
  const bhName = row ? (row['BH Name'] || row['PointID'] || `BH #${rowIdx+1}`).trim() : `BH #${rowIdx+1}`;
  
  if (idx === -1) {
    profileSelectedIdx.push(rowIdx);
    if (typeof showAppToast === 'function') {
      showAppToast('📍 Borehole Added', `Added ${bhName} (${profileSelectedIdx.length} selected for 2D profile)`, 'success');
    }
  } else {
    profileSelectedIdx.splice(idx, 1);
    if (typeof showAppToast === 'function') {
      showAppToast('📍 Borehole Removed', `Removed ${bhName} (${profileSelectedIdx.length} remaining)`, 'info');
    }
  }
  updateProfileChips();
  if (typeof render === 'function') render();
}

// Global window exports to guarantee fail-proof onclick resolution
window.toggleProfileSelection = toggleProfileSelection;
window.showProfileModal = showProfileModal;
window.updateProfileChips = updateProfileChips;
window.recreateProfile = recreateProfile;

function updateProfileChips() {
  const wrap = document.getElementById('profile-selected-list');
  const chipsEl = document.getElementById('profile-chips');
  if (!wrap || !chipsEl) return;
  if (profileSelectedIdx.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  chipsEl.innerHTML = profileSelectedIdx.map((rowIdx, i) => {
    const r = allRows[rowIdx];
    const n = r ? (r['BH Name'] || r['PointID'] || '').trim() : '(missing)';
    return `<span class="profile-chip" data-idx="${rowIdx}">${i+1}. ${n} &times;</span>`;
  }).join('');
  chipsEl.querySelectorAll('.profile-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleProfileSelection(parseInt(chip.getAttribute('data-idx'), 10)));
  });
}

function sortBoreholesByMapPosition(rows) {
  // Convert all to lat/lon
  const pts = rows.map(row => {
    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    const ll = (e !== null && n !== null) ? convertToLatLon(e, n) : null;
    return { row, lat: ll ? ll.lat : 0, lon: ll ? ll.lon : 0 };
  });

  if (pts.length < 2) return rows;

  // Find principal axis: from first-most to last-most BH along the overall direction
  // Use the vector from centroid to the extreme point
  const centLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const centLon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;

  // PCA-style: pick the BH farthest from centroid, use that as direction vector
  let maxDist = -1, farIdx = 0;
  pts.forEach((p, i) => {
    const d = Math.sqrt((p.lat - centLat) ** 2 + (p.lon - centLon) ** 2);
    if (d > maxDist) { maxDist = d; farIdx = i; }
  });

  const axLat = pts[farIdx].lat - centLat;
  const axLon = pts[farIdx].lon - centLon;
  const axLen = Math.sqrt(axLat ** 2 + axLon ** 2) || 1;

  // Project each BH onto this axis and sort
  pts.forEach(p => {
    p.proj = ((p.lat - centLat) * axLat + (p.lon - centLon) * axLon) / axLen;
  });

  pts.sort((a, b) => a.proj - b.proj);
  return pts.map(p => p.row);
}

// Helper to extract or parse highway chainage / stationing from borehole metadata or PointID
function extractBoreholeChainage(row, bhName) {
  if (!row && !bhName) return '';
  const rawCh = row ? (row['Chainage'] || row['Station'] || row['CH'] || row['Chainage (m)'] || row['Distance'] || row['Location'] || '') : '';
  if (rawCh && String(rawCh).trim()) {
    const s = String(rawCh).trim();
    if (s.toLowerCase().startsWith('ch') || s.toLowerCase().startsWith('sta')) return s;
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      const km = Math.floor(num / 1000);
      const m = Math.round(num % 1000);
      return `CH ${km}+${String(m).padStart(3, '0')}`;
    }
    return `CH ${s}`;
  }
  // Try extracting from BH name (e.g., BH-14170-L1 -> CH 14+170, BH-19195-R1 -> CH 19+195)
  const name = String(bhName || (row ? row['PointID'] || '' : '')).trim();
  const m5 = name.match(/BH[^\d]*(\d{2})(\d{3})/i);
  if (m5) {
    return `CH ${parseInt(m5[1], 10)}+${m5[2]}`;
  }
  const m4 = name.match(/BH[^\d]*(\d{1,2})[\-_](\d{3})/i);
  if (m4) {
    return `CH ${parseInt(m4[1], 10)}+${m4[2]}`;
  }
  const mBr = name.match(/BH[^\d]*BR[^\d]*(\d+)[-_](\d+)/i);
  if (mBr) {
    return `BR ${mBr[1]}-${mBr[2]}`;
  }
  return '';
}

function computeProfilePositions(rows){
  const points = rows.map(row => {
    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    const ll = (e !== null && n !== null) ? convertToLatLon(e, n) : null;
    return { row, latlng: ll ? L.latLng(ll.lat, ll.lon) : null };
  });
  let cumDist = 0;
  const positions = [];
  points.forEach((p, i) => {
    if (i > 0 && points[i-1].latlng && p.latlng){
      cumDist += points[i-1].latlng.distanceTo(p.latlng);
    }
    positions.push(cumDist);
  });
  return positions;
}

/* ============================================================
   REWRITTEN PROFESSIONAL GEOLOGICAL CROSS-SECTION ENGINE
   (Fulfills 100% complete filling via cumulative boundaries,
    separate Y-axis margins, terrain-following groundwater, zero white gaps)
   ============================================================ */
profileOptions = {
  showRockLithology: true,
  showSPT: true,
  showRQD: true,
  showGWT: true,
  showWeathering: true,
  showRoughGround: false,
  showRoughSoil: false,
  showRoughRockhead: false
};

function originFamilyStackPriority(family) {
  if (family === 'made_ground') return 0;   // human-placed fill, always at/near surface
  if (family === 'alluvium') return 1;      // transported, surface/near-surface deposit
  if (family === 'colluvium') return 1;     // transported, surface/near-surface deposit
  if (family === 'unknown') return 2;       // unclassified soil — treated as ordinary overburden
  if (family === 'residual') return 3;      // in-situ weathering profile (Residual + CWR)
  return 2; // any other named origin (Aeolian, Estuarine, etc.)
}

// Monotonic Piecewise Cubic Hermite Interpolating Polynomial (PCHIP)
// Preserves monotonicity between data points to prevent unphysical overshoots or artificial bedrock spires
function interpolateSpline(points, xTarget) {
  if (!points || !points.length) return 0;
  if (points.length === 1) return points[0].y;
  if (xTarget <= points[0].x) return points[0].y;
  if (xTarget >= points[points.length - 1].x) return points[points.length - 1].y;

  const n = points.length;
  const h = [];
  const delta = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    h.push(dx);
    delta.push(dx > 1e-6 ? (points[i + 1].y - points[i].y) / dx : 0);
  }

  const d = new Array(n);
  d[0] = delta[0];
  d[n - 1] = delta[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      d[i] = 0; // Local extremum: tangent set flat to prevent overshoot
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (xTarget >= points[i].x && xTarget <= points[i + 1].x) {
      const dx = h[i];
      if (dx <= 1e-6) return points[i].y;
      const t = (xTarget - points[i].x) / dx;
      const t2 = t * t;
      const t3 = t2 * t;

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      return h00 * points[i].y + h10 * dx * d[i] + h01 * points[i + 1].y + h11 * dx * d[i + 1];
    }
  }
  return points[points.length - 1].y;
}

function detectBHTrendAzimuth(rows) {
  if (!rows || rows.length < 2) return 45.0;
  const sorted = sortBoreholesByMapPosition(rows);
  const e1 = toNum(sorted[0]['Easting']), n1 = toNum(sorted[0]['Northing']);
  const e2 = toNum(sorted[sorted.length - 1]['Easting']), n2 = toNum(sorted[sorted.length - 1]['Northing']);
  if (e1 === null || n1 === null || e2 === null || n2 === null) return 45.0;
  const dE = e2 - e1, dN = n2 - n1;
  if (Math.hypot(dE, dN) < 0.1) return 45.0;
  let az = (Math.atan2(dE, dN) * 180) / Math.PI;
  if (az < 0) az += 360;
  return Math.round(az * 10) / 10;
}

function buildProfileSvg(rows, options = {}, arg3 = null, arg4 = null) {
  if (!rows || !rows.length) return '';

  let distancesOverride = null;
  let projectMeta = null;

  if (Array.isArray(arg3)) {
    distancesOverride = arg3;
    projectMeta = (arg4 && typeof arg4 === 'object' && !Array.isArray(arg4)) ? arg4 : null;
  } else if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3)) {
    projectMeta = arg3;
    distancesOverride = Array.isArray(arg4) ? arg4 : null;
  } else {
    if (Array.isArray(arg4)) distancesOverride = arg4;
    else if (arg4 && typeof arg4 === 'object') projectMeta = arg4;
  }

  const opts = Object.assign({
    showRockLithology: true,
    showSPT: true,
    showRQD: true,
    showGWT: true,
    showWeathering: true,
    showRoughGround: false,
    showRoughSoil: false,
    showRoughRockhead: false
  }, profileOptions, options);

  const detectedAz = detectBHTrendAzimuth(rows);
  const meta = Object.assign({
    sectionMethod: 'sequential',
    sectionAzimuth: detectedAz,
    dipDirection: 45,
    dipAngle: 45,
    offsets: null,
    isProjection: false
  }, projectMeta || {});

  // If sectionAzimuth was not explicitly customized by user, use the auto-detected borehole trend
  if (!projectMeta || projectMeta.sectionAzimuth === undefined || projectMeta.sectionAzimuth === null) {
    meta.sectionAzimuth = detectedAz;
  }

  const appDip = calcApparentDip(meta.sectionAzimuth, meta.dipDirection, meta.dipAngle);
  const leftBearingDeg = (meta.sectionAzimuth + 180) % 360;
  const rightBearingDeg = meta.sectionAzimuth % 360;
  const leftBearingStr = `${leftBearingDeg.toFixed(1)}° ${getCompassQuadrant(leftBearingDeg)}`;
  const rightBearingStr = `${rightBearingDeg.toFixed(1)}° ${getCompassQuadrant(rightBearingDeg)}`;

  const distances = distancesOverride || computeProfilePositions(rows);
  const levelsArr = rows.map(computeBHLevels);
  const bhNames = rows.map(r => (r['BH Name'] || '').trim());
  const rawLayersArr = rows.map(r => getBHLayers(r) || null);

  // Only merge CONTIGUOUS layers that share BOTH the same Origin Family AND
  // the same BSCS / graphic code (e.g. two consecutive 1.5m SM readings merge
  // into one 3.0m SM layer). Distinct lithology layers (e.g. SM, MG, CS, MS,
  // SC, CL) are individually preserved with their true logged depths and
  // elevations. Boulders/Corestones are decoupled from layer merging and
  // treated strictly as borehole column feature markers.
  const layersArr = rawLayersArr.map(layers => {
    if (!layers || !layers.length) return layers;
    const merged = [];
    layers.forEach(l => {
      const info = getGraphicInfo(l.graphic);
      const isBld = info.isBoulder || isBoulderCode(l.graphic);
      const isRk = info.isRock || isRockCode(l.graphic);
      const fam = (isRk || isBld) ? null : originFamilyOf(l.origin);
      const last = merged[merged.length - 1];
      if (!isRk && !isBld && last && !last.isRockBlock && !last.isBoulder && last.originFamily === fam && (last.graphic || '').trim() === (l.graphic || '').trim() && Math.abs(last.bottom - l.depth) < 0.01) {
        last.bottom = l.bottom;
        last.subLayers.push(l);
      } else {
        merged.push({
          depth: l.depth,
          bottom: l.bottom,
          graphic: l.graphic,
          origin: l.origin,
          consistency: l.consistency,
          originFamily: fam,
          isRockBlock: isRk,
          isBoulder: isBld,
          subLayers: [l]
        });
      }
    });
    return merged;
  });

  // Track layer occurrence index for non-contiguous repeats (e.g. Upper SM vs Lower SM)
  layersArr.forEach(layers => {
    if (!layers) return;
    const seenCount = {};
    layers.forEach(l => {
      if (l.isRockBlock || l.isBoulder) return;
      const baseKey = (l.originFamily || 'residual') + '||' + (l.graphic || '').trim();
      seenCount[baseKey] = (seenCount[baseKey] || 0) + 1;
      l.occIndex = seenCount[baseKey];
    });
  });

  const effectiveRockLevel = levelsArr.map((lv, i) => {
    const layers = layersArr[i];
    if (layers && layers.length && lv.elevation !== null) {
      const rockLayer = layers.find(l => getGraphicInfo(l.graphic).isRock);
      if (rockLayer) return lv.elevation - rockLayer.depth;
    }
    return lv.rockLevel !== null ? lv.rockLevel : (lv.elevation !== null ? lv.elevation - (lv.overburden || 5) : null);
  });

  const effectiveTermLevel = levelsArr.map((lv, i) => {
    const layers = layersArr[i];
    if (layers && layers.length && lv.elevation !== null) {
      const maxBottom = Math.max(...layers.map(l => l.bottom));
      return lv.elevation - maxBottom;
    }
    return lv.terminationLevel !== null ? lv.terminationLevel : (lv.elevation !== null ? lv.elevation - (lv.termDepth || 15) : null);
  });

  const totalDist = Math.max(distances[distances.length - 1], 1);
  const padLeft = 85, padRight = 45, padTop = 140;
  // sideExt: dynamically proportional extension beyond first/last BH for balanced geological margins
  const sideExt = Math.min(Math.max(totalDist * 0.12, 1.8), Math.max(totalDist * 0.08, 15));
  // distMin / distMax define the geological extent (with side extensions)
  const distMin = 0 - sideExt;
  const distMax = totalDist + sideExt;
  const distSpan = distMax - distMin;
  const plotMargin = 55; // Offset plot frame from Y-axis labels
  const minInnerW = Math.max(700, totalDist * 0.18 + rows.length * 105);
  const plotW = minInnerW + plotMargin * 2;
  const plotH = 440;
  const svgW = plotW + padLeft + padRight;

  const numSamples = Math.max(Math.round(plotW / 2), 160);
  // Build ONE shared sample-distance array, used for every curve (ground, rock,
  // layer fills, GWT) AND the legend's hasArea dry-run check. Crucially it
  // MERGES IN the exact borehole distances, so every fill polygon passes
  // exactly through the true logged boundary at each pillar instead of only
  // approaching it via the nearest evenly-spaced sample — this is what caused
  // thin mismatched slivers right at the BH columns. Defined early (right
  // after plotW/distSpan) rather than later, because the legend needs it for
  // its dry-run "did this unit actually render" check, and the legend size
  // must be known before the SVG header line further down.
  const sampleDists = (() => {
    const uniform = [];
    for (let s = 0; s <= numSamples; s++) uniform.push(distMin + (distSpan * s) / numSamples);
    const merged = uniform.concat(distances.filter(d => d >= distMin && d <= distMax));
    merged.sort((a, b) => a - b);
    const eps = distSpan * 1e-6;
    const out = [];
    merged.forEach(d => {
      if (out.length === 0 || d - out[out.length - 1] > eps) out.push(d);
    });
    return out;
  })();

  let maxElev = -Infinity, minElev = Infinity;
  levelsArr.forEach((lv, i) => {
    if (lv.elevation !== null) maxElev = Math.max(maxElev, lv.elevation);
    if (effectiveTermLevel[i] !== null && effectiveTermLevel[i] !== undefined) minElev = Math.min(minElev, effectiveTermLevel[i]);
    if (effectiveRockLevel[i] !== null && effectiveRockLevel[i] !== undefined) minElev = Math.min(minElev, effectiveRockLevel[i]);
  });
  if (!isFinite(maxElev) || !isFinite(minElev)) { maxElev = 100; minElev = 70; }
  const elevSpanRaw = maxElev - minElev;
  const elevPadTop = Math.max(elevSpanRaw * 0.20, 6);
  const elevPadBottom = Math.max(elevSpanRaw * 0.12, 3);
  maxElev += elevPadTop; minElev -= elevPadBottom;
  const elevRange = maxElev - minElev;

  // xPos maps actual distances (including negative sideExt) to SVG X
  function xPos(dist) {
    const xLeft = padLeft + plotMargin;
    const xRight = padLeft + plotW - plotMargin;
    return xLeft + ((dist - distMin) / distSpan) * (xRight - xLeft);
  }
  // xDistMin / xDistMax are the SVG pixel positions of the left/right plot frame edges
  const xFrameLeft = padLeft + plotMargin;
  const xFrameRight = padLeft + plotW - plotMargin;

  function yPos(elev) {
    return padTop + ((maxElev - elev) / elevRange) * plotH;
  }

  const GraphicHierarchy = [
    'FILL', 'MS', 'ML', 'MH', 'CL', 'CH', 'CI', 'OL', 'OH',
    'SM', 'SC', 'SP', 'CS', 'GM', 'GC', 'WEATHERED ROCK'
  ];

  function getGraphicRank(code) {
    const clean = (code || '').trim().toUpperCase();
    const idx = GraphicHierarchy.indexOf(clean);
    return idx !== -1 ? idx : 50;
  }

  function unitKey(layerLike, originFamily) {
    const graphic = typeof layerLike === 'string' ? layerLike : (layerLike ? layerLike.graphic : '');
    const occ = (layerLike && layerLike.occIndex && layerLike.occIndex > 1) ? `#${layerLike.occIndex}` : '';
    return originFamily + '||' + (graphic || '').trim() + occ;
  }

  function hasMatchingNeighborBlock(bhIdx, family, subLayerCodes) {
    const neighbors = [bhIdx - 1, bhIdx + 1].filter(j => j >= 0 && j < rows.length);
    return neighbors.some(j => {
      const layers = layersArr[j];
      if (!layers) return false;
      return layers.some(l => {
        if (l.isRockBlock || l.isBoulder || l.originFamily !== family) return false;
        const neighborCodes = new Set((l.subLayers || [l]).map(sl => (sl.graphic || '').trim()));
        return subLayerCodes.some(code => neighborCodes.has(code));
      });
    });
  }

  // Tag every merged block as tabular or lens BEFORE building the master
  // unit list, so both downstream passes (tabular interpolation, lens
  // rendering) agree on the same classification for the same block.
  layersArr.forEach((layers, i) => {
    if (!layers) return;
    layers.forEach(l => {
      if (l.isRockBlock || l.isBoulder) { l.isLens = false; return; }
      const lensSet = (typeof LENS_ORIGIN_FAMILIES !== 'undefined' && LENS_ORIGIN_FAMILIES) ? LENS_ORIGIN_FAMILIES : new Set(['alluvium', 'colluvium', 'made_ground']);
      const isLensFamily = lensSet.has(l.originFamily);
      const ownCodes = (l.subLayers || [l]).map(sl => (sl.graphic || '').trim());
      l.isLens = isLensFamily && !hasMatchingNeighborBlock(i, l.originFamily, ownCodes);
    });
  });

  // Master soil units (tabular system) now include any lens-family block
  // that turned out to be CONNECTED to a neighbour (rule 3 corrected) —
  // ── TWO-TIER HIERARCHICAL STRATIGRAPHIC ARCHITECTURE ─────────────────────
  // Tier 1: Macro-Origin Formations (Alluvium/Transported vs In-situ Residual/CWR)
  // Tier 2: Intra-Formation Sub-Units (Layers pinch out strictly within their origin envelope)

  const alluvUnitKeySet = new Set();
  const resUnitKeySet = new Set();
  const soilUnitMeta = {}; // unitKey -> { graphic, originFamily, origin }
  const alluvUnitDepths = {}; // unitKey -> [normalizedDepthInAlluv]
  const resUnitDepths = {}; // unitKey -> [normalizedDepthInRes]

  // 1. Calculate Alluvium Base depth & elevation at each borehole
  const alluvBaseDepths = rows.map((r, i) => {
    const layers = layersArr[i];
    if (!layers || !layers.length) return 0;
    let maxAlluv = 0;
    layers.forEach(l => {
      if (!l.isRockBlock && !l.isBoulder && (l.originFamily === 'alluvium' || l.originFamily === 'colluvium' || l.originFamily === 'made_ground')) {
        if (l.bottom > maxAlluv) maxAlluv = l.bottom;
      }
    });
    return maxAlluv;
  });

  const alluvBaseLevels = rows.map((r, i) => {
    const lv = levelsArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const dAlluv = alluvBaseDepths[i];
    if (dAlluv <= 0.05) return zG;
    return Math.min(Math.max(zG - dAlluv, zR), zG);
  });

  // 2. Classify and collect intra-formation sub-units
  layersArr.forEach((layers, i) => {
    const dAlluv = alluvBaseDepths[i];
    if (layers && layers.length) {
      const nonRockSoil = layers.filter(l => !l.isRockBlock && !l.isBoulder);
      const totalSoil = nonRockSoil.length ? Math.max(...nonRockSoil.map(l => l.bottom)) : 10;
      const totalRes = Math.max(totalSoil - dAlluv, 0.1);

      layers.forEach(l => {
        if (l.isRockBlock || l.isBoulder) return;
        if (l.isLens) return; // handled by isolated lens pass
        const key = unitKey(l, l.originFamily);
        soilUnitMeta[key] = { graphic: (l.graphic || '').trim(), originFamily: l.originFamily, origin: l.origin };

        if (l.originFamily === 'alluvium' || l.originFamily === 'colluvium' || l.originFamily === 'made_ground') {
          alluvUnitKeySet.add(key);
          if (!alluvUnitDepths[key]) alluvUnitDepths[key] = [];
          alluvUnitDepths[key].push(dAlluv > 0.05 ? (l.depth / dAlluv) : 0);
        } else {
          resUnitKeySet.add(key);
          if (!resUnitDepths[key]) resUnitDepths[key] = [];
          const topInRes = Math.max(l.depth - dAlluv, 0);
          resUnitDepths[key].push(topInRes / totalRes);
        }
      });
    }
  });

  const alluvialMasterUnits = Array.from(alluvUnitKeySet).sort((a, b) => {
    const famA = originFamilyStackPriority(soilUnitMeta[a].originFamily);
    const famB = originFamilyStackPriority(soilUnitMeta[b].originFamily);
    if (famA !== famB) return famA - famB;
    const depthsA = alluvUnitDepths[a] || [0];
    const depthsB = alluvUnitDepths[b] || [0];
    const minA = Math.min(...depthsA), minB = Math.min(...depthsB);
    if (Math.abs(minA - minB) > 0.01) return minA - minB;
    const avgA = depthsA.reduce((x, y) => x + y, 0) / depthsA.length;
    const avgB = depthsB.reduce((x, y) => x + y, 0) / depthsB.length;
    if (Math.abs(avgA - avgB) > 0.01) return avgA - avgB;
    return getGraphicRank(soilUnitMeta[a].graphic) - getGraphicRank(soilUnitMeta[b].graphic);
  });

  const residualMasterUnits = Array.from(resUnitKeySet).sort((a, b) => {
    const famA = originFamilyStackPriority(soilUnitMeta[a].originFamily);
    const famB = originFamilyStackPriority(soilUnitMeta[b].originFamily);
    if (famA !== famB) return famA - famB;
    const depthsA = resUnitDepths[a] || [0];
    const depthsB = resUnitDepths[b] || [0];
    const minA = Math.min(...depthsA), minB = Math.min(...depthsB);
    if (Math.abs(minA - minB) > 0.01) return minA - minB;
    const avgA = depthsA.reduce((x, y) => x + y, 0) / depthsA.length;
    const avgB = depthsB.reduce((x, y) => x + y, 0) / depthsB.length;
    if (Math.abs(avgA - avgB) > 0.01) return avgA - avgB;
    return getGraphicRank(soilUnitMeta[a].graphic) - getGraphicRank(soilUnitMeta[b].graphic);
  });

  if (residualMasterUnits.length === 0 && alluvialMasterUnits.length === 0) {
    const key = unitKey('Overburden (soil)', 'unknown');
    residualMasterUnits.push(key);
    soilUnitMeta[key] = { graphic: 'Overburden (soil)', originFamily: 'unknown', origin: '' };
  }

  // Combined master list for legend & color palettes
  const masterSoilUnits = [...alluvialMasterUnits, ...residualMasterUnits];
  const K = masterSoilUnits.length;
  const K_alluv = alluvialMasterUnits.length;
  const K_res = residualMasterUnits.length;

  // 3. Build Intra-Alluvium Cumulative Boundaries
  const bhAlluvUnitPresent = [];
  const bhAlluvCumBoundaries = rows.map((r, i) => {
    const layers = layersArr[i];
    const dAlluv = alluvBaseDepths[i];
    const present = new Array(K_alluv).fill(false);
    const unitMap = {};

    if (K_alluv > 0 && dAlluv > 0.05 && layers && layers.length) {
      const alluvLayers = layers.filter(l => !l.isRockBlock && !l.isBoulder && !l.isLens && (l.originFamily === 'alluvium' || l.originFamily === 'colluvium' || l.originFamily === 'made_ground'));
      alluvLayers.forEach(l => {
        const key = unitKey(l, l.originFamily);
        const uIdx = alluvialMasterUnits.indexOf(key);
        if (uIdx >= 0) {
          present[uIdx] = true;
          const fTop = Math.min(Math.max(l.depth / dAlluv, 0), 1.0);
          const fBot = Math.min(Math.max(l.bottom / dAlluv, 0), 1.0);
          if (!unitMap[key]) unitMap[key] = { fTop, fBot };
          else {
            unitMap[key].fTop = Math.min(unitMap[key].fTop, fTop);
            unitMap[key].fBot = Math.max(unitMap[key].fBot, fBot);
          }
        }
      });
    }
    bhAlluvUnitPresent.push(present);

    const C = new Array(K_alluv + 1).fill(0);
    C[0] = 0.0;
    let cursor = 0.0;
    alluvialMasterUnits.forEach((u, uIdx) => {
      if (unitMap[u]) {
        const fTop = Math.max(unitMap[u].fTop, cursor);
        const fBot = Math.max(unitMap[u].fBot, fTop);
        C[uIdx] = fTop;
        C[uIdx + 1] = fBot;
        for (let k = 0; k < uIdx; k++) {
          if (!bhAlluvUnitPresent[i][k]) {
            C[k] = Math.min(C[k], fTop);
            C[k + 1] = Math.min(C[k + 1], fTop);
          }
        }
        cursor = fBot;
      } else {
        C[uIdx] = cursor;
        C[uIdx + 1] = cursor;
      }
    });
    for (let k = 0; k < K_alluv; k++) {
      if (bhAlluvUnitPresent[i][k]) {
        C[k] = 0.0;
        for (let j = 0; j <= k; j++) {
          if (!bhAlluvUnitPresent[i][j]) { C[j] = 0.0; C[j + 1] = 0.0; }
        }
        break;
      }
    }
    C[K_alluv] = 1.0;
    if (cursor < 1.0) {
      for (let k = K_alluv - 1; k >= 0; k--) {
        if (bhAlluvUnitPresent[i][k]) {
          C[k + 1] = 1.0;
          for (let j = k + 1; j <= K_alluv; j++) C[j] = 1.0;
          break;
        }
      }
    }
    for (let k = 1; k <= K_alluv; k++) {
      if (C[k] < C[k - 1]) C[k] = C[k - 1];
    }
    return C;
  });

  // 4. Build Intra-Residual Cumulative Boundaries
  const bhResUnitPresent = [];
  const bhResCumBoundaries = rows.map((r, i) => {
    const lv = levelsArr[i];
    const layers = layersArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const dAlluv = alluvBaseDepths[i];
    const nonRock = (layers || []).filter(l => !l.isRockBlock && !l.isBoulder);
    const totalSoil = nonRock.length ? Math.max(...nonRock.map(l => l.bottom)) : Math.max(zG - zR, 0.1);
    const resThick = Math.max(totalSoil - dAlluv, 0.1);

    const present = new Array(K_res).fill(false);
    const unitMap = {};

    if (K_res > 0 && layers && layers.length) {
      const resLayers = layers.filter(l => !l.isRockBlock && !l.isBoulder && !l.isLens && (l.originFamily === 'residual' || l.originFamily === 'unknown'));
      resLayers.forEach(l => {
        const key = unitKey(l, l.originFamily);
        const uIdx = residualMasterUnits.indexOf(key);
        if (uIdx >= 0) {
          present[uIdx] = true;
          const topInRes = Math.max(l.depth - dAlluv, 0);
          const botInRes = Math.max(l.bottom - dAlluv, topInRes);
          const fTop = Math.min(Math.max(topInRes / resThick, 0), 1.0);
          const fBot = Math.min(Math.max(botInRes / resThick, 0), 1.0);
          if (!unitMap[key]) unitMap[key] = { fTop, fBot };
          else {
            unitMap[key].fTop = Math.min(unitMap[key].fTop, fTop);
            unitMap[key].fBot = Math.max(unitMap[key].fBot, fBot);
          }
        }
      });
    }
    bhResUnitPresent.push(present);

    const C = new Array(K_res + 1).fill(0);
    C[0] = 0.0;
    let cursor = 0.0;
    residualMasterUnits.forEach((u, uIdx) => {
      if (unitMap[u]) {
        const fTop = Math.max(unitMap[u].fTop, cursor);
        const fBot = Math.max(unitMap[u].fBot, fTop);
        C[uIdx] = fTop;
        C[uIdx + 1] = fBot;
        for (let k = 0; k < uIdx; k++) {
          if (!bhResUnitPresent[i][k]) {
            C[k] = Math.min(C[k], fTop);
            C[k + 1] = Math.min(C[k + 1], fTop);
          }
        }
        cursor = fBot;
      } else {
        C[uIdx] = cursor;
        C[uIdx + 1] = cursor;
      }
    });
    for (let k = 0; k < K_res; k++) {
      if (bhResUnitPresent[i][k]) {
        C[k] = 0.0;
        for (let j = 0; j <= k; j++) {
          if (!bhResUnitPresent[i][j]) { C[j] = 0.0; C[j + 1] = 0.0; }
        }
        break;
      }
    }
    C[K_res] = 1.0;
    if (cursor < 1.0) {
      for (let k = K_res - 1; k >= 0; k--) {
        if (bhResUnitPresent[i][k]) {
          C[k + 1] = 1.0;
          for (let j = k + 1; j <= K_res; j++) C[j] = 1.0;
          break;
        }
      }
    }
    for (let k = 1; k <= K_res; k++) {
      if (C[k] < C[k - 1]) C[k] = C[k - 1];
    }
    return C;
  });

  // ---- LENS-FAMILY LAYERS (rule 3, corrected): collected here for a
  // separate, non-tabular rendering pass. Each entry is one borehole's own
  // logged occurrence of a lens-type origin that has NO matching neighbour
  // (see hasMatchingNeighborBlock above) — rendered independently around ITS
  // OWN borehole only, capped at LENS_MAX_HALF_WIDTH_M, never pinched toward
  // a neighbour.
  const lensLayers = []; // { bhIdx, graphic, originFamily, origin, zTop, zBot }
  rows.forEach((r, i) => {
    const layers = layersArr[i];
    if (!layers || !layers.length) return;
    const zG = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
    layers.forEach(l => {
      if (l.isRockBlock || !l.isLens) return;
      lensLayers.push({
        bhIdx: i,
        graphic: (l.graphic || '').trim(),
        originFamily: l.originFamily,
        origin: l.origin,
        zTop: zG - l.depth,
        zBot: zG - l.bottom,
        depthTop: l.depth,
        depthBot: l.bottom
      });
    });
  });




  // ── ptsToCubicBezier ────────────────────────────────────────────────────────
  // Converts an array of [x,y] points into an SVG cubic Bézier path string
  // using the Catmull-Rom → cubic Bézier conversion.  The result is C1-smooth
  // everywhere (continuous first derivative), so all kinks/hard bends disappear.
  // tension: 0 = tight (less curvature), 0.5 = standard Catmull-Rom.
  function ptsToCubicBezier(pts, tension) {
    if (!pts || pts.length < 2) return '';
    const t = (tension === undefined) ? 0.4 : tension;
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * t;
      const cp1y = p1[1] + (p2[1] - p0[1]) * t;
      const cp2x = p2[0] - (p3[0] - p1[0]) * t;
      const cp2y = p2[1] - (p3[1] - p1[1]) * t;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  // Build a CLOSED Bézier polygon: top curve forward + bottom curve reversed
  function closedLayerPath(topPts, botPts) {
    if (!topPts || topPts.length < 2) return '';
    const topD = ptsToCubicBezier(topPts);
    // Bottom reversed → append as continuation then close
    const botRev = botPts.slice().reverse();
    // Connect top end → bot end with a straight line (collapses at pinch tips)
    let d = topD;
    d += ` L${botRev[0][0].toFixed(1)},${botRev[0][1].toFixed(1)}`;
    // Smooth bottom (reversed)
    for (let i = 0; i < botRev.length - 1; i++) {
      const p0 = botRev[Math.max(i - 1, 0)];
      const p1 = botRev[i];
      const p2 = botRev[i + 1];
      const p3 = botRev[Math.min(i + 2, botRev.length - 1)];
      const tension = 0.4;
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    d += ' Z';
    return d;
  }

  // Monotonic Piecewise Cubic Hermite Interpolating Polynomial (PCHIP)
  // Preserves monotonicity between data points to prevent unphysical overshoots or artificial bedrock spires
  function interpolateSpline(points, xTarget) {
    if (!points || !points.length) return 0;
    if (points.length === 1) return points[0].y;
    if (xTarget <= points[0].x) return points[0].y;
    if (xTarget >= points[points.length - 1].x) return points[points.length - 1].y;

    const n = points.length;
    const h = [];
    const delta = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      h.push(dx);
      delta.push(dx > 1e-6 ? (points[i + 1].y - points[i].y) / dx : 0);
    }

    const d = new Array(n);
    d[0] = delta[0];
    d[n - 1] = delta[n - 2];

    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) {
        d[i] = 0; // Local extremum: tangent set flat to prevent overshoot
      } else {
        const w1 = 2 * h[i] + h[i - 1];
        const w2 = h[i] + 2 * h[i - 1];
        d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
      }
    }

    for (let i = 0; i < n - 1; i++) {
      if (xTarget >= points[i].x && xTarget <= points[i + 1].x) {
        const dx = h[i];
        if (dx <= 1e-6) return points[i].y;
        const t = (xTarget - points[i].x) / dx;
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        return h00 * points[i].y + h10 * dx * d[i] + h01 * points[i + 1].y + h11 * dx * d[i + 1];
      }
    }
    return points[points.length - 1].y;
  }

  const groundPts = rows.map((r, i) => ({ x: distances[i], y: levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev }));
  const rockPts = rows.map((r, i) => ({ x: distances[i], y: effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : groundPts[i].y - 5 }));

  const gwDepthPts = rows.map((r, i) => {
    const lv = levelsArr[i];
    if (lv.gwLevel !== null && lv.elevation !== null) {
      return { x: distances[i], y: Math.max(lv.elevation - lv.gwLevel, 0.1) };
    } else if (lv.gwDepth !== null) {
      return { x: distances[i], y: Math.max(lv.gwDepth, 0.1) };
    }
    return null;
  }).filter(Boolean);

  // Natural micro-topographic subtle roughness (small organic micro-relief, not large undulations)
  function calcNaturalGroundRoughness(d) {
    if (!opts.showRoughGround) return 0;
    // Side extensions: subtle tapering micro-relief
    if (d <= distances[0] || d >= distances[distances.length - 1]) {
      const distFromEdge = d < distances[0] ? (distances[0] - d) : (d - distances[distances.length - 1]);
      const extEnvelope = Math.sin(Math.min(distFromEdge / 12, 1) * Math.PI / 2);
      return extEnvelope * (0.06 * Math.sin(d / 3.2 + 1.1) + 0.03 * Math.sin(d / 1.6 + 2.3));
    }
    // Find active borehole span
    let j = 0;
    for (let s = 0; s < distances.length - 1; s++) {
      if (d >= distances[s] - 1e-4 && d <= distances[s + 1] + 1e-4) {
        j = s;
        break;
      }
    }
    const d0 = distances[j], d1 = distances[j + 1];
    const spanLen = Math.max(d1 - d0, 1);
    const t = (d - d0) / spanLen; // 0 at BH j, 1 at BH j+1

    // Envelope window: exactly 0 at boreholes (preserving 100% exact GL collar elevations)
    const envelope = Math.pow(Math.sin(t * Math.PI), 1.3);
    const maxAmp = Math.min(0.12, spanLen * 0.006); // Subtle natural micro-relief (0.04m to 0.12m)

    // Multi-frequency organic natural ground texture
    const wave1 = Math.sin((d * 2 * Math.PI) / 6.5 + 0.8);
    const wave2 = 0.50 * Math.sin((d * 2 * Math.PI) / 2.8 + 2.4);
    const wave3 = 0.25 * Math.sin((d * 2 * Math.PI) / 1.3 + 4.1);

    return envelope * maxAmp * (wave1 + wave2 + wave3);
  }

  // Smooth ground surface (base spline) — used for water table and smooth reference
  function getZGroundSmooth(d) {
    if (d <= groundPts[0].x) return groundPts[0].y;
    if (d >= groundPts[groundPts.length - 1].x) return groundPts[groundPts.length - 1].y;
    return interpolateSpline(groundPts, d);
  }

  // Extended ground for terrain line and soil layering (includes subtle natural micro-relief when active)
  function getZGround(d) {
    return getZGroundSmooth(d) + calcNaturalGroundRoughness(d);
  }

  // Foliation-guided anisotropic rockhead roughness (when opts.showRoughRockhead is active)
  function calcFoliationRockheadRoughness(d) {
    if (!opts.showRoughRockhead) return 0;
    const dirSign = appDip.directionStr === '← A' ? -1 : (appDip.directionStr === '→ B' ? 1 : 0);
    const dipFactor = Math.sin((appDip.angle * Math.PI) / 180); // 0 at horizontal, 1 at vertical

    // Side extensions: subtle tapering anisotropic steps
    if (d <= distances[0] || d >= distances[distances.length - 1]) {
      const distFromEdge = d < distances[0] ? (distances[0] - d) : (d - distances[distances.length - 1]);
      const extEnvelope = Math.sin(Math.min(distFromEdge / 12, 1) * Math.PI / 2);
      const phase = (d * (dirSign || 1)) / 8.0;
      const saw = (phase % 1 + 1) % 1;
      const sawWave = saw < 0.65 ? (saw / 0.65) * 2 - 1 : (1 - (saw - 0.65) / 0.35) * 2 - 1;
      return extEnvelope * (0.10 * sawWave + 0.04 * Math.sin(d / 2.5));
    }

    // Find active borehole span
    let j = 0;
    for (let s = 0; s < distances.length - 1; s++) {
      if (d >= distances[s] - 1e-4 && d <= distances[s + 1] + 1e-4) {
        j = s;
        break;
      }
    }
    const d0 = distances[j], d1 = distances[j + 1];
    const spanLen = Math.max(d1 - d0, 1);
    const t = (d - d0) / spanLen; // 0 at BH j, 1 at BH j+1

    // Envelope window: strictly 0 at boreholes (preserving 100% exact logged rockhead elevation)
    const envelope = Math.pow(Math.sin(t * Math.PI), 1.25);
    const maxAmp = Math.min(0.24, spanLen * 0.012) * (0.45 + 0.55 * Math.max(dipFactor, 0.3));

    // Foliation-stepped anisotropic wave:
    // Steeper face along cross-joints, gentle face along foliation apparent dip
    const waveLambda = 7.5; // meters
    const phase = (d * (dirSign || 1)) / waveLambda;
    const saw = (phase % 1 + 1) % 1; // 0 to 1
    const sawWave = saw < 0.65 ? (saw / 0.65) * 2 - 1 : (1 - (saw - 0.65) / 0.35) * 2 - 1;
    const harmWave = 0.30 * Math.sin(phase * Math.PI * 2 * 2.1 + 1.2);

    return envelope * maxAmp * (sawWave + harmWave);
  }

  function getZRock(d) {
    let zRBase;
    if (d <= rockPts[0].x) zRBase = rockPts[0].y;
    else if (d >= rockPts[rockPts.length - 1].x) zRBase = rockPts[rockPts.length - 1].y;
    else zRBase = interpolateSpline(rockPts, d);

    const roughness = calcFoliationRockheadRoughness(d);
    const zR = zRBase + roughness;

    return Math.min(zR, getZGround(d) - 0.05);
  }

  // Groundwater Table always follows the smooth hydraulic piezometric surface
  function getZWater(d) {
    if (gwDepthPts.length === 0) return null;
    const depthGw = Math.max(
      d <= gwDepthPts[0].x ? gwDepthPts[0].y
      : d >= gwDepthPts[gwDepthPts.length - 1].x ? gwDepthPts[gwDepthPts.length - 1].y
      : interpolateSpline(gwDepthPts, d),
      0.1
    );
    return getZGroundSmooth(d) - depthGw;
  }

  // ── TWO-TIER STRATIGRAPHIC BOUNDARY EVALUATION ──
  const alluvBasePts = rows.map((r, i) => ({ x: distances[i], y: alluvBaseLevels[i] }));

  function getZAlluvBase(d) {
    const hasAnyAlluv = alluvBaseLevels.some((z, i) => {
      const zG = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
      return (zG - z) > 0.05;
    });
    if (!hasAnyAlluv) return getZGround(d);

    let zBase;
    if (d <= alluvBasePts[0].x) zBase = alluvBasePts[0].y;
    else if (d >= alluvBasePts[alluvBasePts.length - 1].x) zBase = alluvBasePts[alluvBasePts.length - 1].y;
    else zBase = interpolateSpline(alluvBasePts, d);

    const zG = getZGround(d);
    const zR = getZRock(d);
    return Math.min(Math.max(zBase, zR), zG);
  }

  // Natural depositional undulations for internal soil layer boundaries (when opts.showRoughSoil is active)
  function calcNaturalSoilBoundaryRoughness(k, d) {
    if (!opts.showRoughSoil) return 0;
    if (d <= distances[0] || d >= distances[distances.length - 1]) {
      const distFromEdge = d < distances[0] ? (distances[0] - d) : (d - distances[distances.length - 1]);
      const extEnvelope = Math.sin(Math.min(distFromEdge / 12, 1) * Math.PI / 2);
      return extEnvelope * (0.04 * Math.sin(d / 2.8 + k * 1.5) + 0.02 * Math.sin(d / 1.4 + k * 0.7));
    }
    let j = 0;
    for (let s = 0; s < distances.length - 1; s++) {
      if (d >= distances[s] - 1e-4 && d <= distances[s + 1] + 1e-4) {
        j = s;
        break;
      }
    }
    const d0 = distances[j], d1 = distances[j + 1];
    const spanLen = Math.max(d1 - d0, 1);
    const t = (d - d0) / spanLen;
    const envelope = Math.pow(Math.sin(t * Math.PI), 1.25);
    const maxAmp = Math.min(0.08, spanLen * 0.004);
    const wave1 = Math.sin((d * 2 * Math.PI) / 5.5 + k * 1.8);
    const wave2 = 0.45 * Math.sin((d * 2 * Math.PI) / 2.5 + k * 3.1 + 0.9);
    return envelope * maxAmp * (wave1 + wave2);
  }

  // Intra-Alluvial Boundary Evaluation (0 = Ground, K_alluv = Alluvium Base)
  function getAlluvBoundaryZ(k, d) {
    const zTop = getZGround(d);
    const zBase = getZAlluvBase(d);
    const thick = Math.max(zTop - zBase, 0);
    if (thick <= 0.01) return zTop;
    if (k === 0) return zTop;
    if (k === K_alluv) return zBase;
    const pts = rows.map((r, i) => ({ x: distances[i], y: bhAlluvCumBoundaries[i][k] }));
    const val = d <= pts[0].x ? pts[0].y : (d >= pts[pts.length - 1].x ? pts[pts.length - 1].y : interpolateSpline(pts, d));
    const f = Math.min(Math.max(val, 0.0), 1.0);
    const roughness = calcNaturalSoilBoundaryRoughness(k, d);
    return Math.min(Math.max(zTop - f * thick + roughness, zBase), zTop);
  }

  // Intra-Residual / CWR Boundary Evaluation (0 = Alluvium Base, K_res = Rockhead)
  function getResBoundaryZ(k, d) {
    const zTop = getZAlluvBase(d);
    const zBase = getZRock(d);
    const thick = Math.max(zTop - zBase, 0);
    if (thick <= 0.01) return zTop;
    if (k === 0) return zTop;
    if (k === K_res) return zBase;
    const pts = rows.map((r, i) => ({ x: distances[i], y: bhResCumBoundaries[i][k] }));
    const val = d <= pts[0].x ? pts[0].y : (d >= pts[pts.length - 1].x ? pts[pts.length - 1].y : interpolateSpline(pts, d));
    const f = Math.min(Math.max(val, 0.0), 1.0);
    const roughness = calcNaturalSoilBoundaryRoughness(k + K_alluv, d);
    return Math.min(Math.max(zTop - f * thick + roughness, zBase), zTop);
  }

  // Evaluate elevation of cumulative soil boundary k across masterSoilUnits
  function getSoilBoundaryZ(k, d) {
    if (k < K_alluv) return getAlluvBoundaryZ(k, d);
    else return getResBoundaryZ(k - K_alluv, d);
  }

  // Helper: get the range of distances over which unit k has non-zero thickness
  // Used to determine the pinch-out extent of each layer
  function getUnitExtentDist(k) {
    // Find first and last BH where unit k is present
    let firstIdx = -1, lastIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (bhUnitPresent[i] && bhUnitPresent[i][k]) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    }
    return { firstIdx, lastIdx };
  }

  let bedrockColor = '#8f8f95';
  layersArr.forEach(layers => {
    if (layers) layers.forEach(l => {
      const info = getGraphicInfo(l.graphic);
      if (info.isRock) bedrockColor = info.color;
    });
  });
  const WEATHERING_GRADE_COLORS = buildWeatheringColorRamp(bedrockColor);

  // ---- ROCK WEATHERING: CONTINUOUS FADE ----
  // Instead of discrete flat-coloured bands, weathering renders as one smooth
  // colour fade per borehole (highly-weathered tint at rockhead -> fresh/
  // bedrock colour at depth), then blended LATERALLY across the section too,
  // so there are no hard seams either vertically (zone boundaries) or
  // horizontally (between boreholes) — matching a tomography-style gradient
  // while the real logged zone depths still drive exactly where the fade
  // sits at each point.
  //
  // Each borehole's "fade profile" is a piecewise-linear function of depth:
  // at each reading's own depth, fade = that reading's grade anchor position
  // (WEATHERING_GRADE_FADE_POS); between readings, fade is linearly
  // interpolated (this IS the smooth version of the old midpoint-zone
  // logic — the zone boundary becomes the 50%-point of the linear ramp
  // between two anchors instead of a hard edge). Above the shallowest
  // reading, fade holds at that reading's value; below the deepest reading,
  // fade ramps the rest of the way to 1.0 (fresh) by termination depth, so a
  // borehole's fresh rock always resolves to the same colour as the plain
  // bedrock fill elsewhere.
  const bhFadeProfile = rows.map((r, i) => {
    const readings = getBHWeathering(r);
    const zGround = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
    const zRock = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zGround - 5;
    const zTerm = effectiveTermLevel[i] !== null ? effectiveTermLevel[i] : zRock - 5;
    if (!readings || !readings.length) return null;
    const rockDepthTop = zGround - zRock;
    const termDepthAbs = zGround - zTerm;
    const pts = readings
      .map(pt => ({ depthBelowRock: pt.depth - rockDepthTop, fade: WEATHERING_GRADE_FADE_POS[pt.grade] }))
      .filter(p => p.depthBelowRock >= -0.01)
      .sort((a, b) => a.depthBelowRock - b.depthBelowRock);
    if (!pts.length) return null;
    // Anchor list in depth-below-rockhead terms: start at 0 (holds shallowest
    // reading's fade value), through each reading, then ramp to 1.0 (fresh)
    // exactly at termination.
    const anchors = [{ depth: 0, fade: pts[0].fade }];
    pts.forEach(p => {
      const last = anchors[anchors.length - 1];
      if (p.depthBelowRock > last.depth) anchors.push({ depth: p.depthBelowRock, fade: p.fade });
      else last.fade = p.fade;
    });
    const rockSpan = Math.max(termDepthAbs - rockDepthTop, 0.1);
    const last = anchors[anchors.length - 1];
    if (last.depth < rockSpan) anchors.push({ depth: rockSpan, fade: 1.0 });
    return { anchors, zRock, zTerm, rockSpan };
  });

  const anyWeatheringData = (opts.showWeathering !== false) && bhFadeProfile.some(p => p !== null);

  // Evaluates a borehole's own fade profile at a given depth-below-rockhead.
  function fadeAtProfileDepth(profile, depthBelowRock) {
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

  // Continuous fade fraction (0=highly weathered tint .. 1=fresh/bedrock) at
  // any (distance, elevation) point within the rock mass. Depth is measured
  // relative to the LOCAL (interpolated) rockhead and termination surfaces at
  // that exact distance — getZRock(d)/getZTerm(d) — NOT each borehole's own
  // absolute rockhead elevation. This is what makes the fade follow the
  // sloped/undulating bedrock contact and termination surface instead of
  // forming flat horizontal stripes that cut across a dipping rockhead.
  // We convert `elev` to a FRACTION of the local rock span (0=at local
  // rockhead, 1=at local termination), then apply that fraction to each
  // bracketing borehole's OWN rock span to look up its fade profile — so a
  // borehole with a much deeper/shallower rockhead than its neighbour still
  // contributes its own true weathering profile at the correspondingly
  // rescaled depth, and the two are blended horizontally as before.
  const _termInterpPts = rows.map((r, i) => ({ x: distances[i], y: effectiveTermLevel[i] !== null ? effectiveTermLevel[i] : (effectiveRockLevel[i] !== null ? effectiveRockLevel[i] - 5 : maxElev - 10) }));
  function getZTermAtX(d) {
    const pts = _termInterpPts;
    return d <= pts[0].x ? pts[0].y
      : d >= pts[pts.length - 1].x ? pts[pts.length - 1].y
      : interpolateSpline(pts, d);
  }

  function getFadeFractionAt(d, elev) {
    if (!anyWeatheringData) return 1.0;
    const zRockLocal = getZRock(d);
    const zTermLocal = getZTermAtX(d);
    const localSpan = Math.max(zRockLocal - zTermLocal, 0.1);
    // Fraction of the LOCAL rock column (0 = at local rockhead, 1 = at local
    // termination) — this is what stays constant along the sloped contact.
    const localFrac = Math.max(0, Math.min(1, (zRockLocal - elev) / localSpan));

    // Binary search for the bracketing boreholes (distances[] is sorted
    // ascending) instead of a full linear scan — matters once the raster
    // grid gets fine enough to call this thousands of times per profile.
    let lo = 0, hi = rows.length - 1;
    if (d <= distances[0]) { lo = 0; hi = 0; }
    else if (d >= distances[distances.length - 1]) { lo = hi = distances.length - 1; }
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (distances[mid] <= d) lo = mid; else hi = mid;
      }
    }
    const iLeft = lo, iRight = hi;

    function fadeForBH(i) {
      const profile = bhFadeProfile[i];
      if (!profile) return 1.0; // no data at this BH: treat as fresh/bedrock
      // Apply the SAME local fraction to this borehole's own rock span, so
      // e.g. "80% of the way down to termination" looks up that same
      // relative point in BH i's actual logged profile.
      const relDepth = localFrac * profile.rockSpan;
      return fadeAtProfileDepth(profile, relDepth);
    }

    if (iLeft === iRight) return fadeForBH(iLeft);
    const dA = distances[iLeft], dB = distances[iRight];
    const t = dB > dA ? (d - dA) / (dB - dA) : 0;
    const fA = fadeForBH(iLeft), fB = fadeForBH(iRight);
    return fA + (fB - fA) * t;
  }

  // Origin hatch key (rule 6) — lists each texture actually used anywhere
  // in this profile (tabular OR lens), separately from the BSCS colour key
  // above, since origin and material are two independent visual channels.
  // Uses originHatchKeyOf (finer-grained than originFamily) so Residual and
  // Completely Weathered Rock — one connectivity family, two textures — both
  // get their own legend entry. Must scan subLayers too, not just each
  // merged block's own frozen `origin` field — a merged run can contain a
  // LATER origin (e.g. CWR after Residual) that the top-level field never
  // reflects (see the CWR sub-range overlay note in the fill loop above).
  const usedOriginHatchKeys = new Set();
  layersArr.forEach(layers => { if (layers) layers.forEach(l => {
    if (l.isRockBlock) return;
    const hatchKey = originHatchKeyOf(l.origin);
    if (ORIGIN_HATCH_INFO[hatchKey]) usedOriginHatchKeys.add(hatchKey);
    (l.subLayers || []).forEach(sl => {
      const subKey = originHatchKeyOf(sl.origin);
      if (ORIGIN_HATCH_INFO[subKey]) usedOriginHatchKeys.add(subKey);
    });
  }); });
  const originLegendItems = Array.from(usedOriginHatchKeys).map(key => ({
    label: ORIGIN_HATCH_INFO[key].label,
    patternId: ORIGIN_HATCH_INFO[key].patternId,
    isOriginHatch: true
  }));

  // Legend must reflect EVERYTHING actually drawn — both tabular master
  // units AND lens-only occurrences. A unit can exist in masterSoilUnits
  // (present at one borehole) yet still end up with zero rendered area after
  // the shared cumulative-boundary interpolation pinches it out everywhere
  // it's sampled — so "is this unit in masterSoilUnits" is NOT the same test
  // as "did this unit actually get drawn", and the legend must use the
  // SECOND test. This dry-run reuses the identical sampling loop the real
  // fill loop uses below, so the two can never disagree. (Must run AFTER
  // sampleDists is initialized, hence its position here rather than earlier
  // alongside the rest of the legend-prep code.)
  function masterUnitHasRenderedArea(uIdx) {
    const isAlluv = uIdx < K_alluv;
    const kIdx = isAlluv ? uIdx : (uIdx - K_alluv);
    const bhPresent = isAlluv ? bhAlluvUnitPresent : bhResUnitPresent;
    const hasAnyBH = rows.some((r, i) => bhPresent[i] && bhPresent[i][kIdx]);
    if (!hasAnyBH) return false;

    for (const d of sampleDists) {
      let zTop, zBot;
      if (isAlluv) {
        zTop = getAlluvBoundaryZ(kIdx, d);
        zBot = getAlluvBoundaryZ(kIdx + 1, d);
      } else {
        zTop = getResBoundaryZ(kIdx, d);
        zBot = getResBoundaryZ(kIdx + 1, d);
      }
      if (zTop - zBot > 0.02) return true;
    }
    return false;
  }

  // ── EXTRACT ROCK LITHOLOGY LAYERS PER BOREHOLE ──
  const rockLayersPerBH = rows.map((r, i) => {
    const raw = getBHWeathering(r);
    const zG = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const zT = effectiveTermLevel[i] !== null ? effectiveTermLevel[i] : zR - 10;
    const dRock = Math.max(zG - zR, 0);
    const dTerm = Math.max(zG - zT, dRock + 3.0);
    if (!raw || !raw.length) {
      return [{ zTop: zR, zBot: zG - dTerm, rockType: 'Biotite Gneiss', grade: 'fresh' }];
    }
    // Filter out boulder / corestone entries from continuous bedrock formations
    const sorted = raw.slice()
      .filter(cur => !isBoulderCode(cur.rockType) && !isBoulderCode(cur.grade))
      .sort((a, b) => a.depth - b.depth);
    const layers = [];
    for (let k = 0; k < sorted.length; k++) {
      const cur = sorted[k];
      const topD = Math.max(cur.depth, dRock);
      const dTermSafe = Math.max(dTerm, topD + 2.0);
      const nextDepth = k < sorted.length - 1 ? sorted[k+1].depth : dTermSafe;
      const botD = Math.max(nextDepth, topD);
      const zTop = zG - topD;
      const zBot = zG - botD;
      if (zTop > zBot + 0.05) {
        layers.push({
          zTop,
          zBot,
          rockType: normalizeRockType(cur.rockType),
          grade: cur.grade || 'fresh'
        });
      }
    }
    if (!layers.length) {
      const defType = sorted.length ? normalizeRockType(sorted[0].rockType) : 'Biotite Gneiss';
      layers.push({ zTop: zR, zBot: zG - dTerm, rockType: defType, grade: 'fresh' });
    }
    return layers;
  });

  function getDominantRockType(layers) {
    if (!layers || !layers.length) return 'Biotite Gneiss';
    const totalThicknessByRock = {};
    layers.forEach(l => {
      const thick = Math.abs(l.zTop - l.zBot);
      totalThicknessByRock[l.rockType] = (totalThicknessByRock[l.rockType] || 0) + thick;
    });
    let bestType = layers[0].rockType, maxThick = -1;
    Object.keys(totalThicknessByRock).forEach(rType => {
      if (totalThicknessByRock[rType] > maxThick) {
        maxThick = totalThicknessByRock[rType];
        bestType = rType;
      }
    });
    return bestType;
  }

  const dominantRockPerBH = rows.map((r, i) => getDominantRockType(rockLayersPerBH[i]));
  const sectionRockTypes = new Set(dominantRockPerBH);

  // ── CATEGORIZE LEGEND DATA INTO STRUCTURED SEMANTIC GROUPS ──
  // Group 1: Soil Stratigraphy (BS 5930) with Unified Origin Texture Overlays
  const soilItems = [];
  masterSoilUnits.forEach((u, uIdx) => {
    if (!masterUnitHasRenderedArea(uIdx)) return;
    const meta = soilUnitMeta[u];
    const info = getGraphicInfo(meta.graphic);
    let patternId = '';
    const uUp = (meta.graphic || '').toUpperCase();
    if (uUp === 'SM' || uUp === 'SP' || uUp === 'SC' || uUp === 'CS' || uUp.includes('SAND')) patternId = 'pat-sand';
    else if (uUp === 'CL' || uUp === 'CH' || uUp === 'CI' || uUp.includes('CLAY')) patternId = 'pat-clay';
    else if (uUp === 'GM' || uUp === 'GC' || uUp.includes('GRAVEL')) patternId = 'pat-gravel';

    const originHatch = ORIGIN_HATCH_INFO[originHatchKeyOf(meta.origin)];
    const originPatternId = originHatch ? originHatch.patternId : '';

    if (!soilItems.some(it => it.label === info.label && it.originPatternId === originPatternId)) {
      soilItems.push({ 
        label: info.label, 
        color: info.color, 
        patternId, 
        originPatternId,
        originName: meta.origin ? formatTitleCase(meta.origin) : ''
      });
    }
  });
  lensLayers.forEach(lens => {
    const info = getGraphicInfo(lens.graphic);
    let patternId = '';
    const uUp = (lens.graphic || '').toUpperCase();
    if (uUp === 'SM' || uUp === 'SP' || uUp === 'SC' || uUp === 'CS' || uUp.includes('SAND')) patternId = 'pat-sand';
    else if (uUp === 'CL' || uUp === 'CH' || uUp === 'CI' || uUp.includes('CLAY')) patternId = 'pat-clay';
    else if (uUp === 'GM' || uUp === 'GC' || uUp.includes('GRAVEL')) patternId = 'pat-gravel';

    const originHatch = ORIGIN_HATCH_INFO[originHatchKeyOf(lens.origin)];
    const originPatternId = originHatch ? originHatch.patternId : '';

    if (!soilItems.some(it => it.label === info.label && it.originPatternId === originPatternId)) {
      soilItems.push({ 
        label: info.label, 
        color: info.color, 
        patternId, 
        originPatternId,
        originName: lens.origin ? formatTitleCase(lens.origin) : ''
      });
    }
  });

  // Group 2: Bedrock Lithology & Formations (Standard Monochrome Hatches)
  const rockLithoItems = [];
  Array.from(sectionRockTypes).forEach(rType => {
    const conf = ROCK_LITHOLOGY_CONFIG[rType] || ROCK_LITHOLOGY_CONFIG['Biotite Gneiss'];
    rockLithoItems.push({ label: conf.label, patternId: conf.patternId });
  });
  if (!rockLithoItems.length) {
    rockLithoItems.push({ label: 'Biotite Gneiss', patternId: 'pat-rock-bg' });
  }

  // Group 3: Bedrock Weathering Grades
  const weatherGradeItems = [];
  if (anyWeatheringData) {
    WEATHERING_GRADE_ORDER.forEach(grade => {
      weatherGradeItems.push({ label: WEATHERING_GRADE_LABELS[grade], color: WEATHERING_GRADE_COLORS[grade] });
    });
  }

  // Group 4: Geological Boundaries & Hydrogeology
  const lineItems = [];
  lineItems.push({ label: 'Bedrock Contact (Rockhead)', color: '#7a2f1e', dash: '6,4', isLine: true });
  lineItems.push({ label: 'Geological Formation Contact', color: '#1f2937', dash: '6,3', isLine: true });
  if (opts.showGWT !== false && gwDepthPts.length >= 1) {
    lineItems.push({ label: 'Groundwater Table (GWT)', color: '#1e6fd9', dash: '5,3', isLine: true, isGwt: true });
  }
  lineItems.push({ label: 'Soil Origin Boundary', color: '#3a3a3a', dash: '4,3', isLine: true });
  const anyBoulders = rows.some((r, i) => {
    const layers = layersArr[i];
    return layers && layers.some(l => isBoulderCode(l.graphic) || isBoulderCode(l.origin));
  });
  if (anyBoulders) {
    lineItems.push({ label: 'Isolated Boulder (in Soil)', color: '#7a6248', isBoulder: true });
  }

  // Group 5: Depositional Origin (Texture Overlays)
  const originItems = originLegendItems.map(item => ({
    label: item.label,
    patternId: item.patternId
  }));

  // Group 6: In-Situ Testing & Rock Mass Quality (when enabled)
  const inSituItems = [];
  if (opts.showSPT) {
    inSituItems.push({ label: 'SPT N-Value (0 - 50+ / Refusal)', color: '#3f804f', isSpt: true });
  }
  if (opts.showRQD) {
    inSituItems.push({ label: 'RQD % (Rock Quality Designation)', color: '#28a745', isRqd: true });
    inSituItems.push({ label: 'Core Recovery (CR %)', color: '#c2cbd0', isCr: true });
  }

  // ── DYNAMIC & FLEXIBLE CARD SIZING ("FLEXIBLE CAGES") ──
  const legW = plotW;
  const colGap = 10;
  const availW = legW - (colGap * 3);

  // Determine whether Card 1 should use 1 or 2 columns based on available space
  // Only use 2 columns if total width is wide (>= 1100px)
  const use2SoilCols = (availW >= 1050 && soilItems.length > 5);
  const soilCols = use2SoilCols ? 2 : 1;
  const soilRows = Math.ceil(soilItems.length / soilCols);
  const soilColH = 38 + soilRows * 24;

  // Balanced flexible cage widths:
  // Card 4 (Plan View Map): ~24% (min 180px)
  let col4W = Math.max(Math.round(availW * 0.24), 180);
  // Card 3 (Contacts & Features): ~22% (min 175px)
  let col3W = Math.max(Math.round(availW * 0.22), 175);
  // Card 2 (Bedrock Lithology & Weathering): ~24% (min 185px)
  let col2W = Math.max(Math.round(availW * 0.24), 185);
  // Card 1 (Soil Stratigraphy): Gets the remaining width (~30%, min 220px)
  let col1W = availW - col2W - col3W - col4W;

  // If col1W is below minimum, redistribute smoothly
  if (col1W < 220) {
    const deficit = 220 - col1W;
    col4W = Math.max(col4W - Math.round(deficit * 0.35), 170);
    col2W = Math.max(col2W - Math.round(deficit * 0.35), 170);
    col3W = Math.max(col3W - Math.round(deficit * 0.30), 160);
    col1W = availW - col2W - col3W - col4W;
  }

  const rockColH = 38 + rockLithoItems.length * 28 + (weatherGradeItems.length ? Math.ceil(weatherGradeItems.length / 2) * 22 + 24 : 0);
  const lineColH = 38 + lineItems.length * 24;
  const planCardH = 135;
  const topCardH = Math.max(soilColH, rockColH, lineColH, planCardH, 115);

  const originCardH = originItems.length ? 50 : 0;
  const testCardH = inSituItems.length ? 50 : 0;

  const totalLegendH = 36 + topCardH + (originCardH ? originCardH + 12 : 0) + (testCardH ? testCardH + 12 : 0) + 52;
  const padBottom = 100 + totalLegendH + 50;
  const svgH = plotH + padTop + padBottom;
  const axisY = padTop + plotH;

  let svg = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" font-family="Inter, sans-serif">`;

  svg += `<defs>
    <pattern id="pat-bedrock" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="12" stroke="#5c5c60" stroke-width="0.7" opacity="0.4"/>
    </pattern>
    <pattern id="pat-sand" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3.5" cy="3.5" r="0.7" fill="#554422" opacity="0.28"/>
      <circle cx="10.5" cy="10.5" r="0.7" fill="#554422" opacity="0.28"/>
    </pattern>
    <pattern id="pat-clay" width="18" height="12" patternUnits="userSpaceOnUse">
      <line x1="0" y1="6" x2="9" y2="6" stroke="#442211" stroke-width="0.5" opacity="0.22"/>
      <line x1="9" y1="12" x2="18" y2="12" stroke="#442211" stroke-width="0.5" opacity="0.22"/>
    </pattern>
    <pattern id="pat-gravel" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="6" cy="6" r="1.6" fill="none" stroke="#333333" stroke-width="0.5" opacity="0.28"/>
      <circle cx="13" cy="13" r="1.3" fill="none" stroke="#333333" stroke-width="0.5" opacity="0.28"/>
    </pattern>
    ${buildRockLithologyDefs(
      Math.abs(Math.atan(Math.tan(appDip.angle * Math.PI / 180) * ((plotH / elevRange) / ((xFrameRight - xFrameLeft) / distSpan))) * 180 / Math.PI),
      appDip.directionStr
    )}
    ${buildOriginHatchDefs()}
  </defs>`;

  // Compute rockhead points array (reused for bedrock polygon and rockhead line)
  const rockPolyPts = [];
  sampleDists.forEach(d => {
    rockPolyPts.push([xPos(d), yPos(getZRock(d))]);
  });
  let bedrockD = ptsToCubicBezier(rockPolyPts)
    + ` L${xFrameRight.toFixed(1)},${axisY.toFixed(1)} L${xFrameLeft.toFixed(1)},${axisY.toFixed(1)} Z`;

  const bedrockClipId = 'clip-bedrock-master-' + Math.random().toString(36).slice(2, 9);
  svg += `<defs><clipPath id="${bedrockClipId}"><path d="${bedrockD}"/></clipPath></defs>`;

  svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff"/>`;

  // Helper to escape unsafe characters in user-entered SVG text
  function escapeSvg(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  }

  const vertExag = ((plotH / elevRange) / ((xFrameRight - xFrameLeft) / distSpan));

  // ── TOP TITLE & STRUCTURAL GEOLOGY METADATA BANNER ────────────────────────
  const sectionTitle = (meta.sectionTitle && meta.sectionTitle.trim()) ? meta.sectionTitle.trim() : 'ENGINEERING GEOLOGICAL CROSS-SECTION A — B';
  svg += `<!-- Profile Header Title & Metadata -->
  <text x="${padLeft}" y="28" font-size="13" font-weight="800" fill="#0f172a" letter-spacing="0.02em">${escapeSvg(sectionTitle)}</text>
  <text x="${padLeft + plotW}" y="48" font-size="9.5" font-weight="800" fill="#1e293b" text-anchor="end">
    <tspan fill="#1e40af">A [${leftBearingStr}]</tspan> ➔ <tspan fill="#b91c1c">B [${rightBearingStr}]</tspan>
  </text>
  <text x="${padLeft}" y="48" font-size="9" font-weight="600" fill="#334155">
    ALIGNMENT AZIMUTH: <tspan font-weight="700" fill="#1e40af">${meta.sectionAzimuth.toFixed(1)}° N</tspan> | 
    FOLIATION: <tspan font-weight="700" fill="#0f766e">Dip Dir ${meta.dipDirection}° N / Dip ${meta.dipAngle}°</tspan> | 
    APPARENT DIP: <tspan font-weight="800" fill="#b91c1c">${appDip.angle.toFixed(1)}° ${appDip.directionStr}</tspan> | 
    <tspan font-weight="800" fill="#0d9488">V.E. ${vertExag.toFixed(1)}×</tspan>
  </text>
  <text x="${padLeft}" y="65" font-size="8" fill="#64748b" font-style="italic">
    Method: ${meta.isProjection ? `Section Line Projection (Azimuth ${meta.sectionAzimuth.toFixed(1)}° N)` : 'Sequential Inter-Borehole Profile'} | Total Section Length: ${Math.round(totalDist)} m | Boreholes: ${rows.length}
  </text>
  <line x1="${padLeft}" y1="78" x2="${padLeft + plotW}" y2="78" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="4,2"/>
  `;

  // ── SECTION ENDPOINT BEARING BADGES (Top Axis Corners) ──
  const labelA_str = `A [${leftBearingStr}]`;
  const labelB_str = `B [${rightBearingStr}]`;
  const badgeW_A = Math.max(Math.round(labelA_str.length * 6.5 + 16), 64);
  const badgeW_B = Math.max(Math.round(labelB_str.length * 6.5 + 16), 64);
  const badgeH = 17;

  svg += `<!-- Section Endpoints Bearing Indicators (Top Axis Corners) -->
  <g transform="translate(${padLeft}, ${(padTop - 8).toFixed(1)})">
    <rect x="0" y="${-badgeH}" width="${badgeW_A}" height="${badgeH}" fill="#eff6ff" stroke="#93c5fd" stroke-width="1.2" rx="4"/>
    <text x="${(badgeW_A / 2).toFixed(1)}" y="${(-badgeH / 2 + 3.5).toFixed(1)}" font-size="8.5" font-weight="800" fill="#1e40af" text-anchor="middle">${labelA_str}</text>
  </g>
  <g transform="translate(${(padLeft + plotW).toFixed(1)}, ${(padTop - 8).toFixed(1)})">
    <rect x="${-badgeW_B}" y="${-badgeH}" width="${badgeW_B}" height="${badgeH}" fill="#fef2f2" stroke="#fca5a5" stroke-width="1.2" rx="4"/>
    <text x="${(-badgeW_B / 2).toFixed(1)}" y="${(-badgeH / 2 + 3.5).toFixed(1)}" font-size="8.5" font-weight="800" fill="#b91c1c" text-anchor="middle">${labelB_str}</text>
  </g>
  `;

  // Grid Lines & Dual Y-Axes (Left & Right)
  const targetElevStep = elevRange / 6;
  const elevStep = niceScaleMeters(Math.max(targetElevStep, 1));
  const gridStartElev = Math.ceil(minElev / elevStep) * elevStep;
  for (let elev = gridStartElev; elev <= maxElev + 0.001; elev += elevStep) {
    const y = yPos(elev);
    svg += `<line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${padLeft + plotW}" y2="${y.toFixed(1)}" stroke="#e5e0d3" stroke-width="1"/>`;
    // Left Y-Axis elevation label
    svg += `<text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" font-size="10" fill="#6b6459" text-anchor="end" font-weight="600">${Math.round(elev)}</text>`;
    // Right Y-Axis elevation label
    svg += `<text x="${padLeft + plotW + 8}" y="${(y + 3.5).toFixed(1)}" font-size="10" fill="#6b6459" text-anchor="start" font-weight="600">${Math.round(elev)}</text>`;
  }

  // Axis Titles (Left & Right Elevation + Bottom Distance)
  svg += `<text x="22" y="${(padTop + plotH / 2).toFixed(1)}" font-size="11" fill="#1c2b2a" font-weight="700" transform="rotate(-90 22 ${(padTop + plotH / 2).toFixed(1)})" text-anchor="middle">Elevation (m, RL)</text>`;
  svg += `<text x="${(padLeft + plotW + 36).toFixed(1)}" y="${(padTop + plotH / 2).toFixed(1)}" font-size="11" fill="#1c2b2a" font-weight="700" transform="rotate(90 ${(padLeft + plotW + 36).toFixed(1)} ${(padTop + plotH / 2).toFixed(1)})" text-anchor="middle">Elevation (m, RL)</text>`;
  svg += `<text x="${(padLeft + plotW / 2).toFixed(1)}" y="${(axisY + 34).toFixed(1)}" font-size="11" fill="#1c2b2a" font-weight="700" text-anchor="middle">Distance along section (m)</text>`;

  // Distance Axis Ticks & Axis Line
  svg += `<line x1="${padLeft}" y1="${axisY}" x2="${padLeft + plotW}" y2="${axisY}" stroke="#3a3a3a" stroke-width="1.2"/>`;
  const targetTickMeters = totalDist / Math.max(Math.round(plotW / 100), 1);
  const tickStep = niceScaleMeters(Math.max(targetTickMeters, 1));
  for (let d = 0; d <= totalDist + 0.001; d += tickStep) {
    const x = xPos(d);
    svg += `<line x1="${x.toFixed(1)}" y1="${axisY}" x2="${x.toFixed(1)}" y2="${(axisY + 5).toFixed(1)}" stroke="#3a3a3a" stroke-width="1"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${(axisY + 17).toFixed(1)}" font-size="9" fill="#6b6459" font-weight="500" text-anchor="middle">${Math.round(d)}</text>`;
  }



  // RENDERING ORDER (Geologically correct, back-to-front painter's algorithm):
  // Step A: Overburden base fill (ground surface down to rockhead) — fills the entire soil zone
  // Step B: Individual soil layer polygons — paint on top with correct unit colours
  // Step C: Bedrock polygon — painted LAST, covers anything below rockhead
  // Step D: Rockhead dashed line + GWT line + BH pillars (drawn after bedrock)


  // STEP A: Paint overburden base matrix fill (entire soil zone, base colour = first soil unit)
  const soilBaseTopPts = sampleDists.map(d => [xPos(d), yPos(getZGround(d))]);
  const soilBaseBotPts = sampleDists.map(d => [xPos(d), yPos(getZRock(d))]);
  const soilBaseD = closedLayerPath(soilBaseTopPts, soilBaseBotPts);
  const baseSoilColor = (masterSoilUnits.length && getGraphicInfo(soilUnitMeta[masterSoilUnits[0]].graphic).color) ? getGraphicInfo(soilUnitMeta[masterSoilUnits[0]].graphic).color : '#c9a876';
  svg += `<!-- A: Overburden Base Fill -->
  <path d="${soilBaseD}" fill="${baseSoilColor}" stroke="none"/>`;

  // STEP B: Individual soil layer polygons (drawn on top of base fill)
  // 3. RENDER REAL-WORLD STRATIGRAPHIC SOIL LAYER POLYGONS (EXACT LOGGED ELEVATION ALIGNMENT)
  // Group layers per master unit (origin family + BSCS, see rule 1/2) and
  // draw continuous polygons matching exact borehole log depths. Lens-family
  // origins (Alluvium/Colluvium/Made Ground) are NOT in masterSoilUnits at
  // all — they're rendered in a separate lens pass below (rule 3).

  masterSoilUnits.forEach((u) => {
    const meta = soilUnitMeta[u];
    const info = getGraphicInfo(meta.graphic);
    const code = meta.graphic;
    const uIdx = masterSoilUnits.indexOf(u);
    const isAlluv = uIdx < K_alluv;
    const kIdx = isAlluv ? uIdx : (uIdx - K_alluv);
    const bhPresent = isAlluv ? bhAlluvUnitPresent : bhResUnitPresent;

    // Check if layer exists at any borehole
    const hasAnyBH = rows.some((r, i) => bhPresent[i] && bhPresent[i][kIdx]);
    if (!hasAnyBH) return;

    const bhLayerRanges = rows.map((r, i) => {
      const zG = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
      const zBase = alluvBaseLevels[i];
      const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
      const present = bhPresent[i][kIdx];
      if (isAlluv) {
        const thick = Math.max(zG - zBase, 0);
        const C = bhAlluvCumBoundaries[i];
        return {
          present,
          zTop: zG - C[kIdx] * thick,
          zBot: zG - C[kIdx + 1] * thick
        };
      } else {
        const thick = Math.max(zBase - zR, 0);
        const C = bhResCumBoundaries[i];
        return {
          present,
          zTop: zBase - C[kIdx] * thick,
          zBot: zBase - C[kIdx + 1] * thick
        };
      }
    });

    // Build continuous top/bottom curve across profile samples
    const topCurvePts = [];
    const botCurvePts = [];
    let hasArea = false;

    sampleDists.forEach(d => {
      const x = xPos(d);
      const zG = getZGround(d);
      const zBase = getZAlluvBase(d);
      const zR = getZRock(d);

      let zTop = isAlluv ? getAlluvBoundaryZ(kIdx, d) : getResBoundaryZ(kIdx, d);
      let zBot = isAlluv ? getAlluvBoundaryZ(kIdx + 1, d) : getResBoundaryZ(kIdx + 1, d);

      // Handle side extensions (left of first BH, right of last BH)
      if (d < distances[0]) {
        const range = bhLayerRanges[0];
        zTop = range.present ? range.zTop : (isAlluv ? zG : zBase);
        zBot = range.present ? range.zBot : (isAlluv ? zG : zBase);
      } else if (d > distances[distances.length - 1]) {
        const range = bhLayerRanges[bhLayerRanges.length - 1];
        zTop = range.present ? range.zTop : (isAlluv ? zG : zBase);
        zBot = range.present ? range.zBot : (isAlluv ? zG : zBase);
      }

      // Strictly clamp layer boundaries to its origin envelope
      if (isAlluv) {
        zTop = Math.min(Math.max(zTop, zBase), zG);
        zBot = Math.min(Math.max(zBot, zBase), zG);
      } else {
        zTop = Math.min(Math.max(zTop, zR), zBase);
        zBot = Math.min(Math.max(zBot, zR), zBase);
      }

      if (zBot > zTop) zBot = zTop;

      topCurvePts.push([x, yPos(zTop)]);
      botCurvePts.push([x, yPos(zBot)]);
      if (zTop - zBot > 0.01) hasArea = true;
    });

    if (hasArea) {
      const layerD = closedLayerPath(topCurvePts, botCurvePts);

      // Every master unit — Residual, Alluvium, Colluvium, Made Ground,
      // whatever — now renders the same simple way: one BSCS code, one fixed
      // colour, ordinary pinch-out at its edges. (An earlier version special-
      // cased "connected" multi-origin units with clipped per-borehole colour
      // segments/blends; that's been reverted per direction to just treat
      // every origin family's internal BSCS variation the same way Residual's
      // always has — see rule 7b's final note.)
      let patternUrl = '';
      const uUp = (code || '').toUpperCase();
      if (uUp === 'SM' || uUp === 'SP' || uUp === 'SC' || uUp === 'CS' || uUp.includes('SAND')) patternUrl = 'url(#pat-sand)';
      else if (uUp === 'CL' || uUp === 'CH' || uUp === 'CI' || uUp.includes('CLAY')) patternUrl = 'url(#pat-clay)';
      else if (uUp === 'GM' || uUp === 'GC' || uUp.includes('GRAVEL')) patternUrl = 'url(#pat-gravel)';

      const isCwrLayer = originHatchKeyOf(meta.origin) === 'completely_weathered_rock';
      let layerCwrGradId = '';
      if (isCwrLayer) {
        layerCwrGradId = 'grad-layer-cwr-' + uIdx + '-' + Math.random().toString(36).slice(2, 7);
        svg += `<defs>
          <linearGradient id="${layerCwrGradId}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="#6b441e" stop-opacity="0.55"/>
            <stop offset="25%" stop-color="#8c5d2b" stop-opacity="0.40"/>
            <stop offset="55%" stop-color="#b38446" stop-opacity="0.22"/>
            <stop offset="80%" stop-color="#d6b074" stop-opacity="0.09"/>
            <stop offset="100%" stop-color="#edd5ae" stop-opacity="0.0"/>
          </linearGradient>
        </defs>`;
      }
      svg += `<!-- Stratigraphic Layer: ${info.label} (origin family: ${meta.originFamily}) -->
      <path d="${layerD}" fill="${info.color}" stroke="${info.color}" stroke-width="0.5"/>`;
      if (layerCwrGradId) svg += `<path d="${layerD}" fill="url(#${layerCwrGradId})" stroke="none"/>`;
      if (patternUrl) svg += `<path d="${layerD}" fill="${patternUrl}" stroke="none"/>`;
      const originHatch = ORIGIN_HATCH_INFO[originHatchKeyOf(meta.origin)];
      if (originHatch) svg += `<path d="${layerD}" fill="url(#${originHatch.patternId})" stroke="none"/>`;

      // CWR SUB-RANGE HATCH OVERLAY & VERTICAL FADING:
      // Completely Weathered Rock (Grade V) transitions from bedrock below up towards residual soil above.
      // 1. Color gradient fades from richer/darker weathered tone at bottom (rockhead) to lighter at top.
      // 2. Pinch-out closure is strictly anchored to the rockhead boundary (zR), never closing from surface.
      if (soilUnitMeta[u].originFamily === 'residual' && ORIGIN_HATCH_INFO['completely_weathered_rock']) {
        const cwrTopPts = [], cwrBotPts = [];
        let cwrHasArea = false;
        sampleDists.forEach(d => {
          const x = xPos(d);
          const zG = getZGround(d);
          const zR = getZRock(d);
          const overburdenAtD = Math.max(zG - zR, 0.1);

          function cwrFracForBH(i) {
            const layers = layersArr[i];
            if (!layers) return null;
            const zGi = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
            const zRi = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zGi - 5;
            const overburdenI = Math.max(zGi - zRi, 0.1);
            const allNonRockI = layers.filter(l => !l.isRockBlock);
            const totalSoilDepthI = allNonRockI.length ? Math.max(...allNonRockI.map(l => l.bottom)) : overburdenI;
            let cwrTopDepth = null, cwrBotDepth = null;
            layers.forEach(block => {
              if (block.isRockBlock || !block.subLayers) return;
              block.subLayers.forEach(sl => {
                if ((sl.origin || '').trim().toLowerCase() === 'completely weathered rock') {
                  cwrTopDepth = cwrTopDepth === null ? sl.depth : Math.min(cwrTopDepth, sl.depth);
                  cwrBotDepth = cwrBotDepth === null ? sl.bottom : Math.max(cwrBotDepth, sl.bottom);
                }
              });
            });
            if (cwrTopDepth === null) return null;
            return { fTop: cwrTopDepth / totalSoilDepthI, fBot: cwrBotDepth / totalSoilDepthI };
          }

          function totalSoilDepthForBH(i) {
            const layers = layersArr[i];
            const zGi = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
            const zRi = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zGi - 5;
            const overburdenI = Math.max(zGi - zRi, 0.1);
            if (!layers) return overburdenI;
            const allNonRockI = layers.filter(l => !l.isRockBlock);
            return allNonRockI.length ? Math.max(...allNonRockI.map(l => l.bottom)) : overburdenI;
          }

          let iLeft = -1, iRight = -1;
          for (let i = 0; i < rows.length; i++) {
            if (distances[i] <= d) iLeft = i;
            if (distances[i] >= d && iRight === -1) iRight = i;
          }
          if (iLeft === -1) iLeft = 0;
          if (iRight === -1) iRight = rows.length - 1;

          const fracL = cwrFracForBH(iLeft);
          const fracR = iLeft === iRight ? fracL : cwrFracForBH(iRight);

          const tsdL = totalSoilDepthForBH(iLeft);
          const tsdR = iLeft === iRight ? tsdL : totalSoilDepthForBH(iRight);

          let zTopC = null, zBotC = null;
          if (d < distances[0]) {
            const frac0 = cwrFracForBH(0);
            if (frac0) {
              const tsd0 = totalSoilDepthForBH(0);
              zTopC = zG - frac0.fTop * tsd0;
              zBotC = zG - frac0.fBot * tsd0;
            }
          } else if (d > distances[distances.length - 1]) {
            const lastIdx = rows.length - 1;
            const fracN = cwrFracForBH(lastIdx);
            if (fracN) {
              const tsdN = totalSoilDepthForBH(lastIdx);
              zTopC = zG - fracN.fTop * tsdN;
              zBotC = zG - fracN.fBot * tsdN;
            }
          } else {
            // Inside borehole span:
            if (fracL || fracR) {
              // PINCH-OUT TO ROCKHEAD CONTACT (Rule: CWR never pinches out to surface; it collapses onto the rock boundary)
              // If a borehole has no CWR, its CWR slot is collapsed at the bottom of the soil overburden (fTop = 1.0, fBot = 1.0)
              const effFracL = fracL || { fTop: 1.0, fBot: 1.0 };
              const effFracR = fracR || { fTop: 1.0, fBot: 1.0 };
              const spanDist = distances[iRight] - distances[iLeft];
              const t = (iLeft === iRight || spanDist <= 1e-6) ? 0 : (d - distances[iLeft]) / spanDist;
              const fTop = effFracL.fTop + (effFracR.fTop - effFracL.fTop) * t;
              const fBot = effFracL.fBot + (effFracR.fBot - effFracL.fBot) * t;
              const tsdAtD = tsdL + (tsdR - tsdL) * t;
              zTopC = zG - fTop * tsdAtD;
              zBotC = zG - fBot * tsdAtD;
            }
          }

          if (zTopC !== null) {
            zTopC = Math.min(Math.max(zTopC, zR), zG);
            zBotC = Math.min(Math.max(zBotC, zR), zG);
            if (zBotC > zTopC) zBotC = zTopC;
            cwrTopPts.push([x, yPos(zTopC)]);
            cwrBotPts.push([x, yPos(zBotC)]);
            if (zTopC - zBotC > 0.01) cwrHasArea = true;
          }
        });

        if (cwrHasArea && cwrTopPts.length >= 2) {
          const cwrD = closedLayerPath(cwrTopPts, cwrBotPts);
          const cwrHatch = ORIGIN_HATCH_INFO['completely_weathered_rock'];
          const cwrClipId = 'clip-cwr-' + uIdx + '-' + Math.random().toString(36).slice(2, 7);
          const cwrGradId = 'grad-cwr-fade-' + uIdx + '-' + Math.random().toString(36).slice(2, 7);

          svg += `<defs>
            <linearGradient id="${cwrGradId}" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#6b441e" stop-opacity="0.55"/>
              <stop offset="25%" stop-color="#8c5d2b" stop-opacity="0.40"/>
              <stop offset="55%" stop-color="#b38446" stop-opacity="0.22"/>
              <stop offset="80%" stop-color="#d6b074" stop-opacity="0.09"/>
              <stop offset="100%" stop-color="#edd5ae" stop-opacity="0.0"/>
            </linearGradient>
            <clipPath id="${cwrClipId}"><path d="${layerD}"/></clipPath>
          </defs>`;
          
          svg += `<!-- CWR sub-range hatch overlay with vertical fading (darker at rockhead -> lighter at top), clipped to parent unit -->
          <g clip-path="url(#${cwrClipId})">
            <path d="${cwrD}" fill="url(#${cwrGradId})" stroke="none"/>
            <path d="${cwrD}" fill="url(#${cwrHatch.patternId})" stroke="none"/>
          </g>`;

          // Draw subtle dashed boundary along top contact of CWR sub-range where thickness >= 2px
          const cwrContactRuns = [];
          let currentCwrRun = [];
          cwrTopPts.forEach((p, j) => {
            const thick = Math.abs(p[1] - cwrBotPts[j][1]) >= 2.0;
            if (thick) {
              currentCwrRun.push(p);
            } else if (currentCwrRun.length) {
              cwrContactRuns.push(currentCwrRun);
              currentCwrRun = [];
            }
          });
          if (currentCwrRun.length) cwrContactRuns.push(currentCwrRun);
          cwrContactRuns.forEach(run => {
            if (run.length >= 2) {
              svg += `<g clip-path="url(#${cwrClipId})"><path d="${ptsToCubicBezier(run)}" fill="none" stroke="#5a3d20" stroke-width="0.85" stroke-dasharray="4,3" opacity="0.55"/></g>`;
            }
          });
        }
      }

      // Draw top contact line only where layer has meaningful thickness (>= 2px).
      // MUST split into separate CONTIGUOUS runs rather than one filtered
      // array — filtering alone silently bridges a gap where the layer
      // pinches to near-zero and reappears further along, drawing a stray
      // diagonal line connecting two genuinely disconnected segments (a
      // real, confirmed bug: visible as an unexplained floating diagonal
      // line in a live render with no connection to any labelled feature).
      const contactRuns = [];
      let currentRun = [];
      topCurvePts.forEach((p, j) => {
        const thick = Math.abs(p[1] - botCurvePts[j][1]) >= 2.0;
        if (thick) {
          currentRun.push(p);
        } else if (currentRun.length) {
          contactRuns.push(currentRun);
          currentRun = [];
        }
      });
      if (currentRun.length) contactRuns.push(currentRun);
      contactRuns.forEach(run => {
        if (run.length >= 2) {
          svg += `<path d="${ptsToCubicBezier(run)}" fill="none" stroke="#554433" stroke-width="0.7" opacity="0.35"/>`;
        }
      });
    }
  });

  // ---- SOIL ORIGIN TRANSITION LINES ----
  // A dark-ash DASHED line marks every boundary where the soil ORIGIN
  // actually changes (e.g. Alluvium -> Residual, Residual -> Completely
  // Weathered Rock) — distinct from the thin, generic per-layer contact
  // line drawn above (which fires at every BSCS sub-layer boundary
  // regardless of origin). Since masterSoilUnits is already sorted by
  // origin-family stacking priority (rule 9), an origin transition occurs
  // at exactly the master-unit index k where soilUnitMeta[masterSoilUnits[k]]
  // .originFamily first differs from soilUnitMeta[masterSoilUnits[k-1]]
  // .originFamily — found once, then rendered using the SAME cumulative-
  // boundary interpolation (getCumBoundaryAtX) the fill itself uses, so the
  // line always sits exactly on the real origin boundary, including through
  // pinch-outs. A single section can have more than one such boundary (e.g.
  // Made Ground -> Alluvium -> Residual), so every transition index is found
  // and drawn, not just the first.
  // ---- SOIL ORIGIN TRANSITION LINES ----
  {
    const originTransitionIndices = [];
    for (let k = 1; k < masterSoilUnits.length; k++) {
      const famPrev = soilUnitMeta[masterSoilUnits[k - 1]].originFamily;
      const famCur = soilUnitMeta[masterSoilUnits[k]].originFamily;
      if (famPrev !== famCur) originTransitionIndices.push(k);
    }
    originTransitionIndices.forEach(k => {
      const lineRuns = [];
      let currentRun = [];
      sampleDists.forEach(d => {
        const zG = getZGround(d);
        const zR = getZRock(d);
        const z = getSoilBoundaryZ(k, d);
        if ((zG - z) > 0.05 && (z - zR) > 0.05) {
          currentRun.push([xPos(d), yPos(z)]);
        } else if (currentRun.length) {
          lineRuns.push(currentRun);
          currentRun = [];
        }
      });
      if (currentRun.length) lineRuns.push(currentRun);
      lineRuns.forEach(run => {
        if (run.length >= 2) {
          svg += `<!-- Soil Origin transition line (master unit boundary index ${k}) -->
          <path d="${ptsToCubicBezier(run)}" fill="none" stroke="#3a3a3a" stroke-width="1.2" stroke-dasharray="4,3" opacity="0.75"/>`;
        }
      });
    });
  }

  // ---- LENS-FAMILY LAYERS (rule 3): Alluvium / Colluvium / Made Ground /
  // Engineered Fill. Each occurrence is rendered as its OWN self-contained,
  // symmetric lens around its borehole — capped at LENS_MAX_HALF_WIDTH_M on
  // each side (or half the distance to the adjacent borehole if that's
  // smaller, so lenses never overlap into a neighbour's own pillar), tapering
  // to a point at the cap. It is NEVER extended all the way to the next
  // borehole just because that borehole logs the same origin — that would
  // recreate the "regional blanket" assumption that's geologically wrong for
  // a transported, locally-bounded deposit. Drawn after the tabular units so
  // lenses visually sit correctly relative to the surrounding stratigraphy.
  svg += `<!-- Lens-family layers (Alluvium/Colluvium/Made Ground): fixed half-width, non-pinching -->`;
  lensLayers.forEach(lens => {
    const i = lens.bhIdx;
    const xCenter = distances[i];
    const leftNeighborDist = i > 0 ? (distances[i] - distances[i - 1]) / 2 : Infinity;
    const rightNeighborDist = i < distances.length - 1 ? (distances[i + 1] - distances[i]) / 2 : Infinity;
    const halfW_left = Math.min(LENS_MAX_HALF_WIDTH_M, leftNeighborDist);
    const halfW_right = Math.min(LENS_MAX_HALF_WIDTH_M, rightNeighborDist);

    // Also clamp to the plotted distance range so a lens near the first/last
    // borehole doesn't try to draw past the section's edge.
    const dLeftEdge = Math.max(xCenter - halfW_left, distMin);
    const dRightEdge = Math.min(xCenter + halfW_right, distMax);

    // Build a tapering lens: full thickness at the borehole, narrowing
    // smoothly to zero thickness at each edge. Uses a simple cosine taper
    // (not the shared cumulative-boundary system — lenses are deliberately
    // NOT part of that tabular interpolation, per rule 3).
    //
    // CRITICAL (real bug fix): the taper must shrink the lens's DEPTH-BELOW-
    // GROUND toward zero at the LOCAL ground surface at each sampled x, not
    // just shrink its width while holding a fixed absolute elevation band.
    // Alluvium/Colluvium/Made Ground are surface-attached, near-surface
    // deposits — as the lens narrows away from its own borehole, it must
    // visually "rise" back toward the ground surface, never stay parked at
    // a constant elevation that can drift into completely different, deeper
    // material (Residual, Completely Weathered Rock) at a neighbouring
    // position where the ground surface itself is higher or lower. The
    // earlier version used a fixed zMid/halfThickness in absolute elevation,
    // which is what let an Alluvium lens visually intrude into CWR/Residual
    // territory once tapering moved it away from its own borehole.
    const nSteps = 24;
    const topPts = [], botPts = [];
    for (let s = 0; s <= nSteps; s++) {
      const t = s / nSteps; // 0 = left edge, 1 = right edge
      const d = dLeftEdge + (dRightEdge - dLeftEdge) * t;
      const x = xPos(d);
      // Taper factor: 0 at both edges, 1 at the borehole's own position
      const distFromCenter = Math.abs(d - xCenter);
      const halfWHere = d < xCenter ? halfW_left : halfW_right;
      const taperT = halfWHere > 0 ? Math.min(distFromCenter / halfWHere, 1) : 1;
      // Natural parabolic / elliptical lenticular taper (C1-smooth at center, asymptotic closure at edges)
      const taper = Math.pow(Math.max(1 - taperT * taperT, 0), 0.85);

      // Depth-below-ground at the lens's own borehole, tapered toward 0
      // (the LOCAL ground surface) as taper shrinks — this is what keeps
      // the lens anchored to "near the surface" everywhere it's drawn,
      // instead of a fixed absolute elevation band.
      const depthTopHere = lens.depthTop * taper;
      const depthBotHere = lens.depthBot * taper;

      const zGroundHere = getZGround(d);
      const zRockHere = getZRock(d);
      let zTopHere = zGroundHere - depthTopHere;
      let zBotHere = zGroundHere - depthBotHere;
      // Safety clamp: never let the lens extend below the LOCAL rockhead —
      // same boundary every other soil layer in this file already respects.
      zTopHere = Math.min(Math.max(zTopHere, zRockHere), zGroundHere);
      zBotHere = Math.min(Math.max(zBotHere, zRockHere), zGroundHere);
      if (zBotHere > zTopHere) zBotHere = zTopHere;
      topPts.push([x, yPos(zTopHere)]);
      botPts.push([x, yPos(zBotHere)]);
    }
    const lensD = closedLayerPath(topPts, botPts);
    const info = getGraphicInfo(lens.graphic);
    svg += `<!-- Lens: ${lens.originFamily} / ${info.label} at BH index ${i} -->
    <path d="${lensD}" fill="${info.color}" stroke="${info.color}" stroke-width="0.5" opacity="0.96"/>`;
    const hatch = ORIGIN_HATCH_INFO[originHatchKeyOf(lens.origin)];
    if (hatch) svg += `<path d="${lensD}" fill="url(#${hatch.patternId})" stroke="none"/>`;

    // Soil origin transition line (rule 15) at the lens's OWN bottom edge —
    // the tabular-only version of this line (drawn earlier, keyed off
    // masterSoilUnits) has no coverage for lens-family origins at all, since
    // a lens never enters that master-unit stack. Marks exactly where this
    // lens's origin (e.g. Alluvium) ends and whatever sits beneath it
    // (typically Residual) begins. Only drawn where the lens has meaningful
    // thickness (matching the >=2px threshold used for the generic contact
    // line elsewhere), so the pinched-out tails don't produce a visible line
    // sitting right on the ground surface.
    const botRunPts = [];
    for (let s = 0; s < topPts.length; s++) {
      if (Math.abs(topPts[s][1] - botPts[s][1]) >= 2.0) botRunPts.push(botPts[s]);
    }
    if (botRunPts.length >= 2) {
      svg += `<!-- Soil Origin transition line (lens bottom edge, ${lens.originFamily}) -->
      <path d="${ptsToCubicBezier(botRunPts)}" fill="none" stroke="#3a3a3a" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>`;
    }
  });

  // STEP C: Paint Bedrock Base & Weathering
  svg += `<!-- C: Bedrock Base Polygon -->
  <path d="${bedrockD}" fill="${bedrockColor}" stroke="none"/>`;

  // STEP C2: Rock weathering as a CONTINUOUS TOMOGRAPHY FADE
  if (opts.showWeathering && anyWeatheringData) {
    const clipId = 'clip-bedrock-' + Math.random().toString(36).slice(2, 9);
    svg += `<defs><clipPath id="${clipId}"><path d="${bedrockD}"/></clipPath></defs>`;
    svg += `<!-- C2: Rock Weathering Continuous Fade Overlay -->`;
    const cellW = 2.2, cellH = 2.2;
    const xStart = xFrameLeft, xEnd = xFrameRight;
    const yStart = padTop, yEnd = padTop + plotH;
    const shallowestRockElev = Math.max(...rows.map((r, i) => effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : maxElev - 5));
    svg += `<g clip-path="url(#${clipId})">`;
    for (let py = yStart; py < yEnd; py += cellH) {
      const elevMid = maxElev - ((py + cellH / 2) - padTop) / plotH * elevRange;
      if (elevMid > shallowestRockElev + 1) continue;
      let runStartX = null, runColor = null;
      const flushRun = (endX) => {
        if (runStartX !== null) {
          svg += `<rect x="${runStartX.toFixed(1)}" y="${py.toFixed(1)}" width="${(endX - runStartX + 0.6).toFixed(1)}" height="${(cellH + 0.6).toFixed(1)}" fill="${runColor}"/>`;
        }
      };
      for (let px = xStart; px < xEnd; px += cellW) {
        const xMid = px + cellW / 2;
        const dMid = distMin + ((xMid - xFrameLeft) / (xFrameRight - xFrameLeft)) * distSpan;
        const fade = getFadeFractionAt(dMid, elevMid);
        const col = colorAtFadePosition(fade, bedrockColor);
        if (col !== runColor) {
          flushRun(px);
          runStartX = px;
          runColor = col;
        }
      }
      flushRun(xEnd);
    }
    svg += `</g>`;
  }

  // STEP C3: Continuous Apparent-Dip Bedrock Stratum Horizons & Dipping Formation Boundaries
  if (opts.showRockLithology !== false && sectionRockTypes.size > 0) {
    svg += `<g clip-path="url(#${bedrockClipId})">`;
    const masterRockList = Array.from(sectionRockTypes);

    // Apparent dip slope along section line (z change per meter of distance)
    const dirSign = appDip.directionStr === '← A' ? -1 : (appDip.directionStr === '→ B' ? 1 : 0);
    const dipSlope = Math.tan((appDip.angle * Math.PI) / 180) * dirSign;

    // Helper: get dominant regional rock type of a borehole
    function getDominantRockType(layers) {
      if (!layers || !layers.length) return masterRockList[0] || 'Biotite Gneiss';
      let bestType = layers[0].rockType, maxThick = -1;
      layers.forEach(l => {
        const thick = Math.abs(l.zTop - l.zBot);
        if (thick > maxThick) {
          maxThick = thick;
          bestType = l.rockType;
        }
      });
      return bestType;
    }

    const dominantRockPerBH = rows.map((r, i) => getDominantRockType(rockLayersPerBH[i]));

    // ── DIP-ORIENTED BEDROCK FORMATION HORIZON ENGINE ──
    // Map all logged rock layers into Apparent-Dip Structural Horizon coordinates: H = z + dipSlope * d
    // At any distance d, the elevation on a dipping plane is z(d) = H - dipSlope * d.
    const bhIntervals = []; // list of { H_top, H_bot, rockType, bhIdx, zTop, zBot }
    rows.forEach((r, i) => {
      const d = distances[i];
      const layers = rockLayersPerBH[i];
      if (layers && layers.length) {
        layers.forEach(l => {
          const H_top = l.zTop + dipSlope * d;
          const H_bot = l.zBot + dipSlope * d;
          bhIntervals.push({
            H_top: Math.max(H_top, H_bot),
            H_bot: Math.min(H_top, H_bot),
            rockType: l.rockType,
            bhIdx: i,
            zTop: l.zTop,
            zBot: l.zBot
          });
        });
      }
    });

    // Collect candidate contact horizons
    const contactHSet = new Set();
    bhIntervals.forEach(inv => {
      contactHSet.add(inv.H_top);
      contactHSet.add(inv.H_bot);
    });

    // Also check inter-borehole transition midpoints if rock types change between adjacent boreholes
    for (let j = 0; j < rows.length - 1; j++) {
      const rA = dominantRockPerBH[j];
      const rB = dominantRockPerBH[j + 1];
      if (rA !== rB) {
        const dMid = (distances[j] + distances[j + 1]) / 2;
        const zMid = (getZRock(distances[j]) + getZRock(distances[j + 1])) / 2;
        const H_trans = zMid + dipSlope * dMid;
        contactHSet.add(H_trans);
      }
    }

    // Sort contact horizons descending (highest structural level to lowest)
    const sortedH = Array.from(contactHSet).sort((a, b) => b - a);

    // Group into meaningful strata intervals (merging very close horizons < 0.6m)
    const mergedH = [];
    sortedH.forEach(h => {
      if (!mergedH.length || Math.abs(mergedH[mergedH.length - 1] - h) >= 0.6) {
        mergedH.push(h);
      }
    });

    // Construct strata layers between horizons [H_{k-1}, H_k]
    const horizonBounds = [Infinity, ...mergedH, -Infinity];
    const strataList = [];

    for (let k = 0; k < horizonBounds.length - 1; k++) {
      const H_upper = horizonBounds[k];
      const H_lower = horizonBounds[k + 1];
      const H_mid = (isFinite(H_upper) && isFinite(H_lower)) ? (H_upper + H_lower) / 2
                  : (isFinite(H_upper) ? H_upper - 5 : (isFinite(H_lower) ? H_lower + 5 : 0));

      // Determine rock type for this structural interval based on overlapping logged intervals
      const typeWeights = {};
      bhIntervals.forEach(inv => {
        const oTop = Math.min(isFinite(H_upper) ? H_upper : inv.H_top + 10, inv.H_top);
        const oBot = Math.max(isFinite(H_lower) ? H_lower : inv.H_bot - 10, inv.H_bot);
        if (oTop > oBot) {
          const overlap = oTop - oBot;
          typeWeights[inv.rockType] = (typeWeights[inv.rockType] || 0) + overlap;
        }
      });

      let bestType = dominantRockPerBH[0] || 'Biotite Gneiss';
      let maxWeight = -1;
      Object.keys(typeWeights).forEach(t => {
        if (typeWeights[t] > maxWeight) {
          maxWeight = typeWeights[t];
          bestType = t;
        }
      });

      // Fallback: if no direct overlap, use borehole nearest to this H-plane intersection
      if (maxWeight <= 0) {
        let bestDist = Infinity;
        rows.forEach((r, i) => {
          const d = distances[i];
          const zR = getZRock(d);
          const zAtD = H_mid - dipSlope * d;
          const diff = Math.abs(zAtD - zR);
          if (diff < bestDist) {
            bestDist = diff;
            bestType = dominantRockPerBH[i];
          }
        });
      }

      strataList.push({ H_upper, H_lower, rockType: bestType });
    }

    // Merge contiguous strata intervals that share the same rock type
    const mergedStrata = [];
    strataList.forEach(st => {
      const last = mergedStrata[mergedStrata.length - 1];
      if (last && last.rockType === st.rockType) {
        last.H_lower = st.H_lower;
      } else {
        mergedStrata.push({ ...st });
      }
    });

    // Render each dipping bedrock stratum formation across the full cross-section width
    mergedStrata.forEach((stratum, sIdx) => {
      const topPts = [];
      const botPts = [];
      let hasArea = false;

      sampleDists.forEach(d => {
        const x = xPos(d);
        const zRock = getZRock(d);
        const zUpper = isFinite(stratum.H_upper) ? (stratum.H_upper - dipSlope * d) : zRock;
        const zLower = isFinite(stratum.H_lower) ? (stratum.H_lower - dipSlope * d) : minElev;

        let zTop = Math.min(zRock, Math.max(minElev, zUpper));
        let zBot = Math.min(zRock, Math.max(minElev, zLower));
        if (zBot > zTop) zBot = zTop;

        topPts.push([x, yPos(zTop)]);
        botPts.push([x, yPos(zBot)]);
        if (zTop - zBot > 0.05) hasArea = true;
      });

      if (hasArea && topPts.length >= 2) {
        const conf = ROCK_LITHOLOGY_CONFIG[stratum.rockType] || ROCK_LITHOLOGY_CONFIG['Biotite Gneiss'];
        const polyD = closedLayerPath(topPts, botPts);
        svg += `<!-- Dipping Bedrock Stratum Horizon: ${stratum.rockType} (Apparent Dip ${appDip.angle.toFixed(1)}° ${appDip.directionStr}) -->\n`;
        svg += `<path d="${polyD}" fill="url(#${conf.patternId})" stroke="none"/>\n`;
      }
    });

    // Draw continuous geological formation contact lines along the dipping contact horizons
    for (let k = 0; k < mergedStrata.length - 1; k++) {
      const contactH = mergedStrata[k].H_lower;
      if (isFinite(contactH)) {
        const linePts = [];
        sampleDists.forEach(d => {
          const zC = contactH - dipSlope * d;
          const zRock = getZRock(d);
          if (zC <= zRock && zC >= minElev) {
            linePts.push([xPos(d), yPos(zC)]);
          }
        });
        if (linePts.length >= 2) {
          svg += `<!-- Geological Formation Contact Boundary (Dipping continuous foliation plane) -->\n`;
          svg += `<path d="${ptsToCubicBezier(linePts, 0.4)}" fill="none" stroke="#78828c" stroke-width="1.3" stroke-dasharray="7,5" opacity="0.95"/>\n`;
        }
      }
    }

    svg += `</g>`;
  } else {
    // Default subtle bedrock texture overlay
    svg += `<path d="${bedrockD}" fill="url(#pat-bedrock)" stroke="none" opacity="0.4"/>`;
  }

  // STEP D: Rockhead contact dashed line (on top of everything)
  // 3. RENDER ROCKHEAD CONTACT LINE (full width including side extensions)
  // Rockhead contact: slightly softer brown, medium dash, tension 0.5 for gentle undulation
  svg += `<!-- Rockhead Contact Line -->
  <path d="${ptsToCubicBezier(rockPolyPts, 0.5)}" fill="none" stroke="#8c3a26" stroke-width="1.9" stroke-dasharray="7,5"/>`;


  // 4. RENDER GROUNDWATER TABLE LINE & STANDARD INTERNATIONAL SYMBOLS
  if (opts.showGWT !== false && gwDepthPts.length >= 1) {
    const gwCurvePts = [];
    sampleDists.forEach(d => {
      const x = xPos(d);
      const zGw = getZWater(d);
      if (zGw !== null) gwCurvePts.push([x, yPos(zGw)]);
    });
    if (gwCurvePts.length >= 2) {
      svg += `<!-- Groundwater Table Line -->
      <path d="${ptsToCubicBezier(gwCurvePts)}" fill="none" stroke="#1e6fd9" stroke-width="2.0" stroke-dasharray="6,3"/>`;
    }

    // Helper: Standard International Groundwater Level Symbol (Inverted triangle + graduated horizontal bars)
    function renderGwtSymbol(x, y, scale = 1.0) {
      const w1 = 5.5 * scale, w2 = 3.5 * scale, w3 = 1.8 * scale;
      const hTri = 6.0 * scale;
      return `<g class="gwt-symbol">
        <polygon points="${(x - w1).toFixed(1)},${(y - hTri).toFixed(1)} ${(x + w1).toFixed(1)},${(y - hTri).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}" fill="#1e6fd9" stroke="#ffffff" stroke-width="0.5"/>
        <line x1="${(x - w1 - 2.5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + w1 + 2.5).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#1e6fd9" stroke-width="1.4"/>
        <line x1="${(x - w2).toFixed(1)}" y1="${(y + 2.2 * scale).toFixed(1)}" x2="${(x + w2).toFixed(1)}" y2="${(y + 2.2 * scale).toFixed(1)}" stroke="#1e6fd9" stroke-width="1.1"/>
        <line x1="${(x - w3).toFixed(1)}" y1="${(y + 4.2 * scale).toFixed(1)}" x2="${(x + w3).toFixed(1)}" y2="${(y + 4.2 * scale).toFixed(1)}" stroke="#1e6fd9" stroke-width="0.9"/>
      </g>`;
    }

    // Render symbols along the groundwater table line in each inter-borehole span
    if (rows.length >= 2) {
      for (let j = 0; j < rows.length - 1; j++) {
        const dMid = (distances[j] + distances[j + 1]) / 2;
        const zGw = getZWater(dMid);
        if (zGw !== null) {
          const x = xPos(dMid);
          const y = yPos(zGw);
          svg += renderGwtSymbol(x, y, 1.0);
        }
      }
    } else {
      gwDepthPts.forEach(pt => {
        const x = xPos(pt.x) + 16;
        const zG = getZGround(pt.x);
        const y = yPos(zG - pt.y);
        svg += renderGwtSymbol(x, y, 1.0);
      });
    }
  }

  // 5. RENDER GROUND SURFACE SMOOTH LINE (full width including side extensions)
  const groundPolyPts = sampleDists.map(d => [xPos(d), yPos(getZGround(d))]);
  svg += `<!-- Ground Surface Smooth Profile -->
  <path d="${ptsToCubicBezier(groundPolyPts)}" fill="none" stroke="#2f6f5e" stroke-width="2.8"/>`;

  // 6. RENDER BOREHOLE COLUMNS (HARD DATA PILLARS)
  const bhLabelInfo = [];
  const termLabelInfo = [];
  const colW = Math.min(15, plotW / Math.max(rows.length, 1) * 0.35);
  rows.forEach((r, i) => {
    const x = xPos(distances[i]);
    const bhName = bhNames[i];
    const lv = levelsArr[i];
    const layers = layersArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zTerm = effectiveTermLevel[i] !== null ? effectiveTermLevel[i] : zG - 15;
    const yG = yPos(zG);
    const yTerm = yPos(zTerm);

    if (layers && layers.length) {
      layers.forEach(l => {
        const info = getGraphicInfo(l.graphic);
        const yTop = yPos(zG - l.depth);
        const yBot = yPos(zG - l.bottom);
        const h = Math.max(yBot - yTop, 0.4);

        if (info.isBoulder || l.isBoulder) {
          // Dedicated Boulder / Corestone symbol on the borehole pillar
          const bldH = Math.max(yBot - yTop, 4);
          const bldMidY = (yTop + yBot) / 2;
          const cx = x;
          const rx = Math.max(colW / 2 - 1.5, 3);
          const ry = Math.max(Math.min(bldH / 2 - 1, 5.5), 2.5);

          svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${colW.toFixed(1)}" height="${bldH.toFixed(1)}" fill="#ded8cd" stroke="#5a5247" stroke-width="0.8" rx="2"/>`;
          svg += `<ellipse cx="${cx.toFixed(1)}" cy="${bldMidY.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#c4bcaf" stroke="#4a4237" stroke-width="0.8"/>`;
          svg += `<ellipse cx="${(cx - 1.5).toFixed(1)}" cy="${(bldMidY - 0.8).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.45).toFixed(1)}" fill="#f0ebe1" opacity="0.65"/>`;
          svg += `<text x="${(x + colW / 2 + 3).toFixed(1)}" y="${(bldMidY + 2.5).toFixed(1)}" font-size="6.8" font-weight="800" fill="#78350f">🪨 Boulder</text>`;
          return;
        }

        // For rock layers, tint with the same continuous weathering fade used
        // in the section fill, evaluated at this layer's own depth — so the
        // pillar reads consistently with the surrounding fade instead of a
        // flat, unrelated rock colour.
        let fillColor = info.color;
        if (info.isRock && anyWeatheringData) {
          const zMid = zG - (l.depth + l.bottom) / 2;
          const fade = getFadeFractionAt(distances[i], zMid);
          fillColor = colorAtFadePosition(fade, bedrockColor);
        }
        // Lighter border: #909090 (medium ash grey) instead of near-black #333333
        svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${colW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fillColor}" stroke="#909090" stroke-width="0.5"/>`;
        if (info.isRock) {
          for (let hy = yTop; hy < yBot; hy += 7) {
            svg += `<line x1="${(x - colW / 2).toFixed(1)}" y1="${hy.toFixed(1)}" x2="${(x + colW / 2).toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#999" stroke-width="0.4" opacity="0.4"/>`;
          }
        }
      });
    } else {
      const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
      const yR = yPos(zR);
      svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yG.toFixed(1)}" width="${colW.toFixed(1)}" height="${Math.max(yR - yG, 0).toFixed(1)}" fill="#c9a876" stroke="#909090" stroke-width="0.5"/>`;
      if (yTerm > yR) {
        if (anyWeatheringData) {
          // Draw the no-layer-data rock portion as a thin stack of tinted
          // strips so it still reflects the fade rather than flat bedrock.
          const stripH = 6;
          for (let yy = yR; yy < yTerm; yy += stripH) {
            const zStripMid = zR - ((yy - yR) + stripH / 2) / (yTerm - yR) * (zR - zTerm);
            const fade = getFadeFractionAt(distances[i], zStripMid);
            const col = colorAtFadePosition(fade, bedrockColor);
            const hh = Math.min(stripH, yTerm - yy);
            svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${colW.toFixed(1)}" height="${hh.toFixed(1)}" fill="${col}" stroke="none"/>`;
          }
          svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yR.toFixed(1)}" width="${colW.toFixed(1)}" height="${(yTerm - yR).toFixed(1)}" fill="none" stroke="#909090" stroke-width="0.5"/>`;
        } else {
          svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yR.toFixed(1)}" width="${colW.toFixed(1)}" height="${(yTerm - yR).toFixed(1)}" fill="#8f8f95" stroke="#909090" stroke-width="0.5"/>`;
        }
      }
    }

    // Outer pillar outline: lighter ash grey #666666 (was near-black #111111)
    svg += `<rect x="${(x - colW / 2).toFixed(1)}" y="${yG.toFixed(1)}" width="${colW.toFixed(1)}" height="${(yTerm - yG).toFixed(1)}" fill="none" stroke="#666666" stroke-width="1.0"/>`;

    // ── IN-SITU TESTING & ROCK QUALITY DATA (SPT N-VALUES & RQD BARS) ──
    const tests = getBHTests(r);
    if (tests && tests.length) {
      const sptTests = [];
      const rqdTests = [];

      tests.forEach(t => {
        if (opts.showSPT && t.nVal !== null && (t.type === 'SPT' || t.nVal > 0)) {
          sptTests.push(t);
        }
        if (opts.showRQD && (t.rqd !== null || t.cr !== null) && t.type !== 'SPT') {
          rqdTests.push(t);
        }
      });

      // 1. SPT N-VALUE CALLOUT (Left side of borehole pillar with Anti-Collision & Translucent Glass Pill)
      let lastSptY = -999;
      sptTests.sort((a, b) => a.depth - b.depth).forEach(t => {
        const yTop = yPos(zG - t.depth);
        const yBot = yPos(zG - (t.depth + (t.length || 0.45)));
        const h = Math.max(Math.abs(yBot - yTop), 3.5);
        const nVal = t.nVal;
        const isRefusal = nVal >= 50;
        const nTxt = isRefusal ? '50+' : String(Math.round(nVal));
        const barW = Math.min(Math.max((nVal / 50) * 16, 4), 20);
        const barX = x - colW / 2 - 2 - barW;
        const barY = yTop;
        // Standard soil density/consistency color-coding
        const barColor = isRefusal ? '#a82c2c' : (nVal >= 30 ? '#c97a2b' : (nVal >= 10 ? '#2e7d32' : '#2563eb'));
        const calloutTxt = `N=${nTxt}`;
        const pillW = calloutTxt.length * 5.2 + 8;
        const pillH = 11;
        const pillX = barX - 2 - pillW;
        let pillY = barY + Math.max(h, 4) / 2 - pillH / 2;

        // Anti-collision staggering: ensure at least (pillH + 1.5) clearance from previous pill
        if (pillY < lastSptY + pillH + 1.5) {
          pillY = lastSptY + pillH + 1.5;
        }
        lastSptY = pillY;

        svg += `<rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 4).toFixed(1)}" fill="${barColor}" opacity="0.80" rx="1"/>`;
        // Translucent pill container so underlying stratigraphy/textures show through
        svg += `<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH}" fill="rgba(255,255,255,0.70)" stroke="${barColor}" stroke-width="0.75" rx="2.5"/>`;
        svg += `<text x="${(pillX + pillW / 2).toFixed(1)}" y="${(pillY + 8).toFixed(1)}" font-size="7.5" fill="${barColor}" font-weight="800" text-anchor="middle">${calloutTxt}</text>`;
      });

      // 2. RQD & CORE RECOVERY (CR) BARS (Right side of borehole pillar with Anti-Collision & Translucent Glass Pill)
      let lastRqdY = -999;
      rqdTests.sort((a, b) => a.depth - b.depth).forEach(t => {
        const yTop = yPos(zG - t.depth);
        const yBot = yPos(zG - (t.depth + (t.length || 0.45)));
        const h = Math.max(Math.abs(yBot - yTop), 3.5);
        const rqdVal = t.rqd !== null ? t.rqd : 0;
        const crVal = t.cr !== null ? t.cr : 0;
        const maxTrackW = 20; // 0 to 20px
        const rqdW = Math.min(Math.max((rqdVal / 100) * maxTrackW, 0), maxTrackW);
        const crW = Math.min(Math.max((crVal / 100) * maxTrackW, 0), maxTrackW);
        const trackX = x + colW / 2 + 2;
        const barY = yTop;

        // RQD Color classification (ISRM / ASTM D6032)
        let rqdColor = '#d9534f'; // <25% Very Poor (Red)
        if (rqdVal >= 90) rqdColor = '#1b5e20'; // 90-100% Excellent (Dark Green)
        else if (rqdVal >= 75) rqdColor = '#2e7d32'; // 75-90% Good (Green)
        else if (rqdVal >= 50) rqdColor = '#b45309'; // 50-75% Fair (Amber)
        else if (rqdVal >= 25) rqdColor = '#d97706'; // 25-50% Poor (Orange)

        // Background Core Recovery (CR) track with translucency
        if (crVal > 0) {
          svg += `<rect x="${trackX.toFixed(1)}" y="${barY.toFixed(1)}" width="${crW.toFixed(1)}" height="${Math.max(h, 4).toFixed(1)}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="0.4" opacity="0.65" rx="1"/>`;
        }
        // Foreground RQD track with translucency
        if (rqdVal > 0) {
          svg += `<rect x="${trackX.toFixed(1)}" y="${barY.toFixed(1)}" width="${rqdW.toFixed(1)}" height="${Math.max(h, 4).toFixed(1)}" fill="${rqdColor}" opacity="0.80" rx="1"/>`;
        }
        // Text pill label (with guaranteed clearance)
        const rqdTxt = `RQD:${Math.round(rqdVal)}%`;
        const pillW = rqdTxt.length * 4.6 + 6;
        const pillH = 10;
        const pillX = trackX + Math.max(crW, rqdW) + 2;
        let pillY = barY + Math.max(h, 4) / 2 - pillH / 2;
        if (pillY < lastRqdY + pillH + 1.5) {
          pillY = lastRqdY + pillH + 1.5;
        }
        lastRqdY = pillY;

        // Translucent pill container so underlying bedrock mass shows through
        svg += `<rect x="${pillX.toFixed(1)}" y="${pillY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH}" fill="rgba(255,255,255,0.70)" stroke="#cbd5e1" stroke-width="0.6" rx="2"/>`;
        svg += `<text x="${(pillX + pillW / 2).toFixed(1)}" y="${(pillY + 7.5).toFixed(1)}" font-size="7" fill="${rqdVal > 0 ? rqdColor : '#64748b'}" font-weight="700" text-anchor="middle">${rqdTxt}</text>`;
      });
    }

    // BH labels are placed in a vertical-stagger second pass below
    const offVal = (meta.offsets && meta.offsets[i] !== undefined) ? meta.offsets[i] : null;
    const hasOff = offVal !== null && Math.abs(offVal) >= 0.1;
    const offText = hasOff ? `Off: ${offVal >= 0 ? '+' : ''}${offVal.toFixed(1)}m ${offVal >= 0 ? 'R' : 'L'}` : '';
    const chText = extractBoreholeChainage(r, bhName);
    bhLabelInfo.push({ x, yG, bhName, glText: `GL ${zG.toFixed(1)}m`, offText, chText });

    // Termination labels ALSO use a deferred vertical-stagger pass (see
    // below, mirrors the BH header label collision-avoidance) — previously
    // these were drawn immediately at a fixed yTerm+4 offset with no
    // collision checking at all, so two boreholes terminating at similar
    // depths close together would produce overlapping "Term X.Xm" boxes.
    termLabelInfo.push({ x, yTerm, zTerm });
  });


  // ── VERTICAL-STAGGER BH HEADER LABELS (second pass) ─────────────────────
  // Each BH label is placed directly above its borehole at the same X.
  // If it would vertically collide with an already-placed label nearby, it
  // is bumped UP by one row (labelRowH pixels). We allow up to 4 vertical
  // rows so even densely packed profiles stay readable.
  //
  // "Collision" is defined as: another label whose X centre is within
  // (boxW/2 + otherBoxW/2 + 6) pixels — i.e. the boxes would touch or overlap.
  {
    const charW  = 6.3;   // px per char at font-size 9.5
    const glCW   = 5.1;   // px per char at font-size 8
    const offCW  = 4.8;
    const maxRows = 5;

    // placed = array of { x, cx, yTop, boxW }
    const placed = [];

    bhLabelInfo.forEach(({ x, yG, bhName, glText, offText, chText }) => {
      const nameW = bhName.length * charW + 14;
      const glW   = glText.length * glCW  + 10;
      const offW  = offText ? offText.length * offCW + 10 : 0;
      const chW   = chText ? chText.length * glCW + 10 : 0;
      const boxW  = Math.max(nameW, glW, offW, chW);
      const boxH  = (offText && chText) ? 44 : ((offText || chText) ? 36 : 26);
      const rowH  = boxH + 6;
      const cx    = x; // always keep same X — vertical only

      // Find the lowest row (closest to ground) that doesn't collide
      let row = 0;
      let collision = true;
      let targetYTop = yG - (row + 1) * rowH - 8;
      while (collision && row < maxRows) {
        targetYTop = yG - (row + 1) * rowH - 8;
        collision = placed.some(p => {
          const minDist = (boxW + p.boxW) / 2 + 4;
          return Math.abs(cx - p.cx) < minDist && Math.abs(targetYTop - p.yTop) < boxH + 2;
        });
        if (collision) row++;
      }

      // Hard ceiling clamp: NEVER allow yTop to go above 84 (title banner boundary is y <= 78)
      const minAllowedYTop = 84;
      let yTop = Math.max(targetYTop, minAllowedYTop);
      let targetCX = cx;

      // If vertical stacking was clamped at the ceiling and collides horizontally:
      if (yTop === minAllowedYTop) {
        let xShift = 0;
        let xCollision = placed.some(p => Math.abs(targetCX - p.cx) < (boxW + p.boxW)/2 + 4 && Math.abs(yTop - p.yTop) < boxH + 2);
        while (xCollision && Math.abs(xShift) < 140) {
          xShift = (xShift >= 0) ? -(xShift + 25) : -xShift;
          targetCX = cx + xShift;
          xCollision = placed.some(p => Math.abs(targetCX - p.cx) < (boxW + p.boxW)/2 + 4 && Math.abs(yTop - p.yTop) < boxH + 2);
        }
      }

      placed.push({ x, cx: targetCX, yTop, boxW });

      // Leader: vertical dashed line from bottom of box to BH top
      svg += `<line x1="${cx.toFixed(1)}" y1="${(yTop + boxH).toFixed(1)}" x2="${x.toFixed(1)}" y2="${yG.toFixed(1)}" stroke="#8a8478" stroke-width="0.8" stroke-dasharray="2,2"/>`;

      // Box
      svg += `<rect x="${(cx - boxW/2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" fill="rgba(255,255,255,0.93)" stroke="#b8b2a2" stroke-width="1" rx="4"/>`;

      // BH Name
      svg += `<text x="${cx.toFixed(1)}" y="${(yTop + 11).toFixed(1)}" font-size="9.5" font-weight="800" fill="#1c2b2a" text-anchor="middle">${bhName}</text>`;

      let nextY = yTop + 22;
      // Chainage if present
      if (chText) {
        svg += `<text x="${cx.toFixed(1)}" y="${nextY.toFixed(1)}" font-size="8" fill="#0f766e" font-weight="700" text-anchor="middle">${chText}</text>`;
        nextY += 9.5;
      }

      // GL elevation
      svg += `<text x="${cx.toFixed(1)}" y="${nextY.toFixed(1)}" font-size="8" fill="#6b6459" font-weight="600" text-anchor="middle">${glText}</text>`;
      nextY += 9.5;

      // Offset if present
      if (offText) {
        svg += `<text x="${cx.toFixed(1)}" y="${nextY.toFixed(1)}" font-size="7.5" fill="#2563eb" font-weight="700" text-anchor="middle">${offText}</text>`;
      }
    });
  }

  // ── VERTICAL-STAGGER TERMINATION LABELS (mirrors BH header label pass) ──
  // Each "Term X.Xm" label is placed directly below its borehole's
  // termination point, at the same X. If it would collide horizontally with
  // an already-placed termination label nearby, it is bumped DOWN by one row
  // (away from the pillars, since these sit at the BOTTOM of the profile —
  // the opposite stacking direction from the BH header labels, which stack
  // upward toward the top). Previously these were drawn immediately with a
  // fixed offset and no collision checking at all, so two boreholes
  // terminating at similar depths close together produced overlapping boxes
  // — this was a real, confirmed bug, not a style choice.
  {
    const termCW = 5.2; // px per char at font-size 8.5, matches original sizing
    const boxH = 15;
    const rowH = boxH + 4;
    const maxRows = 5;
    const placed = [];

    termLabelInfo.forEach(({ x, yTerm, zTerm }) => {
      const termText = `Term ${zTerm.toFixed(1)}m`;
      const boxW = termText.length * termCW + 10;
      const cx = x; // always keep same X — vertical only, same as BH labels

      // Find the highest row (closest to termination point) that doesn't collide
      let row = 0;
      let collision = true;
      while (collision && row < maxRows) {
        const yTop = yTerm + 4 + row * rowH;
        collision = placed.some(p => {
          const minDist = (boxW + p.boxW) / 2 + 4;
          return Math.abs(cx - p.cx) < minDist && Math.abs(yTop - p.yTop) < boxH + 2;
        });
        if (collision) row++;
      }

      const yTop = yTerm + 4 + row * rowH;
      placed.push({ x, cx, yTop, boxW });

      // Subtle leader line if pushed down
      if (row > 0) {
        svg += `<line x1="${cx.toFixed(1)}" y1="${yTerm.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yTop.toFixed(1)}" stroke="#b8b2a2" stroke-width="0.8" stroke-dasharray="2,2"/>`;
      }

      svg += `<rect x="${(cx - boxW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" fill="rgba(255, 255, 255, 0.90)" stroke="#b8b2a2" stroke-width="1" rx="3"/>`;
      svg += `<text x="${cx.toFixed(1)}" y="${(yTop + 10.5).toFixed(1)}" font-size="8.5" font-weight="600" fill="#444444" text-anchor="middle">${termText}</text>`;
    });
  }



  // ── RENDER STRUCTURED MODULAR GEOLOGICAL & GEOTECHNICAL LEGEND ──
  const legStartY = axisY + 95;
  
  svg += `<g id="legend-modular" font-family="Inter, sans-serif">`;
  svg += `<text x="${padLeft}" y="${axisY + 76}" font-size="11" font-weight="800" fill="#1c2b2a" letter-spacing="0.04em">ENGINEERING GEOLOGY STRATIGRAPHIC &amp; GEOTECHNICAL LEGEND</text>`;
  
  // Section 1: 4-Column Top Grid (Soil Stratigraphy, Bedrock & Weathering, Contacts & Hydrology, Plan View Map)
  const card1X = padLeft;
  const card2X = card1X + col1W + colGap;
  const card3X = card2X + col2W + colGap;
  const card4X = card3X + col3W + colGap;

  // Top Card 1: Soil Stratigraphy (BS 5930)
  svg += `<rect x="${card1X}" y="${legStartY}" width="${col1W}" height="${topCardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card1X}" y="${legStartY}" width="${col1W}" height="24" fill="#eeebe2" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card1X}" y="${legStartY + 18}" width="${col1W}" height="6" fill="#eeebe2" stroke="none"/>`;
  svg += `<text x="${card1X + 10}" y="${legStartY + 16}" font-size="9" font-weight="700" fill="#2c3e50" letter-spacing="0.01em">SOIL STRATIGRAPHY (BS 5930)</text>`;
  
  const colSlotW = (col1W - 20) / soilCols;
  soilItems.forEach((it, idx) => {
    const c = idx % soilCols;
    const r = Math.floor(idx / soilCols);
    const itX = card1X + 10 + c * colSlotW;
    const itY = legStartY + 38 + r * 24;
    const swW = 20, swH = 13;
    const clipId = `clip-soil-${idx}`;
    svg += `<defs><clipPath id="${clipId}"><rect x="${itX}" y="${itY - 9.5}" width="${swW}" height="${swH}" rx="2"/></clipPath></defs>`;
    svg += `<rect x="${itX}" y="${itY - 9.5}" width="${swW}" height="${swH}" fill="${it.color}" stroke="#666" stroke-width="0.7" rx="2"/>`;
    if (it.patternId) svg += `<rect x="${itX}" y="${itY - 9.5}" width="${swW}" height="${swH}" fill="url(#${it.patternId})" clip-path="url(#${clipId})" stroke="none" rx="2"/>`;
    if (it.originPatternId) svg += `<rect x="${itX}" y="${itY - 9.5}" width="${swW}" height="${swH}" fill="url(#${it.originPatternId})" clip-path="url(#${clipId})" stroke="none" rx="2"/>`;
    if (it.originName) {
      const origDisplay = it.originName === 'Completely Weathered Rock' ? 'CWR' : it.originName;
      svg += `<text x="${itX + swW + 6}" y="${itY}" font-size="8.5" fill="#1e293b" font-weight="600">${it.label} <tspan fill="#64748b" font-weight="500" font-size="7.5">(${origDisplay})</tspan></text>`;
    } else {
      svg += `<text x="${itX + swW + 6}" y="${itY}" font-size="8.5" fill="#1e293b" font-weight="600">${it.label}</text>`;
    }
  });

  // Top Card 2: Bedrock Lithology & Weathering
  svg += `<rect x="${card2X}" y="${legStartY}" width="${col2W}" height="${topCardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card2X}" y="${legStartY}" width="${col2W}" height="24" fill="#eeebe2" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card2X}" y="${legStartY + 18}" width="${col2W}" height="6" fill="#eeebe2" stroke="none"/>`;
  svg += `<text x="${card2X + 10}" y="${legStartY + 16}" font-size="9" font-weight="700" fill="#2c3e50" letter-spacing="0.01em">BEDROCK LITHOLOGY &amp; WEATHERING</text>`;
  
  let curRockY = legStartY + 38;
  const rSwW = 30, rSwH = 18;
  rockLithoItems.forEach((it, idx) => {
    const rx = card2X + 10, ry = curRockY - 13.5;
    const clipId = `clip-rock-${idx}`;
    svg += `<defs><clipPath id="${clipId}"><rect x="${rx}" y="${ry}" width="${rSwW}" height="${rSwH}" rx="2"/></clipPath></defs>`;
    svg += `<rect x="${rx}" y="${ry}" width="${rSwW}" height="${rSwH}" fill="#f0eeea" stroke="#555" stroke-width="0.8" rx="2"/>`;
    if (it.patternId) svg += `<rect x="${rx}" y="${ry}" width="${rSwW}" height="${rSwH}" fill="url(#${it.patternId})" clip-path="url(#${clipId})" stroke="none"/>`;
    svg += `<rect x="${rx}" y="${ry}" width="${rSwW}" height="${rSwH}" fill="none" stroke="#555" stroke-width="0.8" rx="2"/>`;
    svg += `<text x="${rx + rSwW + 6}" y="${curRockY - 2}" font-size="8.5" fill="#333333" font-weight="600">${it.label}</text>`;
    curRockY += 26;
  });

  if (weatherGradeItems.length) {
    curRockY += 4;
    svg += `<text x="${card2X + 10}" y="${curRockY - 2}" font-size="8" font-weight="700" fill="#6d5d4d">WEATHERING (OVERLAY):</text>`;
    curRockY += 16;
    const wCols = 2;
    const wColW = (col2W - 20) / wCols;
    weatherGradeItems.forEach((it, idx) => {
      const c = idx % wCols;
      const r = Math.floor(idx / wCols);
      const itX = card2X + 10 + c * wColW;
      const itY = curRockY + r * 20;
      svg += `<rect x="${itX}" y="${itY - 9}" width="15" height="10" fill="${it.color}" stroke="#777" stroke-width="0.6" rx="2"/>`;
      svg += `<text x="${itX + 19}" y="${itY}" font-size="8" fill="#444444" font-weight="500">${it.label.replace(' Weathered Rock', '').replace(' Rock', '')}</text>`;
    });
  }

  // Top Card 3: Contacts & Features
  svg += `<rect x="${card3X}" y="${legStartY}" width="${col3W}" height="${topCardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card3X}" y="${legStartY}" width="${col3W}" height="24" fill="#eeebe2" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
  svg += `<rect x="${card3X}" y="${legStartY + 18}" width="${col3W}" height="6" fill="#eeebe2" stroke="none"/>`;
  svg += `<text x="${card3X + 10}" y="${legStartY + 16}" font-size="9" font-weight="700" fill="#2c3e50" letter-spacing="0.01em">CONTACTS &amp; FEATURES</text>`;
  
  lineItems.forEach((it, idx) => {
    const itX = card3X + 10;
    const itY = legStartY + 38 + idx * 24;
    if (it.isBoulder) {
      svg += `<ellipse cx="${itX + 14}" cy="${itY - 5}" rx="8" ry="5" fill="#c4bcaf" stroke="#5a5247" stroke-width="0.9"/>`;
      svg += `<ellipse cx="${itX + 12.5}" cy="${itY - 6}" rx="3.8" ry="2.3" fill="#f0ebe1" opacity="0.75"/>`;
    } else {
      svg += `<line x1="${itX}" y1="${itY - 5}" x2="${itX + 28}" y2="${itY - 5}" stroke="${it.color}" stroke-width="2" stroke-dasharray="${it.dash}"/>`;
    }
    if (it.isGwt) {
      svg += renderGwtSymbol(itX + 14, itY - 5, 0.85);
    }
    svg += `<text x="${itX + 34}" y="${itY}" font-size="8.5" fill="#333333" font-weight="500">${it.label}</text>`;
  });

  // Top Card 4: Plan View Location Map (Always fits within card boundary)
  svg += renderPlanViewLegendCard(rows, distances, meta.sectionAzimuth, meta.offsets, card4X, legStartY, col4W, topCardH);


  // Section 2 Card: Depositional Origin (Texture Overlays)
  let curBottomY = legStartY + topCardH + 10;
  if (originItems.length) {
    const originCardH = 48;
    svg += `<rect x="${padLeft}" y="${curBottomY}" width="${legW}" height="${originCardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
    svg += `<text x="${padLeft + 10}" y="${curBottomY + 16}" font-size="9" font-weight="700" fill="#4a453c" letter-spacing="0.02em">SOIL ORIGIN (TEXTURE OVERLAYS):</text>`;
    
    const origSpacing = legW / Math.max(originItems.length, 1);
    originItems.forEach((it, idx) => {
      const itX = padLeft + 12 + idx * Math.min(origSpacing, 240);
      const itY = curBottomY + 34;
      const baseCol = it.patternId === 'pat-origin-cwr' ? '#ded8cd' : (it.patternId === 'pat-origin-residual' ? '#efe6d8' : '#e8e4d8');
      svg += `<rect x="${itX}" y="${itY - 10}" width="22" height="14" fill="${baseCol}" stroke="#555" stroke-width="0.8" rx="2"/>`;
      svg += `<rect x="${itX}" y="${itY - 10}" width="22" height="14" fill="url(#${it.patternId})" stroke="none" rx="2"/>`;
      svg += `<text x="${itX + 28}" y="${itY}" font-size="9" fill="#333333" font-weight="600">${it.label}</text>`;
    });
    curBottomY += originCardH + 10;
  }

  // Section 3 Card: In-Situ Testing & Rock Mass Quality (when enabled)
  if (inSituItems.length) {
    const testCardH = 48;
    svg += `<rect x="${padLeft}" y="${curBottomY}" width="${legW}" height="${testCardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>`;
    svg += `<text x="${padLeft + 10}" y="${curBottomY + 16}" font-size="9" font-weight="700" fill="#4a453c" letter-spacing="0.02em">IN-SITU TESTING &amp; ROCK MASS QUALITY:</text>`;
    
    const testSpacing = Math.min(legW / inSituItems.length, 290);
    inSituItems.forEach((it, idx) => {
      const itX = padLeft + 12 + idx * testSpacing;
      const itY = curBottomY + 34;
      if (it.isCr) {
        svg += `<rect x="${itX}" y="${itY - 8}" width="16" height="10" fill="${it.color}" stroke="#99a6ad" stroke-width="0.5" rx="1.5"/>`;
      } else {
        svg += `<rect x="${itX}" y="${itY - 8}" width="16" height="10" fill="${it.color}" rx="1.5"/>`;
      }
      svg += `<text x="${itX + 22}" y="${itY}" font-size="9" fill="#333333" font-weight="500">${it.label}</text>`;
    });
    curBottomY += testCardH + 10;
  }

  // Caution Note & Copyright Footer
  const noteY = curBottomY + 14;
  svg += `<text x="${padLeft}" y="${noteY}" font-size="8.5" fill="#c0392b" font-weight="700">⚠️ CAUTION NOTE:</text>`;
  svg += `<text x="${padLeft + 85}" y="${noteY}" font-size="8.5" fill="#555555" font-style="italic">This 2D cross-section is automatically generated by spatial interpolation between borehole data. Use with caution for preliminary conceptual modeling only.</text>`;

  const copyrightY = noteY + 18;
  svg += `<text x="${padLeft}" y="${copyrightY}" font-size="8" fill="#8a8378" font-weight="500">© ${new Date().getFullYear()} Geotechnical Engineering Division, National Building Research Institute (NBRI). All rights reserved.</text>`;
  svg += `</g>`;

  svg += `</svg>`;
  return svg;
}

function onSectionMethodChange(val) {
  sectionMethod = val;
  const azPanel = document.getElementById('az-panel');
  if (azPanel) azPanel.classList.toggle('visible', val === 'projection');
  updateApparentDipDisplay();
}

// Structural Geology: Calculate Apparent Dip on the Cross-Section Plane
// tan(appDip) = tan(trueDip) * cos(sectionAz - dipDir)
function calcApparentDip(sectionAzDeg, dipDirDeg, dipAngDeg) {
  const sAz = ((sectionAzDeg % 360) * Math.PI) / 180;
  const dDir = ((dipDirDeg % 360) * Math.PI) / 180;
  const dAng = (Math.min(Math.max(dipAngDeg, 0), 90) * Math.PI) / 180;
  const delta = sAz - dDir;
  const cosDelta = Math.cos(delta);
  const tanApp = Math.tan(dAng) * cosDelta;
  const appDipDeg = (Math.atan(tanApp) * 180) / Math.PI;
  return {
    angle: Math.abs(appDipDeg),
    rawAngle: appDipDeg,
    slope: tanApp, // vertical elevation change per meter along section line
    directionStr: appDipDeg > 0.5 ? '→ B' : (appDipDeg < -0.5 ? '← A' : 'Horizontal')
  };
}

function getCompassQuadrant(deg) {
  deg = ((deg % 360) + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

function updateApparentDipDisplay() {
  const sAz = parseFloat(document.getElementById('az-input')?.value) || 0;
  const dDir = parseFloat(document.getElementById('dip-dir-input')?.value) || 45;
  const dAng = parseFloat(document.getElementById('dip-ang-input')?.value) || 45;
  sectionAzimuth = sAz;
  foliationDipDir = dDir;
  foliationDipAngle = dAng;
  const app = calcApparentDip(sAz, dDir, dAng);
  const badge = document.getElementById('app-dip-badge');
  if (badge) {
    badge.textContent = `App. Dip: ${app.angle.toFixed(1)}° ${app.directionStr}`;
  }
}

// Auto-detect azimuth from selected BHs (first→last after map sort)
function autoDetectAzimuth() {
  if (!currentProfileRows || currentProfileRows.length < 2) return;
  const az = detectBHTrendAzimuth(currentProfileRows);
  const input = document.getElementById('az-input');
  if (input) input.value = az;
  sectionAzimuth = az;
  updateApparentDipDisplay();
  const sorted = sortBoreholesByMapPosition(currentProfileRows);
  const infoEl = document.getElementById('az-offset-info');
  if (infoEl) {
    infoEl.textContent = `(${az.toFixed(1)}° — detected from ${sorted[0]['BH Name'] || 'first'} → ${sorted[sorted.length-1]['BH Name'] || 'last'} BH)`;
  }
}

// ── PROJECT BHs ONTO SECTION LINE ──────────────────────────────────────────
function projectBoreholes(rows, azDeg) {
  const azRad = (azDeg * Math.PI) / 180;
  const ux = Math.sin(azRad);   // Easting component
  const uy = Math.cos(azRad);   // Northing component

  let sumE = 0, sumN = 0, cnt = 0;
  rows.forEach(r => {
    const e = toNum(r['Easting']), n = toNum(r['Northing']);
    if (e !== null && n !== null) { sumE += e; sumN += n; cnt++; }
  });
  const oE = sumE / (cnt || 1);
  const oN = sumN / (cnt || 1);

  const tagged = rows.map(r => {
    const e = toNum(r['Easting']), n = toNum(r['Northing']);
    let chainage = 0, offset = 0;
    if (e !== null && n !== null) {
      const dE = e - oE, dN = n - oN;
      chainage = dE * ux + dN * uy;          // along section line (m)
      offset   = dE * uy - dN * ux;          // perpendicular (+ = right side)
    }
    return { row: r, chainage, offset };
  });

  tagged.sort((a, b) => a.chainage - b.chainage);
  const minC = tagged[0].chainage;
  tagged.forEach(t => t.chainage -= minC);
  return tagged; // [ { row, chainage, offset }, ... ]
}

function computeProjectedDistances(projectedBHs) {
  return projectedBHs.map(t => t.chainage);
}

// ── RENDER PLAN VIEW CARD INSIDE LEGEND ────────────────────────────────────
function renderPlanViewLegendCard(rows, distances, sectionAz, offsets, cardX, cardY, cardW, cardH) {
  const pts = rows.map((r, i) => {
    const e = toNum(r['Easting']), n = toNum(r['Northing']);
    const rawName = (r['BH Name'] || r['PointID'] || `BH${i+1}`).replace('BH-', '');
    const shortName = rawName.replace(/^(VD|BR|OP|CU)-\d+-\d+-/, '').replace(/^(VD|BR|OP|CU)-\d+-/, '');
    return { name: rawName, shortName: shortName || rawName, e, n, dist: distances[i], off: offsets ? offsets[i] : 0 };
  }).filter(p => p.e !== null && p.n !== null);

  if (pts.length < 2) return '';

  const azRad = (sectionAz * Math.PI) / 180;
  const uE = Math.sin(azRad);
  const uN = Math.cos(azRad);

  const rawMinE = Math.min(...pts.map(p => p.e));
  const rawMaxE = Math.max(...pts.map(p => p.e));
  const rawMinN = Math.min(...pts.map(p => p.n));
  const rawMaxN = Math.max(...pts.map(p => p.n));
  const midE = (rawMinE + rawMaxE) / 2;
  const midN = (rawMinN + rawMaxN) / 2;

  // Compute projection range along section azimuth
  let minProj = Infinity, maxProj = -Infinity;
  pts.forEach(p => {
    const proj = (p.e - midE) * uE + (p.n - midN) * uN;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  });
  const projSpan = Math.max(maxProj - minProj, 12);
  // Extend baseline ends comfortably beyond first and last boreholes so A and B badges never collide
  const extMeters = Math.max(projSpan * 0.18, 6);
  const startProj = minProj - extMeters;
  const endProj   = maxProj + extMeters;

  const lineStartE = midE + uE * startProj;
  const lineStartN = midN + uN * startProj;
  const lineEndE   = midE + uE * endProj;
  const lineEndN   = midN + uN * endProj;

  // Bounding box encompassing all borehole points AND endpoint badges A & B
  const allE = [...pts.map(p => p.e), lineStartE, lineEndE];
  const allN = [...pts.map(p => p.n), lineStartN, lineEndN];
  const minE = Math.min(...allE);
  const maxE = Math.max(...allE);
  const minN = Math.min(...allN);
  const maxN = Math.max(...allN);
  const spanE = Math.max(maxE - minE, 10);
  const spanN = Math.max(maxN - minN, 10);

  const padX = 18, padY = 14;
  const innerW = cardW - padX * 2;
  const innerH = cardH - 30 - padY * 2;
  // Zoom in significantly (0.92 of available inner area) for superior visibility
  const scale = Math.min(innerW / spanE, innerH / spanN) * 0.92;

  const mapCX = cardX + cardW / 2;
  const mapCY = cardY + 26 + (cardH - 26) / 2;

  function toMapX(e) { return mapCX + (e - midE) * scale; }
  function toMapY(n) { return mapCY - (n - midN) * scale; }

  let svg = `<!-- Top Card 4: Plan View Location Map -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="#faf9f6" stroke="#e0dbce" stroke-width="1" rx="5"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="24" fill="#eeebe2" stroke="#e0dbce" stroke-width="1" rx="5"/>
  <rect x="${cardX}" y="${cardY + 18}" width="${cardW}" height="6" fill="#eeebe2" stroke="none"/>
  <text x="${cardX + 8}" y="${cardY + 16}" font-size="8.5" font-weight="700" fill="#2c3e50" letter-spacing="0.01em">PLAN VIEW (A — B)</text>
  <text x="${cardX + cardW - 8}" y="${cardY + 16}" font-size="8.5" font-weight="700" fill="#2563eb" text-anchor="end">Az: ${sectionAz.toFixed(1)}°</text>
  `;

  // Mini True North arrow
  const nX = cardX + cardW - 16, nY = cardY + 38;
  svg += `
    <g transform="translate(${nX}, ${nY})">
      <circle cx="0" cy="0" r="9" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.7"/>
      <polygon points="0,-7 2.2,0 0,-1.4 -2.2,0" fill="#dc2626"/>
      <polygon points="0,7 2.2,0 0,1.4 -2.2,0" fill="#64748b"/>
      <text x="0" y="-8" font-size="6.5" font-weight="800" fill="#dc2626" text-anchor="middle">N</text>
    </g>
  `;

  // Baseline A - B with high-visibility white background halo + bold blue dashed line
  const ax1 = toMapX(lineStartE), ay1 = toMapY(lineStartN);
  const ax2 = toMapX(lineEndE), ay2 = toMapY(lineEndN);

  svg += `
    <line x1="${ax1.toFixed(1)}" y1="${ay1.toFixed(1)}" x2="${ax2.toFixed(1)}" y2="${ay2.toFixed(1)}" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round"/>
    <line x1="${ax1.toFixed(1)}" y1="${ay1.toFixed(1)}" x2="${ax2.toFixed(1)}" y2="${ay2.toFixed(1)}" stroke="#1d4ed8" stroke-width="2.2" stroke-dasharray="6,3"/>
    
    <!-- Endpoint A Badge -->
    <circle cx="${ax1.toFixed(1)}" cy="${ay1.toFixed(1)}" r="6" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5"/>
    <text x="${ax1.toFixed(1)}" y="${(ay1 + 3).toFixed(1)}" font-size="8" font-weight="900" fill="#ffffff" text-anchor="middle">A</text>

    <!-- Endpoint B Badge -->
    <circle cx="${ax2.toFixed(1)}" cy="${ay2.toFixed(1)}" r="6" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>
    <text x="${ax2.toFixed(1)}" y="${(ay2 + 3).toFixed(1)}" font-size="8" font-weight="900" fill="#ffffff" text-anchor="middle">B</text>
  `;

  // Screen perpendicular unit vector for clean label offsets
  const bdx = ax2 - ax1, bdy = ay2 - ay1;
  const blen = Math.hypot(bdx, bdy) || 1;
  const bnx = -bdy / blen, bny = bdx / blen;

  // Process all points and assign to Left or Right side
  const leftSide = [];
  const rightSide = [];

  pts.forEach((p, pIdx) => {
    const px = toMapX(p.e);
    const py = toMapY(p.n);
    const vE = p.e - lineStartE;
    const vN = p.n - lineStartN;
    const projDist = vE * uE + vN * uN;
    const projE = lineStartE + uE * projDist;
    const projN = lineStartN + uN * projDist;
    const projX = toMapX(projE);
    const projY = toMapY(projN);

    // Cross product / signed perpendicular distance from baseline
    const perpDist = (p.e - lineStartE) * uN - (p.n - lineStartN) * uE;

    // Projection tie line
    if (Math.hypot(px - projX, py - projY) > 1.5) {
      svg += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${projX.toFixed(1)}" y2="${projY.toFixed(1)}" stroke="#64748b" stroke-width="1" stroke-dasharray="2,1.5"/>`;
    }

    // Determine side:
    // If point has negative perpDist (or is left-labeled like L-), assign left side
    // If point has positive perpDist (or is right-labeled like R-), assign right side
    let side = 0;
    if (perpDist < -0.15) {
      side = -1; // Left side
    } else if (perpDist > 0.15) {
      side = 1;  // Right side
    } else if (/[-_]L[-_]?\d+/i.test(p.name)) {
      side = -1;
    } else if (/[-_]R[-_]?\d+/i.test(p.name)) {
      side = 1;
    } else {
      side = (pIdx % 2 === 0) ? -1 : 1;
    }

    const item = { p, pIdx, px, py, side, origY: py, y: py };
    if (side === -1) leftSide.push(item);
    else rightSide.push(item);
  });

  // Vertical anti-collision relaxation function for a side
  function relaxSide(sideList, side) {
    if (!sideList.length) return;
    // Sort top to bottom by screen Y
    sideList.sort((a, b) => a.y - b.y);

    const minGap = 13; // Minimum vertical gap between label baselines
    for (let iter = 0; iter < 12; iter++) {
      for (let k = 0; k < sideList.length - 1; k++) {
        const cur = sideList[k];
        const next = sideList[k + 1];
        const overlap = (cur.y + minGap) - next.y;
        if (overlap > 0) {
          cur.y -= overlap * 0.55;
          next.y += overlap * 0.55;
        }
      }
    }

    // Clamp inside map card bounds
    const minY = cardY + 36, maxY = cardY + cardH - 12;
    sideList.forEach(it => {
      if (it.y < minY) it.y = minY;
      if (it.y > maxY) it.y = maxY;
    });

    // Final forward pass to guarantee minGap
    for (let k = 0; k < sideList.length - 1; k++) {
      if (sideList[k + 1].y < sideList[k].y + minGap) {
        sideList[k + 1].y = sideList[k].y + minGap;
      }
    }
  }

  relaxSide(leftSide, -1);
  relaxSide(rightSide, 1);

  // Render all points and labels
  [...leftSide, ...rightSide].forEach(it => {
    const { p, px, py, side, y } = it;
    
    // Label placement
    const textAnchor = (side < 0) ? 'end' : 'start';
    const labelOffsetX = (side < 0) ? -8 : 8;
    const tx = px + labelOffsetX;
    const ty = y + 2.5;

    // If vertically displaced by more than 3px, draw crisp leader tick
    if (Math.abs(y - py) > 3) {
      const leaderX = (side < 0) ? tx + 2 : tx - 2;
      svg += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${leaderX.toFixed(1)}" y2="${(ty - 2.5).toFixed(1)}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="1.5,1.5"/>`;
    }

    // Label with white halo
    svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="7.5" font-weight="700" fill="#0f172a" text-anchor="${textAnchor}" style="paint-order: stroke fill; stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round;">${p.shortName}</text>`;

    // Borehole circle point (rendered on top)
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="#0f172a" stroke="#ffffff" stroke-width="1.2"/>`;
  });

  return svg;
}

// ── 0% TO 100% GEOTECHNICAL SYNTHESIS PROGRESS CARD ─────────────────────
function renderProgressCard(percent, stageText) {
  return `
    <div id="profile-progress-modal-wrapper" style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:460px; padding:40px 20px; background:#f8fafc; border-radius:12px;">
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.07), 0 8px 10px -6px rgba(0,0,0,0.05); padding:36px 40px; width:100%; max-width:540px; text-align:center;">
        
        <div style="display:inline-flex; align-items:center; justify-content:center; width:54px; height:54px; background:linear-gradient(135deg, #eff6ff, #dbeafe); border-radius:14px; margin-bottom:18px; border:1px solid #bfdbfe; font-size:26px;">
          ⚙️
        </div>

        <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:6px; letter-spacing:-0.01em;">
          Synthesizing 2D Geological Cross-Section
        </div>
        
        <div id="profile-progress-status" style="font-size:12.5px; font-weight:600; color:#64748b; min-height:22px; margin-bottom:20px;">
          ${stageText}
        </div>

        <!-- Progress Bar Container -->
        <div style="background:#f1f5f9; border-radius:999px; height:12px; overflow:hidden; border:1px solid #cbd5e1; padding:2px; margin-bottom:12px; position:relative;">
          <div id="profile-progress-bar" style="width:${percent}%; height:100%; border-radius:999px; background:linear-gradient(90deg, #3b82f6 0%, #2563eb 50%, #059669 100%); transition:width 0.22s cubic-bezier(0.4, 0, 0.2, 1); box-shadow:0 0 10px rgba(37,99,235,0.35);"></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; font-weight:700; color:#475569;">
          <span>Geotechnical Synthesis</span>
          <span id="profile-progress-pct" style="color:#2563eb; font-weight:800;">${percent}%</span>
        </div>

        <!-- Geotechnical Pipeline Steps Checklist -->
        <div style="margin-top:24px; padding-top:16px; border-top:1px dashed #e2e8f0; display:flex; justify-content:space-around; font-size:10.5px; font-weight:600; color:#94a3b8;">
          <span id="step-chk-1" style="color:${percent >= 20 ? '#059669' : '#94a3b8'}">✓ 3D Alignment</span>
          <span id="step-chk-2" style="color:${percent >= 50 ? '#059669' : '#94a3b8'}">✓ BS 5930 Strata</span>
          <span id="step-chk-3" style="color:${percent >= 75 ? '#059669' : '#94a3b8'}">✓ SPT &amp; RQD</span>
          <span id="step-chk-4" style="color:${percent >= 100 ? '#059669' : '#94a3b8'}">✓ Vector CAD</span>
        </div>

      </div>
    </div>
  `;
}

function runProfileSynthesisWithProgress(onDone) {
  const container = document.getElementById('profile-modal-body');
  if (!container) return;

  const stages = [
    { pct: 20, text: '📍 Calculating borehole spatial chainages and 3D terrain profile...' },
    { pct: 50, text: '📐 Projecting BS 5930 stratigraphy and continuous weathering envelopes...' },
    { pct: 75, text: '🔬 Assembling SPT N-value resistance bars and dual RQD/CR tracks...' },
    { pct: 92, text: '🎨 Synthesizing vector CAD lithological patterns and foliation apparent dips...' },
    { pct: 100, text: '✨ Engineering geological cross-section synthesized successfully!' }
  ];

  container.innerHTML = renderProgressCard(0, 'Initializing geotechnical synthesis pipeline...');

  let stepIdx = 0;

  function advanceStage() {
    if (stepIdx < stages.length) {
      const cur = stages[stepIdx];
      const bar = document.getElementById('profile-progress-bar');
      const pctEl = document.getElementById('profile-progress-pct');
      const statusEl = document.getElementById('profile-progress-status');
      const chk1 = document.getElementById('step-chk-1');
      const chk2 = document.getElementById('step-chk-2');
      const chk3 = document.getElementById('step-chk-3');
      const chk4 = document.getElementById('step-chk-4');

      if (bar) bar.style.width = cur.pct + '%';
      if (pctEl) pctEl.textContent = cur.pct + '%';
      if (statusEl) statusEl.textContent = cur.text;
      if (chk1 && cur.pct >= 20) chk1.style.color = '#059669';
      if (chk2 && cur.pct >= 50) chk2.style.color = '#059669';
      if (chk3 && cur.pct >= 75) chk3.style.color = '#059669';
      if (chk4 && cur.pct >= 100) chk4.style.color = '#059669';

      stepIdx++;
      setTimeout(advanceStage, 60);
    } else {
      setTimeout(() => {
        try {
          recreateProfileDirect();
        } catch(err) {
          console.error('Error generating profile SVG:', err);
          container.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #b91c1c;">
              <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
              <div style="font-weight: 800; font-size: 16px; margin-bottom: 6px;">Error Synthesizing Cross-Section</div>
              <div style="font-size: 12px; color: #64748b; margin-bottom: 16px;">${err.message || 'An unexpected error occurred.'}</div>
              <button onclick="runProfileSynthesisWithProgress()" style="padding: 6px 14px; background: #2563eb; color: #fff; border: none; border-radius: 4px; font-weight: 700; cursor: pointer;">🔄 Retry</button>
            </div>
          `;
        }
        if (onDone) onDone();
      }, 70);
    }
  }

  setTimeout(advanceStage, 30);
}

function recreateProfileDirect() {
  if (!currentProfileRows || !currentProfileRows.length) return;
  sectionAzimuth = parseFloat(document.getElementById('az-input')?.value) || 0;
  foliationDipDir = parseFloat(document.getElementById('dip-dir-input')?.value) || 45;
  foliationDipAngle = parseFloat(document.getElementById('dip-ang-input')?.value) || 45;
  const sectionTitle = (document.getElementById('section-title-input')?.value || '').trim();
  updateApparentDipDisplay();

  let orderedRows, distances, offsets = null;
  if (sectionMethod === 'projection') {
    const projected = projectBoreholes(currentProfileRows, sectionAzimuth);
    orderedRows = projected.map(t => t.row);
    distances   = computeProjectedDistances(projected);
    offsets     = projected.map(t => t.offset);
    const maxOff = Math.max(...offsets.map(o => Math.abs(o)));
    const infoEl = document.getElementById('az-offset-info');
    if (infoEl) infoEl.textContent =
      `Max offset from line: ${maxOff.toFixed(1)} m`;
  } else {
    orderedRows = sortBoreholesByMapPosition(currentProfileRows);
    distances   = null;
  }

  const projectMeta = {
    sectionMethod,
    sectionAzimuth,
    sectionTitle,
    dipDirection: foliationDipDir,
    dipAngle: foliationDipAngle,
    offsets,
    isProjection: sectionMethod === 'projection'
  };

  const svg = buildProfileSvg(orderedRows, profileOptions, distances, projectMeta);
  const body = document.getElementById('profile-modal-body');
  if (body) {
    body.innerHTML = svg;
  }
}

// ── RECREATE BUTTON ────────────────────────────────────────────────────────
function recreateProfile() {
  runProfileSynthesisWithProgress();
}

function showProfileModal(rows){
  if (!rows || !rows.length) {
    if (typeof showToast === 'function') {
      showToast('Please select at least 2 boreholes on the map to generate a 2D cross-section profile.', 'warning');
    } else {
      alert('Please select at least 2 boreholes on the map to generate a 2D cross-section profile.');
    }
    return;
  }

  currentProfileRows = rows;
  const rockEl = document.getElementById('modal-opt-rocklithology');
  const sptEl  = document.getElementById('modal-opt-spt');
  const rqdEl  = document.getElementById('modal-opt-rqd');
  const gwtEl  = document.getElementById('modal-opt-gwt');
  const weaEl  = document.getElementById('modal-opt-weathering');
  const rghEl  = document.getElementById('modal-opt-roughground');
  const rsoEl  = document.getElementById('modal-opt-roughsoil');
  const rckEl  = document.getElementById('modal-opt-roughrockhead');
  if (rockEl) rockEl.checked = profileOptions.showRockLithology;
  if (sptEl)  sptEl.checked  = profileOptions.showSPT;
  if (rqdEl)  rqdEl.checked  = profileOptions.showRQD;
  if (gwtEl)  gwtEl.checked  = profileOptions.showGWT;
  if (weaEl)  weaEl.checked  = profileOptions.showWeathering;
  if (rghEl)  rghEl.checked  = profileOptions.showRoughGround || false;
  if (rsoEl)  rsoEl.checked  = profileOptions.showRoughSoil || false;
  if (rckEl)  rckEl.checked  = profileOptions.showRoughRockhead || false;

  const seqRadio = document.querySelector('input[name="section-method"][value="sequential"]');
  if (seqRadio) { seqRadio.checked = true; onSectionMethodChange('sequential'); }

  const titleInput = document.getElementById('section-title-input');
  if (titleInput && (!titleInput.value || titleInput.value === 'ENGINEERING GEOLOGICAL CROSS-SECTION A — B' || titleInput.getAttribute('data-auto-generated') === 'true')) {
    const firstBH = (rows[0]['BH Name'] || rows[0]['PointID'] || 'BH 1').trim();
    const lastBH  = (rows[rows.length - 1]['BH Name'] || rows[rows.length - 1]['PointID'] || `BH ${rows.length}`).trim();
    titleInput.value = `ENGINEERING GEOLOGICAL CROSS-SECTION A — B (${firstBH} to ${lastBH})`;
    titleInput.setAttribute('data-auto-generated', 'true');
  }

  autoDetectAzimuth();

  // Instantly open modal backdrop so the user gets immediate feedback
  const backdrop = document.getElementById('profile-modal-backdrop');
  if (backdrop) backdrop.classList.add('open');

  // Trigger 0% to 100% progress animation and render
  runProfileSynthesisWithProgress();
}

function syncProfileOption(key, val) {
  profileOptions[key] = val;
  const modalEl = document.getElementById('modal-opt-' + key.replace('show', '').toLowerCase());
  const sideEl  = document.getElementById('sidebar-opt-' + key.replace('show', '').toLowerCase());
  if (modalEl) modalEl.checked = val;
  if (sideEl)  sideEl.checked  = val;
  if (currentProfileRows && document.getElementById('profile-modal-backdrop')?.classList.contains('open')) {
    recreateProfileDirect();
  }
}

function toggleProfileOption(key, val) {
  syncProfileOption(key, val);
}

document.getElementById('profile-close-btn').addEventListener('click', () => {
  document.getElementById('profile-modal-backdrop').classList.remove('open');
});
document.getElementById('profile-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'profile-modal-backdrop'){
    document.getElementById('profile-modal-backdrop').classList.remove('open');
  }
});

function downloadProfilePNG() {
  const svgEl = document.querySelector('#profile-modal-body svg');
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = svgEl.viewBox.baseVal.width * 2;
    canvas.height = svgEl.viewBox.baseVal.height * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'CEP3_Borehole_Profile_' + new Date().toISOString().slice(0,10) + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };
  img.src = url;
}

function downloadProfileSVG() {
  const svgEl = document.querySelector('#profile-modal-body svg');
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(svgBlob);
  a.download = 'CEP3_Borehole_Profile_' + new Date().toISOString().slice(0,10) + '.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadProfilePDF(paperSize = 'a4') {
  const svgEl = document.querySelector('#profile-modal-body svg');
  if (!svgEl) return;
  
  const format = paperSize === 'a3' ? 'a3' : 'a4';
  const pdfWidth = paperSize === 'a3' ? 420 : 297;  // mm
  const pdfHeight = paperSize === 'a3' ? 297 : 210; // mm

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = paperSize === 'a3' ? 3.5 : 2.5;
    canvas.width = svgEl.viewBox.baseVal.width * scale;
    canvas.height = svgEl.viewBox.baseVal.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const imgData = canvas.toDataURL('image/png', 1.0);
    
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF generator library loading... Please try again in a moment.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: format
    });

    const margin = 8;
    const availW = pdfWidth - (margin * 2);
    const availH = pdfHeight - (margin * 2);

    const imgAspect = canvas.width / canvas.height;
    let renderW = availW;
    let renderH = renderW / imgAspect;

    if (renderH > availH) {
      renderH = availH;
      renderW = renderH * imgAspect;
    }

    const xPos = margin + (availW - renderW) / 2;
    const yPos = margin + (availH - renderH) / 2;

    doc.addImage(imgData, 'PNG', xPos, yPos, renderW, renderH);
    doc.save(`CEP3_Geology_Profile_${format.toUpperCase()}_` + new Date().toISOString().slice(0,10) + '.pdf');
  };
  img.src = url;
}

/* ============================================================
   AUTOCAD / CIVIL 3D DXF VECTOR EXPORTER STUDIO
   ============================================================ */

