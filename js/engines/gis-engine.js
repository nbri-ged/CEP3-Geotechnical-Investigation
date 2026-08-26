/* ============================================================
   NBRI GEOTECHNICAL GIS — SPATIAL GIS & MAP ENGINE (gis-engine.js)
   Leaflet map initialization, spatial rendering, cluster filters,
   and live Google Sheet synchronization.
   ============================================================ */

function initMapEngine() {
  if (map) return;
  
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  map = L.map('map', { zoomControl: true }).setView([7.45, 80.6], 12);

  baseLayers = {
    "Street": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }),
    "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri', crossOrigin: 'anonymous'
    }),
    "Hybrid": L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, crossOrigin: 'anonymous'
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, crossOrigin: 'anonymous'
      })
    ]),
    "Terrain": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17, attribution: 'Style &copy; OpenTopoMap'
    }),
    "Google Hybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google'
    })
  };

  baseLayers["Street"].addTo(map);

  layersControl = L.control.layers(baseLayers, {}, {
    position: 'topright', collapsed: window.matchMedia('(max-width: 768px)').matches
  }).addTo(map);

  cep4Layer = L.layerGroup();
  layersControl.addOverlay(cep4Layer, 'CEP4 BHs (separate project)');

  markersLayer = L.layerGroup();
  map.addLayer(markersLayer);

  profilePolyline = L.polyline([], { color: '#0d9488', weight: 4, dashArray: '8, 6', opacity: 0.95 }).addTo(map);
  measureLines = L.polyline([], { color: '#b3541e', weight: 3, dashArray: '6, 6' }).addTo(map);
  measurePolygon = L.polygon([], { color: '#b3541e', fillColor: '#b3541e', fillOpacity: 0.15 }).addTo(map);

  // Geolocation FAB Control
  const LocateControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function(){
      const container = L.DomUtil.create('div', 'locate-fab-wrap');
      const btn = L.DomUtil.create('button', 'locate-fab', container);
      btn.type = 'button'; btn.title = 'Show my location';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(btn, 'click', () => toggleLocate(btn));
      return container;
    }
  });
  map.addControl(new LocateControl());

  // Legend Panel Control
  const LegendPanelControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(){
      const container = L.DomUtil.create('div', 'legend-panel collapsed');
      container.innerHTML = `
        <div class="legend-panel-header" id="legend-panel-toggle">
          <span>📊 Legend</span><span class="legend-panel-arrow">&#9656;</span>
        </div>
        <div class="legend-panel-body">
          <div class="legend-section-title">Status</div>
          <div id="legend"></div>
          <div class="legend-section-title">Package <span class="legend-package-note">(zoomed out view)</span></div>
          <div id="package-legend"></div>
        </div>`;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(container.querySelector('#legend-panel-toggle'), 'click', () => {
        container.classList.toggle('collapsed');
        const arrow = container.querySelector('.legend-panel-arrow');
        arrow.innerHTML = container.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
      });
      return container;
    }
  });
  map.addControl(new LegendPanelControl());

  const LABEL_MIN_ZOOM = 18;
  function updateLabelVisibility(){
    const zoom = map.getZoom();
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    mapDiv.classList.toggle('show-pkg-labels', zoom >= 12 && zoom < LABEL_MIN_ZOOM);
    mapDiv.classList.toggle('show-bh-labels', zoom >= LABEL_MIN_ZOOM);
  }
  map.on('zoomend', updateLabelVisibility);

  initMeasurementHandlers();
}



