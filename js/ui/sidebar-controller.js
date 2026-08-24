/* ============================================================
   NBRI GEOTECHNICAL GIS — SIDEBAR & FILTER CONTROLLER (sidebar-controller.js)
   ============================================================ */

function initSidebarController() {
  const searchInput = document.getElementById('search');
  const fStatus = document.getElementById('f-status');
  const fContractor = document.getElementById('f-contractor');
  const fLot = document.getElementById('f-lot');
  const fPackage = document.getElementById('f-package');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (fStatus) fStatus.addEventListener('change', applyFilters);
  if (fContractor) fContractor.addEventListener('change', applyFilters);
  if (fLot) fLot.addEventListener('change', applyFilters);
  if (fPackage) fPackage.addEventListener('change', applyFilters);

  // Sidebar Mobile Toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const appEl = document.getElementById('app');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        appEl.classList.toggle('sidebar-open-mobile');
      } else {
        appEl.classList.toggle('sidebar-collapsed-desktop');
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      appEl.classList.remove('sidebar-open-mobile');
    });
  }

  // Cross-Section Profile Mode Toggle
  const profBtn = document.getElementById('profile-select-btn');
  const profClearBtn = document.getElementById('profile-clear-btn');
  const profGenBtn = document.getElementById('profile-generate-btn');

  if (profBtn) {
    profBtn.addEventListener('click', toggleProfileSelectionMode);
  }
  if (profClearBtn) {
    profClearBtn.addEventListener('click', clearProfileSelection);
  }
  if (profGenBtn) {
    profGenBtn.addEventListener('click', openProfileModalFromSelection);
  }

  // Export Buttons Listeners
  const kmlBhBtn = document.getElementById('kml-bh-only');
  const kmlRoadBtn = document.getElementById('kml-bh-road');
  const pdfMapBtn = document.getElementById('pdf-map-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const overlayFileInput = document.getElementById('overlay-file');
  const refreshBtn = document.getElementById('refresh-btn');
  const measureBtn = document.getElementById('measure-btn');

  if (kmlBhBtn) kmlBhBtn.addEventListener('click', () => exportKML(false));
  if (kmlRoadBtn) kmlRoadBtn.addEventListener('click', () => exportKML(true));
  if (pdfMapBtn) pdfMapBtn.addEventListener('click', downloadMapSnapshotPDF);
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportMasterCSV(allRows));
  if (refreshBtn) refreshBtn.addEventListener('click', fetchData);
  if (measureBtn) measureBtn.addEventListener('click', toggleMeasureTool);

  if (overlayFileInput) {
    overlayFileInput.addEventListener('change', (e) => handleVectorOverlayUpload(e.target.files));
  }
}

