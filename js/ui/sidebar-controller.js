/* ============================================================
   NBRI GEOTECHNICAL GIS — SIDEBAR & FILTER CONTROLLER (sidebar-controller.js)
   ============================================================ */

function initSidebarController() {
  const searchInput = document.getElementById('search');
  const fStatus = document.getElementById('f-status');
  const fContractor = document.getElementById('f-contractor');
  const fLot = document.getElementById('f-lot');
  const fPackage = document.getElementById('f-package');

  if (searchInput) searchInput.addEventListener('input', () => { if (typeof render === 'function') render(); });
  if (fStatus) fStatus.addEventListener('change', () => { if (typeof render === 'function') render(); });
  if (fContractor) fContractor.addEventListener('change', () => { if (typeof render === 'function') render(); });
  if (fLot) fLot.addEventListener('change', () => { if (typeof render === 'function') render(); });
  if (fPackage) fPackage.addEventListener('change', () => { if (typeof render === 'function') render(); });

  // Sidebar Mobile Toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const appEl = document.getElementById('app');

  if (sidebarToggle && appEl) {
    sidebarToggle.addEventListener('click', () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        appEl.classList.toggle('sidebar-open-mobile');
      } else {
        appEl.classList.toggle('sidebar-collapsed-desktop');
      }
    });
  }

  if (backdrop && appEl) {
    backdrop.addEventListener('click', () => {
      appEl.classList.remove('sidebar-open-mobile');
    });
  }

  // Cross-Section Profile Mode Toggle
  const profBtn = document.getElementById('profile-select-btn');
  const profClearBtn = document.getElementById('profile-clear-btn');
  const profGenBtn = document.getElementById('profile-generate-btn');

  if (profBtn) {
    profBtn.addEventListener('click', () => {
      profileSelectMode = !profileSelectMode;
      profBtn.classList.toggle('profile-active', profileSelectMode);
      profBtn.textContent = profileSelectMode ? '✅ Click Boreholes Now (tap again to stop)' : '📍 Select Boreholes on Map';
      if (typeof showAppToast === 'function' && profileSelectMode) {
        showAppToast('📐 Profile Mode Active', 'Click on map markers or popup buttons to add boreholes.', 'info');
      }
    });
  }

  if (profClearBtn) {
    profClearBtn.addEventListener('click', () => {
      profileSelectedIdx = [];
      updateProfileChips();
      if (typeof render === 'function') render();
    });
  }

  if (profGenBtn) {
    profGenBtn.addEventListener('click', () => {
      if (profileSelectedIdx.length < 2) {
        alert('Select at least 2 boreholes first (click them on the map while "Select Boreholes on Map" is active).');
        return;
      }
      let rows = profileSelectedIdx
        .map(rowIdx => allRows[rowIdx])
        .filter(Boolean);

      rows = sortBoreholesByMapPosition(rows);
      showProfileModal(rows);
    });
  }

  // Export Buttons Listeners
  const kmlBhBtn = document.getElementById('kml-bh-only');
  const kmlRoadBtn = document.getElementById('kml-bh-road');
  const pdfMapBtn = document.getElementById('pdf-map-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const pkgReportBtn = document.getElementById('pkg-report-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  if (kmlBhBtn) kmlBhBtn.addEventListener('click', () => { if (typeof exportKML === 'function') exportKML(false); });
  if (kmlRoadBtn) kmlRoadBtn.addEventListener('click', () => { if (typeof exportKML === 'function') exportKML(true); });
  if (pdfMapBtn) pdfMapBtn.addEventListener('click', () => { if (typeof downloadMapSnapshotPDF === 'function') downloadMapSnapshotPDF(); });
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => {
    if (!allRows || allRows.length === 0) { alert("No structured rows loaded."); return; }
    const csvString = Papa.unparse(allRows);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const downloadUrl = URL.createObjectURL(blob);
    const targetLink = document.createElement("a");
    targetLink.href = downloadUrl;
    targetLink.download = `NBRI_Borehole_Master_Data_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(targetLink);
    targetLink.click();
    document.body.removeChild(targetLink);
  });
  if (pkgReportBtn) pkgReportBtn.addEventListener('click', () => { if (typeof generatePackageReportPDF === 'function') generatePackageReportPDF(); });
  if (refreshBtn) refreshBtn.addEventListener('click', () => { if (typeof fetchData === 'function') fetchData(); });
}