/* ── DATA FETCHING & SYNCHRONIZATION ── */
function fetchData() {
  // 1. Immediately bootstrap synchronously with embedded master dataset if empty
  if (window.EMBEDDED_BOREHOLES_CSV && (!allRows || allRows.length === 0)) {
    try {
      const r = Papa.parse(window.EMBEDDED_BOREHOLES_CSV, { header: true, skipEmptyLines: true });
      if (r && r.data && r.data.length) {
        loadRows(r.data);
      }
    } catch(e){}
  }

  // 2. Also load embedded profile layers immediately synchronously
  if (window.EMBEDDED_BH_PROFILE_CSV && (!profileLayersByBH || Object.keys(profileLayersByBH).length === 0)) {
    try {
      const r = Papa.parse(window.EMBEDDED_BH_PROFILE_CSV, { header: false, skipEmptyLines: true });
      if (r && r.data && r.data.length) {
        processBHProfileData(r.data);
      }
    } catch(e){}
  }

  // 3. Load permanent project overlays (Road corridor Polyline_cep32.zip)
  loadPermanentOverlays();

  // 4. Offline Mode check
  if (!navigator.onLine) {
    const localRowsData = localStorage.getItem('nbri_allrows_cache');
    const localDatesData = localStorage.getItem('nbri_dates_cache');
    const cacheStamp = localStorage.getItem('nbri_cache_timestamp');
    if (localRowsData) {
      window.loadedFromOfflineCache = true;
      allRows = JSON.parse(localRowsData);
      bhDatesLookup = localDatesData ? JSON.parse(localDatesData) : {};
      loadRows(allRows);
      setStatus(`Offline Mode — Cached: ${formatDateDMY(cacheStamp)}`, 'err');
      const dashEl = document.getElementById('dash-updated');
      if (dashEl) dashEl.textContent = "Offline Storage Mode";
      return;
    }
  }

  // 4. Live sync from Google Sheets
  if (SHEET_CSV_URL) {
    setStatus('Refreshing from Google Sheet…');
    parseCsvWithProxy(SHEET_CSV_URL, (data) => {
      loadRows(data);
      setStatus('Live — synced ' + new Date().toLocaleTimeString(), 'ok');
      const dashEl = document.getElementById('dash-updated');
      if (dashEl) dashEl.textContent = formatDateDMY(new Date()) + ', ' + new Date().toLocaleTimeString();
      
      // Also fetch auxiliary profile sheets
      fetchBHProfileLog();
      fetchLogDates();
      fetchCEP4BHs();
      fetchProgressSeries();
    }, () => {
      // Fallback 1: Local Master File
      Papa.parse(LOCAL_BOREHOLES_CSV, {
        download: true, header: true, skipEmptyLines: true,
        complete: (r) => {
          if (r.data && r.data.length > 0) {
            loadRows(r.data);
            setStatus('Loaded from Local Master File', 'ok');
            fetchBHProfileLog();
          } else {
            fallbackToCacheOrSample();
          }
        },
        error: () => fallbackToCacheOrSample()
      });
    });
  } else {
    fallbackToCacheOrSample();
  }

  function fallbackToCacheOrSample() {
    const cached = localStorage.getItem('nbri_allrows_cache') || localStorage.getItem('nbri_allrows_cache_backup');
    if (cached) {
      loadRows(JSON.parse(cached));
      setStatus('Using Local Cache Backup', 'ok');
    } else {
      setStatus('Could not reach sheet — showing sample data', 'err');
      Papa.parse(SAMPLE_CSV, { header: true, skipEmptyLines: true, complete: r => loadRows(r.data) });
    }
  }
}

function fetchBHProfileLog() {
  const localProfUrl = 'CEP 3  Rambukkana-Galagedara - BH Profile.csv';
  
  if (window.EMBEDDED_BH_PROFILE_CSV && (!profileLayersByBH || Object.keys(profileLayersByBH).length === 0)) {
    try {
      Papa.parse(window.EMBEDDED_BH_PROFILE_CSV, {
        header: false, skipEmptyLines: true,
        complete: (r) => { if (r.data && r.data.length) processBHProfileData(r.data); }
      });
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
    Papa.parse(localProfUrl, {
      download: true, header: false, skipEmptyLines: true,
      complete: (results) => {
        if (results && results.data && results.data.length) {
          processBHProfileData(results.data);
        }
      },
      error: (err) => console.warn('Could not load local BH Profile log:', err)
    });
  });
}

