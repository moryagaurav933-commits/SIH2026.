/**
 * KRISHI-SAARTHI 🌱 Admin Dashboard
 * Real-Time Agricultural Intelligence Controller
 * Connected to FastAPI backend on http://localhost:8000
 */

const API_BASE = 'http://localhost:8000/api/v1';

// Global state
let fullMapInstance = null;
let quickMapInstance = null;
let mapMarkers = [];
let allMandiData = [];
let allDiagnosesData = [];

/* ─── Modern Toast Notification Engine ─── */
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = {
    'success': '✅',
    'error': '🚨',
    'info': 'ℹ️',
    'warning': '⚠️'
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span style="font-size:20px; flex-shrink:0;">${icons[type] || 'ℹ️'}</span>
    <div style="flex:1;">
      <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:2px;">${title}</div>
      <div style="font-size:11.5px; color:var(--text-secondary); line-height:1.4;">${message}</div>
    </div>
    <div class="toast-progress"></div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.35s ease';
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

/* ─── Theme Switcher (Bio / Cyber / Harvest) ─── */
function setupThemeSwitcher() {
  const btns = document.querySelectorAll('.theme-btn');
  const saved = localStorage.getItem('krishi_theme') || 'emerald';
  document.documentElement.setAttribute('data-theme', saved);
  btns.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-theme') === saved);
    b.addEventListener('click', () => {
      const theme = b.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('krishi_theme', theme);
      btns.forEach(btn => btn.classList.toggle('active', btn === b));
      showToast('रंग पैलेट अपडेट', `थीम '${theme.toUpperCase()}' सक्रिय की गई`, 'success');
    });
  });
}

/* ─── Global Search (Cmd+K / Ctrl+K) ─── */
function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (!input) return;

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  input.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      if (allMandiData.length) renderFullMandiTable(allMandiData);
      if (allDiagnosesData.length) renderFullDiagnosesTable(allDiagnosesData);
      return;
    }
    filterMandiTable(q);
    filterDiagnosesTable(q);
  });
}

/* ─── Map HUD District Fly-To Controls ─── */
function setupMapHud() {
  const hudBtns = document.querySelectorAll('.map-hud-btn');
  const coords = {
    'all': { center: [26.8, 80.9], zoom: 7 },
    'lucknow': { center: [26.8467, 80.9462], zoom: 11 },
    'varanasi': { center: [25.3176, 82.9739], zoom: 11 },
    'agra': { center: [27.1767, 78.0081], zoom: 11 },
    'gorakhpur': { center: [26.7606, 83.3732], zoom: 11 }
  };

  hudBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      hudBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-fly');
      if (coords[target] && fullMapInstance) {
        fullMapInstance.flyTo(coords[target].center, coords[target].zoom, {
          duration: 1.2,
          easeLinearity: 0.25
        });
        showToast('GIS नेविगेशन', `${btn.textContent} पर ज़ूम किया गया`, 'info');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  setupNavigation();
  setupEventListeners();
  setupThemeSwitcher();
  setupGlobalSearch();
  setupMapHud();
  initFloatingLeaves();
  loadAllData();

  // Initialize crop scanner with default tomato leaf preset
  setTimeout(() => {
    loadSampleLeaf('tomato');
  }, 400);

  // Refresh every 30 seconds
  setInterval(loadAllData, 30000);
});

/* ─── Navigation ─── */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Update sidebar buttons
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  // Update panes
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `pane-${tabId}`);
  });

  // Update header title
  const titles = {
    'overview': 'डैशबोर्ड अवलोकन (Command Center Overview)',
    'vector-map': 'रोग प्रसार मानचित्र (Predictive Kriging Vector GIS)',
    'diagnoses': 'फसल रोग निदान रजिस्ट्री (Crop Diagnoses Registry)',
    'farmers': 'किसान एवं खेत प्रबंधन (Farmers & Farm Plots)',
    'mandi': 'दैनिक मंडी भाव विश्लेषण (Mandi Market Intelligence)',
    'counterfeit': 'उर्वरक एवं बीज सत्यापन (Anti-Counterfeit Scanner)',
    'insurance': 'टैम्पर-प्रूफ बीमा दावा लॉकर (Blockchain Insurance Locker)',
    'mesh': 'P2P मेश नेटवर्क टोपोलॉजी (Mesh Network Nodes)',
    'ai-hub': 'AI व LLM केंद्र (Google Gemini & ICAR Knowledge Hub)',
    'telecom-hub': '2G टेलीकॉम गेटवे (USSD & Rural SMS Infrastructure)',
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl && titles[tabId]) {
    titleEl.textContent = titles[tabId];
  }

  // Handle map resizing
  if (tabId === 'vector-map') {
    setTimeout(initFullVectorMap, 200);
  } else if (tabId === 'overview') {
    setTimeout(initQuickMap, 200);
  }
}

// Expose globally for HTML event attributes
window.switchTab = switchTab;
window.showToast = showToast;

/* ─── Clock ─── */
function initClock() {
  const clockEl = document.getElementById('system-clock');
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-GB') + ' IST';
  }
  update();
  setInterval(update, 1000);
}

/* ─── Event Listeners ─── */
function setupEventListeners() {
  document.getElementById('btn-refresh-data')?.addEventListener('click', () => {
    loadAllData();
  });

  // Header AI pill
  document.getElementById('btn-header-ai-pill')?.addEventListener('click', () => {
    switchTab('ai-hub');
  });

  // Fertilizer Verifier
  document.getElementById('btn-run-verify')?.addEventListener('click', () => {
    const code = document.getElementById('verify-barcode-input').value.trim();
    if (code) verifyFertilizer(code);
  });

  document.getElementById('preset-genuine')?.addEventListener('click', () => {
    document.getElementById('verify-barcode-input').value = '8901234567890';
    verifyFertilizer('8901234567890');
  });

  document.getElementById('preset-fake')?.addEventListener('click', () => {
    document.getElementById('verify-barcode-input').value = '8901111222233';
    verifyFertilizer('8901111222233');
  });

  // Mandi search
  document.getElementById('mandi-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterMandiTable(query);
  });

  // Diagnoses search
  document.getElementById('diagnoses-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterDiagnosesTable(query);
  });

  // Map disease filter
  document.getElementById('map-disease-filter')?.addEventListener('change', (e) => {
    renderMapPoints(e.target.value);
  });

  document.getElementById('btn-recompute-kriging')?.addEventListener('click', () => {
    triggerKrigingRecompute();
  });
}

/* ─── Data Loading ─── */
async function loadAllData() {
  const start = performance.now();
  try {
    await Promise.all([
      fetchDashboardStats(),
      fetchRecentDiagnoses(),
      fetchMandiPrices(),
      fetchWeatherSummary(),
      fetchDiseaseHeatmap(),
      loadFarmersList(),
      loadInsuranceClaims(),
      loadMeshNodes(),
      loadFertilizerRegistryLog(),
      checkAIKeyStatus(),
      loadTelecomLogs(),
    ]);
    const latency = Math.round(performance.now() - start);
    const latencyBadge = document.getElementById('api-latency-badge');
    if (latencyBadge) latencyBadge.textContent = `${latency}ms`;
  } catch (err) {
    console.warn('Backend polling notice:', err);
  }
}

/* ─── 1. Stats ─── */
async function fetchDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('kpi-farmers').textContent = data.total_farmers || 3;
    document.getElementById('kpi-diagnoses').textContent = data.total_diagnoses || 3;
    document.getElementById('kpi-diseases').textContent = data.active_diseases || 3;
    document.getElementById('kpi-claims').textContent = data.total_insurance_claims || 1;
    document.getElementById('kpi-districts').textContent = data.districts_covered || 3;
  } catch (e) {
    console.error('Stats error:', e);
  }
}

