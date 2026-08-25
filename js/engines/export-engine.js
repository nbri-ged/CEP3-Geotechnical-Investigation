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

// KML Helpers & CDATA Safeguards
function decodeHtmlEntities(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function fixKmlDescriptionsForHtml(kmlString) {
  return kmlString.replace(/<description>([\s\S]*?)<\/description>/g, (match, inner) => {
    return '<description><![CDATA[' + decodeHtmlEntities(inner) + ']]></description>';
  });
}

function boreholesToGeoJSON() {
  const features = [];
  if (!allRows || !allRows.length) return { type: 'FeatureCollection', features };

  allRows.forEach(row => {
    const e = toNum(row['Easting']), n = toNum(row['Northing']);
    if (e === null || n === null) return;
    const ll = convertToLatLon(e, n);
    if (!ll) return;

    const levels = computeBHLevels(row);
    const bhName = (row['BH Name'] || row['PointID'] || 'BH').trim();
    const logDates = (typeof bhDatesLookup !== 'undefined' && bhDatesLookup[bhName]) ? bhDatesLookup[bhName] : {};
    const commenceDate = formatDateDMY(getFirst(row, ['Borehole Commence Date', 'Commence Date', 'Date Commenced', 'Commencement Date', 'Start Date']) || logDates.commence || '');
    const completedDate = formatDateDMY(getFirst(row, ['Borehole Completed Date', 'Completed Date', 'Completion Date', 'Date Completed', 'Finish Date']) || logDates.completed || '');
    const pdfUrl = (row['PDF Link'] || row['Log PDF'] || row['Borehole Log'] || row['PDF'] || '').trim();

    const descRows = `<tr><td><b>Property</b></td><td><b>Value</b></td></tr>
      <tr><td>Commence Date</td><td>${commenceDate}</td></tr>
      <tr><td>Completed Date</td><td>${completedDate}</td></tr>
      <tr><td>Easting</td><td>${row['Easting'] || ''}</td></tr>
      <tr><td>Northing</td><td>${row['Northing'] || ''}</td></tr>
      <tr><td>Elevation (m)</td><td>${row['Elevation'] || ''}</td></tr>
      <tr><td>Contractor</td><td>${row['Contractor Done'] || row['Contractor'] || ''}</td></tr>
      <tr><td>Lot</td><td>${row['Lot'] || ''}</td></tr>
      <tr><td>Package</td><td>${row['Package'] || ''}</td></tr>
      <tr><td>Termination Depth (m)</td><td>${row['Termination Depth'] || ''}</td></tr>
      <tr><td>Rock Level (m)</td><td>${rockLevelDisplay(levels)}</td></tr>
      <tr><td>Groundwater Level (m)</td><td>${row['Groundwater Level'] || ''}</td></tr>`;

    const descriptionHtml = `<p><b>NBRI Borehole Node Metadata</b></p><table border="1" cellpadding="4" style="border-collapse:collapse;">${descRows}</table>` +
      (pdfUrl ? `<p><a href="${pdfUrl}">View Borehole Log PDF</a></p>` : '');

    features.push({
      type: 'Feature',
      properties: {
        name: bhName || 'Unnamed BH',
        description: descriptionHtml,
        Status: row['Status'] || '',
        'Commence Date': commenceDate,
        'Completed Date': completedDate,
        Easting: row['Easting'] || '',
        Northing: row['Northing'] || '',
        'Elevation (m)': row['Elevation'] || '',
        Contractor: row['Contractor Done'] || row['Contractor'] || '',
        Lot: row['Lot'] || '',
        Package: row['Package'] || '',
        'Termination Depth (m)': row['Termination Depth'] || '',
        'Rock Level (m)': rockLevelDisplay(levels),
        'Groundwater Level (m)': row['Groundwater Level'] || '',
        'PDF Link': pdfUrl
      },
      geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] }
    });
  });
  return { type: 'FeatureCollection', features };
}

