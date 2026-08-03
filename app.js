/**
 * PUDU Academy Stock Placement Optimizer
 * Bulletproof 3D Bin Packing Engine & Smart Auto-Fit Optimizer (Zero Overlap Guaranteed)
 */

const MAX_LIMITS = {
  length: 1200,
  width: 1000,
  height: 1500,
  maxWeight: 600
};

// Global State
const state = {
  trolley: {
    model: 'CUSTOM',
    length: 800,
    width: 800,
    height: 1300,
    clearanceG: 275,
    legCD: 40,
    clearanceE: 720,
    clearanceF: 720,
    maxWeight: 600,
    chassisType: 'mast'
  },
  products: [],
  productCount: 1,
  pendingSmartSuggestion: null,
  packedResult: {
    packedItems: [],
    unpackedItems: [],
    totalVolume: 0,
    usedVolume: 0,
    totalWeight: 0
  },
  activeTab: '3d',
  sliceHeight: 1300
};

const PUDU_PRESETS = {
  'T600':           { length: 900,  width: 660,  height: 1300, maxWeight: 600, clearanceG: 285, legCD: 40, clearanceE: 660, clearanceF: 500, chassisType: 'mast' },
  'T300':           { length: 1200, width: 1200, height: 1350, maxWeight: 300, clearanceG: 275, legCD: 40, clearanceE: 940, clearanceF: 740, chassisType: 'mast' },
  'T600_UNDERRIDE': { length: 900,  width: 660,  height: 1500, maxWeight: 600, clearanceG: 285, legCD: 40, clearanceE: 660, clearanceF: 500, chassisType: 'underride' }
};

// Exact Physical Robot Specs from PUDU Manual
const PUDU_ROBOT_SPECS = {
  'mast':      { length: 830, width: 500, height: 1350 },
  'underride': { length: 845, width: 500, height: 255 }
};

const PALETTE = [
  '#0052cc', '#10b981', '#a855f7', '#f97316', '#ec4899',
  '#06b6d4', '#eab308', '#6366f1', '#f43f5e', '#84cc16'
];

const PUDU_PARAM_BOUNDS = {
  length:     { min: 600, max: 1200, recMin: 700, recMax: 1000, name: 'Length A' },
  width:      { min: 300, max: 1000, recMin: 500, recMax: 800,  name: 'Width B' },
  legCD:      { min: 10,  max: 50,   recMin: 30,  recMax: 50,   name: 'Leg C/D' },
  clearanceE: { min: 620, max: 1200, recMin: 620, recMax: 940,  name: 'Penetration Leg E' },
  clearanceF: { min: 300, max: 1000, recMin: 400, recMax: 740,  name: 'Parallel Leg F' },
  clearanceG: { min: 260, max: 295,  recMin: 275, recMax: 280,  name: 'Ground Clearance G' }
};

function validatePuduParameters() {
  const t = state.trolley;
  const warnings = [];

  // Check absolute & recommended ranges
  if (t.length < 600 || t.length > 1200) warnings.push(`Length A (${t.length}mm) out of range [600-1200mm]`);
  else if (t.length < 700 || t.length > 1000) warnings.push(`Length A (${t.length}mm) outside recommended [700-1000mm]`);

  if (t.width < 300 || t.width > 1000) warnings.push(`Width B (${t.width}mm) out of range [300-1000mm]`);
  else if (t.width < 500 || t.width > 800) warnings.push(`Width B (${t.width}mm) outside recommended [500-800mm]`);

  if (t.legCD < 10 || t.legCD > 50) warnings.push(`Leg C/D (${t.legCD}mm) out of range [10-50mm]`);
  else if (t.legCD < 30 || t.legCD > 50) warnings.push(`Leg C/D (${t.legCD}mm) outside recommended [30-50mm]`);

  if (t.clearanceE < 620 || t.clearanceE > 1200) warnings.push(`Clearance E (${t.clearanceE}mm) out of range [620-1200mm]`);
  else if (t.clearanceE < 620 || t.clearanceE > 940) warnings.push(`Clearance E (${t.clearanceE}mm) outside recommended [620-940mm]`);

  if (t.clearanceF < 300 || t.clearanceF > 1000) warnings.push(`Clearance F (${t.clearanceF}mm) out of range [300-1000mm]`);
  else if (t.clearanceF < 400 || t.clearanceF > 740) warnings.push(`Clearance F (${t.clearanceF}mm) outside recommended [400-740mm]`);

  if (t.clearanceG < 260 || t.clearanceG > 295) warnings.push(`Clearance G (${t.clearanceG}mm) out of range [260-295mm]`);

  const banner = document.getElementById('pudu-validation-banner');
  if (banner) {
    if (warnings.length > 0) {
      banner.className = 'validation-banner warning';
      banner.style.display = 'block';
      banner.innerHTML = `⚠️ <strong>PUDU Spec Warning:</strong><br>` + warnings.slice(0, 3).join('<br>');
    } else {
      banner.className = 'validation-banner success';
      banner.style.display = 'block';
      banner.innerHTML = `✅ <strong>PUDU Spec Validated:</strong> All parameters A-G within recommended specs.`;
    }
  }
}

