      </div>
    </div>`;
}

function populateSelect(id, vals){
  const s = document.getElementById(id); if (!s) return;
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
  const el = document.getElementById('legend'); if (!el) return;
  el.innerHTML = Object.keys(counts).map(k => `<div class="legend-item"><span class="swatch" style="background:${colorFor(k)}"></span><span>${k}</span><span class="legend-count">${counts[k]}</span></div>`).join('');
}

function buildPackageLegend(rows){
  const counts = {}; rows.forEach(r => { const p = (r['Package'] || '').trim(); if (p) counts[p] = (counts[p] || 0) + 1; });
  const packages = Object.keys(counts).sort();
  const el = document.getElementById('package-legend'); if (!el) return;
  el.innerHTML = packages.map(p => `<div class="legend-item"><span class="swatch" style="background:${colorForPackage(p)}"></span><span>${p}</span><span class="legend-count">${counts[p]}</span></div>`).join('');
}

function render(){
  const searchTerm = document.getElementById('search').value.trim().toLowerCase();
  const fStatus = document.getElementById('f-status').value;
  const fContractor = document.getElementById('f-contractor').value;
  const fLot = document.getElementById('f-lot').value;
  const fPackage = document.getElementById('f-package').value;
  
  markersLayer.clearLayers(); markers = [];
  let shown = 0; const bounds = []; const labeledPackages = new Set();
  
  allRows.forEach((row, rowIdx) => {
    const status = row['Status'] || '';
    const contractor = row['Contractor Done'] || row['Contractor'] || '';
    const lot = row['Lot'] || ''; const pkg = row['Package'] || ''; const name = row['BH Name'] || '';
    
    if (fStatus && status !== fStatus) return;
    if (fContractor && contractor !== fContractor) return;
    if (fLot && lot !== fLot) return;
    if (fPackage && pkg !== fPackage) return;
    if (searchTerm){
      const hay = `${name} ${lot} ${pkg} ${contractor}`.toLowerCase(); if (!hay.includes(searchTerm)) return;
    }
    
    if (timelineActiveDate) {
      const bhName = name.trim(); const logDates = bhDatesLookup[bhName] || {};
      const compDateStr = getFirst(row, ['Borehole Completed Date','Completed Date','Completion Date','Date Completed','Finish Date','End Date']) || logDates.completed;
      if (status === 'Completed') {
        if (!compDateStr) return;
        const bhDate = new Date(compDateStr);
        if (!isNaN(bhDate.getTime()) && bhDate > timelineActiveDate) return;
      }
    }
    
    const e = toNum(row['Easting']); const n = toNum(row['Northing']); if (e === null || n === null) return;
    const ll = convertToLatLon(e, n); if (!ll) return;
    
    const marker = L.marker([ll.lat, ll.lon], { icon: makeIcon(status, pkg) });
    marker.bindPopup(popupHtml(row, rowIdx), { maxWidth: 860, minWidth: 800, className: 'wide-popup' });
    marker.on('click', () => {
      if (profileSelectMode){
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
    markersLayer.addLayer(marker); bounds.push([ll.lat, ll.lon]); shown++;
  });
  
  document.getElementById('count').textContent = `${shown} of ${allRows.length} boreholes shown`;
  if (bounds.length && !window.hasInitialZoomed){
    map.fitBounds(bounds, { padding: [40,40], maxZoom: 16 }); window.hasInitialZoomed = true;
  }
  updateLabelVisibility();
}

function uniqueVals(rows, key){ return [...new Set(rows.map(r => (r[key] || '').trim()).filter(v => v))].sort(); }

function updateDashboard(){
  const total = allRows.length; let completed = 0, inProgress = 0, cancelled = 0;
  allRows.forEach(r => {
    const s = (r['Status'] || '').trim();
    if (s === 'Completed') completed++; else if (s === 'In Progress' || s === 'Ongoing') inProgress++; else if (s === 'Cancelled') cancelled++;
  });
  const remaining = Math.max(total - completed - inProgress - cancelled, 0);
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('dash-total').textContent = total;
  document.getElementById('dash-completed').textContent = completed;
  document.getElementById('dash-inprogress').textContent = inProgress;
  document.getElementById('dash-remaining').textContent = remaining;
  document.getElementById('dash-progress').textContent = progressPct + '%';
}

function loadRows(rows){
  allRows = rows.map(normalizeRow).filter(r => r['BH Name'] && r['BH Name'].trim());
  populateSelect('f-status', uniqueVals(allRows, 'Status'));
  populateSelect('f-contractor', uniqueVals(allRows, 'Contractor Done').length ? uniqueVals(allRows,'Contractor Done') : uniqueVals(allRows,'Contractor'));
  populateSelect('f-lot', uniqueVals(allRows, 'Lot'));
  populateSelect('f-package', uniqueVals(allRows, 'Package'));
  populateSelect('report-package-select', uniqueVals(allRows, 'Package'));
  buildLegend(allRows); buildPackageLegend(allRows); updateDashboard(); render();
  setupPwaCache();
}

function fetchData(){
  // 1. Immediately bootstrap with data_master.js if available
  if (window.EMBEDDED_BOREHOLES_CSV && (!allRows || allRows.length === 0)) {
    try {
      Papa.parse(window.EMBEDDED_BOREHOLES_CSV, {
        header: true, skipEmptyLines: true,
        complete: (r) => { if (r.data && r.data.length) loadRows(r.data); }
      });
    } catch(e){}
  }

  // 2. Check offline mode
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
      document.getElementById('dash-updated').textContent = "Offline Storage Mode";
      return;
    }
  }

  // 3. Sync from Google Sheet with fallback
  if (SHEET_CSV_URL){
    setStatus('Refreshing from Google Sheet…');
    parseCsvWithProxy(SHEET_CSV_URL, (data) => {
      loadRows(data);
      setStatus('Live — synced ' + new Date().toLocaleTimeString(), 'ok');
      document.getElementById('dash-updated').textContent = formatDateDMY(new Date()) + ', ' + new Date().toLocaleTimeString();
    }, () => {
      // Fallback: Local master CSV file
      Papa.parse(LOCAL_BOREHOLES_CSV, {
        download: true, header: true, skipEmptyLines: true,
        complete: (r) => {
          if (r.data && r.data.length > 0) {
            loadRows(r.data);
            setStatus('Loaded from Local Master File', 'ok');
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
      Papa.parse(SAMPLE_CSV, { header:true, skipEmptyLines:true, complete: r => loadRows(r.data) });
    }
  }
}

function initTimelineSlider() {}
function updateDashboardTimelineOverride() {}

document.getElementById('measure-btn').addEventListener('click', function() {
  isMeasuring = !isMeasuring; const panel = document.getElementById('measure-output');
  if (isMeasuring) {
    this.textContent = "🛑 Stop Measuring / Clear"; this.style.background = "#c0523f"; this.style.color = "#fff";
    panel.style.display = "block"; map.getContainer().style.cursor = 'crosshair';
    map.on('click', onMeasureMapClick); map.on('dblclick', finishMeasureArea); map.doubleClickZoom.disable();
  } else {
    this.textContent = "📏 Enable Distance/Area Ruler"; this.style.background = ""; this.style.color = ""; this.style.borderColor = "var(--accent)";
    panel.style.display = "none"; map.getContainer().style.cursor = '';
    map.off('click', onMeasureMapClick); map.off('dblclick', finishMeasureArea); map.doubleClickZoom.enable();
    clearMeasurements();
  }
});

function onMeasureMapClick(e) {
  const latlng = e.latlng; measurePoints.push(latlng);
  const dot = L.circleMarker(latlng, {radius: 5, color: '#b3541e', fillColor: '#fff', fillOpacity: 1, weight: 2}).addTo(map);
  measureMarkers.push(dot); measureLines.setLatLngs(measurePoints); measurePolygon.setLatLngs(measurePoints);
  calculateMeasurementOutput();
}

function calculateMeasurementOutput() {
  if (measurePoints.length < 2) {
    document.getElementById('measure-output').innerHTML = "Click next point... Double-click to lock area calculation."; return;
  }
  let totalDistance = 0;
  for (let i = 1; i < measurePoints.length; i++) { totalDistance += measurePoints[i-1].distanceTo(measurePoints[i]); }
  let outputHtml = `<b>Total Length:</b> ${totalDistance.toFixed(2)} m`;
  if (measurePoints.length >= 3) {
    const areaM2 = geodesicArea(measurePoints);
    outputHtml += `<br><b>Enclosed Area:</b> ${(areaM2 / 10000).toFixed(3)} Hectares (${areaM2.toFixed(1)} m²)`;
  }
  document.getElementById('measure-output').innerHTML = outputHtml;
}

function finishMeasureArea() {
  if (measurePoints.length > 2) {
    measurePoints.push(measurePoints[0]); measureLines.setLatLngs(measurePoints); measurePolygon.setLatLngs(measurePoints); calculateMeasurementOutput();
  }
}

function clearMeasurements() {
  measurePoints = []; measureLines.setLatLngs([]); measurePolygon.setLatLngs([]);
  measureMarkers.forEach(m => map.removeLayer(m)); measureMarkers = [];
  document.getElementById('measure-output').innerHTML = "Click points on the map to measure.";
}

function geodesicArea(latLngs) {
  const RADIUS = 6378137; let area = 0;
  if (latLngs.length > 2) {
    for (let i = 0; i < latLngs.length; i++) {
      const p1 = latLngs[i]; const p2 = latLngs[(i + 1) % latLngs.length];
      area += (p2.lng - p1.lng) * Math.PI / 180 * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
    }
    area = area * RADIUS * RADIUS / 2;
  }
  return Math.abs(area);
}

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!allRows || allRows.length === 0) { alert("No structured rows loaded."); return; }
  const csvString = Papa.unparse(allRows);
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const targetLink = document.createElement("a");
  targetLink.href = downloadUrl; targetLink.download = `NBRI_Borehole_Master_Data_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(targetLink); targetLink.click(); document.body.removeChild(targetLink);
});