// Master KML Exporter
function exportKML(includeRoad = false) {
  const bhGeoJSON = boreholesToGeoJSON();
  if (includeRoad && typeof roadCorridorGeoJSON !== 'undefined' && roadCorridorGeoJSON && roadCorridorGeoJSON.features) {
    const mixed = { type: 'FeatureCollection', features: [...roadCorridorGeoJSON.features, ...bhGeoJSON.features] };
    const kml = tokml(mixed, { name: 'name', description: 'description' });
    downloadTextFile('CEP3_Boreholes_And_Road_Trace.kml', fixKmlDescriptionsForHtml(kml));
    showAppToast('🌐 KML Export Complete', 'Exported CEP3 Boreholes + Road Corridor Alignment.', 'success');
  } else {
    const kml = tokml(bhGeoJSON, { name: 'name', description: 'description' });
    downloadTextFile('CEP3_Boreholes_Locations_Only.kml', fixKmlDescriptionsForHtml(kml));
    showAppToast('🌐 KML Export Complete', 'Exported CEP3 Borehole Investigation Nodes.', 'success');
  }
}

/* ── PROFESSIONAL CARTOGRAPHIC MAP PDF EXPORT ── */
function drawNorthArrow(doc, x, y, size) {
  doc.setDrawColor(28, 43, 42);
  doc.setFillColor(28, 43, 42);
  doc.triangle(x, y - size, x - size * 0.35, y + size * 0.5, x + size * 0.35, y + size * 0.5, 'F');
  doc.setFontSize(9);
  doc.text('N', x, y + size * 0.5 + 4, { align: 'center' });
}

function drawScaleBar(doc, x, y, metersPerMm) {
  const targetWidthMm = 30;
  const targetMeters = targetWidthMm * metersPerMm;
  const scaleMeters = niceScaleMeters(targetMeters);
  const scaleWidthMm = scaleMeters / metersPerMm;

  doc.setDrawColor(28, 43, 42);
  doc.setLineWidth(1.0);
  doc.line(x, y, x + scaleWidthMm, y);
  doc.line(x, y - 1.5, x, y + 1.5);
  doc.line(x + scaleWidthMm, y - 1.5, x + scaleWidthMm, y + 1.5);
  doc.setFontSize(7.5);
  doc.setTextColor(28, 43, 42);
  doc.text(scaleMeters >= 1000 ? (scaleMeters / 1000) + ' km' : scaleMeters + ' m', x + scaleWidthMm + 3, y + 1);
}