function fetchLogDates() {
  if (!LOG_SHEET_CSV_URL) return;
  parseCsvWithProxy(LOG_SHEET_CSV_URL, (data) => {
    const mapDates = {};
    data.forEach(raw => {
      const row = normalizeRow(raw);
      const status = (row['Status of the Borehole'] || '').trim();
      const bhId = (row['Borehole ID'] || '').trim();
      if (!bhId || status !== 'Completed') return;
      mapDates[bhId] = {
        commence: (row['Borehole Commence Date'] || '').trim(),
        completed: (row['Date'] || '').trim()
      };
    });
    bhDatesLookup = mapDates;
    try {
      localStorage.setItem('nbri_dates_cache', JSON.stringify(bhDatesLookup));
    } catch(e){}
  }, () => {});
}

function fetchCEP4BHs() {
  if (!CEP4_BH_CSV_URL || !cep4Layer) return;
  parseCsvWithProxy(CEP4_BH_CSV_URL, (data) => {
    cep4Layer.clearLayers();
    data.forEach(raw => {
      const row = normalizeRow(raw);
      const bhId = (row['BH_ID'] || row['BH ID'] || row['PointID'] || '').trim();
      const x = toNum(row['POINT_X'] || row['Point_X'] || row['Easting']);
      const y = toNum(row['POINT_Y'] || row['Point_Y'] || row['Northing']);
      if (!bhId || x === null || y === null) return;
      const ll = convertToLatLon(x, y);
      if (!ll) return;
      const marker = L.circleMarker([ll.lat, ll.lon], {
        radius: 5, color: '#fff', weight: 1.5, fillColor: '#7048e8', fillOpacity: 0.9
      });
      marker.bindPopup(`<div class="popup-title">${bhId}</div><span class="status-pill" style="background:#7048e8;">CEP4</span><table class="popup-table" style="margin-top:8px;"><tr><td class="k">Easting</td><td>${x}</td></tr><tr><td class="k">Northing</td><td>${y}</td></tr></table>`);
      marker.bindTooltip(bhId, { direction: 'top', offset: [0,-6], className: 'bh-label', permanent: true });
      cep4Layer.addLayer(marker);
    });
  }, () => {});
}

function fetchProgressSeries() {}

function loadRows(data) {
  allRows = data.map(r => normalizeRow(r)).filter(r => (r['BH Name'] && r['BH Name'].trim()) || (r['PointID'] && r['PointID'].trim()));

  // Cache to localStorage
  try {
    localStorage.setItem('nbri_allrows_cache', JSON.stringify(allRows));
    localStorage.setItem('nbri_cache_timestamp', new Date().toISOString());
  } catch(e){}

  // Populate Filter Dropdowns
  const statuses = Array.from(new Set(allRows.map(r => (r['Status'] || '').trim()))).filter(Boolean).sort();
  const contractors = Array.from(new Set(allRows.map(r => (r['Contractor Done'] || r['Contractor'] || '').trim()))).filter(Boolean).sort();
  const lots = Array.from(new Set(allRows.map(r => (r['Lot'] || '').trim()))).filter(Boolean).sort();
  const packages = Array.from(new Set(allRows.map(r => (r['Package'] || '').trim()))).filter(Boolean).sort();

  populateSelect('f-status', statuses);
  populateSelect('f-contractor', contractors);
  populateSelect('f-lot', lots);
  populateSelect('f-package', packages);
  populateSelect('report-package-select', packages);

  buildLegend(allRows);
  buildPackageLegend(allRows);
  updateDashboard();
  render();
}

function populateSelect(id, vals){
  const s = document.getElementById(id);
  if (!s) return;
  const currentSelected = s.value;
  s.innerHTML = '<option value="">All</option>' + vals.map(v => `<option value="${v}">${v}</option>`).join('');
  s.value = currentSelected;
}

function buildLegend(rows){
  const counts = { "Completed": 0, "In Progress": 0, "Planned": 0, "Cancelled": 0 };
  rows.forEach(r => {
    let s = (r['Status'] || '').trim();
    if (s === 'Ongoing') s = 'In Progress';
    if (counts[s] !== undefined) counts[s]++;
  });
  const el = document.getElementById('legend');
  if (!el) return;
  el.innerHTML = Object.keys(counts).map(k => `<div class="legend-item"><span class="swatch" style="background:${colorFor(k)}"></span><span>${k}</span><span class="legend-count">${counts[k]}</span></div>`).join('');
}