document.getElementById('pkg-report-btn').addEventListener('click', () => {
  const selectedPkg = document.getElementById('report-package-select').value;
  if (!selectedPkg) { alert("Please select a construction Package first."); return; }
  
  const { jsPDF } = window.jspdf; const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210, pageH = 297, margin = 16; let currentY = margin;
  const targetRows = allRows.filter(r => (r['Package'] || '').trim() === selectedPkg);
  
  doc.setFillColor(28, 43, 42); doc.rect(margin, currentY, pageW - (margin * 2), 14, 'F');
  doc.setFontSize(11); doc.setTextColor(246, 244, 238);
  doc.text(`GEOTECHNICAL INVESTIGATION EXECUTIVE SUMMARY REPORT`, margin + 5, currentY + 9);
  
  currentY += 22; doc.setTextColor(28, 43, 42); doc.setFontSize(10);
  doc.text(`Project Corridor Segment: CEP3 (Rambukkana - Galagedara Section)`, margin, currentY);
  doc.text(`Target Package Classification: ${selectedPkg}`, margin, currentY + 5);
  doc.text(`Total Documented Boreholes: ${targetRows.length}`, margin, currentY + 10);
  doc.text(`Generated Timestamp: ${new Date().toLocaleDateString()} — Geotechnical Division`, margin, currentY + 15);
  currentY += 24;
  
  targetRows.forEach((bh, index) => {
    if (currentY > pageH - 55) { doc.addPage(); currentY = margin; }
    doc.setDrawColor(216, 210, 194); doc.setLineWidth(0.4); doc.line(margin, currentY, pageW - margin, currentY);
    currentY += 6; doc.setFont(undefined, 'bold'); doc.setFontSize(10);
    doc.text(`${index + 1}. Borehole ID Reference: ${bh['BH Name'] || 'N/A'}`, margin, currentY);
    currentY += 5; doc.setFont(undefined, 'normal'); doc.setFontSize(8.5);
    
    const levels = computeBHLevels(bh);
    const textLines = [
      `Easting: ${bh['Easting'] || '—'}  |  Northing: ${bh['Northing'] || '—'}  |  Elevation: ${bh['Elevation'] || '—'} m (MSL)`,
      `Status: ${bh['Status'] || 'Planned'}  |  Contractor assigned: ${bh['ContractorDone'] || bh['Contractor'] || 'NBRI'}`,
      `Termination Depth: ${bh['Termination Depth'] || '—'} m  |  Water Table Level: ${bh['Groundwater Level'] || '—'} m`,
      `Overburden Horizon: ${levels.overburden !== null ? levels.overburden.toFixed(2) + ' m' : '—'}  |  Bedrock Depth Level: ${rockLevelDisplay(levels)}`
    ];
    textLines.forEach(line => { doc.text(line, margin + 4, currentY); currentY += 4; });
    
    if (levels.termDepth > 0) {
      const colH = 16, colW = 5, x0 = margin + 145, y0 = currentY - 18;
      const scale = colH / levels.termDepth;
      const soilH = levels.overburden !== null ? Math.min(levels.overburden * scale, colH) : colH;
      const rkH = colH - soilH;
      doc.setFillColor(201, 168, 118); doc.rect(x0, y0, colW, soilH, 'F');
      if (rkH > 0) { doc.setFillColor(143, 143, 149); doc.rect(x0, y0 + soilH, colW, rkH, 'F'); }
      doc.setDrawColor(58, 58, 58); doc.setLineWidth(0.2); doc.rect(x0, y0, colW, colH, 'S');
      doc.setFontSize(7); doc.text(`0.00m`, x0 + colW + 2, y0 + 2); doc.text(`${levels.termDepth}m (Term)`, x0 + colW + 2, y0 + colH);
    }
    currentY += 4;
  });
  
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
    doc.text(`© National Building Research Institute — Report Compilation Package ${selectedPkg} — Page ${i} of ${doc.getNumberOfPages()}`, margin, pageH - 6);
  }
  doc.save(`NBRI_Geotechnical_Report_Package_${selectedPkg}.pdf`);
});

