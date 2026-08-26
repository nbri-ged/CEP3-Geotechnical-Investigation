# 🏛️ NBRI Geotechnical GIS — Central Expressway Project (CEP3)
### Web GIS, Subsurface Stratigraphic Modeling & 2D Engineering Cross-Section Studio
**National Building Research Institute (NBRI), Sri Lanka — Geotechnical Engineering Division**  
*In collaboration with the Road Development Authority (RDA)*  
*Lead Developer & Geotechnical Engineer: Ranjan*

---

## 🌟 Overview

The **NBRI Geotechnical GIS** is an advanced, high-performance spatial analysis and geotechnical subsurface modeling platform developed for the **Central Expressway Project Section 3 (CEP3: Rambukkana to Galagedara)** in Sri Lanka.

It provides real-time geotechnical data visualization, automated borehole stratigraphic column generation, multi-tier data resiliency, GPS field tracking, in-situ field test analysis (SPT & RQD), and **automated 2D Engineering Geological Cross-Section generation** with full **AutoCAD / Civil 3D DXF Vector CAD export**.

---

## 🚀 Key Features

* 🗺️ **Interactive GIS Map**: Multi-layer basemap support (Satellite, Hybrid, Topo, OSM) with on-the-fly Sri Lanka National Grid (**EPSG:5235 SLD99**) to **WGS84** coordinate transformation using Proj4js.
* 📊 **Executive KPI Dashboard**: Real-time progress metrics (Total, Completed, In-Progress, Planned, Progress Rate %).
* 🧪 **820px Wide Geotechnical Borehole Inspector**: Scaled dynamic SVG core columns with BS 5930 hatch patterns, water table (GWT), rockhead level, SPT $N$-value charts ($0-50+$ with refusal indicators), and RQD / Core Recovery % charts.
* 📐 **2D Geological Cross-Section Studio**:
  * Sequential auto-sorting vs. Section Line perpendicular projection (true geological chainage).
  * Foliation apparent dip calculator with rotating gneissic textures.
  * Stacking hierarchy enforcement (Made Ground $\rightarrow$ Alluvium $\rightarrow$ Residual Soil $\rightarrow$ CWR $\rightarrow$ Bedrock).
  * Parabolic pinch-out lens modeling for transported deposits.
  * Continuous weathering fade (ISRM Grades I to IV).
* 🛠️ **Geological Interpretation & Reshape Studio**:
  * Interactive control knots allowing geotechnical engineers to raise, lower, pinch, or re-contour boundaries between boreholes.
  * Explicit **Soil Origin Boundary Editing**: Made Ground / Fill Base, Alluvium Base, Colluvium Base, Residual Soil Base (Saprolite / CWR Top), Rockhead Weathering Front, Natural Ground Surface, and Groundwater Table (GWT).
  * Live spline calculation with instant synchronization to 2D Cross-Sections and AutoCAD DXF outputs.
  * Inferred fault planes, shear zone markers, callouts, undo/redo history, and `.json` override export/import.
* 📐 **AutoCAD DXF Vector CAD Studio**: Generates layered `.dxf` CAD files with strata boundaries, borehole pillars, 3DFACE meshes/hatches, test data, and $1:1$ or $5\times$ vertical exaggeration.
* 📄 **Multi-Format Export Suite**: Print-ready landscape A3 & A4 PDF cross-sections, SVG vector diagrams, PNG images, KML with HTML CDATA tables, and Master CSV datasets.
* 🛡️ **4-Tier Data Resiliency**: Google Sheets live sync $\rightarrow$ Multiple CORS Proxies $\rightarrow$ Local CSV $\rightarrow$ Embedded offline dataset.
* 📐 **19 Active Geotechnical Rules**: Full specification documented in [`docs/GEOTECHNICAL_RULES.md`](docs/GEOTECHNICAL_RULES.md).

---

## 📁 Repository Structure

```
github/
├── index.html                               # Clean HTML entry point
├── README.md                                # Repository guide & documentation
│
├── docs/                                    # Technical Specifications
│   └── GEOTECHNICAL_RULES.md                # 19 Codified Geotechnical Modeling Rules
│
├── css/                                     # Modular Design System (Vanilla CSS)
│   ├── base.css                             # Tokens, variables, fonts, resets
│   ├── header-dashboard.css                 # Header & KPI dashboard bar
│   ├── sidebar.css                          # Search, filters, studio card, chips
│   ├── map.css                              # Leaflet overrides, legend, locate button
│   ├── borehole-popup.css                   # 820px wide dual-panel borehole log popup
│   ├── cross-section-modal.css              # Cross-section viewer, azimuth & toolbar
│   ├── dxf-modal.css                        # AutoCAD DXF export studio modal
│   ├── geological-editor.css                # Full-screen Geological Interpretation Studio
│   └── version-hub.css                      # System hub, rules catalog, diagnostics & toasts
│
├── js/
│   ├── config/
│   │   ├── app-config.js                    # Global variables, URLs, projection strings
│   │   ├── geotech-rules.js                 # 19 Geotechnical rules data definition
│   │   └── soil-rock-definitions.js         # BS 5930 codes, hatch patterns & color ramps
│   │
│   ├── engines/
│   │   ├── data-pipeline.js                 # 4-tier data fetcher, CSV parser, cache engine
│   │   ├── gis-engine.js                    # Leaflet map, EPSG:5235 transforms, vector importer
│   │   ├── geotech-log-engine.js            # Single BH SVG column, SPT & RQD test charts
│   │   ├── cross-section-engine.js          # Sequential/Projection math, apparent dip, spline strata
│   │   ├── geological-editor-engine.js      # Reshape control knots, soil origin boundaries, fault planes
│   │   ├── cad-dxf-engine.js                # AC1009 DXF generator, layers, 3DFACE meshes
│   │   └── export-engine.js                 # PDF (A3/A4 landscape), SVG, PNG, KML, Master CSV
│   │
│   ├── ui/
│   │   ├── sidebar-controller.js            # Filter inputs, search & borehole selection chips
│   │   ├── version-modal-controller.js      # System hub tabs, changelog, diagnostics
│   │   └── toast-service.js                 # Notification toasts & feedback
│   │
│   └── app.js                               # Application bootstrap & lifecycle orchestrator
│
└── data/
    ├── data_master.js                       # Embedded offline dataset
    └── CEP 3  Rambukkana-Galagedara - BoreholesDetails (2).csv
```

---

## 💻 Quick Start & Deployment

### Run Locally (Zero Dependencies)
Simply open `index.html` in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari). No web server or Node.js installation is required.

### Host on Web Server
Deploy the folder to any static web hosting (GitHub Pages, Apache, Nginx, AWS S3, Firebase Hosting).

---

## 📜 Copyright & Legal Notice

© 2026 **National Building Research Institute (NBRI) & Ranjan**. All Rights Reserved.  
*This software and its associated algorithms are proprietary to the National Building Research Institute (NBRI), Sri Lanka.*