function buildPackageLegend(rows){
  const counts = {};
  rows.forEach(r => {
    const p = (r['Package'] || '').trim();
    if (p) counts[p] = (counts[p] || 0) + 1;
  });
  const pkgs = Object.keys(counts).sort();
  const el = document.getElementById('package-legend');
  if (!el) return;
  el.innerHTML = pkgs.map(p => `<div class="legend-item"><span class="swatch" style="background:${colorForPackage(p)}"></span><span>${p}</span><span class="legend-count">${counts[p]}</span></div>`).join('');
}

function updateDashboard(){
  const total = allRows.length;
  let completed = 0, inProgress = 0, cancelled = 0;
  allRows.forEach(r => {
    let s = (r['Status'] || '').trim();
    if (s === 'Completed') completed++;
    else if (s === 'In Progress' || s === 'Ongoing') inProgress++;
    else if (s === 'Cancelled') cancelled++;
  });
  const remaining = Math.max(total - completed - inProgress - cancelled, 0);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('dash-total', total);
  setEl('dash-completed', completed);
  setEl('dash-inprogress', inProgress);
  setEl('dash-remaining', remaining);
  setEl('dash-progress', progressPct + '%');
}

const PACKAGE_PALETTE = ['#4c6ef5', '#e8590c', '#2b8a3e', '#c2255c', '#5f3dc4', '#0c8599', '#e67700', '#495057', '#087f5b', '#a61e4d'];

function colorFor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.default || '#4c6a72';
}

function colorForPackage(pkg) {
  const s = (pkg || '').trim();
  if (!s) return '#8a8370';
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return PACKAGE_PALETTE[Math.abs(hash) % PACKAGE_PALETTE.length];
}

function makeIcon(status, pkg, isSelected = false, selOrder = null) {
  const statusColor = colorFor(status);
  const pkgColor = colorForPackage(pkg);
  const opacity = (status === "Cancelled") ? "0.5" : "1.0";
  
  if (isSelected) {
    return L.divIcon({
      className: 'bh-marker-selected-wrap',
      html: `
        <div style="position:relative; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; inset:0; border-radius:50%; background:rgba(13,148,136,0.35); border:2px solid #0d9488; box-shadow:0 0 10px rgba(13,148,136,0.6);"></div>
          <div class="bh-dot-package" style="position:absolute; top:5px; left:5px; width:18px; height:18px; border-radius:50%; background:${pkgColor}; border:2px solid #ffffff; box-shadow:0 0 0 2px ${pkgColor}, 0 2px 6px rgba(0,0,0,0.5); opacity:${opacity};"></div>
          <div class="bh-dot-status" style="position:absolute; top:5px; left:5px; width:18px; height:18px; border-radius:50%; background:${statusColor}; border:2px solid #ffffff; box-shadow:0 0 0 2px ${statusColor}, 0 2px 6px rgba(0,0,0,0.5); opacity:${opacity};"></div>
          ${selOrder ? `<div style="position:absolute; top:-6px; right:-6px; background:#0f766e; color:#ffffff; font-size:10px; font-weight:900; width:17px; height:17px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:1.5px solid #ffffff; box-shadow:0 2px 4px rgba(0,0,0,0.4); z-index:10;">${selOrder}</div>` : ''}
        </div>`,
      iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
    });
  }

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

/* ── LEAFLET SPATIAL RENDERING & POPUPS ── */
function render(){
  if (!map || !markersLayer) return;
  
  const searchInput = document.getElementById('search');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const fStatus = document.getElementById('f-status') ? document.getElementById('f-status').value : '';
  const fContractor = document.getElementById('f-contractor') ? document.getElementById('f-contractor').value : '';
  const fLot = document.getElementById('f-lot') ? document.getElementById('f-lot').value : '';
  const fPackage = document.getElementById('f-package') ? document.getElementById('f-package').value : '';

  markersLayer.clearLayers();
  markers = [];
  let shown = 0;
  const bounds = [];
  const labeledPackages = new Set();

  allRows.forEach((row, rowIdx) => {
    const status = row['Status'] || '';
    const contractor = row['Contractor Done'] || row['Contractor'] || '';
    const lot = row['Lot'] || '';
    const pkg = row['Package'] || '';
    const name = row['BH Name'] || row['PointID'] || '';

    if (fStatus && status !== fStatus) return;
    if (fContractor && contractor !== fContractor) return;
    if (fLot && lot !== fLot) return;
    if (fPackage && pkg !== fPackage) return;
    if (searchTerm) {
      const hay = `${name} ${lot} ${pkg} ${contractor}`.toLowerCase();
      if (!hay.includes(searchTerm)) return;
    }

    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    if (e === null || n === null) return;
    const ll = convertToLatLon(e, n);
    if (!ll) return;

    bounds.push([ll.lat, ll.lon]);
    shown++;

    const isSelected = profileSelectedIdx.includes(rowIdx);
    const selOrder = isSelected ? (profileSelectedIdx.indexOf(rowIdx) + 1) : null;
    const marker = L.marker([ll.lat, ll.lon], { icon: makeIcon(status, pkg, isSelected, selOrder) });
    marker.rowIdx = rowIdx;

    marker.bindPopup(popupHtml(row, rowIdx), { maxWidth: 860, minWidth: 800, className: 'wide-popup' });
    marker.on('click', () => {
      if (profileSelectMode) {
        marker.closePopup();
        toggleProfileSelection(rowIdx);
      }
    });

    const cleanPkgName = pkg.trim();
    if (cleanPkgName && !labeledPackages.has(cleanPkgName)) {
      marker.bindTooltip(`📦 ${cleanPkgName}`, { permanent: true, direction: 'top', offset: [0, -9], className: 'pkg-label' });
      labeledPackages.add(cleanPkgName);
    } else {
      marker.bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -9], className: 'bh-label' });
    }

    markersLayer.addLayer(marker);
    markers.push(marker);
  });

  const countEl = document.getElementById('count');
  if (countEl) countEl.textContent = `${shown} of ${allRows.length} boreholes shown`;

  if (bounds.length > 0 && !window.__MAP_INITIALIZED_VIEW__) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    window.__MAP_INITIALIZED_VIEW__ = true;
  }

  updateProfileMapVisuals();
}