function setupPwaCache() {
  if (allRows && allRows.length > 0 && !window.loadedFromOfflineCache) {
    try {
      localStorage.setItem('nbri_allrows_cache', JSON.stringify(allRows));
      localStorage.setItem('nbri_dates_cache', JSON.stringify(bhDatesLookup));
      localStorage.setItem('nbri_cache_timestamp', new Date().toISOString());
    } catch(e) { console.warn("Storage limits hit while caching dataset:", e); }
  }
}

document.getElementById('search').addEventListener('input', render);
['f-status','f-contractor','f-lot','f-package'].forEach(id => document.getElementById(id).addEventListener('change', render) );

fetchData(); fetchLogDates(); fetchProgressSeries(); fetchBHProfileLog(); fetchCEP4BHs();
if (SHEET_CSV_URL && AUTO_REFRESH_MS > 0){
  setInterval(fetchData, AUTO_REFRESH_MS); setInterval(fetchLogDates, AUTO_REFRESH_MS); setInterval(fetchProgressSeries, AUTO_REFRESH_MS); setInterval(fetchBHProfileLog, AUTO_REFRESH_MS); setInterval(fetchCEP4BHs, AUTO_REFRESH_MS);
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn'); btn.classList.add('spinning');
  fetchData(); fetchLogDates(); fetchProgressSeries(); fetchBHProfileLog(); fetchCEP4BHs(); setTimeout(() => btn.classList.remove('spinning'), 900);
});

