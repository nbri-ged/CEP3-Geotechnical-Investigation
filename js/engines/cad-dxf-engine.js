/* ============================================================
   NBRI GEOTECHNICAL GIS — AUTOCAD DXF VECTOR CAD ENGINE (cad-dxf-engine.js)
   ============================================================ */

function openDxfExportModal(customRows) {
  let rows = customRows;
  if (!rows || !rows.length) {
    rows = currentProfileRows;
  }
  if (!rows || !rows.length) {
    if (typeof profileSelectedIdx !== 'undefined' && profileSelectedIdx && profileSelectedIdx.length >= 2 && typeof allRows !== 'undefined') {
      rows = profileSelectedIdx.map(rowIdx => allRows[rowIdx]).filter(Boolean);
    }
  }
  if (!rows || !rows.length) {
    if (typeof allRows !== 'undefined' && allRows && allRows.length >= 2) {
      rows = allRows.slice(0, 10);
    }
  }
  if (!rows || rows.length < 2) {
    if (typeof showAppToast === 'function') {
      showAppToast('CAD DXF Export', 'Please select at least 2 boreholes on the map or generate a profile first before exporting to CAD DXF.', 'warning');
    } else {
      alert('Please select at least 2 boreholes on the map or generate a profile first before exporting to CAD DXF.');
    }
    return;
  }

  currentProfileRows = rows;
  const backdrop = document.getElementById('dxf-modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('open');
  }
}

function closeDxfModal() {
  const backdrop = document.getElementById('dxf-modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function exportProfileToDXF(customRows) {
  openDxfExportModal(customRows);
}

function executeDxfExport() {
  const options = {
    optGround: document.getElementById('dxf-opt-ground')?.checked ?? true,
    optRockhead: document.getElementById('dxf-opt-rockhead')?.checked ?? true,
    optSoilLines: document.getElementById('dxf-opt-soil-lines')?.checked ?? true,
    optRockLines: document.getElementById('dxf-opt-rock-lines')?.checked ?? true,
    optOriginLines: document.getElementById('dxf-opt-origin-lines')?.checked ?? true,
    optGWT: document.getElementById('dxf-opt-gwt')?.checked ?? true,
    optSoilHatches: document.getElementById('dxf-opt-soil-hatches')?.checked ?? true,
    optRockHatches: document.getElementById('dxf-opt-rock-hatches')?.checked ?? true,
    optTrueColor: document.getElementById('dxf-opt-truecolor')?.checked ?? true,
    optCwrHatches: document.getElementById('dxf-opt-cwr-hatches')?.checked ?? true,
    optSPT: document.getElementById('dxf-opt-spt')?.checked ?? true,
    optRQD: document.getElementById('dxf-opt-rqd')?.checked ?? true,
    optPillars: document.getElementById('dxf-opt-pillars')?.checked ?? true,
    optGrid: document.getElementById('dxf-opt-grid')?.checked ?? true,
    optTitle: document.getElementById('dxf-opt-titleblock')?.checked ?? true,
    scaleChoice: document.querySelector('input[name="dxf-scale-choice"]:checked')?.value || '1'
  };

  closeDxfModal();
  generateAndDownloadDxf(currentProfileRows, options);
}

function hexToDxfTrueColor(hex) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  if (clean.length < 6) return null;
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return (r << 16) + (g << 8) + b;
}