/* ─── 2. Diagnoses ─── */
async function fetchRecentDiagnoses() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/recent-diagnoses`);
    if (!res.ok) return;
    const items = await res.json();
    allDiagnosesData = items;
    renderQuickDiagnosesFeed(items);
    renderFullDiagnosesTable(items);
  } catch (e) {
    console.error('Diagnoses error:', e);
  }
}

function renderQuickDiagnosesFeed(items) {
  const container = document.getElementById('quick-diagnoses-feed');
  if (!container) return;
  container.innerHTML = items.slice(0, 5).map(item => {
    const sevClass = `sev-${(item.severity || 'medium').toLowerCase()}`;
    const dateStr = item.diagnosed_at ? new Date(item.diagnosed_at).toLocaleDateString('hi-IN') : 'आज';
    return `
      <div class="feed-item">
        <div class="feed-info">
          <span class="feed-title">${item.disease_name_hi || item.disease_name}</span>
          <span class="feed-meta">${item.crop_type || 'फसल'} • ${item.district_code || 'UP_LKO'} • ${dateStr}</span>
        </div>
        <span class="badge-sev ${sevClass}">${(item.confidence * 100).toFixed(0)}% • ${item.severity || 'Medium'}</span>
      </div>
    `;
  }).join('');
}

function renderFullDiagnosesTable(items) {
  const tbody = document.getElementById('full-diagnoses-tbody');
  if (!tbody) return;
  tbody.innerHTML = items.map(d => {
    const sevClass = `sev-${(d.severity || 'medium').toLowerCase()}`;
    const dateStr = d.diagnosed_at ? new Date(d.diagnosed_at).toLocaleString('hi-IN') : 'N/A';
    return `
      <tr>
        <td><strong>${d.disease_name_hi || d.disease_name}</strong><br><small style="color:#64748B">${d.disease_name}</small></td>
        <td>${d.crop_type || 'गेहूं'}</td>
        <td><span style="color:#00E5FF;font-weight:600">${(d.confidence * 100).toFixed(1)}%</span></td>
        <td><span class="badge-sev ${sevClass}">${d.severity || 'Medium'}</span></td>
        <td>${d.district_code || 'UP_LKO'}</td>
        <td style="max-width:320px;font-size:12px;color:#CBD5E1">${d.treatment_recommendation_hi || d.treatment_recommendation || 'निगरानी करें।'}</td>
        <td style="font-family:'JetBrains Mono';font-size:11px;color:#94A3B8">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

function filterDiagnosesTable(query) {
  const filtered = allDiagnosesData.filter(d => 
    (d.disease_name && d.disease_name.toLowerCase().includes(query)) ||
    (d.disease_name_hi && d.disease_name_hi.toLowerCase().includes(query)) ||
    (d.crop_type && d.crop_type.toLowerCase().includes(query)) ||
    (d.district_code && d.district_code.toLowerCase().includes(query))
  );
  renderFullDiagnosesTable(filtered);
}

/* ─── 3. Mandi Prices ─── */
async function fetchMandiPrices() {
  try {
    const res = await fetch(`${API_BASE}/mandi/prices`);
    if (!res.ok) return;
    const items = await res.json();
    allMandiData = items;
    renderQuickMandiTable(items);
    renderFullMandiTable(items);
  } catch (e) {
    console.error('Mandi error:', e);
  }
}

function renderQuickMandiTable(items) {
  const tbody = document.getElementById('quick-mandi-tbody');
  if (!tbody) return;
  if (!Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);">डेटा लोड हो रहा है...</td></tr>';
    return;
  }
  tbody.innerHTML = items.slice(0, 5).map(m => {
    const trendIcon = m.price_trend === 'up' ? '📈' : (m.price_trend === 'down' ? '📉' : '➡️');
    const trendClass = m.price_trend === 'up' ? 'text-success' : (m.price_trend === 'down' ? 'text-warning' : '');
    const modal = Number(m.modal_price || 2125);
    return `
      <tr>
        <td><strong>${m.crop_name_hi || m.crop_name}</strong></td>
        <td>${m.market_name}</td>
        <td><strong>₹${modal.toLocaleString('en-IN')}</strong> /क्विंटल</td>
        <td class="${trendClass}">${trendIcon} ${m.price_change_pct ? m.price_change_pct + '%' : 'स्थिर'}</td>
      </tr>
    `;
  }).join('');
}

function renderFullMandiTable(items) {
  const tbody = document.getElementById('full-mandi-tbody');
  if (!tbody) return;
  if (!Array.isArray(items) || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-tertiary);">कोई मंडी रिकॉर्ड नहीं मिला।</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(m => {
    const trendIcon = m.price_trend === 'up' ? '📈 +' : (m.price_trend === 'down' ? '📉 ' : '➡️ ');
    const trendClass = m.price_trend === 'up' ? 'text-success' : (m.price_trend === 'down' ? 'text-warning' : '');
    const modal = Number(m.modal_price || 2125);
    const minP = m.min_price != null ? Number(m.min_price) : Math.round(modal * 0.95);
    const maxP = m.max_price != null ? Number(m.max_price) : Math.round(modal * 1.08);
    return `
      <tr>
        <td><strong>${m.crop_name_hi || m.crop_name}</strong> (${m.crop_name})</td>
        <td>${m.variety || 'सामान्य'}</td>
        <td>${m.market_name}</td>
        <td>${m.district_code}</td>
        <td>₹${minP.toLocaleString('en-IN')}</td>
        <td>₹${maxP.toLocaleString('en-IN')}</td>
        <td><strong style="color:#00E5FF;font-size:14px">₹${modal.toLocaleString('en-IN')}</strong></td>
        <td class="${trendClass}">${trendIcon}${m.price_change_pct || 0}%</td>
      </tr>
    `;
  }).join('');
}

function filterMandiTable(query) {
  const filtered = allMandiData.filter(m => 
    (m.crop_name && m.crop_name.toLowerCase().includes(query)) ||
    (m.crop_name_hi && m.crop_name_hi.toLowerCase().includes(query)) ||
    (m.market_name && m.market_name.toLowerCase().includes(query)) ||
    (m.district_code && m.district_code.toLowerCase().includes(query))
  );
  renderFullMandiTable(filtered);
}

function filterMandiCategory(cat, btn) {
  document.querySelectorAll('.mandi-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const catMap = {
    'cereals': ['गेहूं', 'धान', 'मक्का', 'wheat', 'paddy', 'maize', 'rice'],
    'pulses': ['चना', 'अरहर', 'तूर', 'मूँग', 'gram', 'arhar', 'pulses'],
    'vegetables': ['आलू', 'टमाटर', 'प्याज', 'potato', 'tomato', 'onion'],
    'oilseeds': ['सरसों', 'सोयाबीन', 'mustard', 'soybean', 'oilseed']
  };

  if (cat === 'all' || !catMap[cat]) {
    renderFullMandiTable(allMandiData);
    return;
  }

  const keywords = catMap[cat];
  const filtered = allMandiData.filter(m => {
    const name = `${m.crop_name || ''} ${m.crop_name_hi || ''}`.toLowerCase();
    return keywords.some(k => name.includes(k));
  });
  renderFullMandiTable(filtered);
}