const ACI_COLORS = { 1:"#ff0000",2:"#ffff00",3:"#00ff00",4:"#00ffff",5:"#0000ff",6:"#ff00ff",7:"#1a1a1a",8:"#808080",9:"#c0c0c0" };
const OVERLAY_LINE_WEIGHT_PX = 2.0;
function dashArrayForLinetype(lt){
  const s = String(lt).toLowerCase();
  if (s.includes('dash') || s.includes('hidden')) return '6, 5';
  if (s.includes('dot')) return '1, 5';
  if (s.includes('center')) return '10, 4, 2, 4';
  return null;
}
function styleForOverlayFeature(feature){
  const props = feature.properties || {};
  let color = '#b3541e';
  if (props.Color !== undefined){
    const aci = parseInt(props.Color); if (!isNaN(aci) && ACI_COLORS[aci]) color = ACI_COLORS[aci];
  } else if (props.stroke){ color = props.stroke; }
  const lt = props.Linetype || props.EntLinetyp || '';
  return { color: color, weight: OVERLAY_LINE_WEIGHT_PX, dashArray: dashArrayForLinetype(lt), opacity: 0.95, fillColor: color, fillOpacity: 0.15 };
}

let overlayCount = 0;
function addOverlayLayer(name, geojson, fitToBounds){
  if (fitToBounds === undefined) fitToBounds = true;
  let layer;
  try {
    layer = L.geoJSON(geojson, {
      style: styleForOverlayFeature,
      pointToLayer: (feature, latlng) => {
        const s = styleForOverlayFeature(feature);
        return L.circleMarker(latlng, { radius: 5, color: s.color, weight: 1.5, fillColor: s.color, fillOpacity: 0.85 });
      }
    });
  } catch (err) { alert('Could not draw "' + name + '": ' + err.message); return; }
  overlayCount++; const label = overlayCount + '. ' + name;
  layer.addTo(map); layersControl.addOverlay(layer, label);
  if (fitToBounds){
    try { const b = layer.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [40, 40] }); } catch (e) {}
  }
}

