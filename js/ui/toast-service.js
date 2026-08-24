/* ============================================================
   NBRI GEOTECHNICAL GIS — TOAST & FEEDBACK SERVICE (toast-service.js)
   ============================================================ */

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

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  }
}

function setStatus(text, cls) {
  const t = document.getElementById('status-text');
  const d = document.getElementById('status-dot');
  if (t) t.textContent = text;
  if (d) {
    d.className = '';
    if (cls) d.classList.add(cls);
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
  } catch (e) {
    showAppToast('⚠️ Copy Notice', 'Please manually select and copy system information.', 'warning');
  }
  document.body.removeChild(ta);
}
