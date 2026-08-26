/* ============================================================
   NBRI GEOTECHNICAL GIS — GEOLOGICAL INTERPRETATION & PROFILE EDITING ENGINE
   (geological-editor-engine.js)
   ============================================================ */

var profileOverrides = {};

// Load persisted overrides from localStorage on initialization
try {
  const storedOverrides = localStorage.getItem('nbri_geo_profile_overrides');
  if (storedOverrides) {
    profileOverrides = JSON.parse(storedOverrides);
  }
} catch (err) {
  console.warn('Could not load profileOverrides from localStorage:', err);
  profileOverrides = {};
}

var activeEditorState = null;

function getSectionIdentityKey(rows) {
  if (!rows || !rows.length) return 'default_section';
  const names = rows.map(r => (r['BH Name'] || r['PointID'] || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_'));
  return `sec_${names[0]}_to_${names[names.length - 1]}_cnt${names.length}`;
}

function openGeologicalEditor(customRows) {
  let rows = customRows;
  if (!rows || !rows.length) rows = currentProfileRows;
  if (!rows || !rows.length) {
    if (typeof profileSelectedIdx !== 'undefined' && profileSelectedIdx && profileSelectedIdx.length >= 2 && typeof allRows !== 'undefined') {
      rows = profileSelectedIdx.map(idx => allRows[idx]).filter(Boolean);
    }
  }
  if (!rows || rows.length < 2) {
    if (typeof showAppToast === 'function') {
      showAppToast('Geological Editor', 'Please select at least 2 boreholes on the map or generate a profile first before opening the Geological Interpretation Studio.', 'warning');
    } else {
      alert('Please select at least 2 boreholes on the map or generate a profile first before opening the Geological Interpretation Studio.');
    }
    return;
  }

  currentProfileRows = rows;
  const sectionKey = getSectionIdentityKey(rows);
  const existingOverride = profileOverrides[sectionKey] || null;

  // Initialize Active Editor State
  activeEditorState = {
    sectionKey: sectionKey,
    rows: rows,
    activeTool: 'reshape',
    selectedBoundaryKey: 'rockhead',
    selectedKnotIdx: null,
    selectedFeatureId: null,
    isDragging: false,
    dragKnot: null,
    pan: { x: 0, y: 0, isPanning: false, startX: 0, startY: 0, zoom: 1.0 },
    undoStack: [],
    redoStack: [],
    // Geotechnical Section Computed Geometry
    geom: initEditorGeometry(rows, existingOverride),
    // Human Interpretations & Inferred Features
    inferredFaults: existingOverride?.inferredFaults ? JSON.parse(JSON.stringify(existingOverride.inferredFaults)) : [],
    lenses: existingOverride?.lenses ? JSON.parse(JSON.stringify(existingOverride.lenses)) : [],
    annotations: existingOverride?.annotations ? JSON.parse(JSON.stringify(existingOverride.annotations)) : [],
    lithologyOverrides: existingOverride?.lithologyOverrides ? JSON.parse(JSON.stringify(existingOverride.lithologyOverrides)) : {},
    notes: existingOverride?.meta?.note || ''
  };

  const backdrop = document.getElementById('geo-editor-modal-backdrop');
  if (backdrop) backdrop.classList.add('open');

  updateEditorHeaderUI();
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function closeGeologicalEditor() {
  const backdrop = document.getElementById('geo-editor-modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
  activeEditorState = null;
}

function initEditorGeometry(rows, existingOverride) {
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
      const d = (e1 !== null && n1 !== null && e2 !== null && n2 !== null) ? Math.sqrt((e2-e1)**2 + (n2-n1)**2) : 50;
      distances.push(distances[i-1] + Math.max(d, 1));
    }
  }

  const totalDist = distances[distances.length - 1];
  const levelsArr = sorted.map(computeBHLevels);
  const layersArr = sorted.map(r => getBHLayers(r) || null);

  // Elevation Range
  let maxElev = -Infinity, minElev = Infinity;
  levelsArr.forEach((lv, i) => {
    if (lv.elevation !== null && !isNaN(lv.elevation)) maxElev = Math.max(maxElev, lv.elevation);
    const zTerm = lv.termDepth !== null ? lv.elevation - lv.termDepth : lv.elevation - 15;
    if (!isNaN(zTerm)) minElev = Math.min(minElev, zTerm);
  });
  if (!isFinite(maxElev)) maxElev = 120;
  if (!isFinite(minElev)) minElev = 70;
  maxElev = Math.ceil(maxElev + 4);
  minElev = Math.floor(minElev - 4);

  // Compute Baseline Knots for All Geotechnical & Soil Origin Boundaries
  const groundKnots = [];
  const madeGroundKnots = [];
  const alluvBaseKnots = [];
  const colluvBaseKnots = [];
  const residualBaseKnots = [];
  const rockheadKnots = [];
  const gwtKnots = [];

  sorted.forEach((r, i) => {
    const d = distances[i];
    const lv = levelsArr[i];
    const lys = layersArr[i] || [];
    const zG = (lv.elevation !== null && !isNaN(lv.elevation)) ? lv.elevation : maxElev - 2;
    groundKnots.push({ d: d, z: zG, isBH: true, name: (r['BH Name'] || r['PointID'] || `BH ${i+1}`).trim() });

    // 1. Made Ground / Engineered Fill Base
    let maxMadeGround = 0;
    lys.forEach(l => {
      const fam = originFamilyOf(l.origin);
      if (fam === 'made_ground') {
        if (l.bottom > maxMadeGround) maxMadeGround = l.bottom;
      }
    });
    const zMadeGround = maxMadeGround > 0 ? (zG - maxMadeGround) : zG;
    madeGroundKnots.push({ d: d, z: zMadeGround, isBH: true });

    // 2. Alluvium Base Contact (Alluvium vs in-situ Residual Soil)
    let maxAlluv = 0;
    lys.forEach(l => {
      const fam = originFamilyOf(l.origin);
      if (fam === 'alluvium' || fam === 'made_ground') {
        if (l.bottom > maxAlluv) maxAlluv = l.bottom;
      }
    });
    const zAlluv = maxAlluv > 0 ? (zG - maxAlluv) : zMadeGround;
    alluvBaseKnots.push({ d: d, z: zAlluv, isBH: true });

    // 3. Colluvium Base Contact (Hill wash / Slope scree)
    let maxColluv = 0;
    lys.forEach(l => {
      const fam = originFamilyOf(l.origin);
      if (fam === 'colluvium' || fam === 'alluvium' || fam === 'made_ground') {
        if (l.bottom > maxColluv) maxColluv = l.bottom;
      }
    });
    const zColluv = maxColluv > 0 ? (zG - maxColluv) : zAlluv;
    colluvBaseKnots.push({ d: d, z: zColluv, isBH: true });

    // 4. Residual Soil Base Contact (Grade VI Residual Soil vs Grade V CWR / Bedrock)
    let zR = (lv.rockLevel !== null && !isNaN(lv.rockLevel)) ? lv.rockLevel : zG - 6;
    let zResidual = zR;

    if (lys.length) {
      const rockLayer = lys.find(l => getGraphicInfo(l.graphic).isRock);
      if (rockLayer) zR = zG - rockLayer.depth;

      // Check for Completely Weathered Rock (CWR Grade V)
      const cwrLayer = lys.find(l => {
        const orig = (l.origin || '').toLowerCase();
        return orig.includes('cwr') || orig.includes('completely weathered');
      });
      if (cwrLayer) {
        zResidual = zG - cwrLayer.depth;
      } else {
        zResidual = zR;
      }
    }
    residualBaseKnots.push({ d: d, z: zResidual, isBH: true });
    rockheadKnots.push({ d: d, z: zR, isBH: true });

    // 5. GWT (Groundwater Piezometric Level)
    if (lv.gwtLevel !== null && !isNaN(lv.gwtLevel)) {
      gwtKnots.push({ d: d, z: lv.gwtLevel, isBH: true });
    } else if (lv.gwtDepth !== null && !isNaN(lv.gwtDepth)) {
      gwtKnots.push({ d: d, z: zG - lv.gwtDepth, isBH: true });
    } else {
      gwtKnots.push({ d: d, z: zG - 2.5, isBH: true });
    }
  });

  // Comprehensive Geotechnical & Soil Origin Boundaries
  const boundaries = {
    made_ground_base: {
      name: 'Made Ground / Fill Base Contact',
      category: 'soil_origin',
      color: '#9333ea', // Purple
      isOverridden: !!existingOverride?.boundaries?.made_ground_base?.isOverridden,
      knots: existingOverride?.boundaries?.made_ground_base?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.made_ground_base.knots)) : madeGroundKnots
    },
    alluv_base: {
      name: 'Alluvial Base Contact (Alluvium vs Residual)',
      category: 'soil_origin',
      color: '#0284c7', // Sky Blue
      isOverridden: !!existingOverride?.boundaries?.alluv_base?.isOverridden,
      knots: existingOverride?.boundaries?.alluv_base?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.alluv_base.knots)) : alluvBaseKnots
    },
    colluvium_base: {
      name: 'Colluvium / Slope-Wash Base Contact',
      category: 'soil_origin',
      color: '#b45309', // Amber
      isOverridden: !!existingOverride?.boundaries?.colluvium_base?.isOverridden,
      knots: existingOverride?.boundaries?.colluvium_base?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.colluvium_base.knots)) : colluvBaseKnots
    },
    residual_base: {
      name: 'Residual Soil Base Contact (Saprolite / CWR Top)',
      category: 'soil_origin',
      color: '#d97706', // Orange-Brown
      isOverridden: !!existingOverride?.boundaries?.residual_base?.isOverridden,
      knots: existingOverride?.boundaries?.residual_base?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.residual_base.knots)) : residualBaseKnots
    },
    rockhead: {
      name: 'Rockhead Weathering Front (Bedrock Contact)',
      category: 'bedrock',
      color: '#b71c1c', // Crimson
      isOverridden: !!existingOverride?.boundaries?.rockhead?.isOverridden,
      knots: existingOverride?.boundaries?.rockhead?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.rockhead.knots)) : rockheadKnots
    },
    ground: {
      name: 'Natural Ground Surface Profile',
      category: 'terrain',
      color: '#00bcd4', // Cyan
      isOverridden: !!existingOverride?.boundaries?.ground?.isOverridden,
      knots: existingOverride?.boundaries?.ground?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.ground.knots)) : groundKnots
    },
    gwt: {
      name: 'Groundwater Table (GWT) Piezometric Level',
      category: 'hydro',
      color: '#2563eb', // Blue
      isOverridden: !!existingOverride?.boundaries?.gwt?.isOverridden,
      knots: existingOverride?.boundaries?.gwt?.knots ? JSON.parse(JSON.stringify(existingOverride.boundaries.gwt.knots)) : gwtKnots
    }
  };

  return {
    sorted,
    distances,
    totalDist,
    levelsArr,
    layersArr,
    minElev,
    maxElev,
    azInput,
    dipDir,
    dipAng,
    secTitle,
    boundaries
  };
}