function updateProfileMapVisuals() {
  // 1. Update alignment polyline
  if (profilePolyline && map && typeof allRows !== 'undefined') {
    const latlngs = profileSelectedIdx.map(idx => {
      const r = allRows[idx];
      if (!r) return null;
      const e = toNum(r['Easting']), n = toNum(r['Northing']);
      if (e === null || n === null) return null;
      const ll = convertToLatLon(e, n);
      return ll ? [ll.lat, ll.lon] : null;
    }).filter(Boolean);
    profilePolyline.setLatLngs(latlngs);
  }

  // 2. Update marker icons on map
  if (markers && markers.length && typeof allRows !== 'undefined') {
    markers.forEach(marker => {
      if (!marker || marker.rowIdx === undefined) return;
      const r = allRows[marker.rowIdx];
      if (!r) return;
      const status = r['Status'] || '';
      const pkg = r['Package'] || '';
      const isSel = profileSelectedIdx.includes(marker.rowIdx);
      const selOrder = isSel ? (profileSelectedIdx.indexOf(marker.rowIdx) + 1) : null;
      marker.setIcon(makeIcon(status, pkg, isSel, selOrder));
    });
  }

  // 3. Update any open popup profile button
  if (typeof allRows !== 'undefined') {
    allRows.forEach((row, rIdx) => {
      const btn = document.getElementById(`popup-profile-btn-${rIdx}`);
      if (btn) {
        const isSel = profileSelectedIdx.includes(rIdx);
        const selPos = isSel ? (profileSelectedIdx.indexOf(rIdx) + 1) : null;
        if (isSel) {
          btn.className = 'popup-profile-btn selected';
          btn.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
          btn.innerHTML = `✓ Selected (#${selPos}) &mdash; Click to Remove`;
        } else {
          btn.className = 'popup-profile-btn';
          btn.style.background = 'linear-gradient(135deg, var(--brand-teal, #0d9488), var(--brand-teal-dark, #0f766e))';
          btn.innerHTML = `📐 Add to 2D Cross-Section`;
        }
      }
    });
  }

  // 4. Update sidebar chips
  if (typeof updateProfileChips === 'function') {
    updateProfileChips();
  }

  // 5. Update modal manager if open
  if (typeof updateModalBoreholeManager === 'function') {
    updateModalBoreholeManager();
  }
}