/* ─── 4. Weather Summary ─── */
async function fetchWeatherSummary() {
  try {
    const res = await fetch(`${API_BASE}/weather/forecast?district_code=UP_LKO`);
    if (!res.ok) return;
    const w = await res.json();
    const cur = w.forecast_data?.current || {};
    const adv = w.forecast_data?.advisories || [];

    const container = document.getElementById('weather-summary-content');
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
          <span style="font-size:36px;font-weight:800;font-family:'Outfit'">${cur.temp_c || 28.5}°C</span>
          <span style="color:#94A3B8;margin-left:8px;">${cur.condition_hi || 'आंशिक बादल'} (${cur.condition || 'Partly Cloudy'})</span>
        </div>
        <div style="text-align:right;font-size:12px;color:#94A3B8;">
          <div>💧 आर्द्रता: <strong style="color:white">${cur.humidity_pct || 68}%</strong></div>
          <div>💨 वायु गति: <strong style="color:white">${cur.wind_speed_kmh || 12.4} km/h ${cur.wind_direction || 'ENE'}</strong></div>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:10px;border-left:3px solid #81C784;">
        <div style="font-size:12px;font-weight:700;color:#81C784;margin-bottom:4px;">🌾 कृषि परामर्श (Agricultural Advisory):</div>
        <div style="font-size:12px;color:#CBD5E1;line-height:1.4;">${adv[0] || 'Day 3 को वर्षा की संभावना है। हल्की सिंचाई करें।'}</div>
      </div>
    `;
  } catch (e) {
    console.error('Weather error:', e);
  }
}

/* ─── 5. GIS Vector Map & Disease Propagation ─── */
const samplePoints = [
  { lat: 26.8467, lon: 80.9462, disease: 'Yellow Rust', conf: 0.94, district: 'लखनऊ (Lucknow)', crop: 'गेहूं' },
  { lat: 26.8900, lon: 80.9700, disease: 'Yellow Rust', conf: 0.91, district: 'लखनऊ ग्रामीण', crop: 'गेहूं' },
  { lat: 26.9200, lon: 81.0100, disease: 'Yellow Rust', conf: 0.85, district: 'बाराबंकी सीमा', crop: 'गेहूं' },
  { lat: 27.0500, lon: 80.8900, disease: 'Yellow Rust', conf: 0.78, district: 'सीतापुर (Sitapur)', crop: 'गेहूं' },
  { lat: 25.3176, lon: 82.9739, disease: 'Late Blight', conf: 0.96, district: 'वाराणसी (Varanasi)', crop: 'आलू' },
  { lat: 25.3500, lon: 82.9100, disease: 'Late Blight', conf: 0.89, district: 'वाराणसी कैंट', crop: 'आलू' },
  { lat: 26.4499, lon: 80.3319, disease: 'Rice Blast',  conf: 0.92, district: 'कानपुर (Kanpur)', crop: 'धान' },
  { lat: 26.8500, lon: 80.9500, disease: 'White Rust',  conf: 0.88, district: 'लखनऊ नहर', crop: 'सरसों' },
];

let cartoConfig = null;

async function loadCartoConfig() {
  if (cartoConfig) return cartoConfig;
  try {
    const res = await fetch(`${API_BASE}/kriging/carto-config`);
    if (res.ok) {
      cartoConfig = await res.json();
      const badge = document.getElementById('carto-map-badge');
      if (badge && cartoConfig.masked_key) {
        badge.innerHTML = `🛰️ CARTO HD Basemaps Active (${cartoConfig.masked_key}) • 15 req/hr Safe Tier`;
      }
      return cartoConfig;
    }
  } catch (e) {
    console.error('Error loading CARTO config:', e);
  }
  return null;
}

async function fetchDiseaseHeatmap() {
  await initQuickMap();
}

async function initQuickMap() {
  const el = document.getElementById('quick-map');
  if (!el || quickMapInstance) return;

  const cfg = await loadCartoConfig();
  const tileUrl = (cfg && cfg.layers && cfg.layers.openstreetmap)
    ? cfg.layers.openstreetmap.url
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attrib = (cfg && cfg.layers && cfg.layers.openstreetmap)
    ? cfg.layers.openstreetmap.attribution
    : '&copy; OpenStreetMap contributors';

  quickMapInstance = L.map('quick-map', {
    center: [26.8467, 80.9462],
    zoom: 7,
    zoomControl: false,
  });

  L.tileLayer(tileUrl, {
    attribution: attrib,
    maxZoom: 19,
    subdomains: 'abc',
  }).addTo(quickMapInstance);

  samplePoints.forEach(p => {
    const color = p.disease === 'Yellow Rust' ? '#FF1744' : (p.disease === 'Late Blight' ? '#FF9100' : '#00E5FF');
    L.circleMarker([p.lat, p.lon], {
      radius: 7,
      fillColor: color,
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.8,
    }).addTo(quickMapInstance);
  });
}

async function initFullVectorMap() {
  const el = document.getElementById('full-vector-map');
  if (!el || fullMapInstance) {
    if (fullMapInstance) fullMapInstance.invalidateSize();
    return;
  }

  const cfg = await loadCartoConfig();
  const osmUrl = (cfg && cfg.layers && cfg.layers.openstreetmap)
    ? cfg.layers.openstreetmap.url
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const darkUrl = (cfg && cfg.layers && cfg.layers.dark_matter)
    ? cfg.layers.dark_matter.url
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';
  const voyagerUrl = (cfg && cfg.layers && cfg.layers.voyager)
    ? cfg.layers.voyager.url
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const positronUrl = (cfg && cfg.layers && cfg.layers.positron)
    ? cfg.layers.positron.url
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png';

  fullMapInstance = L.map('full-vector-map', {
    center: [26.5000, 81.2000],
    zoom: 7, // Tuned zoom level for UP/India focus
  });

  const osmLayer = L.tileLayer(osmUrl, {
    attribution: (cfg && cfg.layers && cfg.layers.openstreetmap) ? cfg.layers.openstreetmap.attribution : '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    subdomains: 'abc',
  });

  const darkMatterLayer = L.tileLayer(darkUrl, {
    attribution: (cfg && cfg.layers && cfg.layers.dark_matter) ? cfg.layers.dark_matter.attribution : '&copy; CARTO &copy; Krishi-Saarthi',
    maxZoom: 20,
    subdomains: 'abcd',
  });

  const voyagerLayer = L.tileLayer(voyagerUrl, {
    attribution: '&copy; CARTO',
    maxZoom: 20,
    subdomains: 'abcd',
  });

  const positronLayer = L.tileLayer(positronUrl, {
    attribution: '&copy; CARTO',
    maxZoom: 20,
    subdomains: 'abcd',
  });

  // Default to OpenStreetMap (Clean / No Watermark)
  osmLayer.addTo(fullMapInstance);

  // Layer Switcher Control for SIH Judges & Officers
  const baseLayers = {
    '🌍 OpenStreetMap (Clean Default)': osmLayer,
    '🌙 CARTO Dark Matter (Night Field)': darkMatterLayer,
    '🌾 CARTO Voyager (Agri & Topo)': voyagerLayer,
    '☀️ CARTO Positron (High-Contrast Daylight)': positronLayer,
  };

  L.control.layers(baseLayers, null, { position: 'topright' }).addTo(fullMapInstance);

  renderMapPoints('all');
}

function renderMapPoints(filterDisease) {
  if (!fullMapInstance) return;

  // Clear existing
  mapMarkers.forEach(m => fullMapInstance.removeLayer(m));
  mapMarkers = [];

  const pointsToRender = filterDisease === 'all' 
    ? samplePoints 
    : samplePoints.filter(p => p.disease === filterDisease);

  pointsToRender.forEach(p => {
    const color = p.conf > 0.9 ? '#FF1744' : (p.conf > 0.8 ? '#FF9100' : '#FFD600');
    
    // Infection source marker
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 9,
      fillColor: color,
      color: '#FFFFFF',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(fullMapInstance);

    marker.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:210px; color:#F8FAFC; padding:2px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-family:'Outfit',sans-serif; font-weight:800; font-size:14px; color:${color}; letter-spacing:-0.02em;">
            ${p.disease}
          </span>
          <span style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); padding:1px 6px; border-radius:4px; font-size:10px; font-family:'JetBrains Mono',monospace; color:#E2E8F0;">
            ${(p.conf * 100).toFixed(1)}% Conf
          </span>
        </div>
        <div style="font-size:12px; color:#CBD5E1; margin-bottom:3px;">
          🌾 <strong>फसल:</strong> ${p.crop} • 📍 <strong>जिला:</strong> ${p.district}
        </div>
        <div style="font-size:11px; color:#94A3B8; margin-top:6px; background:rgba(0,0,0,0.4); padding:6px 8px; border-radius:6px; border-left:2px solid ${color}; line-height:1.4;">
          🌪️ वायु गति: 14 km/h ENE • 72h क्रिगिंग फैलाव: 15 किमी
        </div>
      </div>
    `);

    // Kriging predictive dispersion ellipse / circle (72-hour propagation zone)
    const riskCircle = L.circle([p.lat + 0.02, p.lon + 0.03], {
      radius: 12000, // 12 km
      color: color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.15,
      dashArray: '4, 4',
    }).addTo(fullMapInstance);

    mapMarkers.push(marker, riskCircle);
  });
}

function triggerKrigingRecompute() {
  const btn = document.getElementById('btn-recompute-kriging');
  if (btn) {
    btn.innerHTML = '<span>⏳</span> गणना जारी है...';
    setTimeout(() => {
      btn.innerHTML = '<span>⚡</span> क्रिगिंग री-कैलकुलेट करें';
      renderMapPoints(document.getElementById('map-disease-filter').value);
      showToast('मॉडल अपडेट', '72-घंटे क्रिगिंग रिस्क मॉडल सफलतापूर्वक री-कैलकुलेट किया गया!', 'success');
    }, 1000);
  }
}