function setEditorTool(toolName) {
  if (!activeEditorState) return;
  activeEditorState.activeTool = toolName;
  document.querySelectorAll('.geo-tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
  });
  const container = document.getElementById('geo-canvas-container');
  if (container) {
    container.classList.toggle('pan-mode', toolName === 'select');
  }
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function selectEditorBoundary(boundaryKey) {
  if (!activeEditorState) return;
  activeEditorState.selectedBoundaryKey = boundaryKey;
  activeEditorState.selectedKnotIdx = null;
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function pushUndoSnapshot() {
  if (!activeEditorState) return;
  const snapshot = {
    boundaries: JSON.parse(JSON.stringify(activeEditorState.geom.boundaries)),
    inferredFaults: JSON.parse(JSON.stringify(activeEditorState.inferredFaults)),
    lenses: JSON.parse(JSON.stringify(activeEditorState.lenses)),
    annotations: JSON.parse(JSON.stringify(activeEditorState.annotations)),
    lithologyOverrides: JSON.parse(JSON.stringify(activeEditorState.lithologyOverrides)),
    notes: activeEditorState.notes
  };
  activeEditorState.undoStack.push(snapshot);
  if (activeEditorState.undoStack.length > 30) activeEditorState.undoStack.shift();
  activeEditorState.redoStack = [];
}

function executeUndo() {
  if (!activeEditorState || !activeEditorState.undoStack.length) return;
  const current = {
    boundaries: JSON.parse(JSON.stringify(activeEditorState.geom.boundaries)),
    inferredFaults: JSON.parse(JSON.stringify(activeEditorState.inferredFaults)),
    lenses: JSON.parse(JSON.stringify(activeEditorState.lenses)),
    annotations: JSON.parse(JSON.stringify(activeEditorState.annotations)),
    lithologyOverrides: JSON.parse(JSON.stringify(activeEditorState.lithologyOverrides)),
    notes: activeEditorState.notes
  };
  activeEditorState.redoStack.push(current);
  const prev = activeEditorState.undoStack.pop();
  activeEditorState.geom.boundaries = prev.boundaries;
  activeEditorState.inferredFaults = prev.inferredFaults;
  activeEditorState.lenses = prev.lenses;
  activeEditorState.annotations = prev.annotations;
  activeEditorState.lithologyOverrides = prev.lithologyOverrides;
  activeEditorState.notes = prev.notes;
  updateEditorHeaderUI();
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function executeRedo() {
  if (!activeEditorState || !activeEditorState.redoStack.length) return;
  const next = activeEditorState.redoStack.pop();
  const current = {
    boundaries: JSON.parse(JSON.stringify(activeEditorState.geom.boundaries)),
    inferredFaults: JSON.parse(JSON.stringify(activeEditorState.inferredFaults)),
    lenses: JSON.parse(JSON.stringify(activeEditorState.lenses)),
    annotations: JSON.parse(JSON.stringify(activeEditorState.annotations)),
    lithologyOverrides: JSON.parse(JSON.stringify(activeEditorState.lithologyOverrides)),
    notes: activeEditorState.notes
  };
  activeEditorState.undoStack.push(current);
  activeEditorState.geom.boundaries = next.boundaries;
  activeEditorState.inferredFaults = next.inferredFaults;
  activeEditorState.lenses = next.lenses;
  activeEditorState.annotations = next.annotations;
  activeEditorState.lithologyOverrides = next.lithologyOverrides;
  activeEditorState.notes = next.notes;
  updateEditorHeaderUI();
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function resetBoundaryToAuto(boundaryKey) {
  if (!activeEditorState) return;
  pushUndoSnapshot();
  const baselineGeom = initEditorGeometry(activeEditorState.rows, null);
  if (baselineGeom.boundaries[boundaryKey]) {
    activeEditorState.geom.boundaries[boundaryKey] = JSON.parse(JSON.stringify(baselineGeom.boundaries[boundaryKey]));
    activeEditorState.geom.boundaries[boundaryKey].isOverridden = false;
  }
  updateEditorHeaderUI();
  updatePropertiesPanelUI();
  renderEditorCanvas();
  if (typeof showAppToast === 'function') {
    showAppToast('Boundary Reset', `Reset ${activeEditorState.geom.boundaries[boundaryKey]?.name || boundaryKey} to algorithmic baseline.`, 'info');
  }
}

function resetAllToAuto() {
  if (!activeEditorState) return;
  if (!confirm('Are you sure you want to reset all geological interpretations and restore the algorithmic baseline profile?')) return;
  pushUndoSnapshot();
  activeEditorState.geom = initEditorGeometry(activeEditorState.rows, null);
  activeEditorState.inferredFaults = [];
  activeEditorState.lenses = [];
  activeEditorState.annotations = [];
  activeEditorState.lithologyOverrides = {};
  delete profileOverrides[activeEditorState.sectionKey];
  localStorage.setItem('nbri_geo_profile_overrides', JSON.stringify(profileOverrides));
  updateEditorHeaderUI();
  updatePropertiesPanelUI();
  renderEditorCanvas();
  if (typeof showAppToast === 'function') {
    showAppToast('Profile Reset', 'All manual geological interpretations reset to baseline.', 'info');
  }
}

function saveAndApplyGeologicalEditor() {
  if (!activeEditorState) return;
  
  const sectionKey = activeEditorState.sectionKey;
  profileOverrides[sectionKey] = {
    meta: {
      lastEditedAt: new Date().toISOString(),
      sectionTitle: activeEditorState.geom.secTitle,
      note: activeEditorState.notes
    },
    boundaries: JSON.parse(JSON.stringify(activeEditorState.geom.boundaries)),
    inferredFaults: JSON.parse(JSON.stringify(activeEditorState.inferredFaults)),
    lenses: JSON.parse(JSON.stringify(activeEditorState.lenses)),
    annotations: JSON.parse(JSON.stringify(activeEditorState.annotations)),
    lithologyOverrides: JSON.parse(JSON.stringify(activeEditorState.lithologyOverrides))
  };

  try {
    localStorage.setItem('nbri_geo_profile_overrides', JSON.stringify(profileOverrides));
  } catch (err) {
    console.error('Failed to save profileOverrides to localStorage:', err);
  }

  // Update Main Cross-Section Modal if open
  if (typeof recreateProfileDirect === 'function') {
    recreateProfileDirect();
  }

  if (typeof showAppToast === 'function') {
    showAppToast('💾 Interpretations Saved', 'Geological overrides saved and applied to cross-section and exports.', 'success');
  }
  updateEditorHeaderUI();
}

function exportOverridesJson() {
  const jsonStr = JSON.stringify(profileOverrides, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const a = document.body.appendChild(document.createElement('a'));
  a.href = URL.createObjectURL(blob);
  a.download = `NBRI_Geological_Overrides_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  document.body.removeChild(a);
}

function importOverridesJson(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      profileOverrides = Object.assign(profileOverrides, parsed);
      localStorage.setItem('nbri_geo_profile_overrides', JSON.stringify(profileOverrides));
      if (activeEditorState) {
        openGeologicalEditor(activeEditorState.rows);
      }
      if (typeof showAppToast === 'function') {
        showAppToast('📥 Overrides Imported', 'Geological profile overrides loaded successfully.', 'success');
      }
    } catch (err) {
      alert('Invalid JSON file format.');
    }
  };
  reader.readAsText(file);
}

// ── SVG CANVAS RENDERING & INTERACTIVE DRAG HANDLERS ───────────────────────
function renderEditorCanvas() {
  if (!activeEditorState) return;

  const geom = activeEditorState.geom;
  const totalDist = geom.totalDist;
  const minElev = geom.minElev;
  const maxElev = geom.maxElev;
  const elevRange = Math.max(maxElev - minElev, 10);

  const plotW = 1200;
  const plotH = 550;
  const padL = 90, padR = 60, padT = 80, padB = 70;
  const svgW = plotW + padL + padR;
  const svgH = plotH + padT + padB;

  function toSvgX(d) { return padL + (d / Math.max(totalDist, 1)) * plotW; }
  function toSvgY(z) { return padT + ((maxElev - z) / elevRange) * plotH; }
  function fromSvgX(svgX) { return Math.max(Math.min(((svgX - padL) / plotW) * totalDist, totalDist), 0); }
  function fromSvgY(svgY) { return maxElev - ((svgY - padT) / plotH) * elevRange; }

  activeEditorState.coordTransform = { toSvgX, toSvgY, fromSvgX, fromSvgY, svgW, svgH };

  let svg = `<svg id="geo-editor-svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block; user-select:none;">`;

  // Grid Background
  svg += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>`;

  // Elevation Grid Lines & RL Ticks
  const elevStep = niceScaleMeters(Math.max(elevRange / 6, 2));
  const startElev = Math.ceil(minElev / elevStep) * elevStep;
  for (let el = startElev; el <= maxElev; el += elevStep) {
    const y = toSvgY(el);
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${padL - 10}" y="${y + 4}" font-size="11" font-weight="700" fill="#64748b" text-anchor="end">${el}m RL</text>`;
    svg += `<text x="${padL + plotW + 10}" y="${y + 4}" font-size="11" font-weight="700" fill="#64748b" text-anchor="start">${el}m RL</text>`;
  }

  // Distance Chainage Grid Ticks
  const distStep = niceScaleMeters(Math.max(totalDist / 8, 10));
  for (let d = 0; d <= totalDist + 0.1; d += distStep) {
    const x = toSvgX(d);
    svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#e2e8f0" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${padT + plotH + 20}" font-size="11" font-weight="700" fill="#64748b" text-anchor="middle">${Math.round(d)}m</text>`;
  }

  // 1. Render Strata Solid Fills (Genetic Soil Origin Horizons + Bedrock)
  const groundKnots = geom.boundaries.ground.knots;
  const madeGroundKnots = geom.boundaries.made_ground_base.knots;
  const alluvKnots = geom.boundaries.alluv_base.knots;
  const residualKnots = geom.boundaries.residual_base.knots;
  const rockheadKnots = geom.boundaries.rockhead.knots;

  function evalKnots(knots, d) {
    const pts = knots.map(k => ({ x: k.d, y: k.z }));
    return interpolateSpline(pts, d);
  }

  const nS = 120;
  const sDists = [];
  for (let s = 0; s <= nS; s++) sDists.push((s / nS) * totalDist);

  // A. Bedrock Polygon Fill (Below Rockhead)
  let rockPoly = `M ${toSvgX(0)} ${toSvgY(minElev)} `;
  sDists.forEach(d => { rockPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(rockheadKnots, d))} `; });
  rockPoly += `L ${toSvgX(totalDist)} ${toSvgY(minElev)} Z`;
  svg += `<path d="${rockPoly}" fill="#94a3b8" fill-opacity="0.30"/>`;

  // B. Completely Weathered Rock (CWR Grade V) Transition Band (Between Rockhead and Residual Base)
  let cwrPoly = `M ${toSvgX(0)} ${toSvgY(evalKnots(rockheadKnots, 0))} `;
  sDists.forEach(d => { cwrPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(residualKnots, d))} `; });
  for (let s = sDists.length - 1; s >= 0; s--) {
    const d = sDists[s];
    cwrPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(rockheadKnots, d))} `;
  }
  cwrPoly += `Z`;
  svg += `<path d="${cwrPoly}" fill="#d97706" fill-opacity="0.22"/>`;

  // C. In-situ Residual Soil Horizon (Grade VI) (Between Residual Base and Alluvium/Ground)
  let resPoly = `M ${toSvgX(0)} ${toSvgY(evalKnots(residualKnots, 0))} `;
  sDists.forEach(d => { resPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(alluvKnots, d))} `; });
  for (let s = sDists.length - 1; s >= 0; s--) {
    const d = sDists[s];
    resPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(residualKnots, d))} `;
  }
  resPoly += `Z`;
  svg += `<path d="${resPoly}" fill="#fde68a" fill-opacity="0.35"/>`;

  // D. Transported Alluvium / Colluvium Deposits (Between Alluvial Base and Made Ground/Ground)
  let alluvPoly = `M ${toSvgX(0)} ${toSvgY(evalKnots(alluvKnots, 0))} `;
  sDists.forEach(d => { alluvPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(madeGroundKnots, d))} `; });
  for (let s = sDists.length - 1; s >= 0; s--) {
    const d = sDists[s];
    alluvPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(alluvKnots, d))} `;
  }
  alluvPoly += `Z`;
  svg += `<path d="${alluvPoly}" fill="#bae6fd" fill-opacity="0.35"/>`;

  // E. Made Ground / Fill Horizon (Between Made Ground Base and Ground)
  let fillPoly = `M ${toSvgX(0)} ${toSvgY(evalKnots(madeGroundKnots, 0))} `;
  sDists.forEach(d => { fillPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(groundKnots, d))} `; });
  for (let s = sDists.length - 1; s >= 0; s--) {
    const d = sDists[s];
    fillPoly += `L ${toSvgX(d)} ${toSvgY(evalKnots(madeGroundKnots, d))} `;
  }
  fillPoly += `Z`;
  svg += `<path d="${fillPoly}" fill="#e9d5ff" fill-opacity="0.40"/>`;

  // 2. Render Inferred Faults
  activeEditorState.inferredFaults.forEach((flt, fIdx) => {
    const x1 = toSvgX(flt.p1.d), y1 = toSvgY(flt.p1.z);
    const x2 = toSvgX(flt.p2.d), y2 = toSvgY(flt.p2.z);
    svg += `<line class="geo-fault-plane" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" data-fault-idx="${fIdx}"/>`;
    svg += `<text x="${(x1 + x2)/2 + 8}" y="${(y1 + y2)/2}" font-size="11" font-weight="800" fill="#dc2626">${flt.name || 'Fault'}</text>`;
  });

  // 3. Render Boundary Lines & Interactive Line Badges
  Object.keys(geom.boundaries).forEach(bKey => {
    const bObj = geom.boundaries[bKey];
    const isSelected = activeEditorState.selectedBoundaryKey === bKey;
    let pathD = `M ${toSvgX(0)} ${toSvgY(evalKnots(bObj.knots, 0))} `;
    sDists.forEach(d => { pathD += `L ${toSvgX(d)} ${toSvgY(evalKnots(bObj.knots, d))} `; });

    const strokeW = isSelected ? 3.8 : 2.0;
    const strokeDash = bKey === 'gwt' ? '6 4' : (bObj.isOverridden ? '8 3' : 'none');
    
    // Glowing halo for selected boundary
    if (isSelected) {
      svg += `<path d="${pathD}" fill="none" stroke="${bObj.color}" stroke-width="8" stroke-opacity="0.3" stroke-linecap="round"/>`;
    }

    svg += `<path d="${pathD}" fill="none" stroke="${bObj.color}" stroke-width="${strokeW}" stroke-dasharray="${strokeDash}" style="cursor:pointer;" onclick="selectEditorBoundary('${bKey}')"/>`;

    // Boundary Label Badge along line
    const labelD = totalDist * 0.35;
    const labelX = toSvgX(labelD);
    const labelY = toSvgY(evalKnots(bObj.knots, labelD)) - 4;
    const shortNames = {
      made_ground_base: '🚜 Fill Base',
      alluv_base: '🌊 Alluvial Base',
      colluvium_base: '⛰️ Colluvium Base',
      residual_base: '🍂 Residual Soil Base (CWR Top)',
      rockhead: '🪨 Rockhead (Bedrock)',
      ground: '🌿 Ground Surface',
      gwt: '💧 GWT'
    };
    svg += `<text x="${labelX}" y="${labelY}" font-size="9" font-weight="800" fill="${bObj.color}" style="cursor:pointer; paint-order:stroke; stroke:#fff; stroke-width:3px;" onclick="selectEditorBoundary('${bKey}')">${shortNames[bKey] || bObj.name}</text>`;
  });

  // 4. Render Borehole Exploratory Pillars
  geom.sorted.forEach((r, i) => {
    const d = geom.distances[i];
    const x = toSvgX(d);
    const lv = geom.levelsArr[i];
    const zG = (lv.elevation !== null && !isNaN(lv.elevation)) ? lv.elevation : maxElev;
    const zTerm = lv.termDepth !== null ? zG - lv.termDepth : zG - 15;
    const bhName = (r['BH Name'] || r['PointID'] || `BH ${i+1}`).trim();
    const lys = geom.layersArr[i];

    // Pillar Column
    const pw = 8;
    svg += `<rect x="${x - pw}" y="${toSvgY(zG)}" width="${pw * 2}" height="${toSvgY(zTerm) - toSvgY(zG)}" fill="#ffffff" stroke="#1e293b" stroke-width="1.5"/>`;

    // Internal Strata Slices
    if (lys && lys.length) {
      lys.forEach(l => {
        const topY = toSvgY(zG - l.depth);
        const botY = toSvgY(zG - l.bottom);
        const info = getGraphicInfo(l.graphic);
        svg += `<rect x="${x - pw + 1}" y="${topY}" width="${(pw - 1) * 2}" height="${Math.max(botY - topY, 1)}" fill="${info.color}" fill-opacity="0.8"/>`;
      });
    }

    // Borehole Collar & Termination Text
    svg += `<text x="${x}" y="${toSvgY(zG) - 12}" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">${bhName}</text>`;
    svg += `<text x="${x}" y="${toSvgY(zG) - 2}" font-size="10" font-weight="700" fill="#475569" text-anchor="middle">GL ${zG.toFixed(2)}m</text>`;
    svg += `<text x="${x}" y="${toSvgY(zTerm) + 12}" font-size="10" font-weight="700" fill="#475569" text-anchor="middle">Term ${zTerm.toFixed(2)}m</text>`;
  });

  // 5. Render Interactive Knots for Selected Boundary
  const activeB = geom.boundaries[activeEditorState.selectedBoundaryKey];
  if (activeB && activeEditorState.activeTool === 'reshape') {
    activeB.knots.forEach((k, kIdx) => {
      const kX = toSvgX(k.d);
      const kY = toSvgY(k.z);
      const isSel = activeEditorState.selectedKnotIdx === kIdx;
      const knotClass = `geo-knot ${isSel ? 'selected' : ''} ${k.isBH ? 'geo-knot-bh' : ''}`;
      svg += `<circle class="${knotClass}" cx="${kX}" cy="${kY}" r="6.5" data-knot-idx="${kIdx}" onpointerdown="onKnotPointerDown(event, ${kIdx})"/>`;
    });
  }

  // 6. Title Block
  svg += `<text x="${padL}" y="35" font-size="16" font-weight="800" fill="#0f172a">${geom.secTitle}</text>`;
  svg += `<text x="${padL}" y="52" font-size="11" font-weight="700" fill="#64748b">AZIMUTH: ${geom.azInput.toFixed(1)}° N | FOLIATION DIP DIR: ${geom.dipDir}° / DIP ${geom.dipAng}° | STATUS: ${activeB?.isOverridden ? 'HUMAN INTERPRETED OVERRIDE' : 'AUTOMATIC BASELINE'}</text>`;

  svg += `</svg>`;

  const wrapper = document.getElementById('geo-editor-svg-wrapper');
  if (wrapper) {
    wrapper.innerHTML = svg;
    attachCanvasEventListeners();
  }
}

