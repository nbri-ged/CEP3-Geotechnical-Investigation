/* ============================================================
   NBRI GEOTECHNICAL GIS — GEOTECHNICAL CORE LOG ENGINE (geotech-log-engine.js)
   Interactive 820px multi-column borehole core log dashboard complying
   with exploratory borehole visualization guidelines.
   ============================================================ */



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
  const bscsEntry = (typeof GRAPHIC_CODE_INFO !== 'undefined') ? GRAPHIC_CODE_INFO[code] : null;
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
  const d = toNum(layer.depth) || 0;
  const b = toNum(layer.bottom) || d;
  const subtitle = `${origin} (${d.toFixed(2)}–${b.toFixed(2)}m)`;
  const info = getGraphicInfo(layer.graphic);
  return { title, subtitle, color: info.color };
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
  
  const d = toNum(layer.depth) || 0;
  const b = toNum(layer.bottom) || d;
  const subtitle = `Bedrock Core (${d.toFixed(2)}–${b.toFixed(2)}m)`;
  return { title, subtitle, color: '#8f8f95' };
}

function buildBoreholeLogSvg(levels, layers, row){
  if (!levels) return '';
  const { elevation, termDepth, overburden, gwDepth, rockLevel, terminationLevel, gwLevel } = levels;
  
  const effectiveTermDepth = (layers && layers.length)
    ? Math.max(...layers.map(l => (toNum(l.bottom) || 0)))
    : (toNum(termDepth) || 15);
  if (!effectiveTermDepth || effectiveTermDepth <= 0) return '';

  const colH = 310, colW = 26, x0 = 50, y0 = 25;
  const scale = colH / effectiveTermDepth;
  
  const gwNum = toNum(gwDepth);
  const rkNum = toNum(overburden);
  const gwPx = gwNum !== null ? Math.min(Math.max(gwNum * scale, 0), colH) : null;
  const rkPx = rkNum !== null ? Math.min(Math.max(rkNum * scale, 0), colH) : null;

  const POPUP_BEDROCK_COLOR = '#8f8f95';
  let fadeProfile = null;
  let rockDepthTopForFade = null;
  let readings = null;
  if (row) {
    readings = getBHWeathering(row);
    if (readings && readings.length) {
      const rockLayer = (layers && layers.length) ? layers.find(l => getGraphicInfo(l.graphic).isRock) : null;
      rockDepthTopForFade = rockLayer ? (toNum(rockLayer.depth) || 0) : (rkNum !== null ? rkNum : 0);
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
    layers.forEach(l => {
      const d = toNum(l.depth);
      const b = toNum(l.bottom);
      if (d !== null) depthTicks.add(d);
      if (b !== null) depthTicks.add(b);
    });
  } else if (rkNum !== null) {
    depthTicks.add(rkNum);
  }

  Array.from(depthTicks).sort((a,b) => a - b).forEach(d => {
    const y = y0 + Math.min(d * scale, colH);
    const isTerm = Math.abs(d - effectiveTermDepth) < 0.05;
    const isRockHead = (rkNum !== null && Math.abs(d - rkNum) < 0.05);
    const strokeCol = isTerm ? '#0f172a' : (isRockHead ? '#b91c1c' : '#64748b');
    const strokeW = (isTerm || isRockHead) ? 1.2 : 0.8;
    svg += `<line x1="42" y1="${y.toFixed(1)}" x2="50" y2="${y.toFixed(1)}" stroke="${strokeCol}" stroke-width="${strokeW}"/>`;
    svg += `<text x="39" y="${(y + 2.8).toFixed(1)}" font-size="7.5" font-weight="${(isTerm||isRockHead)?'800':'600'}" fill="${strokeCol}" text-anchor="end">${d.toFixed(1)}</text>`;
  });

  // GWT Indicator Line
  if (gwPx !== null && gwNum !== null) {
    const gwY = y0 + gwPx;
    svg += `<line x1="12" y1="${gwY.toFixed(1)}" x2="${x0+colW+4}" y2="${gwY.toFixed(1)}" stroke="#2563eb" stroke-width="1.2" stroke-dasharray="3,2"/>`;
    svg += `<polygon points="26,${gwY.toFixed(1)} 20,${(gwY-5).toFixed(1)} 32,${(gwY-5).toFixed(1)}" fill="#2563eb"/>`;
    svg += `<text x="18" y="${(gwY-3).toFixed(1)}" font-size="6.5" font-weight="800" fill="#2563eb" text-anchor="end">GWT</text>`;
    svg += `<text x="18" y="${(gwY+5).toFixed(1)}" font-size="6.5" font-weight="700" fill="#2563eb" text-anchor="end">${gwNum.toFixed(1)}m</text>`;
  }

  // Rockhead Indicator Line
  if (rkPx !== null && rkNum !== null && rkPx > 0 && rkPx < colH) {
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
      const layerD = toNum(layer.depth) || 0;
      const layerB = toNum(layer.bottom) || (layerD + 0.5);
      const yTop = y0 + Math.min(layerD * scale, colH);
      const yBot = y0 + Math.min(layerB * scale, colH);
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
        svg += `<text x="${x0+colW+12}" y="${(labelY+7).toFixed(1)}" font-size="7" font-weight="600" fill="#64748b">Isolated Clast (${layerD.toFixed(2)}–${layerB.toFixed(2)}m)</text>`;
        return;
      }

      if (isRock) {
        if (fadeProfile) {
          const midDepth = (layerD + layerB) / 2;
          const fade = evalSingleBHFade(fadeProfile, midDepth - (rockDepthTopForFade || 0));
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
    const overburdenPx = rkNum !== null ? Math.min(rkNum * scale, colH) : colH;
    const rockPx = colH - overburdenPx;
    svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${overburdenPx.toFixed(1)}" fill="#c9a84e" stroke="#574c38" stroke-width="0.4"/>`;
    svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${overburdenPx.toFixed(1)}" fill="url(#pat-residual)" stroke="none"/>`;
    if (rockPx > 0.3) {
      svg += `<rect x="${x0}" y="${(y0+overburdenPx).toFixed(1)}" width="${colW}" height="${rockPx.toFixed(1)}" fill="${POPUP_BEDROCK_COLOR}" stroke="#574c38" stroke-width="0.4"/>`;
      svg += `<rect x="${x0}" y="${(y0+overburdenPx).toFixed(1)}" width="${colW}" height="${rockPx.toFixed(1)}" fill="url(#pat-rock)" stroke="none"/>`;
    }
    svg += `<text x="${x0+colW+12}" y="${y0+15}" font-size="8" font-weight="700" fill="#0f172a">Soil Overburden</text>`;
    svg += `<text x="${x0+colW+12}" y="${y0+24}" font-size="7" font-weight="500" fill="#64748b">Thickness ${rkNum !== null ? rkNum.toFixed(2)+'m' : '—'}</text>`;
    if (rockPx > 0.3) {
      let rockName = 'Bedrock';
      if (row) {
        const rawName = row['Rock Type Name'] || row['Rock Type'] || row['Lithology'];
        if (rawName) rockName = formatTitleCase(rawName);
      }
      const rockCoringVal = toNum(levels.rockCoring);
      svg += `<text x="${x0+colW+12}" y="${(y0+overburdenPx+18).toFixed(1)}" font-size="8" font-weight="700" fill="#0f172a">${rockName}</text>`;
      svg += `<text x="${x0+colW+12}" y="${(y0+overburdenPx+27).toFixed(1)}" font-size="7" font-weight="500" fill="#64748b">Cored ${rockCoringVal !== null ? rockCoringVal.toFixed(2)+'m' : '—'}</text>`;
    }
  }

  // Column outer border
  svg += `<rect x="${x0}" y="${y0}" width="${colW}" height="${colH.toFixed(1)}" fill="none" stroke="#0f172a" stroke-width="1.3"/>`;

  // Plot SPT Tests & RQD/CR Tests in Consolidated Single Column
  const tests = row ? getBHTests(row) : [];
  if (tests && tests.length) {
    tests.forEach(t => {
      const testD = toNum(t.depth);
      if (testD === null) return;
      const ty = y0 + Math.min(testD * scale, colH);
      
      // SPT Test rendering
      const nValNum = toNum(t.nVal);
      if (nValNum !== null) {
        const val = nValNum;
        const bw = Math.min(val / 50, 1) * testColWidth;
        const isRefusal = val >= 50;
        const barFill = isRefusal ? '#ef4444' : (val > 25 ? '#f59e0b' : '#10b981');
        svg += `<rect x="${testColLeft}" y="${(ty-3.5).toFixed(1)}" width="${bw.toFixed(1)}" height="7" fill="${barFill}" rx="1"/>`;
        svg += `<text x="${(testColLeft+bw+3).toFixed(1)}" y="${(ty+2.2).toFixed(1)}" font-size="6.8" font-weight="800" fill="${isRefusal?'#b91c1c':'#1e293b'}">${isRefusal ? '50★' : 'N=' + val}</text>`;
      }
      
      // Rock Coring / RQD Test rendering
      const rqdNum = toNum(t.rqd);
      const crNum = toNum(t.cr);
      if (rqdNum !== null || crNum !== null) {
        const testLen = toNum(t.length) || 1.0;
        const th = Math.max(testLen * scale, 7.5);
        if (crNum !== null) {
          const crW = Math.min(crNum / 100, 1) * testColWidth;
          svg += `<rect x="${testColLeft}" y="${ty.toFixed(1)}" width="${crW.toFixed(1)}" height="${th.toFixed(1)}" fill="#e0f2fe" stroke="#38bdf8" stroke-width="0.4" opacity="0.9" rx="1"/>`;
        }
        if (rqdNum !== null) {
          const rqdW = Math.min(rqdNum / 100, 1) * testColWidth;
          svg += `<rect x="${testColLeft}" y="${ty.toFixed(1)}" width="${rqdW.toFixed(1)}" height="${th.toFixed(1)}" fill="#0284c7" fill-opacity="0.85" stroke="#0369a1" stroke-width="0.4" rx="1"/>`;
        }
        
        let lbl = '';
        if (rqdNum !== null && crNum !== null) {
          lbl = `RQD ${Math.round(rqdNum)}% (CR ${Math.round(crNum)}%)`;
        } else if (rqdNum !== null) {
          lbl = `RQD ${Math.round(rqdNum)}%`;
        } else if (crNum !== null) {
          lbl = `CR ${Math.round(crNum)}%`;
        }
        
        if (lbl) {
          const textColor = (rqdNum && rqdNum > 35) ? '#ffffff' : '#0369a1';
          svg += `<text x="${testColLeft + 3}" y="${(ty + th/2 + 2.2).toFixed(1)}" font-size="6.2" font-weight="700" fill="${textColor}">${lbl}</text>`;
        }
      }
    });
  }

  // Bottom Summary Text
  const termLevelNum = toNum(terminationLevel);
  const termRLStr = termLevelNum !== null ? ` (RL +${termLevelNum.toFixed(2)}m MSL)` : '';
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