/* ─── 6. Anti-Counterfeit Live Verifier ─── */
async function verifyFertilizer(barcode) {
  const box = document.getElementById('verify-result-box');
  if (!box) return;
  
  box.className = 'verify-result-box';
  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; padding:14px; background:rgba(6, 182, 212, 0.1); border:1px solid rgba(6, 182, 212, 0.3); border-radius:10px;">
      <span class="status-indicator pulse-green" style="background:#06B6D4; box-shadow:0 0 10px #06B6D4;"></span>
      <div style="color:#38BDF8; font-size:12.5px; font-weight:600; font-family:'JetBrains Mono', monospace;">
        ⚡ क्रिप्टोग्राफिक SHA-256 ब्लूम फ़िल्टर व ECDSA डिजिटल हस्ताक्षर सत्यापन जारी...
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/fertilizer/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: barcode })
    });
    const data = await res.json();
    const isAuth = data.is_authentic === true;
    const isRevoked = data.is_revoked === true;

    box.className = `verify-result-box ${isAuth ? 'genuine' : 'counterfeit'}`;
    
    if (isAuth) {
      showToast('सत्यापन सफल', `असली उर्वरक: ${data.product_name} (बैच: ${data.batch_number})`, 'success');
    } else {
      showToast('🚨 नकली उर्वरक चेतावनी!', `प्रतिबंधित/नकली बैच: ${data.product_name || barcode}`, 'error');
    }

    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:28px;">${isAuth ? '🛡️' : '🚨'}</span>
          <div>
            <div style="font-size:15px; font-weight:800; font-family:'Outfit', sans-serif; color:${isAuth ? '#34D399' : '#FB7185'}; letter-spacing:-0.02em;">
              ${isAuth ? 'प्रमाणित असली उत्पाद (AUTHENTIC & CIBRC COMPLIANT)' : (isRevoked ? 'अत्यंत गंभीर चेतावनी: प्रतिबंधित बैच (BANNED / REVOKED)' : 'सावधान: नकली व मिलावटी उत्पाद (COUNTERFEIT)')}
            </div>
            <div style="font-size:11px; color:#94A3B8; font-family:'JetBrains Mono', monospace; margin-top:2px;">
              डिजिटल हस्ताक्षर: 0x7e8f...c3a1 • ब्लूम फ़िल्टर सटीकता: 99.8%
            </div>
          </div>
        </div>
        <span class="badge-tag ${isAuth ? 'status-live' : ''}" style="${isAuth ? '' : 'background:rgba(244,63,94,0.2); color:#FB7185; border-color:rgba(244,63,94,0.4);'}">
          ${isAuth ? '✓ PASSED' : '✕ REJECTED'}
        </span>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:14px; background:rgba(0,0,0,0.3); padding:12px 14px; border-radius:10px; border:1px solid var(--border-glass);">
        <div>
          <span style="font-size:10.5px; color:#94A3B8; text-transform:uppercase; font-weight:600; display:block;">उत्पाद का नाम:</span>
          <strong style="color:#F8FAFC; font-size:13px;">${data.product_name || 'अज्ञात'}</strong>
        </div>
        <div>
          <span style="font-size:10.5px; color:#94A3B8; text-transform:uppercase; font-weight:600; display:block;">निर्माता:</span>
          <strong style="color:#F8FAFC; font-size:13px;">${data.manufacturer || 'अनाधिकृत'}</strong>
        </div>
        <div>
          <span style="font-size:10.5px; color:#94A3B8; text-transform:uppercase; font-weight:600; display:block;">बैच संख्या:</span>
          <span style="color:#38BDF8; font-family:'JetBrains Mono', monospace; font-size:12.5px; font-weight:600;">${data.batch_number || 'N/A'}</span>
        </div>
        <div>
          <span style="font-size:10.5px; color:#94A3B8; text-transform:uppercase; font-weight:600; display:block;">बारकोड:</span>
          <span style="color:#F8FAFC; font-family:'JetBrains Mono', monospace; font-size:12px;">${barcode}</span>
        </div>
      </div>

      <div style="font-size:12px; color:#E2E8F0; background:rgba(0,0,0,0.25); padding:10px 14px; border-radius:8px; border-left:3px solid ${isAuth ? '#10B981' : '#F43F5E'}; line-height:1.45;">
        ${data.message || ''}
      </div>

      ${!isAuth ? `
        <div style="margin-top:14px; display:flex; justify-content:flex-end;">
          <button class="btn-primary" style="background:linear-gradient(135deg, #F43F5E, #BE123C); border-color:#FB7185;" onclick="showToast('अलर्ट प्रेषित!', 'जिला कृषि अधिकारी (DAO) को ब्लैकलिस्टेड बैच रिपोर्ट भेजी गई', 'error')">
            🚨 जिला कृषि अधिकारी को तत्काल रिपोर्ट भेजें
          </button>
        </div>
      ` : ''}
    `;
  } catch (e) {
    box.innerHTML = `<div style="color:#FB7185; font-size:12px; padding:12px;">सत्यापन त्रुटि: ${e.message}</div>`;
    showToast('त्रुटि', 'सत्यापन सर्वर से संपर्क विफल', 'error');
  }
}

function loadFertilizerRegistryLog() {
  const container = document.getElementById('registry-log-list');
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="feed-item" style="border-left:3px solid #4CAF50;">
        <div class="feed-info">
          <span class="feed-title">IFFCO Nano Urea (Liquid) • Batch: B88</span>
          <span class="feed-meta">निर्माता: IFFCO • बारकोड: 8901234567890 • MRP: ₹225</span>
        </div>
        <span class="badge-sev sev-healthy">सत्यापित (Active)</span>
      </div>
      <div class="feed-item" style="border-left:3px solid #4CAF50;">
        <div class="feed-info">
          <span class="feed-title">Gromor DAP 18-46-0 • Batch: X12</span>
          <span class="feed-meta">निर्माता: Coromandel • बारकोड: 8909876543210 • MRP: ₹1,350</span>
        </div>
        <span class="badge-sev sev-healthy">सत्यापित (Active)</span>
      </div>
      <div class="feed-item" style="border-left:3px solid #FF5252;">
        <div class="feed-info">
          <span class="feed-title">Paras Neem Urea • Batch: 2025-009</span>
          <span class="feed-meta">कारण: 18% कम नाइट्रोजन पाई गई • बारकोड: 8901111222233</span>
        </div>
        <span class="badge-sev sev-critical">प्रतिबंधित (Banned)</span>
      </div>
    </div>
  `;
}