function updateEditorHeaderUI() {
  if (!activeEditorState) return;
  const badge = document.getElementById('geo-editor-status-badge');
  if (badge) {
    const isAnyOverridden = Object.values(activeEditorState.geom.boundaries).some(b => b.isOverridden) || activeEditorState.inferredFaults.length > 0;
    badge.className = `geo-status-badge ${isAnyOverridden ? 'interpreted' : ''}`;
    badge.innerText = isAnyOverridden ? '🟡 Human Interpreted Override' : '🟢 Baseline (Auto)';
  }
}

function updatePropertiesPanelUI() {
  if (!activeEditorState) return;
  const selB = activeEditorState.geom.boundaries[activeEditorState.selectedBoundaryKey];
  const nameEl = document.getElementById('geo-prop-boundary-name');
  if (nameEl) nameEl.innerText = selB?.name || 'None';

  const bSelect = document.getElementById('geo-boundary-select');
  if (bSelect && activeEditorState.selectedBoundaryKey) {
    bSelect.value = activeEditorState.selectedBoundaryKey;
  }

  const statusEl = document.getElementById('geo-prop-boundary-status');
  if (statusEl) statusEl.innerText = selB?.isOverridden ? '🟡 Overridden' : '🟢 Pure Baseline';

  const knotTbody = document.getElementById('geo-knot-tbody');
  if (knotTbody && selB) {
    let rowsHtml = '';
    selB.knots.forEach((k, idx) => {
      const isSel = activeEditorState.selectedKnotIdx === idx;
      rowsHtml += `<tr class="${isSel ? 'active' : ''}" onclick="selectKnotFromTable(${idx})">
        <td>${idx + 1}</td>
        <td>${k.d.toFixed(1)}m</td>
        <td>${k.z.toFixed(2)}m</td>
        <td>${k.isBH ? 'BH Pillar' : 'Human Knot'}</td>
      </tr>`;
    });
    knotTbody.innerHTML = rowsHtml;
  }
}