// Global window exports
window.updateProfileMapVisuals = updateProfileMapVisuals;

function popupHtml(row, rowIdx){
  const levels = computeBHLevels(row);
  const bhName = (row['BH Name'] || row['PointID'] || 'BH').trim();
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
  
  const isSel = profileSelectedIdx.includes(rowIdx);
  const selPos = isSel ? (profileSelectedIdx.indexOf(rowIdx) + 1) : null;
  const profileBtn = isSel
    ? `<button id="popup-profile-btn-${rowIdx}" onclick="toggleProfileSelection(${rowIdx})" class="popup-profile-btn selected" style="width:100%; margin-top:8px; padding:8px 10px; background:linear-gradient(135deg, #d97706, #b45309); color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11.5px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.15); transition:all 0.15s ease;">✓ Selected (#${selPos}) &mdash; Click to Remove</button>`
    : `<button id="popup-profile-btn-${rowIdx}" onclick="toggleProfileSelection(${rowIdx})" class="popup-profile-btn" style="width:100%; margin-top:8px; padding:8px 10px; background:linear-gradient(135deg, var(--brand-teal, #0d9488), var(--brand-teal-dark, #0f766e)); color:#fff; border:none; border-radius:6px; font-weight:800; font-size:11.5px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.15); transition:all 0.15s ease;">📐 Add to 2D Cross-Section</button>`;

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
      </div>
    </div>`;
}

function buildBoreholeLogMarkup(levels, layers, row){
  const svg = buildBoreholeLogSvg(levels, layers, row);
  if (!svg) return '';
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

/* ── GEOLOCATION CONTROLLER ── */
function toggleLocate(btn){
  if (userLocationWatchId !== null){
    navigator.geolocation.clearWatch(userLocationWatchId);
    userLocationWatchId = null;
    if (userLocationMarker) { map.removeLayer(userLocationMarker); userLocationMarker = null; }
    if (userAccuracyCircle) { map.removeLayer(userAccuracyCircle); userAccuracyCircle = null; }
    if (btn) { btn.classList.remove('locate-active', 'locate-acquiring'); }
    return;
  }
  if (!navigator.geolocation) {
    alert('Browser doesn\'t support geolocation.');
    return;
  }
  if (btn) btn.classList.add('locate-acquiring');
  let firstFix = true;
  userLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];
      if (!userLocationMarker){
        userLocationMarker = L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: '#1e6fd9', fillOpacity: 1 }).addTo(map).bindPopup('Accuracy: &plusmn;' + Math.round(accuracy) + 'm');
      } else { userLocationMarker.setLatLng(latlng); }
      if (!userAccuracyCircle){
        userAccuracyCircle = L.circle(latlng, { radius: accuracy, color: '#1e6fd9', weight: 1, fillColor: '#1e6fd9', fillOpacity: 0.12 }).addTo(map);
      } else { userAccuracyCircle.setLatLng(latlng).setRadius(accuracy); }
      if (firstFix){
        map.setView(latlng, Math.max(map.getZoom(), 17));
        firstFix = false;
        if (btn) { btn.classList.remove('locate-acquiring'); btn.classList.add('locate-active'); }
      }
    },
    (err) => {
      alert('Could not acquire location: ' + err.message);
      if (btn) btn.classList.remove('locate-active', 'locate-acquiring');
      userLocationWatchId = null;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

/* ── DISTANCE / AREA MEASURING RULER HANDLERS ── */
function initMeasurementHandlers() {
  const mBtn = document.getElementById('measure-btn');
  if (!mBtn) return;

  mBtn.addEventListener('click', function() {
    isMeasuring = !isMeasuring;
    const panel = document.getElementById('measure-output');
    if (isMeasuring) {
      this.textContent = "🛑 Stop Measuring / Clear";
      this.style.background = "#c0523f";
      this.style.color = "#fff";
      if (panel) panel.style.display = "block";
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', onMeasureMapClick);
      map.on('dblclick', finishMeasureArea);
      map.doubleClickZoom.disable();
    } else {
      this.textContent = "📏 Enable Distance/Area Ruler";
      this.style.background = "";
      this.style.color = "";
      if (panel) panel.style.display = "none";
      map.getContainer().style.cursor = '';
      map.off('click', onMeasureMapClick);
      map.off('dblclick', finishMeasureArea);
      map.doubleClickZoom.enable();
      clearMeasurements();
    }
  });
}

function onMeasureMapClick(e) {
  const latlng = e.latlng;
  measurePoints.push(latlng);
  const dot = L.circleMarker(latlng, { radius: 5, color: '#b3541e', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(map);
  measureMarkers.push(dot);
  if (measureLines) measureLines.setLatLngs(measurePoints);
  if (measurePolygon) measurePolygon.setLatLngs(measurePoints);
  calculateMeasurementOutput();
}

function calculateMeasurementOutput() {
  const panel = document.getElementById('measure-output');
  if (!panel) return;
  if (measurePoints.length < 2) {
    panel.innerHTML = "Click next point... Double-click to lock area calculation.";
    return;
  }
  let totalDistance = 0;
  for (let i = 1; i < measurePoints.length; i++) {
    totalDistance += measurePoints[i-1].distanceTo(measurePoints[i]);
  }
  let outputHtml = `<b>Total Length:</b> ${totalDistance.toFixed(2)} m`;
  if (measurePoints.length >= 3) {
    const areaM2 = geodesicArea(measurePoints);
    outputHtml += `<br><b>Enclosed Area:</b> ${(areaM2 / 10000).toFixed(3)} Hectares (${areaM2.toFixed(1)} m²)`;
  }
  panel.innerHTML = outputHtml;
}

function finishMeasureArea() {
  if (measurePoints.length > 2) {
    measurePoints.push(measurePoints[0]);
    if (measureLines) measureLines.setLatLngs(measurePoints);
    if (measurePolygon) measurePolygon.setLatLngs(measurePoints);
    calculateMeasurementOutput();
  }
}

function clearMeasurements() {
  measurePoints = [];
  if (measureLines) measureLines.setLatLngs([]);
  if (measurePolygon) measurePolygon.setLatLngs([]);
  measureMarkers.forEach(m => map.removeLayer(m));
  measureMarkers = [];
  const panel = document.getElementById('measure-output');
  if (panel) panel.innerHTML = "Click points on the map to measure.";
}

function geodesicArea(latLngs) {
  const RADIUS = 6378137;
  let area = 0;
  if (latLngs.length > 2) {
    for (let i = 0; i < latLngs.length; i++) {
      const p1 = latLngs[i];
      const p2 = latLngs[(i + 1) % latLngs.length];
      area += (p2.lng - p1.lng) * Math.PI / 180 * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
    }
    area = area * RADIUS * RADIUS / 2;
  }
  return Math.abs(area);
}

/* ── VECTOR OVERLAY (KML, GeoJSON, Shapefile ZIP) ENGINE ── */
function dashArrayForLinetype(lt) {
  const s = String(lt || '').toLowerCase();
  if (s.includes('dash') || s.includes('hidden')) return '6, 5';
  if (s.includes('dot')) return '1, 5';
  if (s.includes('center')) return '10, 4, 2, 4';
  return null;
}

function styleForOverlayFeature(feature) {
  const props = feature.properties || {};
  let color = '#b3541e';
  if (props.Color !== undefined) {
    const aci = parseInt(props.Color);
    if (!isNaN(aci) && ACI_COLORS[aci]) color = ACI_COLORS[aci];
  } else if (props.stroke) {
    color = props.stroke;
  }
  const lt = props.Linetype || props.EntLinetyp || '';
  return {
    color: color,
    weight: typeof OVERLAY_LINE_WEIGHT_PX !== 'undefined' ? OVERLAY_LINE_WEIGHT_PX : 2.0,
    dashArray: dashArrayForLinetype(lt),
    opacity: 0.95,
    fillColor: color,
    fillOpacity: 0.15
  };
}

function addOverlayLayer(name, geojson, fitToBounds = true) {
  let layer;
  try {
    layer = L.geoJSON(geojson, {
      style: styleForOverlayFeature,
      pointToLayer: (feature, latlng) => {
        const s = styleForOverlayFeature(feature);
        return L.circleMarker(latlng, { radius: 5, color: s.color, weight: 1.5, fillColor: s.color, fillOpacity: 0.85 });
      }
    });
  } catch (err) {
    alert('Could not draw "' + name + '": ' + err.message);
    return;
  }
  overlayCount++;
  const label = overlayCount + '. ' + name;
  layer.addTo(map);
  if (layersControl) layersControl.addOverlay(layer, label);
  if (fitToBounds) {
    try {
      const b = layer.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
    } catch (e) {}
  }
}

function loadOverlayFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'kml') {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dom = new DOMParser().parseFromString(reader.result, 'text/xml');
        if (typeof toGeoJSON !== 'undefined' && toGeoJSON.kml) {
          addOverlayLayer(file.name, toGeoJSON.kml(dom));
        } else {
          alert('KML parser not loaded.');
        }
      } catch (err) {
        alert('Could not parse KML: ' + err.message);
      }
    };
    reader.readAsText(file);
  } else if (ext === 'geojson' || ext === 'json') {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        addOverlayLayer(file.name, JSON.parse(reader.result));
      } catch (err) {
        alert('Could not parse GeoJSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  } else if (ext === 'zip') {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof shp !== 'undefined') {
        shp(reader.result).then(geojson => addOverlayLayer(file.name, geojson)).catch(err => alert('Zipped Shapefile error: ' + err.message));
      } else {
        alert('Shapefile library (shpjs) not ready.');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

function loadPermanentOverlays() {
  if (typeof PERMANENT_OVERLAYS === 'undefined' || !PERMANENT_OVERLAYS.length) return;
  PERMANENT_OVERLAYS.forEach(o => {
    fetch(o.url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(buf => {
        if (typeof shp !== 'undefined') return shp(buf);
        throw new Error('shpjs not loaded');
      })
      .then(geojson => {
        roadCorridorGeoJSON = geojson;
        addOverlayLayer(o.name, geojson, false);
      })
      .catch(err => console.warn('Permanent overlay note (' + o.name + '):', err.message));
  });
}

/* ── VISIBLE FILTERED ROWS (FOR CARTOGRAPHIC MAP PDF) ── */
function getVisibleFilteredRows() {
  const out = [];
  if (!map || !allRows) return out;
  const bounds = map.getBounds();
  const searchInput = document.getElementById('search');
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const fStatusEl = document.getElementById('f-status');
  const fContractorEl = document.getElementById('f-contractor');
  const fLotEl = document.getElementById('f-lot');
  const fPackageEl = document.getElementById('f-package');

  const fStatus = fStatusEl ? fStatusEl.value : '';
  const fContractor = fContractorEl ? fContractorEl.value : '';
  const fLot = fLotEl ? fLotEl.value : '';
  const fPackage = fPackageEl ? fPackageEl.value : '';

  allRows.forEach(row => {
    const status = row['Status'] || '';
    const contractor = row['Contractor Done'] || row['Contractor'] || '';
    const lot = row['Lot'] || '';
    const pkg = row['Package'] || '';
    const name = row['BH Name'] || '';

    if (fStatus && status !== fStatus) return;
    if (fContractor && contractor !== fContractor) return;
    if (fLot && lot !== fLot) return;
    if (fPackage && pkg !== fPackage) return;
    if (searchTerm) {
      const hay = `${name} ${lot} ${pkg} ${contractor}`.toLowerCase();
      if (!hay.includes(searchTerm)) return;
    }
    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    if (e === null || n === null) return;
    const ll = convertToLatLon(e, n);
    if (!ll) return;
    if (!bounds.contains([ll.lat, ll.lon])) return;
    out.push({ row, lat: ll.lat, lon: ll.lon, status });
  });
  return out;
}

function setupPwaCache() {}
