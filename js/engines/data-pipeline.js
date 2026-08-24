/* ============================================================
   APPLICATION VERSION & CACHE MANAGEMENT
   ============================================================ */
const APP_VERSION = "2.5.0"; // Major: Foliation Structural Projection, Geotechnical Rules Registry, System Hub & Version Center
const LOCAL_BOREHOLES_CSV = "CEP 3  Rambukkana-Galagedara - BoreholesDetails (2).csv";

function getBustedUrl(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_v=${APP_VERSION}_t=${Date.now()}`;
}

/* ── VERSION MODAL & SYSTEM HUB CONTROLLERS ── */
function openVersionModal(defaultTab = 'changelog') {
  const backdrop = document.getElementById('version-modal-backdrop');
  if (!backdrop) return;
  switchVersionTab(defaultTab);
  updateDiagnosticsTab();
  backdrop.classList.add('open');
}

function closeVersionModal() {
  const backdrop = document.getElementById('version-modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function switchVersionTab(tabId) {
  const tabs = ['changelog', 'rules', 'copyright', 'diagnostics'];
  tabs.forEach(t => {
    const btn = document.getElementById(`vbtn-${t}`);
    const pane = document.getElementById(`vtab-${t}`);
    if (btn) {
      if (t === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (pane) {
      if (t === tabId) pane.classList.add('active');
      else pane.classList.remove('active');
    }
  });
}

function updateDiagnosticsTab() {
  const vEl = document.getElementById('diag-app-version');
  const netEl = document.getElementById('diag-net-status');
  const cacheEl = document.getElementById('diag-cache-ver');
  const embedEl = document.getElementById('diag-embedded-status');
  
  if (vEl) vEl.textContent = `v${APP_VERSION}`;
  if (netEl) {
    const isOnline = navigator.onLine;
    netEl.textContent = isOnline ? 'Online (Connected)' : 'Offline (Local Mode)';
    netEl.style.color = isOnline ? '#16a34a' : '#dc2626';
  }
  if (cacheEl) {
    const stored = localStorage.getItem('nbri_app_version') || 'None';
    cacheEl.textContent = stored === APP_VERSION ? `v${stored} (Synchronized)` : `v${stored} (Outdated)`;
    cacheEl.style.color = stored === APP_VERSION ? '#16a34a' : '#d97706';
  }
  if (embedEl) {
    const hasData = (typeof window.EMBEDDED_BOREHOLES_CSV === 'string' && window.EMBEDDED_BOREHOLES_CSV.length > 50);
    embedEl.textContent = hasData ? 'Ready (data_master.js loaded)' : 'Master File Absent';
    embedEl.style.color = hasData ? '#2563eb' : '#dc2626';
  }
}

function copySystemInfo() {
  const infoText = `NBRI Geotechnical Information System — CEP3
Application Version: v${APP_VERSION} (Release: August 2026)
Engineered & Developed by: Ranjan (Geotechnical Engineering Division, NBRI)
Project: Central Expressway Project Section 3 (Rambukkana to Galagedara)
Institutional Owner: National Building Research Institute (NBRI), Sri Lanka
Copyright: © 2026 National Building Research Institute (NBRI). All Rights Reserved.
Status: Operational with 19 Active Geotechnical Modeling Rules.`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(infoText).then(() => {
      showAppToast('📋 System Details Copied', 'Copyright and version information copied to clipboard.', 'success');
    }).catch(() => {
      fallbackCopyText(infoText);
    });
  } else {
    fallbackCopyText(infoText);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showAppToast('📋 System Details Copied', 'Copyright and version information copied to clipboard.', 'success');
  } catch(e) {
    showAppToast('⚠️ Copy Notice', 'Please manually select and copy system information.', 'warning');
  }
  document.body.removeChild(ta);
}

function showAppToast(title, message, type = 'info', duration = 4500) {
  const container = document.getElementById('app-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `app-toast ${type}`;
  toast.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:3px;">
      <strong style="font-size:12.5px; color:#fff;">${title}</strong>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#94a3b8; font-size:15px; cursor:pointer; padding:0 3px; line-height:1;">&times;</button>
    </div>
    <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">${message}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, duration);
}

function checkForAppUpdates(manual = false) {
  const storedVer = localStorage.getItem('nbri_app_version');
  updateDiagnosticsTab();
  if (manual) {
    showAppToast('🔄 System Check Complete', `You are running the latest version v${APP_VERSION}. All geotechnical models and dataset caches are up to date.`, 'success');
  }
}

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

function showVersionUpdateNotice(oldVer, newVer) {
  showAppToast(
    `🚀 System Updated (v${newVer})`,
    `Foliation structural projection engine, updated geotechnical rules, and master datasets are ready. <a href="javascript:void(0)" onclick="openVersionModal('changelog')" style="color:#60a5fa; font-weight:700; text-decoration:underline;">View What's New &rarr;</a>`,
    'success',
    9000
  );
}

function forceHardRefreshAndPurge() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch(e){}
  showAppToast('🧹 Purging Cache...', 'Reloading latest system state from server.', 'info');
  setTimeout(() => {
    window.location.reload(true);
  }, 400);
}

/* ── AUTO REFRESH CACHE ON FILE OPEN ── */
function autoRefreshCacheOnStartup() {
  try {
    sessionStorage.clear();
    // Clear temporary data cache keys to guarantee fresh dataset parsing on startup
    const tempKeys = ['nbri_dates_cache', 'nbri_cache_timestamp'];
    tempKeys.forEach(k => localStorage.removeItem(k));
    if ('caches' in window) {
      caches.keys().then(names => { names.forEach(n => caches.delete(n)); }).catch(() => {});
    }
    console.log('[NBRI System] Cache memory automatically refreshed on startup.');
    setTimeout(() => {
      showAppToast('⚡ Fresh Cache Synchronized', 'Real-time dataset connection established with live cache busting.', 'info', 3500);
    }, 1200);
  } catch(e) {
    console.warn('[NBRI System] Auto-refresh cache note:', e);
  }
}

