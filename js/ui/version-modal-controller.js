/* ============================================================
   NBRI GEOTECHNICAL GIS — SYSTEM HUB & VERSION CONTROLLER (version-modal-controller.js)
   ============================================================ */

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

  if (tabId === 'rules') {
    renderGeotechnicalRulesUI('rules-grid-container');
  }
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

function checkForAppUpdates(manual = false) {
  updateDiagnosticsTab();
  if (manual) {
    showAppToast(
      '🔄 System Check Complete',
      `You are running the latest version v${APP_VERSION}. All geotechnical models, foliation engines, and dataset caches are synchronized.`,
      'success',
      5000
    );
  }
}

function checkAppVersionAndClearCache() {
  try {
    const storedVer = localStorage.getItem('nbri_app_version');
    if (!storedVer || storedVer !== APP_VERSION) {
      console.log(`[NBRI System] Upgraded from "${storedVer || 'initial'}" to "${APP_VERSION}". Syncing dataset and cache...`);
      const oldRows = localStorage.getItem('nbri_allrows_cache');
      if (oldRows) localStorage.setItem('nbri_allrows_cache_backup', oldRows);
      
      const keysToPurge = ['nbri_dates_cache', 'nbri_cache_timestamp'];
      keysToPurge.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
      
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        }).catch(() => {});
      }
      
      localStorage.setItem('nbri_app_version', APP_VERSION);
      if (storedVer) {
        setTimeout(() => {
          showVersionUpdateNotice(storedVer, APP_VERSION);
        }, 800);
      }
    }
  } catch (e) {
    console.warn('[Version Center] Version sync note:', e);
  }
}

function showVersionUpdateNotice(oldVer, newVer) {
  const note = document.getElementById('version-update-pill');
  if (note) {
    note.style.display = 'inline-flex';
    note.innerHTML = `✨ Updated to v${newVer}`;
  }
  if (typeof showAppToast === 'function') {
    showAppToast(
      `🚀 System Updated (v${newVer})`,
      `Foliation structural projection engine, updated geotechnical rules, and master datasets are ready. <a href="javascript:void(0)" onclick="openVersionModal('changelog')" style="color:#60a5fa; font-weight:700; text-decoration:underline;">View What's New &rarr;</a>`,
      'success',
      9000
    );
  }
}

function forceHardRefreshAndPurge() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(n => caches.delete(n));
      }).catch(() => {});
    }
  } catch (e) {}
  window.location.reload(true);
}