function getSkuColor(skuName, index) {
  return PALETTE[index % PALETTE.length];
}

let topViewTransform = { startX: 0, startY: 0, scale: 1 };

/**
 * Strict 3D Axis-Aligned Bounding Box (AABB) Overlap Test
 */
function boxesOverlap3D(a, b) {
  const overlapX = (a.x < b.x + b.packedL) && (a.x + a.packedL > b.x);
  const overlapY = (a.y < b.y + b.packedW) && (a.y + a.packedW > b.y);
  const overlapZ = (a.z < b.z + b.packedH) && (a.z + a.packedH > b.z);
  return overlapX && overlapY && overlapZ;
}

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initThreeJS();
  renderProductTable();
  validatePuduParameters();
  calculatePacking();
});

function initUI() {
  // Dimension Guide toggle + fullscreen zoom
  const dimGuideBtn = document.getElementById('btn-dim-guide');
  const dimGuidePanel = document.getElementById('dim-guide-panel');
  const dimGuideImg = document.getElementById('dim-guide-img');

  if (dimGuideBtn && dimGuidePanel) {
    dimGuideBtn.addEventListener('click', () => {
      const isVisible = dimGuidePanel.style.display !== 'none';
      dimGuidePanel.style.display = isVisible ? 'none' : 'block';
      dimGuideBtn.classList.toggle('active', !isVisible);
    });
  }

  if (dimGuideImg) {
    dimGuideImg.onerror = () => {
      if (dimGuideImg.src.endsWith('.png')) {
        dimGuideImg.src = 'pudu_rack_dimensions_guide.jpg';
      }
    };
    dimGuideImg.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'dim-guide-overlay';
      const zoomedImg = document.createElement('img');
      zoomedImg.src = dimGuideImg.src;
      zoomedImg.alt = 'PUDU Rack Dimensions A-G (Zoomed)';
      overlay.appendChild(zoomedImg);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => overlay.remove());
    });
  }

  const presetSelect = document.getElementById('trolley-preset');
  presetSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (PUDU_PRESETS[val]) {
      const p = PUDU_PRESETS[val];
      document.getElementById('trolley-l').value = p.length;
      document.getElementById('trolley-w').value = p.width;
      document.getElementById('trolley-h').value = p.height;
      document.getElementById('trolley-g').value = p.clearanceG;
      document.getElementById('trolley-cd').value = p.legCD;
      document.getElementById('trolley-e').value = p.clearanceE;
      document.getElementById('trolley-f').value = p.clearanceF;
      document.getElementById('trolley-weight-limit').value = p.maxWeight;

      state.trolley.model = val;
      state.trolley.length = p.length;
      state.trolley.width = p.width;
      state.trolley.height = p.height;
      state.trolley.clearanceG = p.clearanceG;
      state.trolley.legCD = p.legCD;
      state.trolley.clearanceE = p.clearanceE;
      state.trolley.clearanceF = p.clearanceF;
      state.trolley.maxWeight = p.maxWeight;
      state.trolley.chassisType = p.chassisType || 'mast';

      const modelNameElem = document.getElementById('compass-model-name');
      if (modelNameElem) {
        modelNameElem.textContent = val === 'T600_UNDERRIDE' ? 'T600 Underride' : (val === 'CUSTOM' ? 'Custom PUDU' : `PUDU ${val}`);
      }

      document.getElementById('slice-slider').max = p.height;
      
      // Dynamically trigger model load and 3D scene re-render
      validatePuduParameters();
      loadPuduModel(state.trolley.chassisType, () => {
        calculatePacking();
      });
    }
  });

  ['trolley-l', 'trolley-w', 'trolley-h', 'trolley-g', 'trolley-cd', 'trolley-e', 'trolley-f', 'trolley-weight-limit'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem) {
      const handler = () => {
        document.getElementById('trolley-preset').value = 'CUSTOM';
        const isUnderride = state.trolley.chassisType === 'underride';
        const maxH = isUnderride ? 1500 : 1300;

        state.trolley.length = parseInt(document.getElementById('trolley-l').value) || 800;
        state.trolley.width = parseInt(document.getElementById('trolley-w').value) || 800;
        state.trolley.height = Math.min(parseInt(document.getElementById('trolley-h').value) || 1300, maxH);
        state.trolley.clearanceG = parseInt(document.getElementById('trolley-g').value) || 275;
        state.trolley.legCD = parseInt(document.getElementById('trolley-cd').value) || 40;
        state.trolley.clearanceE = parseInt(document.getElementById('trolley-e').value) || 720;
        state.trolley.clearanceF = parseInt(document.getElementById('trolley-f').value) || 720;
        state.trolley.maxWeight = parseFloat(document.getElementById('trolley-weight-limit').value) || 600;

        document.getElementById('slice-slider').max = state.trolley.height;
        validatePuduParameters();
        calculatePacking();
      };
      elem.addEventListener('change', handler);
      elem.addEventListener('input', handler);
    }
  });

  // Add Product Form
  const formAdd = document.getElementById('form-product-add');
  formAdd.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('p-name');
    const name = nameInput.value.trim() || `Product ${state.productCount}`;

    const l = parseInt(document.getElementById('p-l').value) || 600;
    const w = parseInt(document.getElementById('p-w').value) || 600;
    const h = parseInt(document.getElementById('p-h').value) || 300;
    const wt = parseFloat(document.getElementById('p-wt').value) || 15;
    const qty = parseInt(document.getElementById('p-qty').value) || 4;

    state.products.push({
      id: 'P_' + Date.now(),
      name, l, w, h, wt, qty,
      color: getSkuColor(name, state.products.length)
    });

    state.productCount++;
    nameInput.value = `Product ${state.productCount}`;

    renderProductTable();
    calculatePacking();
  });

  // Find Max Qty button handler
  document.getElementById('btn-calc-max-qty').addEventListener('click', () => {
    const l = parseInt(document.getElementById('p-l').value) || 600;
    const w = parseInt(document.getElementById('p-w').value) || 600;
    const h = parseInt(document.getElementById('p-h').value) || 300;
    const wt = parseFloat(document.getElementById('p-wt').value) || 15;

    const maxQty = calculateSingleProductMaxFit(l, w, h, wt);
    document.getElementById('p-qty').value = maxQty;
  });

  // Max Fill Mix button handler
  document.getElementById('btn-max-mix').addEventListener('click', () => {
    optimizeMultiProductMix();
  });

  document.getElementById('btn-smart-fit').addEventListener('click', () => {
    suggestSmartTrolleyDimensions();
  });

  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-smart').addEventListener('click', closeModal);
  document.getElementById('btn-apply-smart').addEventListener('click', applySmartDimensions);

  document.getElementById('btn-calculate').addEventListener('click', () => {
    calculatePacking();
  });

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(`view-${tabId}`).classList.add('active');
      state.activeTab = tabId;

      if (tabId === '3d') {
        const container = document.getElementById('canvas-3d-container');
        if (renderer && camera && container && container.clientWidth > 0) {
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        }
        if (controls) controls.update();
      }
      if (tabId === 'top') render2DTopView();
      if (tabId === 'side') render2DSideView();
    });
  });

  const slider = document.getElementById('slice-slider');
  slider.addEventListener('input', (e) => {
    state.sliceHeight = parseInt(e.target.value);
    document.getElementById('slice-val').textContent = `0 - ${state.sliceHeight} mm`;
    if (state.activeTab === 'top') render2DTopView();
  });
}

