/* ============================================================
   NBRI GEOTECHNICAL GIS — APPLICATION CONFIGURATION (app-config.js)
   Single source of truth for global configuration, endpoints, and shared state.
   ============================================================ */

// Software Version & Release
const APP_VERSION = "2.7.0";
const LOCAL_BOREHOLES_CSV = "CEP 3  Rambukkana-Galagedara - BoreholesDetails (2).csv";

// Scale meter rounder for grids and cross-sections
function niceScaleMeters(target) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  let best = steps[0];
  for (const s of steps) {
    if (s <= target) best = s;
  }
  return best;
}

// Data Source Endpoints (Google Sheets Published CSV Feeds)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?gid=364501395&single=true&output=csv";
const LOG_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv";
const BH_PROFILE_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv&gid=1914424732";
const CEP4_BH_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8PKkh7RDdd1g5boTWjdryadGLVhDkvKUMEjScApNAeWA7TrPrcetA1YiccjQvhPfnZ8ewg1NQugfv/pub?output=csv&gid=1030712797";
const CEP4_SHEET_CSV_URL = "PASTE_PUBLISHED_CSV_LINK_FOR_GID_1030712797_HERE";
const PROGRESS_SHEET_CSV_URL = "PASTE_PUBLISHED_CSV_LINK_FOR_GID_1476293361_HERE";
const AUTO_REFRESH_MS = 5 * 60 * 1000;

// Permanent Road Corridor & Vector Overlays Configuration
const PERMANENT_OVERLAYS = [ { name: "CEP3 Road Corridor", url: "Polyline_cep32.zip" } ];
let roadCorridorGeoJSON = null;
let overlayCount = 0;
const ACI_COLORS = { 1:"#ff0000",2:"#ffff00",3:"#00ff00",4:"#00ffff",5:"#0000ff",6:"#ff00ff",7:"#1a1a1a",8:"#808080",9:"#c0c0c0" };
const OVERLAY_LINE_WEIGHT_PX = 2.0;

// Coordinate Projection Definition: Sri Lanka National Grid (Kandawala / SLD99 - EPSG:5235)
if (typeof proj4 !== 'undefined') {
  proj4.defs("EPSG:5235", "+proj=tmerc +lat_0=7.000480277777778 +lon_0=80.77171308333334 +k=0.9999238418 +x_0=500000 +y_0=500000 +ellps=evrst30 +towgs84=-0.293,766.95,87.713,0.195704,1.69507,3.47302,-0.039338 +units=m +no_defs");
}

// Sample fallback CSV snippet if offline and master file unavailable
const SAMPLE_CSV = `BH Name,Easting,Northing,Elevation,TF,Status,Contractor,Difficulty,Lot,Package,Status-N,Termination Depth,Rock Coring,Groundwater Level
BH-MT-08,457534.196,539950.47,99.929,TRUE,Completed,NBRI,Paddy Field,Lot 0,Package 2A,2,15,12,2
BH-MT-07,457571.239,539966.16,100.505,TRUE,Completed,NBRI,Paddy Field,Lot 0,Package 2A,2,15,9,1`;

// Color Palettes
const STATUS_COLORS = {
  "Completed": "#2f6f5e",
  "Cancelled": "#c0523f",
  "Ongoing": "#b3541e",
  "In Progress": "#b3541e",
  "Planned": "#8a8370",
  "Pending": "#c9a227",
  "default": "#4c6a72"
};

const PACKAGE_COLORS = {
  "Package 1": "#2563eb",
  "Package 2A": "#10b981",
  "Package 2B": "#f59e0b",
  "Package 3": "#8b5cf6",
  "Package 4": "#ec4899",
  "default": "#64748b"
};

// Cache busting URL helper
function getBustedUrl(url) {
  if (!url) return '';
  if (url.includes('docs.google.com')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_v=${APP_VERSION}_t=${Date.now()}`;
}

// ── GLOBAL SHARED STATE VARIABLES ─────────────────────────────
var allRows = [];
var markers = [];
var markersLayer = null;
var map = null;
var baseLayers = {};
var layersControl = null;
var cep4Layer = null;

var bhDatesLookup = {};
var profileLayersByBH = {};
var profileWeatheringByBH = {};
var profileTestsByBH = {};

var profileSelectMode = false;
var profileSelectedIdx = [];
var currentProfileRows = null;
var sectionMethod = 'sequential';
var sectionAzimuth = 45;
var foliationDipDir = 45;
var foliationDipAngle = 45;

var profileOptions = {
  showRockLithology: true,
  showSPT: true,
  showRQD: true,
  showGWT: true,
  showWeathering: true,
  showRoughGround: false,
  showRoughSoil: false,
  showRoughRockhead: false
};

var isMeasuring = false;
var measurePoints = [];
var measureLines = null;
var measurePolygon = null;
var measureMarkers = [];
var timelineActiveDate = null;
var progressSeries = [];
var userLocationMarker = null;
var userAccuracyCircle = null;
var userLocationWatchId = null;
var activeKmlLayers = [];