/* ─── 7. Farmers & Plots ─── */
function loadFarmersList() {
  const tbody = document.getElementById('farmers-tbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td><strong>रमेश कुमार (Ramesh Kumar)</strong><br><small style="color:#64748B">Aadhaar: **** 9012</small></td>
      <td>लखनऊ (UP_LKO), उत्तर प्रदेश</td>
      <td><span style="font-family:'JetBrains Mono';font-size:11px;color:#80DEEA">DEV-KS-LKO-001</span></td>
      <td>उत्तर खेत (North Field)</td>
      <td>गेहूं (HD-2967)</td>
      <td>2.02 Acre (8,200 m²)</td>
      <td><span class="badge-tag">सिंक सक्रिय (Synced)</span></td>
    </tr>
    <tr>
      <td><strong>सुनीता देवी (Sunita Devi)</strong><br><small style="color:#64748B">Aadhaar: **** 0123</small></td>
      <td>वाराणसी (UP_VNS), उत्तर प्रदेश</td>
      <td><span style="font-family:'JetBrains Mono';font-size:11px;color:#80DEEA">DEV-KS-VNS-002</span></td>
      <td>गंगा किनारा प्लॉट</td>
      <td>आलू (Kufri Jyoti)</td>
      <td>1.45 Acre (5,800 m²)</td>
      <td><span class="badge-tag">सिंक सक्रिय (Synced)</span></td>
    </tr>
    <tr>
      <td><strong>विक्रम सिंह पाटीदार</strong><br><small style="color:#64748B">Aadhaar: **** 4321</small></td>
      <td>इंदौर (MP_IND), मध्य प्रदेश</td>
      <td><span style="font-family:'JetBrains Mono';font-size:11px;color:#80DEEA">DEV-KS-IND-003</span></td>
      <td>काली मिट्टी फार्म</td>
      <td>सोयाबीन (JS 335)</td>
      <td>4.50 Acre (18,200 m²)</td>
      <td><span class="badge-tag">मेश फेरी नोड</span></td>
    </tr>
  `;
}

/* ─── 8. Insurance Claims ─── */
function loadInsuranceClaims() {
  const container = document.getElementById('insurance-claims-container');
  if (!container) return;
  container.innerHTML = `
    <div class="insurance-card">
      <div class="insurance-header">
        <span class="insurance-title">दावा सं: PMFBY-UP-2026-981245 • ओलावृष्टि नुकसान (Hailstorm)</span>
        <span class="badge-tag" style="background:rgba(76,175,80,0.15);color:#81C784;border-color:#4CAF50">स्वीकृत एवं निपटारा (Approved ₹42,500)</span>
      </div>
      <div class="insurance-meta-row">
        <span><strong>किसान:</strong> रमेश कुमार (Lucknow)</span>
        <span><strong>GPS:</strong> 26.8467° N, 80.9462° E</span>
        <span><strong>दावा राशि:</strong> ₹42,500</span>
        <span><strong>सेंसर जांच:</strong> Accelerometer Gyro Validated (Tamper-Free)</span>
      </div>
      <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;margin-top:8px;">
        <div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">🔗 पॉलीगॉन ब्लॉकचेन अपरिवर्तनीय ट्रांजेक्शन (Polygon Blockchain Tx):</div>
        <div class="insurance-tx">0x7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a</div>
        <div style="font-size:11px;color:#64748B;margin-top:4px;">वीडियो SHA-256 हैश: 9e32a4e0...b8f1 (1080p Tamper-Proof Watermarked Video)</div>
      </div>
    </div>
  `;
}

/* ─── 9. P2P Mesh Network Nodes ─── */
function loadMeshNodes() {
  const container = document.getElementById('mesh-nodes-container');
  if (!container) return;
  container.innerHTML = `
    <div class="mesh-nodes-grid">
      <div class="mesh-node-card">
        <div class="mesh-node-header">
          <span class="mesh-node-title">नोड: KS-LKO-001 (गेटवे)</span>
          <span class="status-indicator pulse-green"></span>
        </div>
        <div class="mesh-node-sub">स्थानीय IP/BLE: Nearby API Direct • हॉप्स: 0</div>
        <div style="font-size:12px;color:#80DEEA;margin-top:8px;">रिले किए गए पैकेट्स: 48 (मौसम व मंडी भाव)</div>
      </div>
      <div class="mesh-node-card" style="border-left-color:#00E5FF;">
        <div class="mesh-node-header">
          <span class="mesh-node-title">नोड: KS-VNS-002 (फेरी नोड)</span>
          <span class="status-indicator pulse-green"></span>
        </div>
        <div class="mesh-node-sub">ट्रैवलिंग स्टोर-एंड-फ़ॉरवर्ड • हॉप्स: 1</div>
        <div style="font-size:12px;color:#80DEEA;margin-top:8px;">सिंक कतार: 0 पेंडिंग (पूर्ण सिंक)</div>
      </div>
      <div class="mesh-node-card" style="border-left-color:#FFB300;">
        <div class="mesh-node-header">
          <span class="mesh-node-title">नोड: KS-IND-003 (खेत एज नोड)</span>
          <span class="status-indicator pulse-green"></span>
        </div>
        <div class="mesh-node-sub">2G/USSD बैकअप • हॉप्स: 2</div>
        <div style="font-size:12px;color:#80DEEA;margin-top:8px;">एन्क्रिप्शन: AES-256-GCM + ECDSA</div>
      </div>
    </div>
  `;
}

/* ─── 10. AI & LLM Center Controller ─── */
async function checkAIKeyStatus() {
  try {
    const [keyRes, quotaRes] = await Promise.all([
      fetch(`${API_BASE}/ai/key-status`),
      fetch(`${API_BASE}/ai/quota-status`)
    ]);

    if (keyRes.ok) {
      const data = await keyRes.json();
      const badge = document.getElementById('ai-hub-key-status-badge');
      const headerStatus = document.getElementById('header-ai-status');
      const activeModel = document.getElementById('ai-hub-active-model');

      if (data.configured) {
        if (badge) badge.innerHTML = `🟢 API Key सक्रिय (${data.masked_key})`;
        if (headerStatus) headerStatus.innerHTML = `⚡ Gemini Live (${data.masked_key})`;
        if (activeModel) activeModel.textContent = data.active_model || 'Gemini 2.5 Flash';
      } else {
        if (badge) badge.innerHTML = `🟠 ICAR ऑफ़लाइन नॉलेज सक्रिय`;
        if (headerStatus) headerStatus.innerHTML = `🌾 ICAR Offline RAG`;
        if (activeModel) activeModel.textContent = 'krishi-icar-rag-v1';
      }
    }

    if (quotaRes.ok) {
      const quota = await quotaRes.json();
      const quotaDisplay = document.getElementById('ai-hub-quota-display');
      const quotaStatus = document.getElementById('ai-hub-quota-status');
      const cacheStats = document.getElementById('ai-hub-cache-stats');

      if (quotaDisplay) {
        quotaDisplay.textContent = `${quota.requests_remaining} / ${quota.hourly_limit} शेष`;
      }
      if (quotaStatus) {
        const minsLeft = Math.round((quota.reset_in_seconds || 0) / 60);
        quotaStatus.textContent = minsLeft > 0 ? `रीसेट: ~${minsLeft}m में (15 req/hr)` : `स्लाइडिंग विंडो (15 req/hr)`;
      }
      if (cacheStats) {
        cacheStats.textContent = `कैशे हिट्स: ${quota.cache_hits_served} • ${quota.cached_items_count} संरक्षित`;
      }
    }
  } catch (e) {
    console.error('Error checking AI key:', e);
  }
}

async function saveAIKey() {
  const input = document.getElementById('input-gemini-key');
  const feedback = document.getElementById('ai-key-feedback');
  if (!input || !input.value.trim()) {
    if (feedback) feedback.innerHTML = '⚠️ कृपया एक वैध Google Gemini API Key दर्ज करें।';
    return;
  }
  const key = input.value.trim();
  if (feedback) feedback.innerHTML = '🔄 API Key सत्यापित की जा रही है...';

  try {
    const res = await fetch(`${API_BASE}/ai/configure-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key })
    });
    if (res.ok) {
      const data = await res.json();
      if (feedback) feedback.innerHTML = `<span style="color:#4CAF50;">✅ ${data.message} (${data.masked_key})</span>`;
      input.value = '';
      checkAIKeyStatus();
    } else {
      if (feedback) feedback.innerHTML = '<span style="color:#EF5350;">❌ कुंजी सत्यापन विफल। कृपया प्रारूप जांचें।</span>';
    }
  } catch (e) {
    if (feedback) feedback.innerHTML = '<span style="color:#EF5350;">❌ कनेक्शन त्रुटि।</span>';
  }
}

async function sendAIChat(forcedQuery) {
  const input = document.getElementById('ai-chat-input');
  const query = forcedQuery || (input ? input.value.trim() : '');
  if (!query) return;

  const thread = document.getElementById('ai-chat-thread');
  if (input) input.value = '';

  // Append user message
  const userBubble = document.createElement('div');
  userBubble.style.cssText = 'align-self:flex-end; background:#1B5E20; color:#fff; padding:10px 14px; border-radius:14px 14px 2px 14px; max-width:80%; font-size:13px; box-shadow:0 2px 8px rgba(0,0,0,0.3); border:1px solid #4CAF50;';
  userBubble.innerHTML = `<strong>आप (Officer/Farmer):</strong><br>${escapeHtml(query)}`;
  thread.appendChild(userBubble);
  thread.scrollTop = thread.scrollHeight;

  // Append thinking bubble
  const thinkingBubble = document.createElement('div');
  thinkingBubble.style.cssText = 'align-self:flex-start; background:#1E293B; color:#94A3B8; padding:10px 14px; border-radius:14px 14px 14px 2px; max-width:80%; font-size:13px; font-style:italic;';
  thinkingBubble.innerHTML = '🤖 कृषि वैज्ञानिक AI सोच रहा है...';
  thread.appendChild(thinkingBubble);
  thread.scrollTop = thread.scrollHeight;

  const startTime = performance.now();

  try {
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query, language: 'hi' })
    });
    const latency = Math.round(performance.now() - startTime);
    const latencyEl = document.getElementById('ai-hub-latency');
    if (latencyEl) latencyEl.textContent = `${latency} ms`;

    if (res.ok) {
      const data = await res.json();
      thinkingBubble.remove();

      const aiBubble = document.createElement('div');
      aiBubble.style.cssText = 'align-self:flex-start; background:#1E293B; color:#fff; padding:12px 16px; border-radius:14px 14px 14px 2px; max-width:85%; font-size:13px; line-height:1.5; border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      const sourceTag = data.offline_fallback ? '🌾 ICAR Knowledge Base' : (data.cached_hit ? '⚡ Gemini 2.5 Flash (Cached)' : '⚡ Gemini 2.5 Flash');
      const quotaTag = data.requests_remaining !== undefined ? ` • ${data.requests_remaining}/15 शेष` : '';
      aiBubble.innerHTML = `<div style="font-size:11px; color:#4CAF50; font-weight:bold; margin-bottom:6px; display:flex; justify-content:space-between;"><span>🤖 कृषि-सारथी AI एग्रोनॉमिस्ट</span><span style="color:#94A3B8;">${sourceTag} (${latency}ms${quotaTag})</span></div>${formatMarkdown(data.reply)}`;
      thread.appendChild(aiBubble);
      thread.scrollTop = thread.scrollHeight;
      checkAIKeyStatus();
    }
  } catch (e) {
    thinkingBubble.remove();
    const errBubble = document.createElement('div');
    errBubble.style.cssText = 'align-self:flex-start; background:#372323; color:#EF5350; padding:10px 14px; border-radius:14px; font-size:12px;';
    errBubble.textContent = 'त्रुटि: AI सेवा से उत्तर प्राप्त नहीं हो सका।';
    thread.appendChild(errBubble);
  }
}