function loadOverlayFile(file){
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'kml'){
    const reader = new FileReader();
    reader.onload = () => {
      try { const dom = new DOMParser().parseFromString(reader.result, 'text/xml'); addOverlayLayer(file.name, toGeoJSON.kml(dom)); } catch (err) { alert('Could not parse KML: ' + err.message); }
    };
    reader.readAsText(file);
  } else if (ext === 'geojson' || ext === 'json'){
    const reader = new FileReader();
    reader.onload = () => {
      try { addOverlayLayer(file.name, JSON.parse(reader.result)); } catch (err) { alert('Could not parse GeoJSON: ' + err.message); }
    };
    reader.readAsText(file);
  } else if (ext === 'zip'){
    const reader = new FileReader();
    reader.onload = () => { shp(reader.result).then(geojson => addOverlayLayer(file.name, geojson)).catch(err => alert('Zipped Shapefile error: ' + err.message)); };
    reader.readAsArrayBuffer(file);
  }
}

const PERMANENT_OVERLAYS = [ { name: "CEP3 Road Corridor", url: "Polyline_cep32.zip" } ];
let roadCorridorGeoJSON = null;
function loadPermanentOverlays(){
  PERMANENT_OVERLAYS.forEach(o => {
    fetch(o.url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(buf => shp(buf)).then(geojson => { roadCorridorGeoJSON = geojson; addOverlayLayer(o.name, geojson, false); })
    .catch(err => console.error('Could not load permanent overlay:', err));
  });
}
loadPermanentOverlays();
document.getElementById('overlay-file').addEventListener('change', (e) => { Array.from(e.target.files).forEach(loadOverlayFile); e.target.value = ''; });

const appEl = document.getElementById('app');
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
function toggleSidebar(){
  const btn = document.getElementById('sidebar-toggle');
  if (isMobile()){
    appEl.classList.toggle('sidebar-open-mobile'); const open = appEl.classList.contains('sidebar-open-mobile');
    btn.innerHTML = open ? '&times;' : '&#9776;';
  } else { appEl.classList.toggle('sidebar-collapsed-desktop'); }
  setTimeout(() => map.invalidateSize(), 260);
}
document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
document.getElementById('sidebar-backdrop').addEventListener('click', () => {
  appEl.classList.remove('sidebar-open-mobile'); document.getElementById('sidebar-toggle').innerHTML = '&#9776;';
});
if (isMobile()){ appEl.classList.remove('sidebar-open-mobile'); }

function boreholesToGeoJSON(){
  const features = [];
  allRows.forEach(row => {
    const e = toNum(row['Easting']); const n = toNum(row['Northing']); if (e === null || n === null) return;
    const ll = convertToLatLon(e, n); if (!ll) return;
    const levels = computeBHLevels(row); const bhName = (row['BH Name'] || '').trim();
    const logDates = bhDatesLookup[bhName] || {};
    const commenceDate = formatDateDMY(getFirst(row, ['Borehole Commence Date','Commence Date','Date Commenced','Commencement Date','Start Date']) || logDates.commence || '');
    const completedDate = formatDateDMY(getFirst(row, ['Borehole Completed Date','Completed Date','Completion Date','Date Completed','Finish Date']) || logDates.completed || '');
    const pdfUrl = (row['PDF Link'] || row['Log PDF'] || row['Borehole Log'] || '').trim();
    
    let descRows = `<tr><td><b>Property</b></td><td><b>Value</b></td></tr><tr><td>Commence Date</td><td>${commenceDate}</td></tr><tr><td>Completed Date</td><td>${completedDate}</td></tr><tr><td>Easting</td><td>${row['Easting'] || ''}</td></tr><tr><td>Northing</td><td>${row['Northing'] || ''}</td></tr><tr><td>Elevation (m)</td><td>${row['Elevation'] || ''}</td></tr><tr><td>Contractor</td><td>${row['Contractor Done'] || row['Contractor'] || ''}</td></tr><tr><td>Lot</td><td>${row['Lot'] || ''}</td></tr><tr><td>Package</td><td>${row['Package'] || ''}</td></tr><tr><td>Termination Depth (m)</td><td>${row['Termination Depth'] || ''}</td></tr><tr><td>Rock Level (m)</td><td>${rockLevelDisplay(levels)}</td></tr><tr><td>Groundwater Level (m)</td><td>${row['Groundwater Level'] || ''}</td></tr>`;
    let descriptionHtml = `<p><b>NBRI Borehole Node Metadata</b></p><table border="1" cellpadding="4" style="border-collapse:collapse;">${descRows}</table>` + (pdfUrl ? `<p><a href="${pdfUrl}">View Borehole Log PDF</a></p>` : '');
    
    features.push({
      type: 'Feature',
      properties: { name: bhName || 'Unnamed BH', description: descriptionHtml, Status: row['Status'] || '', 'Commence Date': commenceDate, 'Completed Date': completedDate, Easting: row['Easting'] || '', Northing: row['Northing'] || '', 'Elevation (m)': row['Elevation'] || '', Contractor: row['Contractor Done'] || row['Contractor'] || '', Lot: row['Lot'] || '', Package: row['Package'] || '', 'Termination Depth (m)': row['Termination Depth'] || '', 'Rock Level (m)': rockLevelDisplay(levels), 'Groundwater Level (m)': row['Groundwater Level'] || '', 'PDF Link': pdfUrl },
      geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] }
    });
  });
  return { type: 'FeatureCollection', features };
}