function buildAndSavePDF(rasterDataUrl, canvasW, canvasH) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not ready. Please try again.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageW = 297, pageH = 210, margin = 12;

  // Title Block
  doc.setFillColor(28, 43, 42);
  doc.rect(margin, margin, pageW - margin * 2, 14, 'F');
  doc.setFont('Inter', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(246, 244, 238);
  doc.text('NBRI BOREHOLE LOCATION MAP — EXPRESSWAY SEGMENT CEP3', margin + 6, margin + 9.5);

  const mapX = margin, mapY = margin + 18, mapW = 195, mapH = pageH - margin * 2 - 18;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 100, 89);
  doc.text('Current View | Generated ' + formatDateDMY(new Date()) + ', ' + new Date().toLocaleTimeString(), margin, margin + 16);

  doc.setFillColor(246, 244, 238);
  doc.rect(mapX, mapY, mapW, mapH, 'F');
  const bounds = map.getBounds();
  const west = bounds.getWest(), east = bounds.getEast(), north = bounds.getNorth(), south = bounds.getSouth();

  if (rasterDataUrl) {
    try {
      doc.addImage(rasterDataUrl, 'PNG', mapX, mapY, mapW, mapH);
    } catch (e) {
      rasterDataUrl = null;
    }
  }

  function project(lat, lon) {
    const px = mapX + ((lon - west) / (east - west)) * mapW;
    const py = mapY + ((north - lat) / (north - south)) * mapH;
    return [Math.max(mapX, Math.min(mapX + mapW, px)), Math.max(mapY, Math.min(mapY + mapH, py))];
  }

  // Draw permanent road corridor vector line if available
  if (typeof roadCorridorGeoJSON !== 'undefined' && roadCorridorGeoJSON && roadCorridorGeoJSON.features) {
    roadCorridorGeoJSON.features.forEach(feature => {
      const geom = feature.geometry;
      if (!geom) return;
      doc.setDrawColor(179, 84, 30);
      doc.setLineWidth(0.35);
      if (geom.type === 'LineString') {
        let lastPt = null;
        geom.coordinates.forEach(c => {
          const pt = project(c[1], c[0]);
          if (lastPt) doc.line(lastPt[0], lastPt[1], pt[0], pt[1]);
          lastPt = pt;
        });
      } else if (geom.type === 'MultiLineString') {
        geom.coordinates.forEach(line => {
          let lastPt = null;
          line.forEach(c => {
            const pt = project(c[1], c[0]);
            if (lastPt) doc.line(lastPt[0], lastPt[1], pt[0], pt[1]);
            lastPt = pt;
          });
        });
      }
    });
  }

  // Draw crisp borehole markers & labels
  const visible = typeof getVisibleFilteredRows === 'function' ? getVisibleFilteredRows() : [];
  doc.setFontSize(6.5);
  doc.setTextColor(28, 43, 42);
  visible.forEach(v => {
    const [px, py] = project(v.lat, v.lon);
    const hex = colorFor(v.status);
    const rgb = [parseInt(hex.slice(1, 3), 16) || 0, parseInt(hex.slice(3, 5), 16) || 0, parseInt(hex.slice(5, 7), 16) || 0];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.circle(px, py, 1.4, 'FD');
    const name = (v.row['BH Name'] || '').trim();
    if (name) doc.text(name, px + 1.6, py - 1.2);
  });

  doc.setDrawColor(28, 43, 42);
  doc.setLineWidth(0.3);
  doc.rect(mapX, mapY, mapW, mapH);
  drawNorthArrow(doc, mapX + mapW - 10, mapY + 14, 5);

  const metersAcross = map.distance(L.latLng((north + south) / 2, west), L.latLng((north + south) / 2, east));
  drawScaleBar(doc, mapX + 6, mapY + mapH - 6, metersAcross / mapW);

  // Status Legend Box
  const legX = mapX + mapW + 8, legYStart = mapY + 4, legendW = pageW - margin - legX;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(216, 210, 194);
  doc.rect(legX - 2, legYStart - 2, legendW + 2, pageH - margin - legYStart, 'F');

  let legY = legYStart + 4;
  doc.setFontSize(9);
  doc.setTextColor(28, 43, 42);
  doc.text('LEGEND — BOREHOLES', legX, legY);
  legY += 6;

  Object.keys(STATUS_COLORS).forEach(k => {
    if (k === 'default') return;
    const hex = STATUS_COLORS[k];
    const rgb = [parseInt(hex.slice(1, 3), 16) || 0, parseInt(hex.slice(3, 5), 16) || 0, parseInt(hex.slice(5, 7), 16) || 0];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(legX + 2, legY - 1, 1.4, 'F');
    doc.setFontSize(8);
    doc.text(k, legX + 6, legY);
    legY += 5.5;
  });

  legY += 2;
  doc.setDrawColor(216, 210, 194);
  doc.line(legX, legY - 4, legX + legendW - 8, legY - 4);
  doc.setFont(undefined, 'bold');
  doc.text('Total visible: ' + visible.length, legX, legY);

  // Footer Attribution
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.setFont(undefined, 'normal');
  doc.text('© National Building Research Institute — Geotechnical Engineering Division', margin, pageH - 5);
  doc.save('CEP3_Map_' + new Date().toISOString().slice(0, 10) + '.pdf');
  showAppToast('📄 Map PDF Generated', 'Cartographic map sheet saved successfully.', 'success');
}

function exportMapPDF() {
  const btn = document.getElementById('pdf-map-btn');
  const originalText = btn ? btn.textContent : '📄 PDF Map Snapshot';
  if (btn) { btn.textContent = 'Generating PDF…'; btn.disabled = true; }
  showAppToast('📄 Generating PDF', 'Rendering cartographic map sheet...', 'info');

  try {
    leafletImage(map, (err, canvas) => {
      let dataUrl = null;
      if (!err && canvas) {
        try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { dataUrl = null; }
      }
      buildAndSavePDF(dataUrl, canvas ? canvas.width : null, canvas ? canvas.height : null);
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
    });
  } catch (e) {
    if (btn) { btn.textContent = originalText; btn.disabled = false; }
  }
}

// Fallback alias for map snapshot
function downloadMapSnapshotPDF() {
  exportMapPDF();
}