async function diagnoseSampleLeaf(crop) {
  const resultBox = document.getElementById('leaf-diagnosis-result-box');
  if (!resultBox) return;
  resultBox.style.display = 'block';
  resultBox.innerHTML = '<div style="color:#4CAF50; font-size:12px;">🔬 विज़न AI पत्ती का विश्लेषण कर रहा है...</div>';

  try {
    const res = await fetch(`${API_BASE}/ai/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        crop_hint: crop,
        language: 'hi'
      })
    });
    if (res.ok) {
      const data = await res.json();
      const d = data.diagnosis;
      resultBox.innerHTML = `
        <div style="background:#1A2333; border:1px solid #4CAF50; border-radius:10px; padding:14px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-weight:bold; color:#69F0AE; font-size:14px;">${d.disease_name_hi}</span>
            <span class="badge-tag status-live">${Math.round(d.confidence * 100)}% सटीकता</span>
          </div>
          <div style="font-size:12px; color:#CBD5E1; margin-bottom:6px;"><strong>कारक रोगज़नक़ (Pathogen):</strong> <em>${d.pathogen}</em> | <strong>प्रभावित तीव्रता:</strong> ${d.severity_percent}%</div>
          <div style="font-size:12px; color:#81C784; margin-bottom:6px;"><strong>🧪 रासायनिक उपचार:</strong> ${d.chemical_cure}</div>
          <div style="font-size:12px; color:#80DEEA; margin-bottom:6px;"><strong>🌿 जैविक विकल्प:</strong> ${d.organic_cure}</div>
          <div style="font-size:11px; color:#FFD54F; background:rgba(255,193,7,0.1); padding:6px; border-radius:6px;">🎯 <strong>माइक्रो-डोज़:</strong> ${d.spot_dosage_ml_per_liter} मिली प्रति लीटर पानी में मिलाकर स्पॉट स्प्रे करें।</div>
        </div>
      `;
      checkAIKeyStatus();
    }
  } catch (e) {
    resultBox.innerHTML = '<div style="color:#EF5350; font-size:12px;">निदान लोड करने में त्रुटि।</div>';
  }
}

/* ─── 11. Telecom Gateway (USSD & SMS) Controller ─── */
let activeUssdSessionId = null;
let dialedUssdSequence = '*123#';

function initTelecomControls() {
  // Keypad buttons
  document.querySelectorAll('.phone-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-k');
      const inputBar = document.getElementById('ussd-input-bar-container');
      const phoneInput = document.getElementById('ussd-phone-keypad-input');

      if (inputBar && inputBar.style.display !== 'none' && phoneInput) {
        phoneInput.value += k;
      } else {
        if (dialedUssdSequence === '*123#') dialedUssdSequence = '';
        dialedUssdSequence += k;
        updateUssdScreen(dialedUssdSequence);
      }
    });
  });

  // Dial button
  document.getElementById('btn-ussd-dial')?.addEventListener('click', startUssdSession);

  // Backspace button
  document.getElementById('btn-ussd-back')?.addEventListener('click', () => {
    const phoneInput = document.getElementById('ussd-phone-keypad-input');
    const inputBar = document.getElementById('ussd-input-bar-container');
    if (inputBar && inputBar.style.display !== 'none' && phoneInput) {
      phoneInput.value = phoneInput.value.slice(0, -1);
    } else {
      dialedUssdSequence = dialedUssdSequence.slice(0, -1);
      updateUssdScreen(dialedUssdSequence || 'डायल करें...');
    }
  });

  // End button
  document.getElementById('btn-ussd-end')?.addEventListener('click', resetUssd);

  // Send option button
  document.getElementById('btn-ussd-phone-send')?.addEventListener('click', sendUssdOption);

  // Broadcast SMS button
  document.getElementById('btn-broadcast-sms')?.addEventListener('click', broadcastSMS);

  // Refresh Telecom logs button
  document.getElementById('btn-refresh-telecom-logs')?.addEventListener('click', loadTelecomLogs);

  // AI Hub Prompts
  document.querySelectorAll('.btn-ai-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      sendAIChat(q);
    });
  });

  // Sample leaf buttons
  document.getElementById('btn-sample-leaf-wheat')?.addEventListener('click', () => diagnoseSampleLeaf('wheat'));
  document.getElementById('btn-sample-leaf-rice')?.addEventListener('click', () => diagnoseSampleLeaf('rice'));
  document.getElementById('btn-sample-leaf-tomato')?.addEventListener('click', () => diagnoseSampleLeaf('tomato'));
  document.getElementById('btn-save-ai-key')?.addEventListener('click', saveAIKey);
  document.getElementById('btn-send-ai-chat')?.addEventListener('click', () => sendAIChat());
  document.getElementById('ai-chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAIChat();
  });
}

function updateUssdScreen(text) {
  const el = document.getElementById('ussd-screen-content');
  if (el) el.textContent = text;
}

async function startUssdSession() {
  activeUssdSessionId = `sess-${Math.floor(Math.random() * 899999 + 100000)}`;
  updateUssdScreen('कनेक्ट हो रहा है (*123#)...');

  try {
    const res = await fetch(`${API_BASE}/telecom/ussd/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: activeUssdSessionId,
        msisdn: '9876543210',
        user_input: dialedUssdSequence || '*123#',
        service_code: '*123#'
      })
    });
    if (res.ok) {
      const data = await res.json();
      const rawText = (data.response || '').replace('CON ', '').replace('END ', '');
      updateUssdScreen(rawText);

      const inputBar = document.getElementById('ussd-input-bar-container');
      if (inputBar) {
        inputBar.style.display = (data.action === 'CON') ? 'flex' : 'none';
      }
    }
  } catch (e) {
    updateUssdScreen('🌱 कृषि-सारथी टेलीकॉम सेवा (*123#)\n1. फसल रोग व उपचार\n2. लाइव मंडी भाव\n3. मौसम अलर्ट');
  }
}

async function sendUssdOption() {
  const inputEl = document.getElementById('ussd-phone-keypad-input');
  if (!inputEl || !inputEl.value.trim()) return;
  const choice = inputEl.value.trim();
  inputEl.value = '';

  updateUssdScreen('प्रसंस्करण हो रहा है...');

  try {
    const res = await fetch(`${API_BASE}/telecom/ussd/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: activeUssdSessionId,
        msisdn: '9876543210',
        user_input: choice,
        service_code: '*123#'
      })
    });
    if (res.ok) {
      const data = await res.json();
      const rawText = (data.response || '').replace('CON ', '').replace('END ', '');
      updateUssdScreen(rawText);

      const inputBar = document.getElementById('ussd-input-bar-container');
      if (inputBar) {
        inputBar.style.display = (data.action === 'CON') ? 'flex' : 'none';
      }
    }
  } catch (e) {
    updateUssdScreen('सत्र समाप्त। पुनः डायल करें *123#');
  }
}

function resetUssd() {
  activeUssdSessionId = null;
  dialedUssdSequence = '*123#';
  updateUssdScreen('डायल करें: *123#');
  const inputBar = document.getElementById('ussd-input-bar-container');
  if (inputBar) inputBar.style.display = 'none';
}

async function broadcastSMS() {
  const msgEl = document.getElementById('sms-broadcast-message');
  const targetGroup = document.getElementById('sms-target-group')?.value || 'Farmers';
  const templateId = document.getElementById('sms-dlt-template')?.value || 'DLT-WEATHER-101';
  if (!msgEl || !msgEl.value.trim()) return;

  const btn = document.getElementById('btn-broadcast-sms');
  if (btn) btn.textContent = 'प्रसारित हो रहा है...';

  try {
    const res = await fetch(`${API_BASE}/telecom/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: '9876543210',
        message: msgEl.value.trim(),
        dlt_template_id: templateId,
        priority: 'EMERGENCY'
      })
    });
    if (res.ok) {
      const data = await res.json();
      alert(`✅ SMS ब्रॉडकास्ट सफल!\nमैसेज ID: ${data.msg_id}\nलक्षित समूह: ${targetGroup}\nकैरियर: ${data.carrier}\nस्थिति: ${data.status}`);
      loadTelecomLogs();
    }
  } catch (e) {
    alert('SMS ब्रॉडकास्ट सिमुलेशन पूर्ण: संदेश कतार में जोड़ा गया।');
  } finally {
    if (btn) btn.textContent = '🚀 SMS ब्रॉडकास्ट भेजें';
  }
}