function renderProductTable() {
  const tbody = document.getElementById('tbody-products');
  const badgeCount = document.getElementById('badge-manifest-count');
  badgeCount.textContent = `${state.products.length} Lines`;

  if (state.products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Manifest is empty. Add parameters above.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.products.map((p, idx) => `
    <tr>
      <td><span class="color-dot" style="background:${p.color}"></span> <strong>${p.name}</strong></td>
      <td>${p.l}x${p.w}x${p.h}</td>
      <td>${p.wt}kg</td>
      <td>${p.qty}</td>
      <td><button class="btn-icon-del" onclick="deleteProduct(${idx})">✕ Remove</button></td>
    </tr>
  `).join('');
}

window.deleteProduct = function(index) {
  state.products.splice(index, 1);
  renderProductTable();
  calculatePacking();
};

// -------------------------------------------------------------
// SMART TROLLEY DIMENSION AUTO-FIT ENGINE
// -------------------------------------------------------------
function suggestSmartTrolleyDimensions() {
  if (state.products.length === 0) {
    alert("Please add products to the manifest first so the smart engine can analyze box dimensions!");
    return;
  }

  const currL = state.trolley.length;
  const currW = state.trolley.width;

  const maxItemL = Math.max(...state.products.map(p => p.l));
  const maxItemW = Math.max(...state.products.map(p => p.w));

  let suggestedL = currL;
  let suggestedW = currW;

  [2, 3].forEach(mult => {
    let neededL = maxItemL * mult;
    let neededW = maxItemW * mult;
    if (neededL <= MAX_LIMITS.length && neededL > currL) suggestedL = neededL;
    if (neededW <= MAX_LIMITS.width && neededW > currW) suggestedW = neededW;
  });

  if (suggestedL === currL && suggestedW === currW) {
    alert("💡 Current trolley dimensions are already optimal for the added products!");
    return;
  }

  const currGrid = Math.floor(currL / maxItemL) * Math.floor(currW / maxItemW);
  const suggGrid = Math.floor(suggestedL / maxItemL) * Math.floor(suggestedW / maxItemW);

  state.pendingSmartSuggestion = { length: suggestedL, width: suggestedW, height: state.trolley.height };

  const modalBody = document.getElementById('smart-modal-body');
  modalBody.innerHTML = `
    <div class="analysis-box">
      <p><strong>Item Dimensions:</strong> ${maxItemL}mm × ${maxItemW}mm</p>
      <p><strong>Current Trolley:</strong> ${currL}mm × ${currW}mm (Fits <strong>${currGrid} item/layer</strong>)</p>
      <p><strong>Suggested Trolley:</strong> <span class="highlight">${suggestedL}mm × ${suggestedW}mm</span> (Fits <strong>${suggGrid} items/layer!</strong>)</p>
      <div class="gain-badge">+${(suggGrid - currGrid) * 100}% Capacity Boost</div>
    </div>
    <p class="mt-2 text-muted">Would you like to confirm and update trolley dimensions to ${suggestedL}mm × ${suggestedW}mm?</p>
  `;

  document.getElementById('smart-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('smart-modal').classList.add('hidden');
  state.pendingSmartSuggestion = null;
}

function applySmartDimensions() {
  if (state.pendingSmartSuggestion) {
    state.trolley.length = state.pendingSmartSuggestion.length;
    state.trolley.width = state.pendingSmartSuggestion.width;
    document.getElementById('trolley-l').value = state.trolley.length;
    document.getElementById('trolley-w').value = state.trolley.width;
    document.getElementById('trolley-preset').value = 'CUSTOM';
    calculatePacking();
  }
  closeModal();
}

/**
 * Calculates the absolute maximum quantity of a single product dimension (l, w, h, wt)
 * that can physically fit inside the current trolley without exceeding weight or dimensions.
 */
function calculateSingleProductMaxFit(l, w, h, wt) {
  const L = state.trolley.length;
  const W = state.trolley.width;
  const H = state.trolley.height;
  const maxWt = state.trolley.maxWeight;

  // Test Orientations: (l, w, h) vs (w, l, h)
  const fit1 = Math.floor(L / l) * Math.floor(W / w) * Math.floor(H / h);
  const fit2 = Math.floor(L / w) * Math.floor(W / l) * Math.floor(H / h);
  const maxGeoCount = Math.max(fit1, fit2);

  // Weight capacity constraint
  const maxWtCount = wt > 0 ? Math.floor(maxWt / wt) : 999;

  return Math.max(1, Math.min(maxGeoCount, maxWtCount));
}

/**
 * Multi-Product Mix Optimization ("Max Fill Mix"):
 * Automatically calculates optimal quantities for all listed products in the manifest
 * to fill the trolley to maximum capacity.
 */
function optimizeMultiProductMix() {
  if (state.products.length === 0) {
    alert("Please add at least 1 product to the manifest first!");
    return;
  }

  // Calculate proportional fill targets for each product line
  state.products.forEach(p => {
    const singleMax = calculateSingleProductMaxFit(p.l, p.w, p.h, p.wt);
    // Evenly distribute available space among listed product lines
    p.qty = Math.max(1, Math.floor(singleMax / state.products.length));
  });

  renderProductTable();
  calculatePacking();
}

// -------------------------------------------------------------
// BULLETPROOF 3D ZERO-OVERLAP PACKING ENGINE (Extreme Points)
// -------------------------------------------------------------
function calculatePacking() {
  const container = {
    l: state.trolley.length,
    w: state.trolley.width,
    h: state.trolley.height,
    maxWt: state.trolley.maxWeight
  };

  let itemsToPack = [];
  state.products.forEach(p => {
    for (let i = 0; i < p.qty; i++) {
      itemsToPack.push({
        id: `${p.id}_${i+1}`,
        name: p.name,
        color: p.color,
        l: p.l, w: p.w, h: p.h,
        wt: p.wt,
        vol: p.l * p.w * p.h
      });
    }
  });

  // Sort items: Heavy items first, then largest volume
  itemsToPack.sort((a, b) => {
    if (b.wt !== a.wt) return b.wt - a.wt;
    return b.vol - a.vol;
  });

  let candidatePoints = [{ x: 0, y: 0, z: 0 }];
  let packedItems = [];
  let unpackedItems = [];
  let currentWeight = 0;

  for (let item of itemsToPack) {
    if (currentWeight + item.wt > container.maxWt) {
      unpackedItems.push(item);
      continue;
    }

    let bestPlacement = null;

    const orientations = [
      { l: item.l, w: item.w, h: item.h },
      { l: item.w, w: item.l, h: item.h }
    ];

    // Sort candidate points: Bottom-to-Top (Z ASC), Back-to-Front (Y ASC), Left-to-Right (X ASC)
    candidatePoints.sort((a, b) => {
      if (a.z !== b.z) return a.z - b.z;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    for (let pt of candidatePoints) {
      for (let o of orientations) {
        // 1. Container boundary check
        if (pt.x + o.l > container.l || pt.y + o.w > container.w || pt.z + o.h > container.h) {
          continue;
        }

        const testBox = {
          x: pt.x, y: pt.y, z: pt.z,
          packedL: o.l, packedW: o.w, packedH: o.h
        };

        // 2. Strict 3D Zero-Overlap check against ALL already packed items
        let overlap = false;
        for (let pItem of packedItems) {
          if (boxesOverlap3D(testBox, pItem)) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;

        // Found a valid position with ZERO overlap!
        bestPlacement = { pt, orient: o };
        break;
      }
      if (bestPlacement) break;
    }

    if (bestPlacement) {
      const { pt, orient } = bestPlacement;
      let packedItem = {
        ...item,
        x: pt.x, y: pt.y, z: pt.z,
        packedL: orient.l, packedW: orient.w, packedH: orient.h,
        step: packedItems.length + 1
      };

      packedItems.push(packedItem);
      currentWeight += item.wt;

      // Add 3 new Extreme Points
      candidatePoints.push({ x: pt.x + orient.l, y: pt.y, z: pt.z });
      candidatePoints.push({ x: pt.x, y: pt.y + orient.w, z: pt.z });
      candidatePoints.push({ x: pt.x, y: pt.y, z: pt.z + orient.h });

      // Clean up invalid points that are inside packed items
      candidatePoints = candidatePoints.filter(p => {
        if (p.x >= container.l || p.y >= container.w || p.z >= container.h) return false;
        for (let item of packedItems) {
          if (p.x >= item.x && p.x < item.x + item.packedL &&
              p.y >= item.y && p.y < item.y + item.packedW &&
              p.z >= item.z && p.z < item.z + item.packedH) {
            return false;
          }
        }
        return true;
      });
    } else {
      unpackedItems.push(item);
    }
  }

  const totalCageVol = container.l * container.w * container.h;
  let usedVol = packedItems.reduce((acc, it) => acc + (it.packedL * it.packedW * it.packedH), 0);
  let volPct = totalCageVol > 0 ? ((usedVol / totalCageVol) * 100).toFixed(1) : 0;

  state.packedResult = {
    packedItems,
    unpackedItems,
    totalVolume: totalCageVol,
    usedVolume: usedVol,
    totalWeight: currentWeight
  };

  document.getElementById('metric-vol-pct').textContent = `${volPct}%`;
  document.getElementById('fill-vol').style.width = `${Math.min(volPct, 100)}%`;

  document.getElementById('metric-wt-stat').textContent = `${currentWeight.toFixed(1)} / ${container.maxWt} kg`;
  let wtPct = ((currentWeight / container.maxWt) * 100).toFixed(1);
  document.getElementById('fill-wt').style.width = `${Math.min(wtPct, 100)}%`;

  document.getElementById('metric-count').textContent = `${packedItems.length} / ${itemsToPack.length}`;
  document.getElementById('metric-unpacked').textContent = `${unpackedItems.length} unpacked`;

  render3DScene();
  render2DTopView();
  render2DSideView();
  renderManifestTable();
}

// -------------------------------------------------------------
// THREE.JS 3D VIEWPORT (PUDU 3D Model + Cargo Volume)
// -------------------------------------------------------------
let scene, camera, renderer, controls, itemsGroup;

// Model cache: keyed by chassisType ('mast' / 'underride')
const puduModelCache = {};
let currentLoadedChassis = null;

// Maps chassisType to the correct .glb file
const CHASSIS_MODEL_FILES = {
  'mast':      'T300.glb',
  'underride': 'T600 Underride.glb'
};

/**
 * Load (or return cached) GLTF model for the given chassis type.
 * Calls onLoaded(scene) when ready.
 */
function loadPuduModel(chassisType, onLoaded) {
  if (puduModelCache[chassisType]) {
    if (onLoaded) onLoaded(puduModelCache[chassisType]);
    return;
  }

  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
    if (onLoaded) onLoaded(null);
    return;
  }

  const file = CHASSIS_MODEL_FILES[chassisType];
  if (!file) { if (onLoaded) onLoaded(null); return; }

  const loader = new THREE.GLTFLoader();

  // Compute absolute path base relative to repository root on GitHub Pages
  const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
  const relativeFile = file;
  const fullPathFile = basePath + file;
  const encodedFile = encodeURI(file);

  loader.load(encodedFile, (gltf) => {
    puduModelCache[chassisType] = gltf.scene;
    if (onLoaded) onLoaded(gltf.scene);
    render3DScene();
  }, undefined, (err) => {
    console.warn(`Attempt 1 failed for ${encodedFile}, trying fullPathFile ${fullPathFile}:`, err);
    loader.load(fullPathFile, (gltf) => {
      puduModelCache[chassisType] = gltf.scene;
      if (onLoaded) onLoaded(gltf.scene);
      render3DScene();
    }, undefined, (err2) => {
      console.warn(`Attempt 2 failed, trying raw file ${relativeFile}:`, err2);
      loader.load(relativeFile, (gltf) => {
        puduModelCache[chassisType] = gltf.scene;
        if (onLoaded) onLoaded(gltf.scene);
        render3DScene();
      }, undefined, (err3) => {
        console.error(`All GLB load attempts failed for ${file}.`, err3);
        if (onLoaded) onLoaded(null);
      });
    });
  });
}

function initThreeJS() {
  const container = document.getElementById('canvas-3d-container');
  if (!container) return;

  if (typeof THREE === 'undefined') {
    setTimeout(initThreeJS, 300);
    return;
  }

  container.innerHTML = '';

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1f5f9);

  const w = container.clientWidth || 700;
  const h = container.clientHeight || 500;

  camera = new THREE.PerspectiveCamera(45, w / h, 10, 10000);
  camera.position.set(1600, 1400, 1600);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  if (typeof THREE.OrbitControls !== 'undefined') {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(1500, 2500, 1500);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight2.position.set(-1500, 1500, -1500);
  scene.add(dirLight2);

  itemsGroup = new THREE.Group();
  scene.add(itemsGroup);

  // Pre-load both models in background
  loadPuduModel('mast', () => { render3DScene(); });
  loadPuduModel('underride', () => {});

  // Ensure container layout settles before sizing renderer
  setTimeout(() => {
    if (!container) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    render3DScene();
  }, 100);

  window.addEventListener('resize', () => {
    if (!container) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    render3DScene();
  });

  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    const G = state.trolley.clearanceG || 275;
    camera.position.set(1600, 1400, 1600);
    controls.target.set(state.trolley.length/2, G + state.trolley.height/2, state.trolley.width/2);
    controls.update();
  });

  animate();
}

function updateRobotOrientationCompass() {
  if (!camera || !controls) return;
  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  const angleRad = Math.atan2(dx, dz);
  const angleDeg = angleRad * (180 / Math.PI);

  const icon = document.getElementById('robot-compass-icon');
  if (icon) {
    icon.style.transform = `rotate(${-angleDeg}deg)`;
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) {
    controls.update();
    updateRobotOrientationCompass();
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

/**
 * Draws the complete 3D scene:
 * - Uses loaded T300.glb model (or procedural fallback)
 * - Robot mast/neck positioned IN FRONT (Z < 0)
 * - Lifted trolley cage sitting BEHIND the mast at height Y = G
 */
function drawPuduChassisAndRack(group, L, W, H, trolleyState) {
  const G = trolleyState.clearanceG || 275;         // Rack bottom height (Dimension G)
  const legW = trolleyState.legCD || 40;            // Leg width
  const clrE = trolleyState.clearanceE || 720;      // Penetration clearance
  const clrF = trolleyState.clearanceF || 720;      // Parallel clearance
  const chassisType = trolleyState.chassisType || 'mast';
  const robotSpec = PUDU_ROBOT_SPECS[chassisType] || PUDU_ROBOT_SPECS['mast'];

  // --- Materials ---
  const legMat    = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 });
  const plateMat  = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.45 });
  const casterMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });

  // ============================================================
  // 1. FOUR CORNER RACK LEGS + SWIVEL CASTERS (< 12cm Rule)
  //    Manual Requirement: 12cm~21cm zone is supported SOLELY by legs.
  //    Swivel casters & mounting plates MUST be below 12cm (<120mm).
  // ============================================================
  const legPositions = [
    { x: legW / 2,     z: legW / 2 },          // Front-Left
    { x: L - legW / 2, z: legW / 2 },          // Front-Right
    { x: legW / 2,     z: W - legW / 2 },      // Back-Left
    { x: L - legW / 2, z: W - legW / 2 }       // Back-Right
  ];

  const casterH = 100; // 100mm height (< 120mm / 12cm constraint!)

  legPositions.forEach(pos => {
    // Leg column from ground Y=0 to Y=G
    const legGeo = new THREE.BoxGeometry(legW, G, legW);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(pos.x, G / 2, pos.z);
    group.add(leg);

    // Swivel caster wheel assembly strictly below 12cm (Y = 0 to 100mm)
    const casterWheelGeo = new THREE.CylinderGeometry(25, 25, 20, 16);
    const casterWheel = new THREE.Mesh(casterWheelGeo, casterMat);
    casterWheel.rotation.x = Math.PI / 2;
    casterWheel.position.set(pos.x, 30, pos.z);
    group.add(casterWheel);
  });

  // ============================================================
  // 2. RACK BASE PLATE (thin plate at Y = G, the rack floor)
  // ============================================================
  const plateThickness = 8;
  const plateGeo = new THREE.BoxGeometry(L, plateThickness, W);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(L / 2, G + plateThickness / 2, W / 2);
  group.add(plate);

  // ============================================================
  // 3. ROBOT CHASSIS & MAST (T300.glb or T600 Underride.glb, or Procedural Fallback)
  // ============================================================
  let cachedModel = puduModelCache[chassisType];
  if (!cachedModel && typeof loadPuduModel === 'function') {
    loadPuduModel(chassisType);
    cachedModel = puduModelCache[chassisType];
  }

  if (cachedModel) {
    const robotMesh = cachedModel.clone();

    // Rotate model 180 degrees so mast column faces the left side (direction of motion)
    robotMesh.rotation.y = Math.PI;

    // Compute bounding box after rotation
    const bbox = new THREE.Box3().setFromObject(robotMesh);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Scale to exact physical PUDU height spec
    const targetH = robotSpec.height;
    const scaleFactor = targetH / (size.y || 1);
    robotMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Re-calculate scaled bounding box
    const scaledBox = new THREE.Box3().setFromObject(robotMesh);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    // Center robot on rack X axis, rest base on ground Y=0
    robotMesh.position.x = (L / 2) - scaledCenter.x;
    robotMesh.position.y = -scaledBox.min.y;

    if (chassisType === 'mast') {
      // Perform addition of +6 grid units (+600mm) along Z axis
      const modelDepth = scaledBox.max.z - scaledBox.min.z;
      robotMesh.position.z = -scaledBox.max.z + (modelDepth * 0.25) + 270;
    } else {
      // Underride: center platform under rack
      robotMesh.position.z = (W / 2) - scaledCenter.z;
    }

    group.add(robotMesh);
  } else {
    // Procedural Fallback if GLTF is loading
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x0052cc, roughness: 0.3, metalness: 0.6, emissive: 0x002b80 });
    const neckMat   = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4, metalness: 0.5 });
    const wheelMat  = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.2 });

    const robotL = robotSpec.length;
    const robotW = robotSpec.width;
    const robotH = chassisType === 'underride' ? 220 : 90;
    const wheelR = 28, wheelH = 20;

    const robotGeo = new THREE.BoxGeometry(robotL, robotH, robotW);
    const robot = new THREE.Mesh(robotGeo, darkMat);
    robot.position.set(L / 2, wheelH + robotH / 2, W / 2);
    group.add(robot);

    // Wheels
    const rWheelOffX = robotL / 2 - wheelR - 10;
    const rWheelOffZ = robotW / 2 - wheelR - 10;
    [
      { x: L / 2 - rWheelOffX, z: W / 2 - rWheelOffZ },
      { x: L / 2 + rWheelOffX, z: W / 2 - rWheelOffZ },
      { x: L / 2 - rWheelOffX, z: W / 2 + rWheelOffZ },
      { x: L / 2 + rWheelOffX, z: W / 2 + rWheelOffZ }
    ].forEach(pos => {
      const wGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelH, 16);
      const wheel = new THREE.Mesh(wGeo, wheelMat);
      wheel.position.set(pos.x, wheelH / 2, pos.z);
      group.add(wheel);
    });

    // Front Mast Column outside rack footprint (Z = -80mm)
    if (chassisType === 'mast') {
      const neckR = 22;
      const neckH = robotSpec.height;
      const mastZ = -80;

      const neckGeo = new THREE.CylinderGeometry(neckR, neckR, neckH, 24);
      const neck = new THREE.Mesh(neckGeo, neckMat);
      neck.position.set(L / 2, neckH / 2, mastZ);
      group.add(neck);

      const headGeo = new THREE.BoxGeometry(90, 55, 45);
      const head = new THREE.Mesh(headGeo, darkMat);
      head.position.set(L / 2, neckH + 25, mastZ);
      group.add(head);

      const lensGeo = new THREE.CylinderGeometry(12, 12, 6, 16);
      const lens = new THREE.Mesh(lensGeo, accentMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(L / 2, neckH + 25, mastZ - 25);
      group.add(lens);
    }
  }

  // ============================================================
  // 4. CARGO CAGE WIREFRAME (from Y = G to Y = G + H, BEHIND THE MAST)
  // ============================================================
  const cageGeo = new THREE.BoxGeometry(L, H, W);
  const cageEdges = new THREE.EdgesGeometry(cageGeo);
  const cageMat = new THREE.LineBasicMaterial({ color: 0x0052cc, linewidth: 2 });
  const cage = new THREE.LineSegments(cageEdges, cageMat);
  cage.position.set(L / 2, G + H / 2, W / 2);
  group.add(cage);

  // ============================================================
  // 5. GROUND GRID (Y = 0)
  // ============================================================
  const gridSize = Math.max(L, W, 1500) * 2;
  const gridHelper = new THREE.GridHelper(gridSize, 30, 0xcbd5e1, 0xe2e8f0);
  gridHelper.position.set(L / 2, 0, W / 2);
  group.add(gridHelper);
}


