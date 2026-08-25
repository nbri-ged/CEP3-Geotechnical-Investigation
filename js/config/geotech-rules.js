/* ============================================================
   NBRI GEOTECHNICAL GIS — CODIFIED GEOTECHNICAL RULES (geotech-rules.js)
   ============================================================ */

const GEOTECHNICAL_RULES = [
  {
    id: 1,
    category: "Stratigraphy & Origin",
    title: "Soil Origin Primary Partitioning",
    desc: "Soil layers interpolate across neighboring boreholes ONLY if they share the same depositional Origin Family. BSCS grain-size codes operate strictly within origin families."
  },
  {
    id: 2,
    category: "Stratigraphy & Origin",
    title: "Origin Family Groupings",
    desc: "Residual Soil & Completely Weathered Rock (CWR) form one continuous genetic in-situ weathering family. Alluvium, Colluvium, and Made Ground are treated as isolated or bounded units."
  },
  {
    id: 3,
    category: "Lens Geometry",
    title: "Transported Deposit Lens Geometry",
    desc: "Alluvium/Colluvium deposits with matching neighbors interpolate continuously; unmatched occurrences taper into isolated parabolic lenses capped at a 15m half-width."
  },
  {
    id: 4,
    category: "Weathering & Bedrock",
    title: "Bedrock Weathering Grade Continuous Fade",
    desc: "Rock weathering grades (I to IV) render with continuous opacity fading, anchoring Fresh Bedrock (Grade I) to the solid geological lithology fill."
  },
  {
    id: 5,
    category: "Correlation Logic",
    title: "Conservative Pairing Simplification",
    desc: "Neighboring layers sharing Origin and BSCS codes are linked assuming deposit continuity without requiring manual deposit sequence IDs."
  },
  {
    id: 6,
    category: "Visual Standards",
    title: "Distinct Soil Origin Hatch Patterns",
    desc: "Independent visual textures per origin (Alluvium waves, Colluvium triangles, Residual ticks, CWR cross-ticks) overlaid on top of BS 5930 soil color fills."
  },
  {
    id: 7,
    category: "Stratigraphy & Origin",
    title: "Contiguous Same-Origin Layer Merging",
    desc: "Contiguous sub-layers within one origin unit collapse into a unified deposit block keyed to the thickest representative BSCS constituent."
  },
  {
    id: 8,
    category: "Visual Standards",
    title: "Rendered Legend Completeness Check",
    desc: "Dynamic legends inspect actual rendered SVG geometry to ensure every drawn soil, rock, and hatch unit is accurately represented without phantom entries."
  },
  {
    id: 9,
    category: "Stratigraphy & Origin",
    title: "Geologically-Constrained Stacking Hierarchy",
    desc: "Enforces natural stratigraphic superposition: Made Ground → Alluvium/Colluvium → Residual Soil → CWR → Bedrock. Surface deposits never stack below residual soil."
  },
  {
    id: 10,
    category: "Stratigraphy & Origin",
    title: "Multi-Origin Unit Internal Sub-Layering",
    desc: "Connected soil blocks preserve distinct grain-size sub-layer pinch-outs rather than artificially homogenizing into single-color blocks."
  },
  {
    id: 11,
    category: "Weathering & Bedrock",
    title: "CWR Sub-Range Depth Hatch Overlay",
    desc: "Completely Weathered Rock depth sub-ranges are extracted from raw logging intervals and rendered with dedicated CWR texture clipped strictly to the parent unit."
  },
  {
    id: 12,
    category: "Visual Standards",
    title: "Termination Label Stagger & Collision Avoidance",
    desc: "Borehole termination depth labels ('Term X.Xm') pass through a vertical collision-avoidance check that staggers overlapping text downward."
  },
  {
    id: 13,
    category: "Standards & Codes",
    title: "Full BS 5930 Soil Classification Codebook",
    desc: "Complete support for British Standard BS 5930 fine-grained plasticity qualifiers (CL, CI, CH, CV, CE) and coarse-grained constituents (SC, SM, GC, GM, CS, MG)."
  },
  {
    id: 14,
    category: "Lens Geometry",
    title: "Lens Anchoring to Local Ground Surface",
    desc: "Transported lens shapes taper relative to local ground surface elevation rather than absolute datum, preventing lenses from artificially plunging into rockhead."
  },
  {
    id: 15,
    category: "Stratigraphy & Origin",
    title: "Soil Origin Boundary Transition Lines",
    desc: "Crisp dashed contact lines delineate genetic origin transitions (e.g. Alluvium to Residual), distinguishing genetic shifts from routine grain-size contacts."
  },
  {
    id: 16,
    category: "Structural Geology",
    title: "Foliation Projection & Apparent Dip Engine",
    desc: "Apparent dip along cross-section lines is mathematically computed from true foliation strike/dip. Gneissic bedrock textures, formation boundaries, and in-situ metamorphic-derived soil horizons (Residual Soil & CWR / Saprolite) rotate and incline to follow apparent dip, reflecting relict fabric and preferential weathering planes."
  },
  {
    id: 17,
    category: "Field Testing",
    title: "Geotechnical Borehole Dashboard Multi-Column Standard",
    desc: "Standardized multi-column exploratory borehole schematic: Depth Scale → Core Column → Strata Descriptions → SPT N-Value Bar Chart (0-50+) → RQD % (0-100%)."
  },
  {
    id: 18,
    category: "System Resilience",
    title: "4-Tier Data Resilience & Offline Architecture",
    desc: "Multi-tiered data fetching pipeline (Live Google Sheets → CORS Proxies → Local Master CSV → Embedded Dataset) prevents map loading failure in any network state."
  },
  {
    id: 19,
    category: "System Resilience",
    title: "Version Tracking & Cache Purge Lifecycle",
    desc: "Version-driven cache invalidation clears obsolete browser storage while preserving user offline backups, coupled with automated update notifications."
  }
];

// Helper to populate the Rules Tab dynamically in the Version Modal
function renderGeotechnicalRulesUI(containerId = 'rules-grid-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = GEOTECHNICAL_RULES.map(r => `
    <div class="rule-card">
      <div class="rule-title"><span>Rule ${r.id}:</span> ${r.title}</div>
      <div class="rule-desc">${r.desc}</div>
    </div>
  `).join('');
}