checkAppVersionAndClearCache();
autoRefreshCacheOnStartup();

/* ============================================================
   CONFIG
   ============================================================ */
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?gid=364501395&single=true&output=csv";
const LOG_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv";
const BH_PROFILE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv&gid=1914424732";
const CEP4_BH_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv&gid=1030712797";
const CEP4_SHEET_CSV_URL = "PASTE_PUBLISHED_CSV_LINK_FOR_GID_1030712797_HERE";
const PROGRESS_SHEET_CSV_URL = "PASTE_PUBLISHED_CSV_LINK_FOR_GID_1476293361_HERE";
const AUTO_REFRESH_MS = 5 * 60 * 1000;

proj4.defs("EPSG:5235", "+proj=tmerc +lat_0=7.000480277777778 +lon_0=80.77171308333334 +k=0.9999238418 +x_0=500000 +y_0=500000 +ellps=evrst30 +towgs84=-0.293,766.95,87.713,0.195704,1.69507,3.47302,-0.039338 +units=m +no_defs");

const SAMPLE_CSV = `BH Name,Easting,Northing,Elevation,TF,Status,Contractor,Difficulty,Lot,Package,Status-N,Termination Depth,Rock Coring,Groundwater Level
BH-MT-08,457534.196,539950.47,99.929,TRUE,Completed,NBRI,Paddy Field,Lot 0,Package 2A,2,15,12,2
BH-MT-07,457571.239,539966.16,100.505,TRUE,Completed,NBRI,Paddy Field,Lot 0,Package 2A,2,15,9,1`;

const STATUS_COLORS = {
  "Completed": "#2f6f5e",
  "Cancelled": "#c0523f",
  "Ongoing": "#b3541e",
  "In Progress": "#b3541e",
  "Planned": "#8a8370",
  "Pending": "#c9a227",
  "default": "#4c6a72"
};

const map = L.map('map', { zoomControl: true }).setView([7.45, 80.6], 12);

let isMeasuring = false;
let measurePoints = [];
let measureLines = L.polyline([], {color: '#b3541e', weight: 3, dashArray: '6, 6'}).addTo(map);
let measurePolygon = L.polygon([], {color: '#b3541e', fillColor: '#b3541e', fillOpacity: 0.15}).addTo(map);
let measureMarkers = [];
let timelineActiveDate = null;
let progressSeries = [];