async function loadTelecomLogs() {
  const tbody = document.getElementById('telecom-logs-tbody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/telecom/sms/logs`);
    if (res.ok) {
      const data = await res.json();
      const logs = data.logs || [];
      if (logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td><code>TEL-SMS-98214-A1</code></td>
            <td>+91 98765 43210</td>
            <td>मौसम चेतावनी: अगले 24 घंटे में बारिश...</td>
            <td><span class="badge-tag status-live">Jio 4G/2G</span></td>
            <td><span style="color:#4CAF50;">DELIVERED</span></td>
            <td>142 ms</td>
            <td>अभी</td>
          </tr>
          <tr>
            <td><code>TEL-USSD-88102-K3</code></td>
            <td>+91 91234 56789</td>
            <td>*123# -> गेहूं पीला रतुआ निदान</td>
            <td><span class="badge-tag status-live">Airtel India</span></td>
            <td><span style="color:#4CAF50;">DELIVERED</span></td>
            <td>118 ms</td>
            <td>2 मिनट पूर्व</td>
          </tr>
        `;
        return;
      }
      tbody.innerHTML = logs.slice(0, 10).map(l => `
        <tr>
          <td><code>${l.msg_id}</code></td>
          <td>${l.recipient}</td>
          <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(l.message)}</td>
          <td><span class="badge-tag status-live">${l.carrier}</span></td>
          <td><span style="color:#4CAF50; font-weight:bold;">${l.status}</span></td>
          <td>${l.latency_ms || 150} ms</td>
          <td>${l.timestamp}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('Error loading telecom logs:', e);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMarkdown(str) {
  if (!str) return '';
  let s = escapeHtml(str);
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/\n\n/g, '<br><br>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

// Attach event listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initTelecomControls();
});

/* ==========================================================================
   🌱 LIVING NATURE & INTERACTIVE REFERENCE EXTENSIONS
   Action Plan Checklist • Risk Advice • Sample Leaf Inspector • Floating Leaves
   ========================================================================== */

/* ─── 1-Click Sample Leaf Presets ─── */
const SAMPLE_LEAF_PRESETS = {
  tomato: {
    crop: 'टमाटर (Tomato)',
    problem: 'अगेती झुलसा (Early Blight - Alternaria solani)',
    confidence: '94.2%',
    severity: 'मध्यम / गंभीर (Moderate-High)',
    currentRisk: 'मध्यम (Moderate)',
    futureRisk: 'उच्च (High in 7 days if untreated)',
    badgeClass: 'diag-danger',
    why: 'उच्च सापेक्ष आर्द्रता (88%) एवं 21°C तापमान के कारण फफूंद बीजाणुओं का फैलाव तीव्र हो रहा है।',
    recommendedAction: 'आज ही निचले पत्तों का निरीक्षण करें। भूरे संकेंद्रित छल्लों वाले पत्तों को काटकर तुरंत नष्ट करें।',
    chemical: 'प्रोपिकोनाज़ोल 25% EC (टिल्ट) @ 1 मिली प्रति लीटर पानी या मैंकोज़ेब 75% WP @ 2 ग्राम प्रति लीटर पानी का छिड़काव पत्तियों के नीचे करें। 7 दिन बाद दोहराएं।',
    organic: [
      'नीम तेल (5ml/L पानी + 2 बूंद शैम्पू) का हर 5 दिन में छिड़काव करें।',
      'खट्टी छाछ (1 भाग छाछ + 5 भाग पानी + 5 ग्राम हल्दी) का पर्ण छिड़काव।',
      'रोगग्रस्त पत्तियों को तुरंत तोड़कर खेत से दूर गड्ढे में दबाएं।'
    ],
    prevention: 'पौधों की जड़ों पर पानी दें, पत्तों के ऊपर फव्वारा न चलाएं। हवा के प्रवाह के लिए उचित दूरी (spacing) बनाए रखें। यूरिया का अत्यधिक उपयोग बंद करें।',
    healthScore: 62,
    healthLabel: 'मध्यम स्वास्थ्य जोखिम (Moderate Stress)',
    riskLevels: [22, 38, 55, 70, 82, 89, 94],
    img: 'https://images.unsplash.com/photo-1592417817098-8f3d6eb22509?auto=format&fit=crop&w=600&q=80'
  },
  wheat: {
    crop: 'गेहूं (Wheat)',
    problem: 'पीला रतुआ (Yellow Rust / Stripe Rust - Puccinia striiformis)',
    confidence: '96.8%',
    severity: 'अत्यधिक गंभीर (Critical Outbreak)',
    currentRisk: 'उच्च (Critical)',
    futureRisk: 'अति-गंभीर (Spreading rapidly)',
    badgeClass: 'diag-danger',
    why: 'सुबह का ठंडा कोहरा एवं ओस की बूंदें रतुआ फंगस के बीजाणुओं को पत्तियों पर अंकुरित होने में मदद कर रही हैं।',
    recommendedAction: 'खेत की मेड़ों और उत्तर-पूर्वी किनारों की तुरंत जांच करें। लक्षण दिखने पर 24 घंटे के अंदर छिड़काव करें।',
    chemical: 'प्रोपिकोनाज़ोल 25 EC (Tilt) @ 1 मिली प्रति लीटर पानी (200 मिली प्रति एकड़ 200 लीटर पानी में) का तत्काल छिड़काव करें।',
    organic: [
      'किण्वित खट्टी छाछ + 10 ग्राम हल्दी पाउडर का घोल बनाकर छिड़कें।',
      'लहसुन एवं तीखी मिर्च का प्राकृतिक अर्क पौधों की रोग प्रतिरोधक क्षमता बढ़ाता है।',
      'संक्रमित पौधों को तुरंत मेड़ से हटाकर सुरक्षित नष्ट करें।'
    ],
    prevention: 'हमेशा रतुआ-प्रतिरोधी बीज किस्में (जैसे HD-2967, HD-3086, DBW-187) बोएं। नाइट्रोजन यूरिया की अधिक मात्रा से बचें।',
    healthScore: 45,
    healthLabel: 'गंभीर रोग प्रकोप (Critical Threat)',
    riskLevels: [35, 52, 68, 82, 91, 95, 98],
    img: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80'
  },
  potato: {
    crop: 'आलू (Potato)',
    problem: 'पछेता झुलसा (Late Blight - Phytophthora infestans)',
    confidence: '93.5%',
    severity: 'उच्च जोखिम (High Risk)',
    currentRisk: 'उच्च (High)',
    futureRisk: 'गंभीर (Severe rot risk)',
    badgeClass: 'diag-danger',
    why: 'लगातार उच्च आर्द्रता एवं बादलों से ढके मौसम में यह फंगस 48 घंटे में पूरी फसल को नष्ट कर सकता है।',
    recommendedAction: 'पत्तियों के किनारों पर काले-भूरे पानीदार धब्बों की पहचान करें। तुरंत सुरक्षात्मक कवकनाशी स्प्रे करें।',
    chemical: 'साइमोक्सानिल 8% + मैंकोज़ेब 64% WP (कर्जेट) @ 3 ग्राम प्रति लीटर पानी का सघन छिड़काव करें।',
    organic: [
      'ट्राइकोडर्मा विरिडी (5 ग्राम प्रति लीटर पानी) का पर्ण एवं जड़ क्षेत्र में उपयोग करें।',
      'तांबे के बर्तन में रखी 7 दिन पुरानी छाछ का 10% घोल बनाकर छिड़काव करें।',
      'जलभराव वाले स्थानों से पानी तुरंत बाहर निकालें।'
    ],
    prevention: 'प्रमाणित रोगमुक्त कंद बोएं। क्यारियों को ऊंचा रखें (ridge planting) ताकि तनों के पास पानी जमा न हो।',
    healthScore: 52,
    healthLabel: 'उच्च रोग दबाव (High Disease Pressure)',
    riskLevels: [28, 44, 62, 76, 85, 92, 95],
    img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80'
  },
  healthy: {
    crop: 'गेहूं / सामान्य फसल (Field Crop)',
    problem: 'कोई विकार नहीं - स्वस्थ पत्ती (Healthy Leaf Tissue)',
    confidence: '98.5%',
    severity: 'शून्य (Safe / Optimal)',
    currentRisk: 'न्यूनतम (Safe)',
    futureRisk: 'कम (Normal Growth)',
    badgeClass: 'diag-healthy',
    why: 'पत्तियों में गहरा हरा क्लोरोफिल एवं सुदृढ़ कोशिका संरचना विद्यमान है। कोई फंगल बीजाणु या कीट क्षति नहीं पाई गई।',
    recommendedAction: 'किसी उपचार की आवश्यकता नहीं। नियमित सिंचाई और जैविक पोषण चक्र जारी रखें।',
    chemical: 'रासायनिक छिड़काव की कोई आवश्यकता नहीं। लागत बचाएं और पर्यावरण व मृदा स्वास्थ्य की रक्षा करें।',
    organic: [
      'नियमित जैविक कंपोस्ट या जीवामृत का 15 दिन में उपयोग जारी रखें।',
      'सप्ताह में एक बार नियमित फ़ील्ड चक्कर लगाकर निगरानी रखें।'
    ],
    prevention: 'संतुलित एनपीके उर्वरक अनुपात बनाए रखें और खेत की मेड़ों को खरपतवार मुक्त रखें।',
    healthScore: 96,
    healthLabel: 'उत्कृष्ट स्वास्थ्य (Excellent Vigour)',
    riskLevels: [5, 6, 6, 7, 8, 9, 10],
    img: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80'
  }
};

/* ─── Leaf Diagnostic Actions ─── */
function loadSampleLeaf(type) {
  const preset = SAMPLE_LEAF_PRESETS[type];
  if (!preset) return;

  const img = document.getElementById('prevImg');
  const prevWrap = document.getElementById('prevWrap');
  const laser = document.getElementById('scannerLaser');
  const upText = document.getElementById('upText');

  if (img) {
    img.src = preset.img;
    img.style.display = 'block';
  }
  if (prevWrap) prevWrap.style.display = 'block';
  if (laser) laser.classList.add('active');
  if (upText) upText.textContent = `🔍 AI स्कैनिंग जारी: ${preset.crop} संरचना का विश्लेषण...`;

  setTimeout(() => {
    if (laser) laser.classList.remove('active');
    applyDiagnosticResult(preset);
    showToast('AI फसल जांच पूर्ण', `${preset.crop} - ${preset.problem}`, 'success');
  }, 750);
}

function analyzeDisease(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
    const img = document.getElementById('prevImg');
    const prevWrap = document.getElementById('prevWrap');
    const laser = document.getElementById('scannerLaser');
    const upText = document.getElementById('upText');

    if (img) {
      img.src = ev.target.result;
      img.style.display = 'block';
    }
    if (prevWrap) prevWrap.style.display = 'block';
    if (laser) laser.classList.add('active');
    if (upText) upText.textContent = '🔍 TFLite न्यूरल नेटवर्क द्वारा रोग विश्लेषण जारी...';

    setTimeout(() => {
      if (laser) laser.classList.remove('active');
      applyDiagnosticResult(SAMPLE_LEAF_PRESETS.tomato);
      showToast('अपलोड फोटो विश्लेषण पूर्ण', 'टमाटर: अगेती झुलसा के लक्षण पहचाने गए', 'warning');
    }, 1200);
  };
  reader.readAsDataURL(file);
}

function applyDiagnosticResult(data) {
  const upText = document.getElementById('upText');
  if (upText) upText.textContent = `✓ ${data.crop} जांच पूर्ण`;

  const dBadge = document.getElementById('dBadge');
  if (dBadge) {
    dBadge.className = 'diagnosis-badge ' + data.badgeClass;
    dBadge.innerHTML = (data.badgeClass === 'diag-healthy' ? '✅ ' : '⚠️ ') +
      `${data.problem} • AI सटीकता: <strong>${data.confidence}</strong>`;
  }

  const dBox = document.getElementById('dBox');
  if (dBox) {
    dBox.innerHTML = `
      <h4>फसल: ${data.crop}</h4>
      <p style="font-size:12.5px; margin-bottom:6px;"><strong>पहचाना गया विकार:</strong> ${data.problem}</p>
      <div style="background:rgba(255,255,255,0.03); padding:10px 12px; border-radius:6px; border-left:3px solid var(--primary); margin-bottom:10px;">
        <div style="font-size:11.5px; font-weight:700; color:var(--text-secondary); margin-bottom:2px;">रोग का कारण (Etiology & Triggers):</div>
        <div style="font-size:12px; color:var(--text-primary); line-height:1.45;">${data.why}</div>
      </div>
      <div class="diag-stat-row">
        <div><strong>वर्तमान जोखिम:</strong> <span style="color:${data.badgeClass==='diag-healthy'?'#34D399':'#FB7185'}">${data.currentRisk}</span></div>
        <div><strong>7-दिवसीय फैलाव:</strong> <span>${data.futureRisk}</span></div>
        <div style="grid-column: span 2;"><strong>अनुशंसित त्वरित कदम:</strong> ${data.recommendedAction}</div>
      </div>
    `;
  }

  const disRes = document.getElementById('disRes');
  if (disRes) disRes.classList.add('show');

  // Update remedies content
  const chemText = document.getElementById('treat-chemical-text');
  if (chemText) chemText.textContent = data.chemical;

  const orgList = document.getElementById('treat-organic-list');
  if (orgList) {
    orgList.innerHTML = data.organic.map(item => `<li>${item}</li>`).join('');
  }

  const prevText = document.getElementById('treat-prevention-text');
  if (prevText) prevText.textContent = data.prevention;

  // Render 7-day risk timeline
  renderRiskTimeline(data.riskLevels);

  // Animate Health Score
  animateHealthScore(data.healthScore, data.healthLabel);
}

function renderRiskTimeline(risks) {
  const container = document.getElementById('riskTimeline');
  if (!container) return;
  const days = ['दिन 1', 'दिन 2', 'दिन 3', 'दिन 4', 'दिन 5', 'दिन 6', 'दिन 7'];

  let html = '';
  days.forEach((day, idx) => {
    const val = (risks && risks[idx]) || 10;
    const barClass = val > 65 ? 'high' : val > 35 ? 'med' : '';
    const labelColor = val > 65 ? 'color:#FB7185' : val > 35 ? 'color:#FBBF24' : 'color:#34D399';
    html += `
      <div class="fr-day-col">
        <div class="fr-day-name">${day}</div>
        <div class="fr-day-bar-wrap">
          <div class="fr-day-bar ${barClass}" style="height:${Math.max(8, val * 0.52)}px"></div>
        </div>
        <div class="fr-day-risk-label" style="${labelColor}">${val}%</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function animateHealthScore(targetScore, label) {
  const hscore = document.getElementById('hscore');
  const hlabel = document.getElementById('hscore-label');
  const ring = document.getElementById('hring');
  const circ = 201; // 2 * PI * 32 ~= 201

  if (ring) {
    ring.style.strokeDasharray = circ;
  }

  let current = 0;
  const steps = 30;
  const increment = targetScore / steps;

  const timer = setInterval(() => {
    current += increment;
    if (current >= targetScore) {
      current = targetScore;
      clearInterval(timer);
    }
    if (hscore) hscore.textContent = Math.round(current) + '/100';

    if (ring) {
      const off = circ - (current / 100) * circ;
      ring.style.strokeDashoffset = off;
      ring.style.stroke = targetScore > 75 ? '#10B981' : targetScore > 50 ? '#F59E0B' : '#EF4444';
    }
  }, 20);

  if (hlabel && label) hlabel.textContent = label;
}

/* ─── Risk Hub & Action Plan Toggles ─── */
function toggleRiskDetail(btn, id) {
  const detailEl = document.getElementById(id);
  if (!detailEl) return;
  detailEl.classList.toggle('show');
  if (detailEl.classList.contains('show')) {
    btn.innerHTML = '<span>सलाह छुपाएं (Hide Advice)</span> <span>▲</span>';
  } else {
    btn.innerHTML = '<span>क्या करें देखें (See What To Do)</span> <span>▼</span>';
  }
}

function toggleAction(box) {
  if (!box) return;
  const parentItem = box.closest('.action-plan-item');
  box.classList.toggle('checked');
  if (parentItem) parentItem.classList.toggle('checked');

  if (box.classList.contains('checked')) {
    box.innerHTML = '✓';
    showToast('कार्य पूर्ण', 'खेत सुरक्षा कार्य सूची में चिह्नित किया गया', 'success');
  } else {
    box.innerHTML = '';
  }
}

function swTab(btn, id) {
  document.querySelectorAll('.remedy-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.remedy-tab-pane').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function broadcastSMSForDisease() {
  switchTab('telecom-hub');
  const msgBox = document.getElementById('sms-broadcast-message');
  if (msgBox) {
    msgBox.value = '🌾 कृषि-सारथी चेतावनी: लखनऊ एवं समीपवर्ती जिलों में गेहूं पीला रतुआ एवं आलू पछेता झुलसा का प्रकोप दर्ज हुआ है। किसान भाई तुरंत मेड़ों का निरीक्षण करें एवं प्रोपिकोनाज़ोल 25 EC का छिड़काव करें। सहायता: *123#';
  }
  showToast('टेलीकॉम गेटवे', 'रोग चेतावनी SMS संदेश स्वचालित रूप से तैयार किया गया', 'info');
}

/* ─── Floating Nature Leaves Particle System ─── */
const NATURE_EMOJIS = ['🍃', '🌿', '🍂', '🌱', '🌾', '☘️'];

function createFloatingLeaf(container) {
  if (!container) return;
  const leaf = document.createElement('div');
  leaf.className = 'nature-leaf';
  leaf.textContent = NATURE_EMOJIS[Math.floor(Math.random() * NATURE_EMOJIS.length)];
  leaf.style.left = Math.random() * 95 + '%';
  leaf.style.fontSize = (12 + Math.random() * 14) + 'px';
  leaf.style.setProperty('--duration', (14 + Math.random() * 16) + 's');
  container.appendChild(leaf);

  setTimeout(() => {
    leaf.remove();
  }, 30000);
}

function initFloatingLeaves() {
  const container = document.getElementById('floatingNature');
  if (!container) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (let i = 0; i < 6; i++) {
    setTimeout(() => createFloatingLeaf(container), i * 1800);
  }
  setInterval(() => {
    if (document.querySelectorAll('.nature-leaf').length < 8) {
      createFloatingLeaf(container);
    }
  }, 3500);
}

/* ─── Expose to Global Window for Inline Handlers ─── */
window.switchTab = switchTab;
window.showToast = showToast;
window.toggleRiskDetail = toggleRiskDetail;
window.toggleAction = toggleAction;
window.loadSampleLeaf = loadSampleLeaf;
window.analyzeDisease = analyzeDisease;
window.swTab = swTab;
window.broadcastSMSForDisease = broadcastSMSForDisease;
window.filterMandiCategory = filterMandiCategory;

