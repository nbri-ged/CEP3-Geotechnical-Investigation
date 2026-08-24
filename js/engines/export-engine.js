/* ============================================================
   NBRI GEOTECHNICAL GIS — EXPORT & REPORTING ENGINE (export-engine.js)
   ============================================================ */

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadProfileSVG() {
  const svgEl = document.querySelector('#profile-modal-body svg');
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `CEP3_Geology_Profile_${new Date().toISOString().slice(0, 10)}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadProfilePNG() {
  const svgEl = document.querySelector('#profile-modal-body svg');
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = 2.0;
    canvas.width = (svgEl.viewBox.baseVal.width || 1140) * scale;
    canvas.height = (svgEl.viewBox.baseVal.height || 580) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png', 1.0);
    a.download = `CEP3_Geology_Profile_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = url;
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
    canvas.width = (svgEl.viewBox.baseVal.width || 1140) * scale;
    canvas.height = (svgEl.viewBox.baseVal.height || 580) * scale;
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
    doc.save(`CEP3_Geology_Profile_${format.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
    showAppToast('📄 PDF Generated', `Exported ${format.toUpperCase()} landscape geological section.`, 'success');
  };
  img.src = url;
}

// Master CSV Exporter
function exportMasterCSV(rows = allRows) {
  if (!rows || !rows.length) {
    alert('No dataset available to export.');
    return;
  }
  const csv = Papa.unparse(rows);
  downloadTextFile(`CEP3_Master_Borehole_Dataset_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  showAppToast('📊 CSV Export Complete', 'Master borehole dataset saved.', 'success');
}

// KML Exporter
function exportKML(includeRoadTrace = false) {
  if (!allRows || !allRows.length) return;
  const features = [];

  allRows.forEach(row => {
    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    const ll = convertToLatLon(e, n);
    if (!ll) return;

    const bhName = (row['BH Name'] || row['PointID'] || 'BH').trim();
    const levels = computeBHLevels(row);
    const pdfUrl = (row['PDF Link'] || row['PDF'] || '').trim();

    let desc = `<b>Borehole Metadata</b><br>
    Status: ${row['Status'] || '—'}<br>
    Elevation: ${row['Elevation'] || '—'} m MSL<br>
    Termination Depth: ${row['Termination Depth'] || '—'} m<br>
    Rockhead: ${rockLevelDisplay(levels)}<br>
    Groundwater: ${row['Groundwater Level'] || '—'} m<br>
    Contractor: ${row['Contractor Done'] || row['Contractor'] || '—'}`;

    if (pdfUrl) {
      desc += `<br><a href="${pdfUrl}">View Borehole Log PDF</a>`;
    }

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] },
      properties: { name: bhName, description: desc }
    });
  });

  if (includeRoadTrace && features.length >= 2) {
    const sorted = sortBoreholesByMapPosition(allRows);
    const lineCoords = sorted.map(r => {
      const ll = convertToLatLon(toNum(r['Easting']), toNum(r['Northing']));
      return ll ? [ll.lon, ll.lat] : null;
    }).filter(Boolean);

    if (lineCoords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lineCoords },
        properties: { name: 'CEP3 Expressway Alignment Baseline Trace', description: 'Centerline connecting investigation nodes' }
      });
    }
  }

  const geojson = { type: 'FeatureCollection', features };
  const kml = tokml(geojson, { name: 'name', description: 'description' });
  const filename = includeRoadTrace ? 'CEP3_Boreholes_And_Road_Trace.kml' : 'CEP3_Boreholes_Locations_Only.kml';
  downloadTextFile(filename, kml);
  showAppToast('🌐 KML Export Complete', `Exported ${filename}`, 'success');
}

// Map Viewport PDF Snapshot
function downloadMapSnapshotPDF() {
  if (!map) return;
  showAppToast('📄 Generating PDF', 'Rendering map viewport snapshot...', 'info');

  leafletImage(map, (err, canvas) => {
    if (err || !canvas) {
      alert('Could not render map snapshot: ' + err);
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', 10, 10, 277, 190);
    doc.save(`CEP3_Map_Snapshot_${new Date().toISOString().slice(0, 10)}.pdf`);
    showAppToast('📄 Map Snapshot Saved', 'Map view saved to PDF.', 'success');
  });
}