function selectKnotFromTable(idx) {
  if (!activeEditorState) return;
  activeEditorState.selectedKnotIdx = idx;
  renderEditorCanvas();
}

function onKnotPointerDown(evt, knotIdx) {
  evt.stopPropagation();
  if (!activeEditorState) return;
  pushUndoSnapshot();
  activeEditorState.isDragging = true;
  activeEditorState.selectedKnotIdx = knotIdx;
  activeEditorState.dragKnot = activeEditorState.geom.boundaries[activeEditorState.selectedBoundaryKey].knots[knotIdx];
  updatePropertiesPanelUI();
  renderEditorCanvas();
}

function attachCanvasEventListeners() {
  const container = document.getElementById('geo-canvas-container');
  const svgEl = document.getElementById('geo-editor-svg');
  if (!container || !svgEl) return;

  svgEl.onpointermove = (evt) => {
    if (!activeEditorState) return;
    const rect = svgEl.getBoundingClientRect();
    const svgX = evt.clientX - rect.left;
    const svgY = evt.clientY - rect.top;
    const d = activeEditorState.coordTransform.fromSvgX(svgX);
    const z = activeEditorState.coordTransform.fromSvgY(svgY);

    // Update HUD
    const hud = document.getElementById('geo-canvas-hud');
    if (hud) {
      hud.innerHTML = `<span>Chainage: <b>${d.toFixed(1)}m</b></span> <span>Elevation: <b>${z.toFixed(2)}m RL</b></span>`;
    }

    // Dragging Knot
    if (activeEditorState.isDragging && activeEditorState.dragKnot) {
      activeEditorState.dragKnot.z = z;
      if (!activeEditorState.dragKnot.isBH) {
        activeEditorState.dragKnot.d = d;
      }
      activeEditorState.geom.boundaries[activeEditorState.selectedBoundaryKey].isOverridden = true;
      renderEditorCanvas();
    }
  };

  svgEl.onpointerup = () => {
    if (activeEditorState && activeEditorState.isDragging) {
      activeEditorState.isDragging = false;
      activeEditorState.dragKnot = null;
      updateEditorHeaderUI();
      updatePropertiesPanelUI();
    }
  };

  svgEl.onclick = (evt) => {
    if (!activeEditorState) return;
    if (activeEditorState.activeTool === 'add_point') {
      const rect = svgEl.getBoundingClientRect();
      const d = activeEditorState.coordTransform.fromSvgX(evt.clientX - rect.left);
      const z = activeEditorState.coordTransform.fromSvgY(evt.clientY - rect.top);
      const selB = activeEditorState.geom.boundaries[activeEditorState.selectedBoundaryKey];
      if (selB) {
        pushUndoSnapshot();
        selB.knots.push({ d: d, z: z, isBH: false });
        selB.knots.sort((a, b) => a.d - b.d);
        selB.isOverridden = true;
        updateEditorHeaderUI();
        updatePropertiesPanelUI();
        renderEditorCanvas();
        if (typeof showAppToast === 'function') {
          showAppToast('Vertex Added', `Inserted control knot at Ch. ${d.toFixed(1)}m, RL ${z.toFixed(2)}m.`, 'success');
        }
      }
    }
  };
}