const baseLayers = {
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
const layersControl = L.control.layers(baseLayers, {}, {
  position: 'topright', collapsed: window.matchMedia('(max-width: 768px)').matches
}).addTo(map);

const cep4Layer = L.layerGroup();
layersControl.addOverlay(cep4Layer, 'CEP4 BHs (separate project)');

function fetchCEP4BHs(){
  Papa.parse(CEP4_BH_CSV_URL, {
    download: true, header: true, skipEmptyLines: true,
    complete: (results) => {
      cep4Layer.clearLayers();
      let count = 0;
      results.data.forEach(raw => {
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
        count++;
      });
      console.log('CEP4 BHs loaded:', count);
    },
    error: (err) => console.error('Could not load CEP4 BH IDs:', err)
  });
}

let userLocationMarker = null;
let userAccuracyCircle = null;
let userLocationWatchId = null;

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

function toggleLocate(btn){
  if (userLocationWatchId !== null){
    navigator.geolocation.clearWatch(userLocationWatchId); userLocationWatchId = null;
    if (userLocationMarker) { map.removeLayer(userLocationMarker); userLocationMarker = null; }
    if (userAccuracyCircle) { map.removeLayer(userAccuracyCircle); userAccuracyCircle = null; }
    if (btn) { btn.classList.remove('locate-active', 'locate-acquiring'); }
    return;
  }
  if (!navigator.geolocation) { alert('Browser doesn\'t support geolocation.'); return; }
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
        map.setView(latlng, Math.max(map.getZoom(), 17)); firstFix = false;
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

const markersLayer = L.layerGroup();
map.addLayer(markersLayer);

const LABEL_MIN_ZOOM = 18;
function updateLabelVisibility(){
  const zoom = map.getZoom();
  const mapDiv = document.getElementById('map');
  mapDiv.classList.toggle('show-pkg-labels', zoom >= 12 && zoom < LABEL_MIN_ZOOM);
  mapDiv.classList.toggle('show-bh-labels', zoom >= LABEL_MIN_ZOOM);
}
map.on('zoomend', updateLabelVisibility);

let allRows = [];
let markers = [];

function setStatus(text, cls){
  document.getElementById('status-text').textContent = text;
  const dot = document.getElementById('status-dot');
  dot.className = ''; if (cls) dot.classList.add(cls);
}

function toNum(v){
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getFirst(row, keys){
  for (const k of keys){
    const v = row[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseDateFlexible(value){
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  let d = null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m){
    let [, dd, mo, yyyy] = m;
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    d = new Date(parseInt(yyyy, 10), parseInt(mo, 10) - 1, parseInt(dd, 10));
  } else {
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}
function formatDateDMY(value){
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  const d = parseDateFlexible(s);
  if (!d) return s;
  return `${String(d.getDate()).padStart(2,'0')} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

function normalizeRow(row){
  const out = {};
  for (const k in row){ out[k.replace(/\s+/g, ' ').trim()] = row[k]; }
  return out;
}

let bhDatesLookup = {};

// BS 5930 (British Soil Classification System, BSCS) letter code table.
// First letter = primary soil type: C=Clay, M=Silt, S=Sand, G=Gravel.
// For FINE soils (C/M), the second letter is the PLASTICITY grade based on
// liquid limit: L=Low (<35%), I=Intermediate (35-50%), H=High (50-70%),
// V=Very High (70-90%), E=Extremely High (>90%). An 'O' suffix denotes
// organic material (e.g. CHO = High plasticity CLAY, Organic).
// For COARSE soils (S/G), the second letter is a SECONDARY CONSTITUENT
// qualifier (e.g. SC = Sandy... no — S=Sand with C=Clayey fines; the
// direction of the compound reads primary-soil-plus-secondary-fines for
// S/G, but primary-soil-plus-plasticity for C/M — this is standard BS 5930
// usage, not a project quirk). Two codes (CS, MG) were confirmed directly
// against the project's own usage rather than inferred from the letter
// scheme alone, since a literal reading of the standard's C/M-second-letter
// convention would treat 'S' and 'G' as invalid plasticity grades: CS =
// Sandy CLAY, MG = Gravelly SILT (both confirmed).
const GRAPHIC_CODE_INFO = {
  // ---- Fine soils: CLAY (C) ----
  'CL':  { label: 'Low Plasticity CLAY', color: '#bd6b46' },
  'CI':  { label: 'Intermediate Plasticity CLAY', color: '#b04a8a' },
  'CH':  { label: 'High Plasticity CLAY', color: '#8a4530' },
  'CV':  { label: 'Very High Plasticity CLAY', color: '#6e3020' },
  'CE':  { label: 'Extremely High Plasticity CLAY', color: '#521f14' },
  'CS':  { label: 'Sandy CLAY', color: '#a56942' }, // confirmed against project usage
  'CLO': { label: 'Low Plasticity CLAY (Organic)', color: '#7a5238' },
  'CIO': { label: 'Intermediate Plasticity CLAY (Organic)', color: '#6f3a60' },
  'CHO': { label: 'High Plasticity CLAY (Organic)', color: '#5c3020' },
  'CVO': { label: 'Very High Plasticity CLAY (Organic)', color: '#4a2415' },
  'CSO': { label: 'Sandy CLAY (Organic)', color: '#6f4a30' },

  // ---- Fine soils: SILT (M) ----
  'ML':  { label: 'Low Plasticity SILT', color: '#a8b06a' },
  'MI':  { label: 'Intermediate Plasticity SILT', color: '#96a352' },
  'MH':  { label: 'High Plasticity SILT', color: '#9a9e5a' },
  'MV':  { label: 'Very High Plasticity SILT', color: '#7d8248' },
  'ME':  { label: 'Extremely High Plasticity SILT', color: '#636836' },
  'MS':  { label: 'Sandy SILT', color: '#c9a84e' }, // confirmed against project usage (matches CS pattern)
  'MG':  { label: 'Gravelly SILT', color: '#8f8f5a' }, // confirmed against project usage
  'MLO': { label: 'Low Plasticity SILT (Organic)', color: '#6a5a40' },
  'MHO': { label: 'High Plasticity SILT (Organic)', color: '#5a4d2c' },
  'MEO': { label: 'Extremely High Plasticity SILT (Organic)', color: '#494024' },

  // ---- Coarse soils: SAND (S) ----
  'SW':  { label: 'Well Graded SAND', color: '#e8c85a' },
  'SP':  { label: 'Poorly Graded SAND', color: '#f0d98a' },
  'SM':  { label: 'Silty SAND', color: '#e0b23c' },
  'SC':  { label: 'Clayey SAND', color: '#9c7a3a' },
  // Dual/borderline classifications (5-15% fines, both gradation and
  // plasticity assessed — standard BS 5930 dual notation).
  'SPC': { label: 'Poorly Graded SAND with Clay', color: '#c9a55a' },
  'SME': { label: 'Silty SAND (Extremely High Plasticity fines)', color: '#b8963c' },

  // ---- Coarse soils: GRAVEL (G) ----
  'GW':  { label: 'Well Graded GRAVEL', color: '#726352' },
  'GP':  { label: 'Poorly Graded GRAVEL', color: '#8a7a63' },
  'GM':  { label: 'Silty GRAVEL', color: '#8a7a63' },
  'GC':  { label: 'Clayey GRAVEL', color: '#5f5240' },
  'GPG': { label: 'Poorly Graded GRAVEL (Gravelly fines)', color: '#6e6250' },

  // ---- Other / project-specific ----
  'OL':  { label: 'Organic SILT/CLAY', color: '#6a5a40' },
  'OH':  { label: 'Organic CLAY', color: '#5a4030' },
  'FILL':{ label: 'Engineered Fill', color: '#d9a05b' },
  'WEATHERED ROCK': { label: 'Weathered Rock / Saprolite', color: '#a39c87' }
};
const ROCK_KEYWORDS = ['BEDROCK','ROCK','GNEISS','GRANITE','QUARTZITE','SCHIST','MARBLE','DOLERITE','CHARNOCKITE','GABBRO','LIMESTONE'];

function isBoulderCode(code) {
  const up = (code || '').toUpperCase();
  return up.includes('BOULDER') || up.includes('CORESTONE');
}

function isRockCode(code) {
  const up = (code || '').toUpperCase();
  if (isBoulderCode(up)) return false; // Boulders are isolated corestones in soil, NOT continuous regional bedrock
  return ROCK_KEYWORDS.some(k => up.includes(k));
}

function graphicHashColor(code){
  let hash = 0;
  const s = (code || '').trim();
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const soilPalette = ['#c9975a','#7a9e6e','#b06a9e','#5a8ca8','#c96a5a','#9e8a4a'];
  return soilPalette[Math.abs(hash) % soilPalette.length];
}

function getGraphicInfo(code){
  const clean = (code || '').trim();
  const upper = clean.toUpperCase();
  if (isBoulderCode(clean)){
    return { label: 'Boulder / Corestone', color: '#b0a898', isBoulder: true, isRock: false };
  }
  if (isRockCode(clean)){
    return { label: clean, color: '#8f8f95', isRock: true };
  }
  if (GRAPHIC_CODE_INFO[upper]){
    return { label: GRAPHIC_CODE_INFO[upper].label, color: GRAPHIC_CODE_INFO[upper].color, isRock: false };
  }
  return { label: clean || 'Unclassified Soil', color: graphicHashColor(clean), isRock: false };
}

let profileLayersByBH = {};
let profileWeatheringByBH = {}; // { bhKey: [ {depth, grade}, ... ] } sorted by depth

// Colour ramp is built dynamically from the ACTUAL bedrock colour (see
// buildWeatheringColorRamp below) so 'fresh' always matches the plain bedrock
// fill exactly, and lighter grades are tints of that same colour — not an
// unrelated fixed palette. WEATHERING_GRADE_ORDER defines both the fixed
// depth sequence and the fade direction (index 0 = lightest/shallowest end).
const WEATHERING_GRADE_ORDER = ['highly', 'moderately', 'slightly', 'fresh'];
const WEATHERING_GRADE_LABELS = {
  highly: 'Highly Weathered Rock',
  moderately: 'Moderately Weathered Rock',
  slightly: 'Slightly Weathered Rock',
  fresh: 'Fresh Rock'
};
// Fade position (0..1) assigned to each grade anchor along the continuous
// ramp. 'fresh' sits at 1.0 (=100% bedrock colour, 0% lightened) so it melts
// seamlessly into plain bedrock wherever there's no weathering data at all.
const WEATHERING_GRADE_FADE_POS = { highly: 0.0, moderately: 0.42, slightly: 0.72, fresh: 1.0 };

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
// Used to smoothly transition a connected multi-origin unit's colour between
// two boreholes' different dominant materials, instead of a hard vertical
// seam at the midpoint (rule 10 refinement — curved/smoothed boundaries).
function blendColors(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const tt = Math.max(0, Math.min(1, t));
  return rgbToHex(a.r + (b.r - a.r) * tt, a.g + (b.g - a.g) * tt, a.b + (b.b - a.b) * tt);
}
// Builds the {highly, moderately, slightly, fresh} colour map as tints of the
// real bedrock colour: fresh = bedrockColor exactly (amount 0), highly = most
// lightened. Max lightening kept moderate so 'highly' still reads as rock,
// not washed out to near-white.
function buildWeatheringColorRamp(bedrockColor) {
  const maxLighten = 0.62;
  const out = {};
  WEATHERING_GRADE_ORDER.forEach(g => {
    const fadePos = WEATHERING_GRADE_FADE_POS[g];
    out[g] = lightenColor(bedrockColor, (1 - fadePos) * maxLighten);
  });
  return out;
}
// Interpolates a colour at continuous fade position t (0=highly..1=fresh) by
// blending between the two nearest grade anchors — this is what gives the
// smooth, seamless fade instead of discrete flat-coloured bands.
function colorAtFadePosition(t, bedrockColor) {
  const maxLighten = 0.62;
  const amount = Math.max(0, Math.min(1, (1 - t) * maxLighten));
  return lightenColor(bedrockColor, amount);
}

// Maps raw "Primary Weathering" sheet values to 4 canonical grades.
// Blank/unrecognized values default to 'fresh' per spec.
const WEATHERING_GRADE_MAP = {
  'highly weathered': 'highly',
  'moderately weathered': 'moderately',
  'moderately': 'moderately',
  'slightly weathered': 'slightly',
  'fresh': 'fresh'
};
function normalizeWeatheringGrade(raw) {
  const clean = (raw || '').trim().toLowerCase();
  if (!clean) return 'fresh';
  return WEATHERING_GRADE_MAP[clean] || 'fresh';
}

// Builds a single borehole's piecewise-linear fade profile (depth-below-
// rockhead -> fade fraction 0..1), given its own weathering readings and rock
// span. Standalone/global so both the section-profile renderer and the
// borehole popup log can share identical fade logic for one column.
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




function cleanBHKey(key) {
  return (key || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

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

  if (onError) onError();
}

/* ============================================================
   GEOLOGICAL RULES — READ ME BEFORE EDITING SOIL/ROCK RENDERING
   ============================================================
   This block is the single source of truth for the geological
   modelling rules encoded in this file. If you (human or AI) add,
   change, or remove a geological behaviour anywhere in this file,
   UPDATE THIS BLOCK IN THE SAME EDIT. Do not let this note go stale
   — a future editor (human or AI) with zero other context needs to
   be able to read this and understand every rule currently active.

   1. SOIL ORIGIN IS THE PRIMARY PARTITION, BSCS IS SECONDARY.
      Two soil layers are only allowed to interpolate/connect across
      neighbouring boreholes if they belong to the SAME "origin
      family" (see ORIGIN_FAMILY below). BSCS grain-size code (SM,
      MS, CS, etc.) only matters WITHIN a family — it no longer
      drives interpolation on its own the way it used to. Two layers
      can share an identical BSCS code and still be geologically
      unconnectable if their Origins put them in different families
      (e.g. an "Alluvium/SM" layer must NEVER blend into a
      neighbouring "Residual/SM" layer just because both are SM).

   2. ORIGIN FAMILIES (which Origins are allowed to connect):
        Family "residual"   -> Residual, Completely Weathered Rock
                                (these two are genetically the same
                                in-situ weathering profile — CWR is
                                just the most-weathered end-member of
                                Residual soil — so they DO connect
                                and interpolate continuously, exactly
                                like ordinary soil layers do today.)
        Family "alluvium"   -> Alluvium (isolated; see rule 3, lens
                                geometry, not tabular pinch-out)
        Family "colluvium"  -> Colluvium (isolated, lens-type, same
                                treatment as Alluvium — gravity-
                                transported, not a regional blanket)
        Family "made_ground"-> Made Ground, Engineered Fill (isolated
                                — both are human-placed, so treated
                                as local/bounded features, never
                                extended into natural soil)
        Every other Origin value (Aeolian, Estuarine, Marine, Peat/
        Organic, Laterite, Saprolite, Glacial/Glaciofluvial,
        Lacustrine, or blank/unknown) currently falls back to its
        own single-Origin family: it only connects to an identical
        Origin string at a neighbouring borehole. This is a
        deliberate simplification (see rule 5) — extend the mapping
        below (ORIGIN_FAMILY) if a specific pairing rule is needed.

   3. LENS GEOMETRY FOR TRANSPORTED DEPOSITS — CORRECTED, connectivity-
      based (Alluvium, Colluvium, Made Ground, Engineered Fill):
      these do NOT automatically get the ordinary "pinch out halfway
      to the next borehole" tabular treatment just by having a
      lens-eligible Origin — but they DO get it if a neighbouring
      borehole logs the SAME origin family AND same representative
      graphic/BSCS (see hasMatchingNeighborBlock). Only a block with
      NO such match at either adjacent borehole is treated as an
      isolated lens: rendered as a self-contained shape around its
      OWN borehole, capped at a FIXED maximum lateral half-width
      (LENS_MAX_HALF_WIDTH_M below), tapering to a point. This
      matters because a real Alluvium blanket that's genuinely
      continuous across several boreholes (common near a floodplain
      surface) should NOT be fragmented into disconnected lenses just
      because its Origin is a "lens-eligible" family — the family
      only controls ELIGIBILITY for lens treatment, not a blanket
      requirement for it. (An earlier version of this rule forced
      every occurrence of these origins into an isolated lens
      unconditionally — that was wrong and has been corrected.)

   4. WEATHERING GRADE FADE (rock) is unaffected by this partitioning
      — it already has its own continuous-fade system (see the
      WEATHERING_GRADE_* constants and getFadeFractionAt), anchored
      so 'fresh' always equals the plain bedrock colour. That system
      is unchanged by the origin rules above.

   5. SIMPLIFICATION WE'RE ACCEPTING: "same Origin family + same
      representative graphic at neighbouring boreholes = connectable"
      is assumed without verifying it's genuinely the same physical
      deposit (e.g. two separate Alluvium channels could share the
      label). This mirrors the same assumption the original BSCS-only
      pinch-out logic made. A future improvement would need an
      explicit deposit/body ID column, which the source sheet does
      not currently have.

   6. HATCH / TEXTURE OVERLAY PER ORIGIN: BS 5930 Table 16 defines
      hatch patterns for MATERIAL/LITHOLOGY (sand, clay, gravel,
      chalk, etc.), not for depositional ORIGIN — there is no
      official BS 5930 symbol for "Alluvium" vs "Residual" as such.
      The origin hatch set used here (see ORIGIN_HATCH_INFO /
      buildOriginHatchDefs) is therefore a PROJECT CONVENTION we
      designed, not a literal BS 5930 citation, layered on top of the
      BS-5930-informed BSCS fill colours which remain the material-
      type authority. This is called out here so nobody mistakes the
      origin hatch for an official standard symbol. REVISED: Residual
      and Completely Weathered Rock now EACH have their own distinct
      hatch texture (an earlier version left the whole family
      texture-free to avoid competing with the rock weathering fade;
      that was changed on direction — both origins should appear in
      the Soil Origin legend even though they remain one CONNECTIVITY
      family, i.e. they can still interpolate into each other across
      boreholes per rule 1/2). Because Residual and Completely
      Weathered Rock share one family but need different textures,
      hatch lookup uses a separate, finer-grained key
      (originHatchKeyOf) than the coarser family used for stacking/
      connectivity decisions — most origins' hatch key equals their
      family; Residual/CWR is the one case where it doesn't. The
      hatch key is rendered as its own legend section, separate from
      the BSCS colour legend, since origin texture and material
      colour are independent visual channels on the same layer.
      MOTIF COLLISION FIX: the first Residual/CWR patterns used small
      circles/dots — the SAME visual language as the sand material
      pattern (pat-sand, filled dots) and gravel (pat-gravel, outlined
      circles). Since origin and material hatches are layered on the
      same shape (e.g. an Alluvium/Sand layer shows both), any
      dot/circle-based origin motif is genuinely ambiguous with those
      material patterns — a real, confirmed legibility bug, not a
      style nitpick. Redesigned Residual/CWR to use a chevron/tick
      motif instead, which doesn't collide with any existing material
      pattern (sand=dots, gravel=outlined circles, clay=short line
      segments). If you add a new origin hatch in future, check it
      against ALL existing material AND origin patterns for motif
      collisions, not just origin patterns against each other.

   7. LAYER MERGING WITHIN ONE ORIGIN BLOCK: a borehole log often
      records several different BSCS/grain-size readings within what
      is really ONE continuous depositional unit (e.g. "Alluvium:
      0-1.5m MS, 1.5-3m MH, 3-6m SC" is one Alluvium deposit with
      internal grain-size variation, not three separate deposits).
      Rendering each sub-reading as its own polygon fragments the
      picture and multiplies unrelated lens shapes. Every CONTIGUOUS
      run of layers sharing the same origin family is collapsed into
      ONE merged block before any interpolation/lens decision is
      made; the merged block's representative graphic/colour is
      whichever sub-layer is THICKEST. Rock layers are never merged
      this way. See the layersArr collapsing step near the top of
      buildProfileSvg for the implementation.

   8. LEGEND COMPLETENESS: the legend must list every distinct
      material actually drawn on the canvas — both tabular
      (masterSoilUnits) AND lens-only occurrences. An earlier version
      of this file only listed masterSoilUnits, silently omitting any
      layer that got lens treatment; that was a real bug, not a
      design choice, and has been fixed (see the legendItems
      construction, which now merges both sources before
      deduplicating by label). A SECOND, deeper legend bug existed
      alongside this: a unit could be listed in masterSoilUnits
      (present at one borehole) yet render with ZERO actual area
      everywhere it was sampled — the legend must check "did this
      actually draw", not just "does this unit exist in the data
      structure" (see masterUnitHasRenderedArea, which reuses the
      exact sampling loop the real fill pass uses so the two checks
      can never disagree).

   9. ORIGIN-FAMILY STACKING PRIORITY (real bug fix): master units are
      NOT sorted by BSCS/material rank alone (getGraphicRank) — origin
      family determines coarse stacking order FIRST, and BSCS rank
      only breaks ties WITHIN the same family (see
      originFamilyStackPriority). Sorting by BSCS rank alone was a
      real, confirmed bug: a connected Alluvium block can end up
      represented by whichever BSCS code has the greatest summed
      thickness (rule 7b), and that code can easily rank AFTER a
      neighbouring Residual block's own representative code in
      GraphicHierarchy — which silently stacked Alluvium BENEATH
      Residual soil in the cumulative boundary system at some
      boreholes. That is geologically backwards: a transported
      surface deposit (Alluvium/Colluvium) or human-placed fill (Made
      Ground) can never sit beneath in-situ Residual soil. Fixed
      stacking priority, top to bottom: Made Ground → Alluvium/
      Colluvium → unknown/other named origins → Residual (+
      Completely Weathered Rock, same family) → Rock. If you add a
      new Origin family, add its priority here too, or it will fall
      into the "unknown/other" tier by default.

   10. SUPERSEDED — connected multi-origin units render EXACTLY like
      Residual's own internal BSCS variation (final resolution of
      rule 7b): an earlier version of this file special-cased a
      "connected" lens-family block (e.g. Alluvium judged continuous
      across boreholes via sub-layer overlap) into a SINGLE combined
      master-unit slot per origin family, painted either with one
      fixed colour or, later, a smooth per-borehole colour blend. Both
      versions were reverted on direction: a connected multi-origin
      unit now simply keys by family+BSCS the same as every other
      unit (see unitKey), so it SPLITS into one slot per distinct
      BSCS code — a real thick clay zone at one borehole shows as its
      own separately-pinching sub-layer, exactly the way a Residual
      sub-layer would, rather than being merged/blended/hidden into a
      combined block. This is simpler and keeps every origin family's
      internal treatment consistent. (blendColors/lightenColor-style
      per-position blending is still used elsewhere, e.g. the rock
      weathering fade — this reversal is specific to soil layer
      colouring, not a removal of that technique in general.)

   11. CWR SUB-RANGE HATCH OVERLAY (real bug fix): the layer-merging
      step (rule 7) collapses a contiguous same-FAMILY run into one
      block and freezes that block's `origin` field at whichever
      sub-layer STARTED the run. Since Residual and Completely
      Weathered Rock share one connectivity family and CWR
      consistently appears as the LAST sub-layer before rock, a
      merged run almost always freezes on "Residual" — meaning CWR's
      own distinct hatch texture (rule 6) was silently unreachable via
      that frozen field, even though real CWR data exists and the
      block's `subLayers` array still has it. Confirmed via direct
      inspection of real project data (three boreholes, each with a
      genuine 1.5-2.1m Completely Weathered Rock zone immediately above
      rock) that this texture was never appearing anywhere in output.
      Fixed with a SEPARATE overlay pass, scoped to 'residual'-family
      master units only: for each borehole, walk its own merged
      block's subLayers to find the actual CWR depth sub-range (if
      any), convert it to the same fraction-of-overburden system the
      main fill uses, interpolate between boreholes the same way, and
      draw a second polygon — clipped to just that inner portion —
      textured with CWR's own pattern. The legend's hatch-key
      collection was fixed the same way (must scan subLayers, not just
      each block's frozen top-level origin field, or CWR would still
      be missing from the Soil Origin legend section even after the
      fill itself was fixed).

      TWO FOLLOW-UP BUGS FOUND AND FIXED after a user report that CWR
      was rendering incorrectly relative to Residual (reported as "CWR
      should be below Residual but now not the case" — the geology was
      always intended as CWR-below-Residual; the RENDERING was wrong,
      not the intended order):
      (a) FRACTION-BASIS MISMATCH: cwrFracForBH originally normalized
      CWR's depth against `overburden` (ground-to-rockhead distance),
      but the MAIN tabular fill it overlays normalizes every layer
      against `totalSoilDepth` (max bottom depth across all non-rock
      layers, which includes CWR itself and can exceed the nominal
      overburden). Using two different depth references for the
      overlay vs. its parent shape caused real misalignment once
      interpolated between two boreholes with different overburden-
      vs-totalSoilDepth ratios (confirmed with a worked numerical
      example: ~0.4m discrepancy at the midpoint between two
      boreholes with differing ratios). Fixed by normalizing
      cwrFracForBH — and the elevation back-conversion at the call
      site — against the SAME totalSoilDepth basis, interpolated
      laterally the same way overburden already was.
      (b) MISSING CLIP TO PARENT UNIT: the overlay's own iLeft/iRight
      bracketing scans ALL boreholes in the section, independent of
      which specific master unit (e.g. "Silty SAND (residual)" vs
      "Sandy CLAY (residual)") it's currently being drawn for — so it
      produced the SAME full-section CWR band on every residual-
      family unit's pass, unclipped, regardless of whether that unit
      actually has any footprint at a given position. Confirmed via
      direct coordinate inspection: a CWR overlay's y-range extended
      well beyond its supposed parent polygon's own y-range. Fixed by
      clipping the CWR overlay path to the CURRENT unit's own layerD
      shape before drawing, so it can only ever appear within that
      unit's actual footprint.

   12. TERMINATION LABEL COLLISION AVOIDANCE (real bug fix): "Term
      X.Xm" labels were drawn immediately in the same pass as the
      borehole pillars, always at a fixed yTerm+4 offset with NO
      collision checking — two boreholes terminating at similar
      depths close together produced visibly overlapping label boxes.
      Fixed the same way the BH header labels already were: collect
      termination info (termLabelInfo) during the pillar pass, then
      render them in a DEFERRED second pass that stacks a colliding
      label to the next row, same X, mirroring the BH header label
      algorithm (see the "VERTICAL-STAGGER BH HEADER LABELS" pass)
      almost exactly — except termination labels stack DOWNWARD (away
      from the pillars, since they sit at the bottom of the profile)
      where BH headers stack upward. padBottom's fixed reserve was
      increased to accommodate a few stacked rows, consistent with how
      padTop is already a fixed (not dynamically computed) budget for
      the BH header stacking case.

   13. BS 5930 (BSCS) LETTER CODE TABLE — GRAPHIC_CODE_INFO expanded to
      cover the actual BS 5930 soil classification letter system, not
      just the handful of codes originally hard-coded. Standard
      convention: first letter = primary soil type (C=Clay, M=Silt,
      S=Sand, G=Gravel). For FINE soils (C/M), the second letter is a
      PLASTICITY grade from liquid limit: L=Low(<35%),
      I=Intermediate(35-50%), H=High(50-70%), V=Very High(70-90%),
      E=Extremely High(>90%); an 'O' suffix denotes organic material
      (e.g. CHO = High plasticity Clay, Organic). For COARSE soils
      (S/G), the second letter is a secondary-constituent qualifier
      instead (e.g. SM = Silty Sand, GC = Clayey Gravel) — this is
      standard BS 5930 usage, not a project quirk, and the two letter
      systems (plasticity vs constituent) read differently depending
      on whether the primary letter is C/M or S/G.
      Before this fix, any code not in the small original hard-coded
      set (CS, CV, ME, MG, MI, MV, SME, SPC, SW, GP, GPG, and the
      *O organic variants, all confirmed present in real project data
      via direct inspection of the BH Profile CSV) fell through to a
      generic hash-based colour with no readable label — meaning the
      legend and BH pillar/popup logs showed a meaningless raw code
      string for a large fraction of real logged layers.
      TWO CODES NEEDED PROJECT-SPECIFIC CONFIRMATION rather than a
      literal reading of the standard, since 'S' and 'G' aren't valid
      plasticity-grade second letters for C/M: CS = Sandy CLAY, MG =
      Gravelly SILT (both confirmed directly with the user — do not
      assume the reverse reading "Clayey Sand"/"Silty Gravel", those
      are SC/GM respectively, already distinct existing codes).
      REMAINING LOWER-CONFIDENCE ENTRIES (best inference, not
      standard- or project-confirmed): SPC ("Poorly Graded Sand with
      Clay") and SME ("Silty Sand, Extremely High Plasticity fines")
      are dual/borderline BS 5930-style notations inferred from the
      letter pattern, not confirmed against a project key or lab
      report — flag to the user if precision here matters for a
      specific deliverable, and update this note if/when confirmed.

   14. LENS ANCHORING TO LOCAL GROUND SURFACE (real bug fix — user
      reported an Alluvium lens visually intruding INTO Completely
      Weathered Rock / Residual territory while tapering, which is
      geologically wrong: Alluvium is a surface-attached deposit and
      must stay near-surface everywhere it's drawn, never punch into
      deeper material as it narrows). The original lens taper (rule 3)
      shrank the lens's WIDTH smoothly toward each edge but held a
      FIXED absolute-elevation band the whole time (a constant zMid +
      halfThickness taken from the lens's own borehole) — nothing
      tied that elevation band to the local ground surface as the
      lens moved away from its own borehole. At a neighbouring
      position where the ground surface (and therefore every layer
      beneath it) sits at a different absolute elevation, that fixed
      band could land squarely inside completely different material.
      Fixed by tapering the lens's DEPTH-BELOW-GROUND toward zero
      (not its absolute elevation band) at each sampled x, computed
      against getZGround(d) — the LOCAL ground surface at that exact
      position — so the lens visually "rises" back toward the surface
      as it thins, staying anchored to "near-surface" everywhere
      rather than floating at a constant elevation. Also added a
      safety clamp against the local rockhead (getZRock(d)), matching
      every other soil layer in this file, so a lens can never punch
      through into rock territory even in an extreme taper case.

   15. SOIL ORIGIN TRANSITION LINES: a dark-ash DASHED line is drawn
      at every boundary where the soil ORIGIN actually changes (e.g.
      Alluvium -> Residual, Residual -> Completely Weathered Rock),
      separate from the thin, low-opacity generic contact line that
      already fires at every individual BSCS sub-layer boundary
      regardless of origin. Since masterSoilUnits is sorted by origin-
      family stacking priority first (rule 9), an origin transition
      occurs at exactly the master-unit index k where
      soilUnitMeta[masterSoilUnits[k]].originFamily first differs from
      soilUnitMeta[masterSoilUnits[k-1]].originFamily — every such k is
      found (a section can have more than one transition, e.g. Made
      Ground -> Alluvium -> Residual) and rendered with
      getCumBoundaryAtX(k, d), the SAME interpolation the fill itself
      uses, so the line always sits exactly on the true origin
      boundary including through pinch-outs. Legend entry: "Soil
      Origin Boundary".
      SECOND COVERAGE GAP FOUND AND FIXED: the masterSoilUnits-based
      version above only covers transitions WITHIN the tabular system
      — a lens (Alluvium/Colluvium/Made Ground, rule 3) never enters
      that master-unit stack at all, so a section whose only origin
      variety is an isolated lens over Residual would draw ZERO
      transition lines even though a real, visually important origin
      boundary exists (confirmed: a real 3-borehole test with Alluvium
      lenses over Residual produced no transition line until this was
      added). Fixed by ALSO drawing the same dashed line at each
      lens's own bottom edge (only where the lens has >=2px thickness,
      matching the generic contact-line threshold elsewhere) — this is
      a second, independent draw site for the identical visual
      treatment, not a variant of it.

   16. FOLIATION-BASED BEDROCK BOUNDARY PROJECTION & APPARENT DIP ENGINE:
       In 2D Geological Cross-Sections, structural rock formation contacts
       and lithological foliation patterns must adhere to true bedrock dip
       direction (θ_dip) and true dip angle (α_true) projected along the
       cross-section line bearing/azimuth (θ_section).
       The apparent dip is calculated via the structural geology equation:
         tan(α_apparent) = tan(α_true) * |cos(θ_section - θ_dip)|
       The apparent dip direction is oriented toward profile point B if
       cos(θ_section - θ_dip) >= 0 (labeled "→ B"), otherwise toward point A
       (labeled "← A"). SVG foliation hatches for Gneissic lithologies
       (Biotite Gneiss, Garnet Biotite Gneiss, Quartzofeldspathic Gneiss,
       Granitic Gneiss, Charnockite, etc.) dynamically rotate to this
       apparent dip angle to visualize true geological structural fabric.
       An "Auto-Suggest" feature computes the best-fitting planar strike/dip
       from observed rock layer contact elevations across all boreholes.

   17. MULTI-COLUMN GEOTECHNICAL BOREHOLE LOG SCHEMATIC DASHBOARD:
       Borehole popups open a wide-format geotechnical log dashboard (820px)
       complying with standard exploratory borehole visualization guidelines:
       (a) Depth Scale Axis with discrete tick marks at every layer contact.
       (b) Core Stratigraphy Column rendered with institutional soil colors
           and lithology hatch patterns.
       (c) Lithology & Strata Descriptions with collision-avoiding leader
           lines connecting each callout to its stratum midpoint.
       (d) Dedicated SPT N-value Column: Horizontal bar chart on a 0-50+ scale
           with color-coded refusal badges ('50★').
       (e) Dedicated RQD % Column: Color-graded recovery bars (0-100%)
           displaying rock quality designation intervals.
       (f) Distinct dashed Groundwater Table (GWT) and Rockhead interface lines.

   18. RESILIENT MULTI-TIER DATA PIPELINE & OFFLINE ENGINE:
       Borehole metadata, progress stats, and stratigraphic logging data
       are fetched through a hardened multi-tiered pipeline:
       (a) Primary: Live Google Sheets CSV feed with anti-cache query params.
       (b) Secondary: Multi-CORS proxy fallbacks (AllOrigins, CodeTabs,
           CorsProxy) with 4-second timeout protection.
       (c) Tertiary: Direct local master CSV files (Borehole Details & BH Profile).
       (d) Quaternary: Standalone embedded master dataset (data_master.js)
           and localStorage offline cache backups.
       This architecture guarantees the map and borehole logs render
       seamlessly in any offline or restricted network environment.

   19. VERSION LIFECYCLE, ANTI-CACHE BUSTING & USER UPDATE NOTIFICATIONS:
       Single source of truth APP_VERSION tracks software releases.
       All fetch requests append unique version and timestamp query params
       via getBustedUrl(). On version upgrades, outdated cache records are
       automatically purged while preserving user offline backups. An
       interactive Version Badge in the header and an automated floating
       Update Notification Center alert users when new features or data
       revisions are available, with one-click instant hard reload.
   ============================================================ */

const LENS_MAX_HALF_WIDTH_M = 15; // rule 3: fixed max lateral half-width for lens-type origins

// Origin hatch/texture overlay (rule 6) — a PROJECT CONVENTION, not a literal
// BS 5930 symbol (see GEOLOGICAL RULES block, rule 6, for why). Applied on
// top of the BSCS colour fill, same layering already used for the sand/
// clay/gravel material patterns.
//
// NOTE (rule 6 revised): Residual and Completely Weathered Rock share one
// CONNECTIVITY family ('residual' — see ORIGIN_FAMILY_MAP, they can still
// interpolate into each other across boreholes per rule 1/2) but need
// visually DISTINCT hatch textures, since they're still recognisably
// different materials on a log even though they're part of one continuous
// weathering profile. So hatch lookup uses a separate, finer-grained key
// (originHatchKeyOf) than the coarser family used for stacking/connectivity
// — most origins' hatch key equals their family; Residual/CWR is the one
// case where it doesn't.