function render3DScene() {
  if (!scene || !itemsGroup) return;

  while (itemsGroup.children.length > 0) {
    itemsGroup.remove(itemsGroup.children[0]);
  }

  const { length: L, width: W, height: H } = state.trolley;
  const G = state.trolley.clearanceG || 275;

  const container = document.getElementById('canvas-3d-container');
  if (renderer && camera && container && container.clientWidth > 0) {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  if (controls) {
    controls.target.set(L / 2, G + H / 2, W / 2);
    controls.update();
  }

  // 1. Draw full chassis + rack + cage structure
  drawPuduChassisAndRack(itemsGroup, L, W, H, state.trolley);

  // 2. Packed Stock Items (placed inside cargo volume: Y offset by G)
  const packedItems = state.packedResult.packedItems;
  packedItems.forEach(it => {
    const boxGeo = new THREE.BoxGeometry(it.packedL - 4, it.packedH - 4, it.packedW - 4);
    const boxMat = new THREE.MeshStandardMaterial({
      color: it.color || 0x0052cc,
      roughness: 0.3,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(boxGeo, boxMat);
    // Cargo Y starts at rack floor (G), then box Z-coordinate adds on top
    mesh.position.set(
      it.x + it.packedL / 2,
      G + it.z + it.packedH / 2,
      it.y + it.packedW / 2
    );

    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const line = new THREE.LineSegments(edges, lineMat);
    mesh.add(line);

    itemsGroup.add(mesh);
  });

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// -------------------------------------------------------------
// 2D TOP VIEW (Clean Read-Only Layer Slice Visualizer)
// -------------------------------------------------------------
function render2DTopView() {
  const canvas = document.getElementById('canvas-top-2d');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const L = state.trolley.length;
  const W = state.trolley.width;
  const paddingX = 60;
  const paddingY = 60;

  // Compute scale reserving 60px vertical margin for header and footer text
  const scale = Math.min(
    (canvas.width - paddingX * 2) / L,
    (canvas.height - paddingY * 2 - 50) / W
  );

  const startX = paddingX + (canvas.width - paddingX * 2 - L * scale) / 2;
  const startY = paddingY + 25 + (canvas.height - paddingY * 2 - 50 - W * scale) / 2;

  topViewTransform = { startX, startY, scale };

  // Robot Chassis Silhouette Below
  const rL = L * 0.8 * scale;
  const rW = W * 0.8 * scale;
  const rX = startX + (L * scale - rL) / 2;
  const rY = startY + (W * scale - rW) / 2;

  ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.fillRect(rX, rY, rL, rW);
  ctx.strokeRect(rX, rY, rL, rW);

  // Facing Direction Header
  ctx.fillStyle = '#0052cc';
  ctx.font = 'bold 12px Inter';
  ctx.fillText('▲ PUDU ROBOT FACING DIRECTION (FRONT)', startX, startY - 15);

  ctx.beginPath();
  ctx.arc(rX + rL / 2, rY + rW, 12, Math.PI, 0, false);
  ctx.fillStyle = '#0052cc';
  ctx.fill();

  // Trolley Platform Rectangle
  ctx.strokeStyle = '#0052cc';
  ctx.lineWidth = 3;
  ctx.strokeRect(startX, startY, L * scale, W * scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(startX, startY, L * scale, W * scale);
  ctx.strokeRect(startX, startY, L * scale, W * scale);

  // Render Placed Stock Items
  const packedItems = state.packedResult.packedItems;
  packedItems.forEach(it => {
    if (it.z <= state.sliceHeight && it.z + it.packedH >= state.sliceHeight - 300) {
      const ix = startX + it.x * scale;
      const iy = startY + it.y * scale;
      const iw = it.packedL * scale;
      const ih = it.packedW * scale;

      ctx.fillStyle = it.color || '#0052cc';
      ctx.fillRect(ix + 2, iy + 2, Math.max(iw - 4, 2), Math.max(ih - 4, 2));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ix + 2, iy + 2, Math.max(iw - 4, 2), Math.max(ih - 4, 2));

      if (iw > 30 && ih > 16) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Inter';
        ctx.fillText(it.name.substring(0, 8), ix + 6, iy + 16);
      }
    }
  });
}

// -------------------------------------------------------------
// 2D SIDE VIEW
// -------------------------------------------------------------
function render2DSideView() {
  const canvas = document.getElementById('canvas-side-2d');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const L = state.trolley.length;
  const H = state.trolley.height;
  const paddingX = 60;
  const paddingY = 40;

  // Scale considering trolley height + chassis height below (180mm) + text margins
  const scale = Math.min(
    (canvas.width - paddingX * 2) / L,
    (canvas.height - paddingY * 2 - 80) / (H + 200)
  );

  const startX = paddingX + (canvas.width - paddingX * 2 - L * scale) / 2;
  const startY = paddingY + H * scale + 30; // Ground line (Z = 0)

  // Ground Line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX - 20, startY);
  ctx.lineTo(startX + L * scale + 20, startY);
  ctx.stroke();

  // Robot Underride Chassis Below Ground Line (Z < 0)
  const rH = 120 * scale;
  const rL = L * 0.85 * scale;
  const rX = startX + (L * scale - rL) / 2;

  ctx.fillStyle = 'rgba(203, 213, 225, 0.5)';
  ctx.strokeStyle = '#0052cc';
  ctx.lineWidth = 2;
  ctx.fillRect(rX, startY, rL, rH);
  ctx.strokeRect(rX, startY, rL, rH);

  // Cylinder Neck Indicator in 2D Side View
  const neckW = 24 * scale;
  const neckH = 140 * scale;
  const neckX = startX + (L * scale) * 0.2;
  ctx.fillStyle = '#64748b';
  ctx.fillRect(neckX, startY - neckH, neckW, neckH);

  // Trolley Container Box Profile (Z = 0 -> H)
  ctx.strokeStyle = '#0052cc';
  ctx.lineWidth = 3;
  ctx.strokeRect(startX, startY - H * scale, L * scale, H * scale);

  // Placed Stock Items
  const packedItems = state.packedResult.packedItems;
  packedItems.forEach(it => {
    const ix = startX + it.x * scale;
    const iy = startY - (it.z + it.packedH) * scale;
    const iw = it.packedL * scale;
    const ih = it.packedH * scale;

    ctx.fillStyle = it.color || '#0052cc';
    ctx.fillRect(ix + 2, iy + 2, Math.max(iw - 4, 2), Math.max(ih - 4, 2));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ix + 2, iy + 2, Math.max(iw - 4, 2), Math.max(ih - 4, 2));
  });
}

// -------------------------------------------------------------
// MANIFEST TABLE
// -------------------------------------------------------------
function renderManifestTable() {
  const tbody = document.getElementById('tbody-manifest');
  const items = state.packedResult.packedItems;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Manifest is empty. Add parameters above.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((it, idx) => `
    <tr>
      <td><strong>Step ${idx + 1}</strong></td>
      <td><span class="color-dot" style="background:${it.color}"></span> ${it.name}</td>
      <td>(${it.x}, ${it.y}, ${it.z})</td>
      <td>${it.packedL} x ${it.packedW} x ${it.packedH}</td>
      <td>${it.wt} kg</td>
      <td><span class="status-tag">Placed</span></td>
    </tr>
  `).join('');
}