// Populate Filter Dropdowns dynamically from active dataset
function populateFilters(rows) {
  const getUnique = (key) => {
    const s = new Set();
    rows.forEach(r => {
      const v = (r[key] || '').trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort();
  };

  const populate = (id, vals, defaultLabel) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="">${defaultLabel}</option>` + vals.map(v => `<option value="${v}">${v}</option>`).join('');
    if (vals.includes(cur)) el.value = cur;
  };

  populate('f-status', getUnique('Status'), 'All Statuses');
  populate('f-contractor', getUnique('Contractor Done'), 'All Contractors');
  populate('f-lot', getUnique('Lot'), 'All Lots');
  populate('f-package', getUnique('Package'), 'All Packages');
}

// Apply Search and Dropdown Filter Criteria
function applyFilters() {
  const query = (document.getElementById('search')?.value || '').toLowerCase().trim();
  const st = (document.getElementById('f-status')?.value || '').toLowerCase().trim();
  const con = (document.getElementById('f-contractor')?.value || '').toLowerCase().trim();
  const lot = (document.getElementById('f-lot')?.value || '').toLowerCase().trim();
  const pkg = (document.getElementById('f-package')?.value || '').toLowerCase().trim();

  const filtered = allRows.filter(row => {
    const bhId = (row['BH Name'] || row['PointID'] || '').toLowerCase();
    const rSt = (row['Status'] || '').toLowerCase();
    const rCon = (row['Contractor Done'] || row['Contractor'] || '').toLowerCase();
    const rLot = (row['Lot'] || '').toLowerCase();
    const rPkg = (row['Package'] || '').toLowerCase();

    if (query && !bhId.includes(query) && !rLot.includes(query) && !rPkg.includes(query) && !rCon.includes(query)) return false;
    if (st && rSt !== st) return false;
    if (con && rCon !== con) return false;
    if (lot && rLot !== lot) return false;
    if (pkg && rPkg !== pkg) return false;
    return true;
  });

  renderMapMarkers(filtered);
  updateDashboardStats(filtered);

  const countEl = document.getElementById('count');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${allRows.length} boreholes`;
  }
}

// Update Top KPI Dashboard Statistics
function updateDashboardStats(rows) {
  const total = rows.length;
  let completed = 0, inProgress = 0, remaining = 0;

  rows.forEach(r => {
    const s = (r['Status'] || '').toLowerCase();
    if (s.includes('completed') || s === 'done') completed++;
    else if (s.includes('progress') || s.includes('ongoing')) inProgress++;
    else if (!s.includes('cancelled')) remaining++;
  });

  const progressRate = total > 0 ? ((completed / total) * 100).toFixed(1) + '%' : '0%';

  const elTot = document.getElementById('dash-total');
  const elComp = document.getElementById('dash-completed');
  const elProg = document.getElementById('dash-inprogress');
  const elRem = document.getElementById('dash-remaining');
  const elRate = document.getElementById('dash-progress');

  if (elTot) elTot.textContent = total;
  if (elComp) elComp.textContent = completed;
  if (elProg) elProg.textContent = inProgress;
  if (elRem) elRem.textContent = remaining;
  if (elRate) elRate.textContent = progressRate;
}

// Borehole Selection Chips for 2D Cross-Section
function toggleProfileSelectionMode() {
  isProfileSelecting = !isProfileSelecting;
  const btn = document.getElementById('profile-select-btn');
  const listEl = document.getElementById('profile-selected-list');

  if (isProfileSelecting) {
    if (btn) {
      btn.classList.add('profile-active');
      btn.innerHTML = '🎯 Click Boreholes on Map...';
    }
    if (listEl) listEl.style.display = 'block';
    showAppToast('📐 Profile Mode Active', 'Click on map markers to add boreholes to the cross-section alignment.', 'info');
  } else {
    if (btn) {
      btn.classList.remove('profile-active');
      btn.innerHTML = '📐 Select Boreholes for Cross-Section';
    }
  }
}

function handleProfileBoreholeClick(rowIdx) {
  if (profileSelectedIdx.includes(rowIdx)) {
    profileSelectedIdx = profileSelectedIdx.filter(i => i !== rowIdx);
  } else {
    profileSelectedIdx.push(rowIdx);
  }
  updateProfileChipsUI();
}

function removeProfileIndex(rowIdx) {
  profileSelectedIdx = profileSelectedIdx.filter(i => i !== rowIdx);
  updateProfileChipsUI();
}

function updateProfileChipsUI() {
  const container = document.getElementById('profile-chips');
  if (!container) return;

  container.innerHTML = profileSelectedIdx.map(idx => {
    const r = allRows[idx];
    const name = (r['BH Name'] || r['PointID'] || `BH ${idx}`).trim();
    return `
      <span class="profile-chip" onclick="removeProfileIndex(${idx})">
        ${name} &times;
      </span>
    `;
  }).join('');
}

function clearProfileSelection() {
  profileSelectedIdx = [];
  updateProfileChipsUI();
}

function openProfileModalFromSelection() {
  if (profileSelectedIdx.length < 2) {
    alert('Please select at least 2 boreholes on the map to generate an engineering geological cross-section.');
    return;
  }
  const selectedRows = profileSelectedIdx.map(i => allRows[i]);
  currentProfileRows = selectedRows;

  const backdrop = document.getElementById('profile-modal-backdrop');
  if (backdrop) backdrop.classList.add('open');

  recreateProfile();
}