function generateDxfString(customRows, options = {}) {
  let rows = customRows;
  if (!rows || !rows.length) rows = currentProfileRows;
  if (!rows || !rows.length) {
    if (typeof profileSelectedIdx !== 'undefined' && profileSelectedIdx && profileSelectedIdx.length >= 2 && typeof allRows !== 'undefined') {
      rows = profileSelectedIdx.map(rowIdx => allRows[rowIdx]).filter(Boolean);
    }
  }
  if (!rows || rows.length < 2) return null;
  if (!rows || rows.length < 2) {
    if (typeof showAppToast === 'function') {
      showAppToast('DXF Export Error', 'Insufficient boreholes to generate cross-section CAD drawing.', 'error');
    }
    return;
  }

  const azInput = parseFloat(document.getElementById('az-input')?.value) || (typeof sectionAzimuth !== 'undefined' ? sectionAzimuth : 45);
  const dipDir = parseFloat(document.getElementById('dip-dir-input')?.value) || (typeof foliationDipDir !== 'undefined' ? foliationDipDir : 45);
  const dipAng = parseFloat(document.getElementById('dip-ang-input')?.value) || (typeof foliationDipAngle !== 'undefined' ? foliationDipAngle : 45);
  const secTitle = (document.getElementById('section-title-input')?.value || 'ENGINEERING GEOLOGICAL CROSS-SECTION A — B').trim();

  let sorted, distances;
  if (typeof sectionMethod !== 'undefined' && sectionMethod === 'projection' && typeof projectBoreholes === 'function') {
    const projected = projectBoreholes(rows, azInput);
    sorted = projected.map(t => t.row);
    distances = computeProjectedDistances(projected);
  } else {
    sorted = (typeof sortBoreholesByMapPosition === 'function') ? sortBoreholesByMapPosition(rows) : rows.slice();
    distances = [0];
    for (let i = 1; i < sorted.length; i++) {
      const e1 = toNum(sorted[i-1]['Easting']), n1 = toNum(sorted[i-1]['Northing']);
      const e2 = toNum(sorted[i]['Easting']), n2 = toNum(sorted[i]['Northing']);
      const d = (e1 !== null && n1 !== null && e2 !== null && n2 !== null)
        ? Math.sqrt((e2-e1)**2 + (n2-n1)**2) : 50;
      distances.push(distances[i-1] + Math.max(d, 1));
    }
  }

  const totalDist = distances[distances.length - 1];
  const levelsArr = sorted.map(computeBHLevels);
  const layersArr = sorted.map(r => getBHLayers(r) || null);

  // Rockhead & Termination Level calculations
  const effectiveRockLevel = levelsArr.map((lv, i) => {
    const layers = layersArr[i];
    if (layers && layers.length && lv.elevation !== null && !isNaN(lv.elevation)) {
      const rockLayer = layers.find(l => getGraphicInfo(l.graphic).isRock);
      if (rockLayer) return lv.elevation - rockLayer.depth;
    }
    return (lv.rockLevel !== null && !isNaN(lv.rockLevel)) ? lv.rockLevel : ((lv.elevation !== null && !isNaN(lv.elevation)) ? lv.elevation - (lv.overburden || 5) : null);
  });

  const effectiveTermLevel = levelsArr.map((lv, i) => {
    const layers = layersArr[i];
    if (layers && layers.length && lv.elevation !== null && !isNaN(lv.elevation)) {
      const maxBottom = Math.max(...layers.map(l => l.bottom));
      return lv.elevation - maxBottom;
    }
    return (lv.termLevel !== null && !isNaN(lv.termLevel)) ? lv.termLevel : ((lv.elevation !== null && !isNaN(lv.elevation)) ? lv.elevation - (lv.termDepth || 15) : null);
  });

  // Elevation range
  let maxElev = -Infinity, minElev = Infinity;
  levelsArr.forEach((lv, i) => {
    if (lv.elevation !== null && !isNaN(lv.elevation)) maxElev = Math.max(maxElev, lv.elevation);
    if (effectiveTermLevel[i] !== null && effectiveTermLevel[i] !== undefined && !isNaN(effectiveTermLevel[i])) minElev = Math.min(minElev, effectiveTermLevel[i]);
    if (effectiveRockLevel[i] !== null && effectiveRockLevel[i] !== undefined && !isNaN(effectiveRockLevel[i])) minElev = Math.min(minElev, effectiveRockLevel[i]);
  });
  if (!isFinite(maxElev)) maxElev = 120;
  if (!isFinite(minElev)) minElev = 70;
  maxElev = Math.ceil(maxElev + 4);
  minElev = Math.floor(minElev - 4);
  const elevRange = Math.max(maxElev - minElev, 10);

  // Vertical scale
  const vScale = options.scaleChoice === 've' ? 5.0 : 1.0;
  function cadX(d) { return d; }
  function cadY(z) { return z * vScale; }

  // Apparent dip calculation
  const appDip = calcApparentDip(azInput, dipDir, dipAng);
  const dirSign = appDip.directionStr === '← A' ? -1 : (appDip.directionStr === '→ B' ? 1 : 0);
  const dipSlope = Math.tan((appDip.angle * Math.PI) / 180) * dirSign;

  // Check for Human Geological Overrides
  const secIdentity = (typeof getSectionIdentityKey === 'function') ? getSectionIdentityKey(sorted) : 'default_section';
  const secOverride = (typeof profileOverrides !== 'undefined' && profileOverrides) ? profileOverrides[secIdentity] : null;

  let groundPts = sorted.map((r, i) => ({ x: distances[i], y: (levelsArr[i].elevation !== null && !isNaN(levelsArr[i].elevation)) ? levelsArr[i].elevation : maxElev }));
  let rockPts = sorted.map((r, i) => ({ x: distances[i], y: (effectiveRockLevel[i] !== null && !isNaN(effectiveRockLevel[i])) ? effectiveRockLevel[i] : groundPts[i].y - 5 }));
  
  if (secOverride?.boundaries?.ground?.isOverridden && secOverride.boundaries.ground.knots?.length) {
    groundPts = secOverride.boundaries.ground.knots.map(k => ({ x: k.d, y: k.z }));
  }
  if (secOverride?.boundaries?.rockhead?.isOverridden && secOverride.boundaries.rockhead.knots?.length) {
    rockPts = secOverride.boundaries.rockhead.knots.map(k => ({ x: k.d, y: k.z }));
  }

  const gwDepthPts = [];
  sorted.forEach((r, i) => {
    const lv = levelsArr[i];
    const zG = (lv.elevation !== null && !isNaN(lv.elevation)) ? lv.elevation : maxElev;
    if (lv.gwtLevel !== null && lv.gwtLevel !== undefined && !isNaN(lv.gwtLevel)) {
      gwDepthPts.push({ x: distances[i], y: Math.max(zG - lv.gwtLevel, 0.1) });
    } else if (lv.gwtDepth !== null && lv.gwtDepth !== undefined && !isNaN(lv.gwtDepth)) {
      gwDepthPts.push({ x: distances[i], y: Math.max(lv.gwtDepth, 0.1) });
    }
  });

  function getZGround(d) { return interpolateSpline(groundPts, d); }
  function getZRock(d) { return interpolateSpline(rockPts, d); }
  function getZWater(d) {
    if (!gwDepthPts.length) return null;
    const depth = interpolateSpline(gwDepthPts, d);
    return getZGround(d) - depth;
  }

  // ── TWO-TIER HIERARCHICAL STRATIGRAPHIC SOIL MODEL FOR DXF ──
  const alluvBaseDepths = sorted.map((r, i) => {
    const lys = layersArr[i];
    if (!lys || !lys.length) return 0;
    let maxAlluv = 0;
    lys.forEach(l => {
      if (!l.isRockBlock && !l.isBoulder) {
        const fam = originFamilyOf(l.origin);
        if (fam === 'alluvium' || fam === 'colluvium' || fam === 'made_ground') {
          if (l.bottom > maxAlluv) maxAlluv = l.bottom;
        }
      }
    });
    return maxAlluv;
  });

  const alluvBaseLevels = sorted.map((r, i) => {
    const lv = levelsArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const dAlluv = alluvBaseDepths[i];
    if (dAlluv <= 0.05) return zG;
    return Math.min(Math.max(zG - dAlluv, zR), zG);
  });

  const alluvUnitKeySet = new Set();
  const resUnitKeySet = new Set();
  const soilUnitMeta = {};

  sorted.forEach((r, i) => {
    const lys = layersArr[i];
    if (!lys) return;
    lys.forEach(l => {
      if (!l.isRockBlock && !l.isBoulder) {
        const fam = originFamilyOf(l.origin);
        const key = fam + '|' + l.graphic;
        soilUnitMeta[key] = {
          graphic: l.graphic,
          origin: l.origin,
          originFamily: fam,
          description: l.description
        };
        if (fam === 'alluvium' || fam === 'colluvium' || fam === 'made_ground') {
          alluvUnitKeySet.add(key);
        } else {
          resUnitKeySet.add(key);
        }
      }
    });
  });

  const alluvialMasterUnits = Array.from(alluvUnitKeySet).sort((a, b) => {
    return originFamilyStackPriority(soilUnitMeta[a].originFamily) - originFamilyStackPriority(soilUnitMeta[b].originFamily);
  });

  const residualMasterUnits = Array.from(resUnitKeySet).sort((a, b) => {
    return originFamilyStackPriority(soilUnitMeta[a].originFamily) - originFamilyStackPriority(soilUnitMeta[b].originFamily);
  });

  if (residualMasterUnits.length === 0 && alluvialMasterUnits.length === 0) {
    const key = 'unknown|Overburden (soil)';
    residualMasterUnits.push(key);
    soilUnitMeta[key] = { graphic: 'Overburden (soil)', origin: '', originFamily: 'unknown', description: 'Overburden soil' };
  }

  const masterSoilUnits = [...alluvialMasterUnits, ...residualMasterUnits];
  const K_alluv = alluvialMasterUnits.length;
  const K_res = residualMasterUnits.length;

  // Intra-Alluvial Cumulative Boundaries
  const bhAlluvUnitPresent = [];
  const bhAlluvCumBoundaries = sorted.map((r, i) => {
    const lv = levelsArr[i];
    const lys = layersArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const dAlluv = alluvBaseDepths[i];
    const alluvThick = Math.max(dAlluv, 0.05);

    const present = new Array(K_alluv).fill(false);
    const unitMap = {};

    if (K_alluv > 0 && lys) {
      lys.forEach(l => {
        if (!l.isRockBlock && !l.isBoulder) {
          const fam = originFamilyOf(l.origin);
          if (fam === 'alluvium' || fam === 'colluvium' || fam === 'made_ground') {
            const key = fam + '|' + l.graphic;
            const uIdx = alluvialMasterUnits.indexOf(key);
            if (uIdx >= 0) {
              present[uIdx] = true;
              const fTop = Math.min(Math.max(l.depth / alluvThick, 0.0), 1.0);
              const fBot = Math.min(Math.max(l.bottom / alluvThick, 0.0), 1.0);
              unitMap[key] = { fTop, fBot };
            }
          }
        }
      });
    }
    bhAlluvUnitPresent.push(present);

    const C = new Array(K_alluv + 1).fill(0);
    let cursor = 0.0;
    alluvialMasterUnits.forEach((u, uIdx) => {
      if (unitMap[u]) {
        const fTop = Math.max(unitMap[u].fTop, cursor);
        const fBot = Math.max(unitMap[u].fBot, fTop);
        C[uIdx] = fTop;
        C[uIdx + 1] = fBot;
        cursor = fBot;
      } else {
        C[uIdx] = cursor;
        C[uIdx + 1] = cursor;
      }
    });
    C[K_alluv] = 1.0;
    for (let k = 1; k <= K_alluv; k++) {
      if (C[k] < C[k - 1]) C[k] = C[k - 1];
    }
    return C;
  });

  // Intra-Residual Cumulative Boundaries
  const bhResUnitPresent = [];
  const bhResCumBoundaries = sorted.map((r, i) => {
    const lv = levelsArr[i];
    const lys = layersArr[i];
    const zG = lv.elevation !== null ? lv.elevation : maxElev;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const dAlluv = alluvBaseDepths[i];
    const nonRock = (lys || []).filter(l => !l.isRockBlock && !l.isBoulder);
    const totalSoil = nonRock.length ? Math.max(...nonRock.map(l => l.bottom)) : Math.max(zG - zR, 0.1);
    const resThick = Math.max(totalSoil - dAlluv, 0.1);

    const present = new Array(K_res).fill(false);
    const unitMap = {};

    if (K_res > 0 && lys) {
      lys.forEach(l => {
        if (!l.isRockBlock && !l.isBoulder) {
          const fam = originFamilyOf(l.origin);
          if (fam === 'residual' || fam === 'unknown') {
            const key = fam + '|' + l.graphic;
            const uIdx = residualMasterUnits.indexOf(key);
            if (uIdx >= 0) {
              present[uIdx] = true;
              const topInRes = Math.max(l.depth - dAlluv, 0);
              const botInRes = Math.max(l.bottom - dAlluv, topInRes);
              const fTop = Math.min(Math.max(topInRes / resThick, 0.0), 1.0);
              const fBot = Math.min(Math.max(botInRes / resThick, 0.0), 1.0);
              unitMap[key] = { fTop, fBot };
            }
          }
        }
      });
    }
    bhResUnitPresent.push(present);

    const C = new Array(K_res + 1).fill(0);
    let cursor = 0.0;
    residualMasterUnits.forEach((u, uIdx) => {
      if (unitMap[u]) {
        const fTop = Math.max(unitMap[u].fTop, cursor);
        const fBot = Math.max(unitMap[u].fBot, fTop);
        C[uIdx] = fTop;
        C[uIdx + 1] = fBot;
        cursor = fBot;
      } else {
        C[uIdx] = cursor;
        C[uIdx + 1] = cursor;
      }
    });
    C[K_res] = 1.0;
    for (let k = 1; k <= K_res; k++) {
      if (C[k] < C[k - 1]) C[k] = C[k - 1];
    }
    return C;
  });

  const alluvBasePts = sorted.map((r, i) => ({ x: distances[i], y: alluvBaseLevels[i] }));
  function getZAlluvBase(d) {
    const hasAnyAlluv = alluvBaseLevels.some((z, i) => {
      const zG = levelsArr[i].elevation !== null ? levelsArr[i].elevation : maxElev;
      return (zG - z) > 0.05;
    });
    if (!hasAnyAlluv) return getZGround(d);
    let zBase = interpolateSpline(alluvBasePts, d);
    const zG = getZGround(d);
    const zR = getZRock(d);
    return Math.min(Math.max(zBase, zR), zG);
  }

  function getAlluvBoundaryZ(k, d) {
    const zTop = getZGround(d);
    const zBase = getZAlluvBase(d);
    const thick = Math.max(zTop - zBase, 0);
    if (thick <= 0.01) return zTop;
    if (k === 0) return zTop;
    if (k === K_alluv) return zBase;
    const pts = sorted.map((r, i) => ({ x: distances[i], y: bhAlluvCumBoundaries[i][k] }));
    const f = Math.min(Math.max(interpolateSpline(pts, d), 0.0), 1.0);
    return Math.min(Math.max(zTop - f * thick, zBase), zTop);
  }

  function getResBoundaryZ(k, d) {
    const zTop = getZAlluvBase(d);
    const zBase = getZRock(d);
    const thick = Math.max(zTop - zBase, 0);
    if (thick <= 0.01) return zTop;
    if (k === 0) return zTop;
    if (k === K_res) return zBase;
    const pts = sorted.map((r, i) => ({ x: distances[i], y: bhResCumBoundaries[i][k] }));
    let f = Math.min(Math.max(interpolateSpline(pts, d), 0.0), 1.0);

    // Apply structural foliation inclination bias across the borehole span
    if (appDip && appDip.angle > 1.0 && distances.length >= 2) {
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
      const dirSign = appDip.directionStr === '→ B' ? 1 : (appDip.directionStr === '← A' ? -1 : 0);
      const slope = -Math.tan((appDip.angle * Math.PI) / 180) * dirSign;
      const folOffset = (slope * spanLen * t * (1 - t) * 0.18) / Math.max(thick, 1.0);
      f = Math.min(Math.max(f + folOffset, 0.0), 1.0);
    }

    return Math.min(Math.max(zTop - f * thick, zBase), zTop);
  }

  // Dominant bedrock lithology color
  let bedrockColor = '#8f8f95';
  layersArr.forEach(layers => {
    if (layers) layers.forEach(l => {
      const info = getGraphicInfo(l.graphic);
      if (info.isRock) bedrockColor = info.color;
    });
  });

  // ── DXF FILE COMPOSITION (AutoCAD AC1015 / 2000+ Standard) ────────────────
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n6\n9\n$EXTMIN\n10\n0.0\n20\n${(minElev * vScale).toFixed(3)}\n30\n0.0\n9\n$EXTMAX\n10\n${totalDist.toFixed(3)}\n20\n${(maxElev * vScale).toFixed(3)}\n30\n0.0\n0\nENDSEC\n`;

  // TABLES SECTION
  dxf += `0\nSECTION\n2\nTABLES\n`;
  
  // LTYPE Table
  dxf += `0\nTABLE\n2\nLTYPE\n70\n4\n`;
  dxf += `0\nLTYPE\n2\nCONTINUOUS\n70\n64\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n`;
  dxf += `0\nLTYPE\n2\nDASHED\n70\n64\n3\nDashed line\n72\n65\n73\n2\n40\n4.0\n49\n3.0\n49\n-1.0\n`;
  dxf += `0\nLTYPE\n2\nHIDDEN\n70\n64\n3\nHidden line\n72\n65\n73\n2\n40\n2.5\n49\n1.8\n49\n-0.7\n`;
  dxf += `0\nLTYPE\n2\nPHANTOM\n70\n64\n3\nPhantom line\n72\n65\n73\n4\n40\n6.0\n49\n3.5\n49\n-0.8\n49\n0.9\n49\n-0.8\n`;
  dxf += `0\nENDTAB\n`;

  // LAYER Table
  const cadLayers = [
    { name: 'GEOL_GROUND_SURFACE', color: 4, ltype: 'CONTINUOUS' },     // Cyan
    { name: 'GEOL_ROCKHEAD', color: 1, ltype: 'DASHED' },               // Red
    { name: 'GEOL_SOIL_STRATA', color: 30, ltype: 'CONTINUOUS' },       // Orange / Tan
    { name: 'GEOL_BEDROCK_STRATA', color: 140, ltype: 'CONTINUOUS' },   // Teal
    { name: 'GEOL_ORIGIN_BOUNDARIES', color: 8, ltype: 'HIDDEN' },      // Gray
    { name: 'GEOL_GWT', color: 5, ltype: 'DASHED' },                    // Blue
    { name: 'GEOL_HATCH_SOIL', color: 30, ltype: 'CONTINUOUS' },
    { name: 'GEOL_HATCH_ROCK', color: 140, ltype: 'CONTINUOUS' },
    { name: 'GEOL_HATCH_CWR', color: 34, ltype: 'CONTINUOUS' },
    { name: 'GEOL_BOREHOLES', color: 7, ltype: 'CONTINUOUS' },          // White / Black
    { name: 'GEOL_SPT_BARS', color: 4, ltype: 'CONTINUOUS' },
    { name: 'GEOL_SPT_DATA', color: 3, ltype: 'CONTINUOUS' },           // Green
    { name: 'GEOL_RQD_BARS', color: 2, ltype: 'CONTINUOUS' },           // Yellow
    { name: 'GEOL_RQD_DATA', color: 2, ltype: 'CONTINUOUS' },
    { name: 'GEOL_LABELS', color: 7, ltype: 'CONTINUOUS' },
    { name: 'GEOL_FAULT_LINES', color: 1, ltype: 'DASHED' },            // Red Dashed Faults
    { name: 'GEOL_ANNOTATIONS', color: 7, ltype: 'CONTINUOUS' },        // Notes & Callouts
    { name: 'GEOL_GRID_AXIS', color: 8, ltype: 'CONTINUOUS' },
    { name: 'GEOL_GRID_TEXT', color: 7, ltype: 'CONTINUOUS' },
    { name: 'GEOL_TITLEBLOCK', color: 7, ltype: 'CONTINUOUS' }
  ];

  dxf += `0\nTABLE\n2\nLAYER\n70\n${cadLayers.length}\n`;
  cadLayers.forEach(l => {
    dxf += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\n${l.ltype}\n`;
  });
  dxf += `0\nENDTAB\n0\nENDSEC\n`;

  // ENTITIES SECTION
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  function addLine(layer, x1, y1, x2, y2, colorAci = null, trueColor = null) {
    dxf += `0\nLINE\n8\n${layer}\n`;
    if (colorAci !== null) dxf += `62\n${colorAci}\n`;
    if (options.optTrueColor && trueColor !== null) dxf += `420\n${trueColor}\n`;
    dxf += `10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n`;
  }

  function addPolyline(layer, pts, isClosed = false, colorAci = null, trueColor = null) {
    if (!pts || pts.length < 2) return;
    for (let i = 0; i < pts.length - 1; i++) {
      addLine(layer, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], colorAci, trueColor);
    }
    if (isClosed) {
      addLine(layer, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], colorAci, trueColor);
    }
  }

  function add3dFace(layer, p1, p2, p3, p4, colorAci = null, trueColor = null) {
    dxf += `0\n3DFACE\n8\n${layer}\n`;
    if (colorAci !== null) dxf += `62\n${colorAci}\n`;
    if (options.optTrueColor && trueColor !== null) dxf += `420\n${trueColor}\n`;
    dxf += `10\n${p1[0].toFixed(3)}\n20\n${p1[1].toFixed(3)}\n30\n0.0\n`;
    dxf += `11\n${p2[0].toFixed(3)}\n21\n${p2[1].toFixed(3)}\n31\n0.0\n`;
    dxf += `12\n${p3[0].toFixed(3)}\n22\n${p3[1].toFixed(3)}\n32\n0.0\n`;
    dxf += `13\n${p4[0].toFixed(3)}\n23\n${p4[1].toFixed(3)}\n33\n0.0\n`;
  }

  function addText(layer, x, y, height, text, rotation = 0, colorAci = null) {
    let cleanStr = String(text).replace(/[\r\n]+/g, ' ')
      .replace(/—/g, ' - ')
      .replace(/–/g, '-')
      .replace(/°/g, '%%d')
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/×/g, 'x')
      .replace(/±/g, '%%p');
    dxf += `0\nTEXT\n8\n${layer}\n`;
    if (colorAci !== null) dxf += `62\n${colorAci}\n`;
    dxf += `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0.0\n40\n${height.toFixed(3)}\n1\n${cleanStr}\n`;
    if (rotation !== 0) dxf += `50\n${rotation.toFixed(1)}\n`;
  }

  // Profile Sampling Points
  const nSamples = Math.max(Math.round(totalDist / 2), 80);
  const sampleD = [];
  for (let s = 0; s <= nSamples; s++) {
    sampleD.push((s / nSamples) * totalDist);
  }

  // 1. GROUND SURFACE LINE
  if (options.optGround) {
    const gPts = sampleD.map(d => [cadX(d), cadY(getZGround(d))]);
    addPolyline('GEOL_GROUND_SURFACE', gPts, false, 4, hexToDxfTrueColor('#00bcd4'));
  }

  // 2. ROCKHEAD LINE
  if (options.optRockhead) {
    const rPts = sampleD.map(d => [cadX(d), cadY(getZRock(d))]);
    addPolyline('GEOL_ROCKHEAD', rPts, false, 1, hexToDxfTrueColor('#b71c1c'));
  }

  // 3. GROUNDWATER TABLE (GWT) LINE
  if (options.optGWT && gwDepthPts.length) {
    const wPts = sampleD.map(d => {
      const zW = getZWater(d);
      return zW !== null ? [cadX(d), cadY(zW)] : null;
    }).filter(Boolean);
    if (wPts.length >= 2) addPolyline('GEOL_GWT', wPts, false, 5, hexToDxfTrueColor('#2563eb'));
  }

  // 4. SOIL STRATIGRAPHY BOUNDARIES & HATCHES
  masterSoilUnits.forEach((u, uIdx) => {
    const meta = soilUnitMeta[u];
    const info = getGraphicInfo(meta.graphic);
    const tc = hexToDxfTrueColor(info.color);
    const isAlluv = uIdx < K_alluv;
    const kIdx = isAlluv ? uIdx : (uIdx - K_alluv);
    const bhPresent = isAlluv ? bhAlluvUnitPresent : bhResUnitPresent;

    const hasAnyBH = sorted.some((r, i) => bhPresent[i] && bhPresent[i][kIdx]);
    if (!hasAnyBH) return;

    const topCurve = [];
    const botCurve = [];
    sampleD.forEach(d => {
      const zG = getZGround(d);
      const zBase = getZAlluvBase(d);
      const zR = getZRock(d);

      let zTop = isAlluv ? getAlluvBoundaryZ(kIdx, d) : getResBoundaryZ(kIdx, d);
      let zBot = isAlluv ? getAlluvBoundaryZ(kIdx + 1, d) : getResBoundaryZ(kIdx + 1, d);

      if (isAlluv) {
        zTop = Math.min(Math.max(zTop, zBase), zG);
        zBot = Math.min(Math.max(zBot, zBase), zG);
      } else {
        zTop = Math.min(Math.max(zTop, zR), zBase);
        zBot = Math.min(Math.max(zBot, zR), zBase);
      }
      if (zBot > zTop) zBot = zTop;

      topCurve.push([cadX(d), cadY(zTop)]);
      botCurve.push([cadX(d), cadY(zBot)]);
    });

    // Draw boundary line
    if (options.optSoilLines) {
      addPolyline('GEOL_SOIL_STRATA', topCurve, false, 30, tc);
    }

    // Draw CAD 3DFACE meshes
    if (options.optSoilHatches) {
      for (let s = 0; s < topCurve.length - 1; s++) {
        const p1 = topCurve[s];
        const p2 = topCurve[s + 1];
        const p3 = botCurve[s + 1];
        const p4 = botCurve[s];
        if (Math.abs(p1[1] - p4[1]) > 0.02 || Math.abs(p2[1] - p3[1]) > 0.02) {
          add3dFace('GEOL_HATCH_SOIL', p1, p2, p3, p4, 30, tc);
        }
      }
    }
  });

  // 4b. SOIL ORIGIN BOUNDARIES (e.g. Alluvium Base Contact)
  if (options.optOriginLines && K_alluv > 0) {
    const originPts = [];
    sampleD.forEach(d => {
      const zG = getZGround(d);
      const zBase = getZAlluvBase(d);
      const zR = getZRock(d);
      if ((zG - zBase) > 0.05 && (zBase - zR) > 0.05) {
        originPts.push([cadX(d), cadY(zBase)]);
      } else {
        if (originPts.length >= 2) {
          addPolyline('GEOL_ORIGIN_BOUNDARIES', originPts, false, 8);
        }
        originPts.length = 0;
      }
    });
    if (originPts.length >= 2) {
      addPolyline('GEOL_ORIGIN_BOUNDARIES', originPts, false, 8);
    }
  }

  // 5. DIPPING BEDROCK FORMATION HORIZONS & 3DFACE MESHES
  if (options.optRockLines || options.optRockHatches) {
    const rockTc = hexToDxfTrueColor(bedrockColor);

    // Bedrock 3DFACE Mesh Fill
    if (options.optRockHatches) {
      for (let s = 0; s < sampleD.length - 1; s++) {
        const d1 = sampleD[s];
        const d2 = sampleD[s + 1];
        const zR1 = getZRock(d1);
        const zR2 = getZRock(d2);
        const p1 = [cadX(d1), cadY(zR1)];
        const p2 = [cadX(d2), cadY(zR2)];
        const p3 = [cadX(d2), cadY(minElev)];
        const p4 = [cadX(d1), cadY(minElev)];
        add3dFace('GEOL_HATCH_ROCK', p1, p2, p3, p4, 140, rockTc);
      }
    }

    // Bedrock Formation Dipping Boundary Lines
    if (options.optRockLines) {
      const rockHorizonElevs = [];
      sorted.forEach((r, i) => {
        const d = distances[i];
        const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : maxElev - 10;
        rockHorizonElevs.push(zR + dipSlope * d);
      });
      rockHorizonElevs.sort((a, b) => b - a);

      const mergedH = [];
      rockHorizonElevs.forEach(h => {
        if (!mergedH.length || Math.abs(mergedH[mergedH.length - 1] - h) >= 3.0) {
          mergedH.push(h);
        }
      });

      mergedH.forEach((hVal) => {
        const linePts = [];
        sampleD.forEach(d => {
          const zUpper = hVal - dipSlope * d;
          const zR = getZRock(d);
          const zTop = Math.min(zUpper, zR);
          if (zTop >= minElev) {
            linePts.push([cadX(d), cadY(zTop)]);
          }
        });
        if (linePts.length >= 2) {
          addPolyline('GEOL_BEDROCK_STRATA', linePts, false, 140, rockTc);
        }
      });
    }
  }

  // 6. BOREHOLE PILLARS, STRATIGRAPHY & IN-SITU DATA (SPT, RQD)
  sorted.forEach((r, i) => {
    const x = cadX(distances[i]);
    const lv = levelsArr[i];
    const zG = lv.elevation !== null ? lv.elevation : 100;
    const zR = effectiveRockLevel[i] !== null ? effectiveRockLevel[i] : zG - 5;
    const zTerm = lv.termDepth !== null ? zG - lv.termDepth : zG - 15;
    const bhName = (r['BH Name'] || r['PointID'] || `BH ${i+1}`).trim();
    const lys = layersArr[i];

    if (options.optPillars) {
      // Pillar rectangle (0.8m wide in CAD)
      const pw = 0.4;
      addLine('GEOL_BOREHOLES', x - pw, cadY(zG), x + pw, cadY(zG), 7);
      addLine('GEOL_BOREHOLES', x - pw, cadY(zTerm), x + pw, cadY(zTerm), 7);
      addLine('GEOL_BOREHOLES', x - pw, cadY(zG), x - pw, cadY(zTerm), 7);
      addLine('GEOL_BOREHOLES', x + pw, cadY(zG), x + pw, cadY(zTerm), 7);

      // Header and footer text annotations
      addText('GEOL_LABELS', x, cadY(zG) + 2.0 * vScale, 1.2 * vScale, bhName, 0, 7);
      addText('GEOL_LABELS', x, cadY(zG) + 0.6 * vScale, 0.9 * vScale, `GL ${zG.toFixed(2)}m`, 0, 7);
      addText('GEOL_LABELS', x, cadY(zTerm) - 1.5 * vScale, 0.9 * vScale, `Term ${zTerm.toFixed(2)}m`, 0, 7);

      // Stratigraphy sub-intervals inside column
      if (lys && lys.length) {
        lys.forEach(l => {
          const topZ = zG - l.depth;
          const botZ = zG - l.bottom;
          const code = (l.graphic || '').trim();
          const info = getGraphicInfo(l.graphic);
          const tc = hexToDxfTrueColor(info.color);
          const aci = info.isRock ? 140 : (originFamilyOf(l.origin) === 'completely_weathered_rock' ? 34 : 30);

          // Colored 3DFACE slice inside borehole
          add3dFace('GEOL_BOREHOLES', [x - pw, cadY(topZ)], [x + pw, cadY(topZ)], [x + pw, cadY(botZ)], [x - pw, cadY(botZ)], aci, tc);
          addLine('GEOL_SOIL_STRATA', x - pw, cadY(topZ), x + pw, cadY(topZ), aci, tc);
          addLine('GEOL_SOIL_STRATA', x - pw, cadY(botZ), x + pw, cadY(botZ), aci, tc);
          if (code) {
            addText('GEOL_SOIL_STRATA', x + pw + 0.3, cadY((topZ + botZ) / 2), 0.65 * vScale, code, 0, aci);
          }
        });
      }
    }

    // 7. IN-SITU SPT N-VALUES & RQD DATA
    const allTests = getBHTests(r);
    if (allTests && allTests.length) {
      allTests.forEach(tst => {
        const tDepth = parseFloat(tst.depth) || 0;
        const tLen = parseFloat(tst.length) || 0.45;
        const tTop = zG - tDepth;
        const tBot = zG - (tDepth + tLen);

        // SPT Data
        if (options.optSPT && tst.nVal !== null && (tst.type === 'SPT' || tst.nVal > 0)) {
          const nNum = tst.nVal;
          const isRefusal = nNum >= 50;
          const nTxt = isRefusal ? '50+' : String(Math.round(nNum));
          const barLen = Math.min(nNum, 50) * 0.08;
          const barX1 = x + 0.6;
          const barX2 = barX1 + Math.max(barLen, 0.5);
          const sptAci = isRefusal ? 1 : (nNum >= 30 ? 30 : 3);
          addLine('GEOL_SPT_BARS', barX1, cadY(tTop), barX2, cadY(tTop), sptAci);
          addText('GEOL_SPT_DATA', barX2 + 0.3, cadY((tTop + tBot) / 2), 0.65 * vScale, `N=${nTxt}`, 0, sptAci);
        }

        // RQD Data
        if (options.optRQD && tst.rqd !== null && tst.type !== 'SPT') {
          const rVal = tst.rqd;
          const barW = (rVal / 100) * 2.5;
          const rx1 = x - 0.6;
          const rx2 = rx1 - Math.max(barW, 0.2);
          addLine('GEOL_RQD_BARS', rx1, cadY(tTop), rx2, cadY(tTop), 2);
          addLine('GEOL_RQD_BARS', rx1, cadY(tBot), rx2, cadY(tBot), 2);
          addLine('GEOL_RQD_BARS', rx2, cadY(tTop), rx2, cadY(tBot), 2);
          addText('GEOL_RQD_DATA', rx2 - 0.3, cadY((tTop + tBot) / 2), 0.6 * vScale, `RQD ${Math.round(rVal)}%`, 0, 2);
        }
      });
    }
  });

  // 7b. INFERRED GEOLOGICAL FAULTS & SHEAR ZONES
  if (secOverride?.inferredFaults && secOverride.inferredFaults.length) {
    secOverride.inferredFaults.forEach(flt => {
      const x1 = cadX(flt.p1.d), y1 = cadY(flt.p1.z);
      const x2 = cadX(flt.p2.d), y2 = cadY(flt.p2.z);
      addLine('GEOL_FAULT_LINES', x1, y1, x2, y2, 1, hexToDxfTrueColor('#dc2626'));
      addText('GEOL_FAULT_LINES', (x1 + x2)/2 + 1.0, cadY((flt.p1.z + flt.p2.z)/2), 1.0 * vScale, flt.name || 'Fault', 0, 1);
    });
  }

  // 7c. GEOLOGICAL CALLOUT NOTES
  if (secOverride?.annotations && secOverride.annotations.length) {
    secOverride.annotations.forEach(ann => {
      const x = cadX(ann.d), y = cadY(ann.z);
      const lx = x + (ann.dx || 5.0), ly = y + (ann.dy || 3.0) * vScale;
      addLine('GEOL_ANNOTATIONS', x, y, lx, ly, 7);
      addText('GEOL_ANNOTATIONS', lx + 0.5, ly, 0.8 * vScale, ann.text || '', 0, 7);
    });
  }

  // 8. ELEVATION & CHAINAGE DIMENSION GRID
  if (options.optGrid) {
    const elevStep = niceScaleMeters(Math.max(elevRange / 6, 2));
    const startElev = Math.ceil(minElev / elevStep) * elevStep;
    for (let el = startElev; el <= maxElev; el += elevStep) {
      const y = cadY(el);
      addLine('GEOL_GRID_AXIS', 0, y, totalDist, y, 8);
      addText('GEOL_GRID_TEXT', -3, y - 0.4 * vScale, 0.9 * vScale, `${el}m RL`, 0, 7);
      addText('GEOL_GRID_TEXT', totalDist + 3, y - 0.4 * vScale, 0.9 * vScale, `${el}m RL`, 0, 7);
    }

    const distStep = niceScaleMeters(Math.max(totalDist / 8, 10));
    for (let d = 0; d <= totalDist + 0.1; d += distStep) {
      const x = cadX(d);
      const yAxis = cadY(minElev);
      addLine('GEOL_GRID_AXIS', x, yAxis, x, yAxis - 1.5 * vScale, 7);
      addText('GEOL_GRID_TEXT', x, yAxis - 3.5 * vScale, 0.9 * vScale, `${Math.round(d)}m`, 0, 7);
    }
    // Bottom Axis Line
    addLine('GEOL_GRID_AXIS', 0, cadY(minElev), totalDist, cadY(minElev), 7);
  }

  // 9. TITLE BLOCK & STRUCTURAL METADATA BANNER
  if (options.optTitle) {
    const titleY = cadY(maxElev + 6);
    addText('GEOL_TITLEBLOCK', 0, titleY, 2.2 * vScale, secTitle, 0, 7);
    const metaStr = `ALIGNMENT AZIMUTH: ${azInput.toFixed(1)}° N | FOLIATION: Dip Dir ${dipDir}° N / Dip ${dipAng}° | APPARENT DIP: ${appDip.angle.toFixed(1)}° ${appDip.directionStr} | SCALE: 1:${vScale === 1.0 ? '1 (Natural)' : 'VE 5x'}`;
    addText('GEOL_TITLEBLOCK', 0, titleY - 2.2 * vScale, 1.1 * vScale, metaStr, 0, 7);
    addLine('GEOL_TITLEBLOCK', 0, titleY - 3.2 * vScale, totalDist, titleY - 3.2 * vScale, 7);
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

function generateAndDownloadDxf(customRows, options = {}) {
  const dxf = generateDxfString(customRows, options);
  if (!dxf) return;

  const secTitle = (document.getElementById('section-title-input')?.value || 'ENGINEERING GEOLOGICAL CROSS-SECTION A — B').trim();
  const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8' });
  const a = document.body.appendChild(document.createElement('a'));
  a.href = URL.createObjectURL(blob);
  const cleanTitle = secTitle.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  a.download = `CEP3_${cleanTitle}_${new Date().toISOString().slice(0,10)}.dxf`;
  a.click();
  document.body.removeChild(a);

  if (typeof showAppToast === 'function') {
    showAppToast('📐 CAD DXF Export Complete', 'AutoCAD / Civil 3D DXF file generated with all selected strata, hatches, and geotechnical test data.', 'success');
  }
}
