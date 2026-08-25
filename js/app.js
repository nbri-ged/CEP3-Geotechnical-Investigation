/* ============================================================
   NBRI GEOTECHNICAL GIS — MAIN ENTRY POINT (app.js)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  console.log(`[NBRI System] Initializing Geotechnical GIS v${APP_VERSION}...`);

  // 1. Version & Cache Validation
  checkAppVersionAndClearCache();
  autoRefreshCacheOnStartup();

  // 2. Initialize GIS Map
  initMapEngine();

  // 3. Initialize Sidebar & UI Event Listeners
  initSidebarController();

  // 4. Load Master Geotechnical Data
  fetchData();

  // 5. Setup periodic background data refresh (every 5 minutes)
  setInterval(() => {
    fetchData();
  }, AUTO_REFRESH_MS);

  // Close modals on backdrop click
  const profModalBackdrop = document.getElementById('profile-modal-backdrop');
  const profCloseBtn = document.getElementById('profile-close-btn');

  if (profModalBackdrop) {
    profModalBackdrop.addEventListener('click', (e) => {
      if (e.target === profModalBackdrop) {
        profModalBackdrop.classList.remove('open');
      }
    });
  }

  if (profCloseBtn) {
    profCloseBtn.addEventListener('click', () => {
      if (profModalBackdrop) profModalBackdrop.classList.remove('open');
    });
  }
});