function downloadTextFile(filename, text){
  const blob = new Blob([text], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function decodeHtmlEntities(s){ return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function fixKmlDescriptionsForHtml(kmlString){
  return kmlString.replace(/<description>([\s\S]*?)<\/description>/g, (match, inner) => { return '<description><![CDATA[' + decodeHtmlEntities(inner) + ']]></description>'; });
}

function exportKML(includeRoad){
  const bhGeoJSON = boreholesToGeoJSON();
  if (includeRoad && roadCorridorGeoJSON){
    const mixed = { type: 'FeatureCollection', features: [...roadCorridorGeoJSON.features, ...bhGeoJSON.features] };
    let kml = tokml(mixed, { name: 'name', description: 'description' });
    downloadTextFile('CEP3_Boreholes_And_Road_Trace.kml', fixKmlDescriptionsForHtml(kml));
  } else {
    let kml = tokml(bhGeoJSON, { name: 'name', description: 'description' });
    downloadTextFile('CEP3_Boreholes_Locations_Only.kml', fixKmlDescriptionsForHtml(kml));
  }
}
document.getElementById('kml-bh-only').addEventListener('click', () => exportKML(false));
document.getElementById('kml-bh-road').addEventListener('click', () => exportKML(true));

function getVisibleFilteredRows(){
  const out = []; const bounds = map.getBounds();
  const searchTerm = document.getElementById('search').value.trim().toLowerCase();
  const fStatus = document.getElementById('f-status').value;
  const fContractor = document.getElementById('f-contractor').value;
  const fLot = document.getElementById('f-lot').value;
  const fPackage = document.getElementById('f-package').value;
  
  allRows.forEach(row => {
    const status = row['Status'] || ''; const contractor = row['Contractor Done'] || row['Contractor'] || '';
    const lot = row['Lot'] || ''; const pkg = row['Package'] || ''; const name = row['BH Name'] || '';
    if (fStatus && status !== fStatus) return;
    if (fContractor && contractor !== fContractor) return;
    if (fLot && lot !== fLot) return;
    if (fPackage && pkg !== fPackage) return;
    if (searchTerm){
      const hay = `${name} ${lot} ${pkg} ${contractor}`.toLowerCase(); if (!hay.includes(searchTerm)) return;
    }
    const e = toNum(row['Easting']); const n = toNum(row['Northing']); if (e === null || n === null) return;
    const ll = convertToLatLon(e, n); if (!ll) return;
    if (!bounds.contains([ll.lat, ll.lon])) return;
    out.push({ row, lat: ll.lat, lon: ll.lon, status });
  });
  return out;
}

function niceScaleMeters(target){
  const steps = [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000];
  let best = steps[0]; for (const s of steps){ if (s <= target) best = s; } return best;
}
function drawNorthArrow(doc, x, y, size){
  doc.setDrawColor(28,43,42); doc.setFillColor(28,43,42);
  doc.triangle(x, y - size, x - size*0.35, y + size*0.5, x + size*0.35, y + size*0.5, 'F');
  doc.setFontSize(9); doc.text('N', x, y + size*0.5 + 4);
}
function drawScaleBar(doc, x, y, metersPerMm){
  const targetWidthMm = 30; const targetMeters = targetWidthMm * metersPerMm;
  const scaleMeters = niceScaleMeters(targetMeters); const scaleWidthMm = scaleMeters / metersPerMm;
  doc.setDrawColor(28,43,42); doc.setLineWidth(1.0); doc.line(x, y, x + scaleWidthMm, y);
  doc.line(x, y - 1.5, x, y + 1.5); doc.line(x + scaleWidthMm, y - 1.5, x + scaleWidthMm, y + 1.5);
  doc.setFontSize(7.5); doc.setTextColor(28,43,42);
  doc.text(scaleMeters >= 1000 ? (scaleMeters/1000)+' km' : scaleMeters+' m', x + scaleWidthMm + 3, y + 1);
}

function buildAndSavePDF(rasterDataUrl, canvasW, canvasH){
  const { jsPDF } = window.jspdf; const doc = new jsPDF('l', 'mm', 'a4');
  const pageW = 297, pageH = 210, margin = 12;
  
  doc.setFillColor(28,43,42); doc.rect(margin, margin, pageW - margin*2, 14, 'F');
  doc.setFont('Inter', 'bold'); doc.setFontSize(13); doc.setTextColor(246,244,238);
  doc.text('NBRI BOREHOLE LOCATION MAP — EXPRESSWAY SEGMENT CEP3', margin + 6, margin + 9.5);
  
  const mapX = margin, mapY = margin + 18, mapW = 195, mapH = pageH - margin*2 - 18;
  doc.setFont('Inter', 'normal'); doc.setFontSize(8.5); doc.setTextColor(107,100,89);
  doc.text('Current View | Generated ' + formatDateDMY(new Date()) + ', ' + new Date().toLocaleTimeString(), margin, margin + 16);
  
  doc.setFillColor(246,244,238); doc.rect(mapX, mapY, mapW, mapH, 'F');
  const bounds = map.getBounds();
  const west = bounds.getWest(), east = bounds.getEast(), north = bounds.getNorth(), south = bounds.getSouth();
  if (rasterDataUrl){ try { doc.addImage(rasterDataUrl, 'PNG', mapX, mapY, mapW, mapH); } catch(e){ rasterDataUrl = null; } }
  
  const visible = getVisibleFilteredRows();
  function project(lat, lon){
    let px = mapX + ((lon - west) / (east - west)) * mapW; let py = mapY + ((north - lat) / (north - south)) * mapH;
    return [Math.max(mapX, Math.min(mapX + mapW, px)), Math.max(mapY, Math.min(mapY + mapH, py))];
  }
  
  if (!rasterDataUrl && roadCorridorGeoJSON && roadCorridorGeoJSON.features){
    roadCorridorGeoJSON.features.forEach(feature => {
      const geom = feature.geometry; if (!geom) return;
      const style = styleForOverlayFeature(feature); const hex = style.color;
      const rgb = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]); doc.setLineWidth(0.25);
      if(geom.type === 'LineString'){
        let lastPt = null;
        geom.coordinates.forEach(c => {
          const pt = project(c[1], c[0]); if(lastPt) doc.line(lastPt[0], lastPt[1], pt[0], pt[1]); lastPt = pt;
        });
      }
    });
  }
  
  doc.setFontSize(6.5); doc.setTextColor(28,43,42);
  visible.forEach(v => {
    const [px, py] = project(v.lat, v.lon); const hex = colorFor(v.status);
    const rgb = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.setDrawColor(255,255,255); doc.setLineWidth(0.3); doc.circle(px, py, 1.4, 'FD');
    const name = (v.row['BH Name'] || '').trim(); if (name) doc.text(name, px + 1.6, py - 1.2);
  });
  
  doc.setDrawColor(28,43,42); doc.setLineWidth(0.3); doc.rect(mapX, mapY, mapW, mapH);
  drawNorthArrow(doc, mapX + mapW - 10, mapY + 14, 5);
  drawScaleBar(doc, mapX + 6, mapY + mapH - 6, (map.distance(L.latLng((north+south)/2, west), L.latLng((north+south)/2, east)) / mapW));
  
  const legX = mapX + mapW + 8, legYStart = mapY + 4, legendW = pageW - margin - legX;
  doc.setFillColor(255,255,255); doc.setDrawColor(216,210,194); doc.rect(legX - 2, legYStart - 2, legendW + 2, pageH - margin - legYStart, 'F');
  
  let legY = legYStart + 4; doc.setFontSize(9); doc.setTextColor(28,43,42); doc.text('LEGEND — BOREHOLES', legX, legY); legY += 6;
  Object.keys(STATUS_COLORS).forEach(k => {
    if (k === 'default') return; const hex = STATUS_COLORS[k];
    const rgb = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.circle(legX + 2, legY - 1, 1.4, 'F');
    doc.setFontSize(8); doc.text(k, legX + 6, legY); legY += 5.5;
  });
  legY += 2; doc.setDrawColor(216,210,194); doc.line(legX, legY - 4, legX + legendW - 8, legY - 4);
  doc.setFont(undefined, 'bold'); doc.text('Total visible: ' + visible.length, legX, legY);
  
  doc.setFontSize(7.5); doc.setTextColor(120,120,120); doc.setFont(undefined, 'normal');
  doc.text('© National Building Research Institute — Geotechnical Engineering Division', margin, pageH - 5);
  doc.save('CEP3_Map_' + new Date().toISOString().slice(0,10) + '.pdf');
}

function exportMapPDF(){
  const btn = document.getElementById('pdf-map-btn'); const originalText = btn.textContent;
  btn.textContent = 'Generating PDF…'; btn.disabled = true;
  try {
    leafletImage(map, (err, canvas) => {
      let dataUrl = null;
      if (!err && canvas){ try { dataUrl = canvas.toDataURL('image/png'); } catch(e){ dataUrl = null; } }
      buildAndSavePDF(dataUrl, canvas ? canvas.width : null, canvas ? canvas.height : null);
      btn.textContent = originalText; btn.disabled = false;
    });
  } catch(e) { btn.textContent = originalText; btn.disabled = false; }
}
document.getElementById('pdf-map-btn').addEventListener('click', exportMapPDF);

/* ============================================================
   Borehole Profile — 2D Cross-Section (Engineering Geology Engine)
   ============================================================ */