/* ── EXECUTIVE SUMMARY REPORT PDF (PER PACKAGE) ── */
function generatePackageReportPDF() {
  const selectEl = document.getElementById('report-package-select');
  const selectedPkg = selectEl ? selectEl.value.trim() : '';
  if (!selectedPkg) {
    alert("Please select a construction Package first.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF generator library loading... Please try again in a moment.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210, pageH = 297, margin = 16;
  let currentY = margin;
  const targetRows = (allRows || []).filter(r => (r['Package'] || '').trim() === selectedPkg);

  if (!targetRows.length) {
    alert(`No borehole records found for package "${selectedPkg}".`);
    return;
  }

  // Header Banner
  doc.setFillColor(28, 43, 42);
  doc.rect(margin, currentY, pageW - (margin * 2), 14, 'F');
  doc.setFontSize(11);
  doc.setTextColor(246, 244, 238);
  doc.text(`GEOTECHNICAL INVESTIGATION EXECUTIVE SUMMARY REPORT`, margin + 5, currentY + 9);

  currentY += 22;
  doc.setTextColor(28, 43, 42);
  doc.setFontSize(10);
  doc.text(`Project Corridor Segment: CEP3 (Rambukkana - Galagedara Section)`, margin, currentY);
  doc.text(`Target Package Classification: ${selectedPkg}`, margin, currentY + 5);
  doc.text(`Total Documented Boreholes: ${targetRows.length}`, margin, currentY + 10);
  doc.text(`Generated Timestamp: ${new Date().toLocaleDateString()} — Geotechnical Division`, margin, currentY + 15);
  currentY += 24;

  targetRows.forEach((bh, index) => {
    if (currentY > pageH - 55) {
      doc.addPage();
      currentY = margin;
    }
    doc.setDrawColor(216, 210, 194);
    doc.setLineWidth(0.4);
    doc.line(margin, currentY, pageW - margin, currentY);
    currentY += 6;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text(`${index + 1}. Borehole ID Reference: ${bh['BH Name'] || 'N/A'}`, margin, currentY);
    currentY += 5;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8.5);

    const levels = computeBHLevels(bh);
    const textLines = [
      `Easting: ${bh['Easting'] || '—'}  |  Northing: ${bh['Northing'] || '—'}  |  Elevation: ${bh['Elevation'] || '—'} m (MSL)`,
      `Status: ${bh['Status'] || 'Planned'}  |  Contractor assigned: ${bh['Contractor Done'] || bh['Contractor'] || 'NBRI'}`,
      `Termination Depth: ${bh['Termination Depth'] || '—'} m  |  Water Table Level: ${bh['Groundwater Level'] || '—'} m`,
      `Overburden Horizon: ${levels.overburden !== null ? levels.overburden.toFixed(2) + ' m' : '—'}  |  Bedrock Depth Level: ${rockLevelDisplay(levels)}`
    ];
    textLines.forEach(line => {
      doc.text(line, margin + 4, currentY);
      currentY += 4;
    });

    if (levels.termDepth > 0) {
      const colH = 16, colW = 5, x0 = margin + 145, y0 = currentY - 18;
      const scale = colH / levels.termDepth;
      const soilH = levels.overburden !== null ? Math.min(levels.overburden * scale, colH) : colH;
      const rkH = colH - soilH;
      doc.setFillColor(201, 168, 118);
      doc.rect(x0, y0, colW, soilH, 'F');
      if (rkH > 0) {
        doc.setFillColor(143, 143, 149);
        doc.rect(x0, y0 + soilH, colW, rkH, 'F');
      }
      doc.setDrawColor(58, 58, 58);
      doc.setLineWidth(0.2);
      doc.rect(x0, y0, colW, colH, 'S');
      doc.setFontSize(7);
      doc.text(`0.00m`, x0 + colW + 2, y0 + 2);
      doc.text(`${levels.termDepth}m (Term)`, x0 + colW + 2, y0 + colH);
    }
    currentY += 4;
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`© National Building Research Institute — Report Compilation Package ${selectedPkg} — Page ${i} of ${totalPages}`, margin, pageH - 6);
  }
  doc.save(`NBRI_Geotechnical_Report_Package_${selectedPkg}.pdf`);
  showAppToast('📄 Executive Report Generated', `Package ${selectedPkg} summary report saved.`, 'success');
}
