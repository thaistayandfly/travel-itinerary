// ===============================
// CONFIGURATION
// ===============================
const CONFIG = {
  // Google Apps Script web app URL
  API_URL: 'https://script.google.com/macros/s/AKfycbyU3Qt_gKgz20JoTy33vuiOji9Bn88yhSsqdfDW-UtumHIIDXES_4SAXGhGrRh1kfiuhQ/exec',
  CACHE_KEY: 'itinerary_cache',
  CACHE_VERSION: 'v1',
  DB_NAME: 'TravelItineraryDB',
  DB_VERSION: 1,
  DOCS_STORE: 'documents'
};

// ===============================
// INDEXEDDB FOR DOCUMENT STORAGE
// ===============================
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CONFIG.DOCS_STORE)) {
        db.createObjectStore(CONFIG.DOCS_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function cacheDocument(id, base64Data) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.DOCS_STORE], 'readwrite');
    const store = transaction.objectStore(CONFIG.DOCS_STORE);
    const request = store.put({
      id: id,
      data: base64Data,
      timestamp: Date.now()
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getCachedDocument(id) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.DOCS_STORE], 'readonly');
    const store = transaction.objectStore(CONFIG.DOCS_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function isDocumentCached(id) {
  try {
    const doc = await getCachedDocument(id);
    return !!doc;
  } catch (error) {
    return false;
  }
}

async function getAllCachedDocumentIds() {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.DOCS_STORE], 'readonly');
    const store = transaction.objectStore(CONFIG.DOCS_STORE);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearDocumentCache() {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.DOCS_STORE], 'readwrite');
    const store = transaction.objectStore(CONFIG.DOCS_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===============================
// STATE
// ===============================
let appState = {
  data: null,
  translations: null,
  cityMap: null,
  language: 'en',
  isRTL: false,
  clientCode: null,
  spreadsheetId: null,
  isOffline: false,
  cachedDocIds: []
};

// ===============================
// INITIALIZATION
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize IndexedDB
    await openDB();

    // Load cached document IDs
    appState.cachedDocIds = await getAllCachedDocumentIds();
    console.log(`📄 ${appState.cachedDocIds.length} documents cached offline`);

    // Get URL parameters
    const params = getURLParams();

    console.log('🔍 Current URL:', window.location.href);
    console.log('🔍 URL params:', params);

    // If no URL parameters, check if we have saved parameters (for installed PWA)
    if (!params.client || !params.shid) {
      console.log('⚠️ Missing URL parameters, checking localStorage...');
      const savedParams = getSavedItineraryParams();

      if (savedParams && savedParams.client && savedParams.shid) {
        console.log('✅ Found saved parameters:', savedParams);

        // Check if we're in standalone mode (PWA installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
          || window.navigator.standalone
          || document.referrer.includes('android-app://');

        if (isStandalone) {
          // In standalone mode, use saved parameters directly without redirect
          console.log('📱 Running in standalone PWA mode, using saved parameters');
          params.client = savedParams.client;
          params.shid = savedParams.shid;
          params.lang = savedParams.lang || 'en';
        } else {
          // In browser mode, redirect to include parameters in URL
          const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
          const queryParams = new URLSearchParams({
            client: savedParams.client,
            shid: savedParams.shid,
            lang: savedParams.lang || 'en'
          });
          const newUrl = `${baseUrl}?${queryParams.toString()}`;
          console.log('🔄 Redirecting to:', newUrl);
          window.location.replace(newUrl);
          return;
        }
      } else {
        console.error('❌ No saved parameters found');
        showError('Missing required parameters: client and shid');
        return;
      }
    }

    // Save parameters for future use (when PWA is installed)
    console.log('💾 Saving parameters for PWA...');
    saveItineraryParams(params);

    appState.clientCode = params.client;
    appState.spreadsheetId = params.shid;
    appState.language = params.lang || 'en';
    appState.isRTL = appState.language === 'he';

    // Set HTML direction
    if (appState.isRTL) {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'he');
    }

    // Check if offline
    appState.isOffline = !navigator.onLine;

    // Try to load data
    if (appState.isOffline) {
      // Load from cache
      await loadFromCache();
    } else {
      // Fetch from API
      await fetchFromAPI();
    }

    // Initialize UI
    initializeUI();

  } catch (error) {
    console.error('Initialization error:', error);
    showError(error.message);
  }
});

// ===============================
// URL PARAMETERS
// ===============================
function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    client: params.get('client'),
    shid: params.get('shid'),
    lang: params.get('lang') || 'en'
  };
}

function saveItineraryParams(params) {
  try {
    localStorage.setItem('itinerary_params', JSON.stringify({
      client: params.client,
      shid: params.shid,
      lang: params.lang
    }));
    console.log('✅ Itinerary parameters saved for installed PWA');
  } catch (error) {
    console.warn('Failed to save itinerary params:', error);
  }
}

function getSavedItineraryParams() {
  try {
    const saved = localStorage.getItem('itinerary_params');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load saved itinerary params:', error);
  }
  return null;
}

// ===============================
// DATA FETCHING
// ===============================
async function fetchFromAPI() {
  // Add timestamp to prevent caching and always get fresh data
  const timestamp = new Date().getTime();
  const url = `${CONFIG.API_URL}?client=${appState.clientCode}&shid=${appState.spreadsheetId}&lang=${appState.language}&format=json&_t=${timestamp}`;

  try {
    // Force fresh fetch, bypass cache
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    // Store data
    appState.data = result.data;
    appState.translations = result.translations;
    appState.cityMap = result.cityMap;

    // Update loading text with translation
    updateLoadingText();

    // Cache it
    cacheData(result);

    // Render
    renderItinerary();

  } catch (error) {
    console.error('Fetch error:', error);

    // Try to load from cache as fallback
    const cached = loadCachedData();
    if (cached) {
      appState.data = cached.data;
      appState.translations = cached.translations;
      appState.cityMap = cached.cityMap;
      renderItinerary();
      showOfflineBadge(true);
    } else {
      throw error;
    }
  }
}

async function loadFromCache() {
  const cached = loadCachedData();

  if (!cached) {
    showError('No cached data available. Please connect to the internet.');
    return;
  }

  appState.data = cached.data;
  appState.translations = cached.translations;
  appState.cityMap = cached.cityMap;

  renderItinerary();
  showOfflineBadge(true);
}

// ===============================
// CACHING
// ===============================
function cacheData(data) {
  try {
    const cacheObject = {
      timestamp: new Date().toISOString(),
      data: data.data,
      translations: data.translations,
      cityMap: data.cityMap,
      version: CONFIG.CACHE_VERSION
    };

    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheObject));
    console.log('✅ Data cached successfully');
  } catch (error) {
    console.warn('Caching failed:', error);
  }
}

function loadCachedData() {
  try {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached);

    // Check version
    if (parsed.version !== CONFIG.CACHE_VERSION) {
      localStorage.removeItem(CONFIG.CACHE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to load cache:', error);
    return null;
  }
}

// ===============================
// RENDERING
// ===============================
function renderItinerary() {
  const container = document.getElementById('mainContainer');
  const loading = document.getElementById('loadingScreen');

  // Count total documents
  const totalDocs = countTotalDocuments();
  const cachedDocs = appState.cachedDocIds.length;

  // Build HTML
  const html = `
    <header class="itinerary-header mb-4">
      <div class="header-row">
        <div class="header-center">
          <div class="header-eyebrow">${appState.translations.clientLabel}</div>
          <h1 class="header-client">${appState.clientCode}</h1>
          <p class="header-sub">${appState.translations.pageTitle}</p>
        </div>
        <button class="header-print" onclick="window.print()" aria-label="Print">🖨️</button>
      </div>

      ${!appState.isOffline && totalDocs > 0 ? `
        <div class="download-all-container">
          <button
            onclick="downloadAllDocuments()"
            class="btn-download-all"
            ${cachedDocs === totalDocs ? 'disabled' : ''}
          >
            ${cachedDocs === totalDocs
              ? `✅ ${appState.translations.allDocumentsOffline} (${totalDocs})`
              : `📥 ${appState.translations.downloadAllOffline} (${cachedDocs}/${totalDocs})`
            }
          </button>
        </div>
      ` : ''}
    </header>

    ${renderSections()}
    ${renderCostSummary()}
    ${renderFooter()}
    ${renderSecurePortal()}
  `;

  container.innerHTML = html;

  // Hide loading, show content
  loading.style.display = 'none';
  container.style.display = 'block';

  // Add staggered reveal animation
  setTimeout(() => {
    document.querySelectorAll('.timeline').forEach((el, i) => {
      setTimeout(() => el.classList.add('reveal'), i * 120);
    });
  }, 100);
}

function countTotalDocuments() {
  let count = 0;
  appState.data.forEach(row => {
    if (row['Doc Link']) {
      const links = row['Doc Link'].toString().split(/\n|,|;/).filter(l => l.trim());
      count += links.length;
    }
  });
  return count;
}

function renderSections() {
  const groups = groupData(appState.data);

  return groups.map((group, i) => {
    const title = formatSectionTitle(group);
    const kind = getSectionKind(group);
    const location = group[0]['Current Location'] || '';

    return `
      <div id="section${i}" class="card mb-4 shadow-sm timeline">
        <div class="timeline-node"></div>
        <div class="card-body">
          ${location ? `
            <div class="country-chip">
              🌍 ${translateCity(location)}
              <span class="chip-divider">•</span>
              ${kind === 'travel' ? `✈️ ${appState.translations.travelDay}` : `🏨 ${appState.translations.staying}`}
            </div>
          ` : ''}

          <h5 class="card-title fw-bold text-primary border-bottom pb-2 mb-3">
            ${title}
          </h5>

          ${group.map((row, idx) => `
            <div class="mb-3">
              ${renderRow(row)}
              ${renderButtons(row)}
            </div>
            ${idx < group.length - 1 ? '<hr>' : ''}
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderRow(row) {
  const type = (row.Type || '').toString().toLowerCase();

  if (type.includes('hotel')) return renderHotel(row);
  if (type.includes('flight')) return renderFlight(row);
  if (type.includes('ferry')) return renderFerry(row);
  if (type.includes('taxi')) return renderTaxi(row);

  return renderGeneric(row);
}

function renderFlight(row) {
  const t = appState.translations;

  // Check if this is a connection flight
  const hasLayover = row['Layover Airport'] && row['Layover Airport'].toString().trim();

  if (hasLayover) {
    // Calculate second flight departure time
    const firstArrival = row['Check-out / Arrival'] || '';
    const layoverDuration = row['Layover Time'] || '';
    const secondDeparture = addTimeAndDuration(firstArrival, layoverDuration);
    const formattedDuration = formatDuration(layoverDuration, appState.language);

    // Render connection flight with layover
    return `
      <div class="info-block flight-block connection-flight">
        <div class="info-header">
          <div class="info-icon">✈️</div>
          <div class="info-title">
            ${safe(row['Hotel / Airline'])}
            <span class="connection-badge">🔄 ${t.connectionFlight || 'Connection'}</span>
          </div>
        </div>

        <!-- First Segment -->
        <div class="flight-segment">
          <div class="segment-header">${t.firstFlight || 'First Flight'}</div>
          <div class="info-grid">
            <div class="info-item"><span>${t.from}</span>${translateCity(row['Current Location'])}</div>
            <div class="info-item"><span>${t.to}</span>${translateCity(row['Layover Airport'])}</div>
            <div class="info-item"><span>${t.flightNumber}</span>${safe(row['Confirmation / Flight #'])}</div>
            <div class="info-item"><span>${t.departure}</span>${row['Start Date'] || '-'} ${row['Check-in / Departure'] || ''}</div>
            <div class="info-item"><span>${t.arrival}</span>${row['Start Date'] || '-'} ${firstArrival}</div>
          </div>
        </div>

        <!-- Layover Indicator -->
        <div class="layover-indicator">
          <div class="layover-location">🏢 ${translateCity(row['Layover Airport'])}</div>
          ${layoverDuration ? `<div class="layover-duration">⏱️ ${t.layoverTime || 'Layover'}: ${formattedDuration}</div>` : ''}
        </div>

        <!-- Second Segment -->
        <div class="flight-segment segment-layover">
          <div class="segment-header">${t.secondFlight || 'Second Flight'}</div>
          <div class="info-grid">
            <div class="info-item"><span>${t.from}</span>${translateCity(row['Layover Airport'])}</div>
            <div class="info-item"><span>${t.to}</span>${translateCity(row['Destination'])}</div>
            ${row['Second Flight #'] ? `<div class="info-item"><span>${t.flightNumber}</span>${safe(row['Second Flight #'])}</div>` : ''}
            ${secondDeparture ? `<div class="info-item"><span>${t.departure}</span>${row['Start Date'] || '-'} ${secondDeparture}</div>` : ''}
            ${row['Second Flight Arrival'] ? `<div class="info-item"><span>${t.arrival}</span>${row['Finish Date'] || '-'} ${row['Second Flight Arrival'] || ''}</div>` : `<div class="info-item"><span>${t.arrival}</span>${row['Finish Date'] || '-'} ${row['Check-out / Arrival'] || ''}</div>`}
          </div>
        </div>

        ${row['Notes'] ? `<div class="info-notes"><span>📝</span>${safe(row['Notes'])}</div>` : ''}
      </div>
    `;
  }

  // Regular direct flight
  return `
    <div class="info-block flight-block">
      <div class="info-header">
        <div class="info-icon">✈️</div>
        <div class="info-title">
          ${safe(row['Hotel / Airline'])}
          <span class="connection-badge">${t.directFlight || 'Direct Flight'}</span>
        </div>
      </div>
      <div class="info-grid">
        <div class="info-item"><span>${t.from}</span>${translateCity(row['Current Location'])}</div>
        <div class="info-item"><span>${t.to}</span>${translateCity(row['Destination'])}</div>
        <div class="info-item"><span>${t.flightNumber}</span>${safe(row['Confirmation / Flight #'])}</div>
        <div class="info-item"><span>${t.departure}</span>${row['Start Date'] || '-'} ${row['Check-in / Departure'] || ''}</div>
        <div class="info-item"><span>${t.arrival}</span>${row['Finish Date'] || '-'} ${row['Check-out / Arrival'] || ''}</div>
      </div>
      ${row['Notes'] ? `<div class="info-notes"><span>📝</span>${safe(row['Notes'])}</div>` : ''}
    </div>
  `;
}

function renderHotel(row) {
  const t = appState.translations;
  return `
    <div class="info-block hotel-block">
      <div class="info-header">
        <div class="info-icon">🏨</div>
        <div class="info-title">${safe(row['Hotel / Airline'])}</div>
      </div>
      <div class="info-grid">
        <div class="info-item"><span>${t.location}</span>${translateCity(row['Current Location'])}</div>
        <div class="info-item"><span>${t.checkIn}</span>${row['Start Date'] || '-'} ${row['Check-in / Departure'] || ''}</div>
        <div class="info-item"><span>${t.checkOut}</span>${row['Finish Date'] || '-'} ${row['Check-out / Arrival'] || ''}</div>
      </div>
      ${row['Notes'] ? `<div class="info-notes"><span>📝</span>${safe(row['Notes'])}</div>` : ''}
    </div>
  `;
}

function renderFerry(row) {
  return renderGeneric(row, '⛴️', 'Ferry');
}

function renderTaxi(row) {
  return renderGeneric(row, '🚕', 'Taxi');
}

function renderGeneric(row, icon = '🚌', title = 'Trip') {
  const t = appState.translations;
  return `
    <div class="info-block">
      <div class="info-header">
        <div class="info-icon">${icon}</div>
        <div class="info-title">${title}</div>
      </div>
      <div class="info-grid">
        <div class="info-item"><span>${t.from}</span>${translateCity(row['Current Location'])}</div>
        <div class="info-item"><span>${t.to}</span>${translateCity(row['Destination'])}</div>
      </div>
    </div>
  `;
}

function renderButtons(row) {
  const t = appState.translations;
  let html = '<div class="d-flex justify-content-end gap-2 mt-3">';

  if (row['Location']) {
    html += `
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row['Location'])}"
        target="_blank"
        class="btn btn-sm btn-outline-success">
        🗺️ ${t.googleMaps || 'Google Maps'}
      </a>
    `;
  }

  if (row['Doc Link']) {
    const docIds = row['Doc Link'].toString().split(/\n|,|;/).map(d => d.trim()).filter(Boolean);
    const type = (row.Type || '').toString().toLowerCase();
    const buttonLabel = getButtonLabel(type, t);

    docIds.forEach((docId, i) => {
      const cacheKey = `${appState.spreadsheetId}_${row._rowIndex}_${i}`;
      const isCached = appState.cachedDocIds.includes(cacheKey);

      html += `
        <button
          onclick="openDocument(${row._rowIndex}, ${i}, '${docId}')"
          class="btn btn-sm ${isCached ? 'btn-success' : 'btn-outline-primary'}"
        >
          ${isCached ? '✅' : '📄'} ${buttonLabel}${docIds.length > 1 ? ` ${i + 1}` : ''}
        </button>
      `;
    });
  }

  return html + '</div>';
}

function getButtonLabel(type, t) {
  if (!type) return t.viewDocument || 'View Document';
  if (type.includes('hotel')) return t.viewHotel || 'View Hotel';
  if (type.includes('flight')) return t.viewFlight || 'View Flight';
  if (type.includes('ferry')) return t.viewFerry || 'View Ferry';
  if (type.includes('taxi')) return t.viewTaxi || 'View Taxi';
  return t.viewDocument || 'View Document';
}

function renderCostSummary() {
  const totals = {};
  const t = appState.translations;

  appState.data.forEach(row => {
    const price = parseFloat(row.Price);
    if (!price || !row.Currency) return;
    totals[row.Currency] = (totals[row.Currency] || 0) + price;
  });

  if (!Object.keys(totals).length) return '';

  return `
    <div class="summary-hero-wrap">
      <div class="card">
        <div class="card-body">
          <h5>${t.costSummary}</h5>
          ${Object.entries(totals).map(([c, v]) => `<strong>${c} ${v.toFixed(2)}</strong>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderFooter() {
  const t = appState.translations;
  const currentYear = new Date().getFullYear();

  return `
    <footer class="mt-5 pt-4">
      <div class="card">
        <div class="card-body text-center">

          <!-- Brand -->
          <p class="mb-1 fw-semibold" style="font-size:0.9rem;">
            © ${currentYear} · ${t.footerBrand}
          </p>

          <p class="text-muted mb-3" style="font-size:0.8rem;">
            ${t.footerPowered} <strong>Thaistayandfly</strong>
          </p>

          <!-- Divider -->
          <hr>

          <!-- Trust Copy -->
          <div class="text-muted" style="font-size:0.78rem; line-height:1.6;">

            <p class="mb-1">
              ${t.footerTrust1}
            </p>

            <p class="mb-1">
              ${t.footerTrust2}
              <strong>${t.footerHours}</strong>
              ${t.footerBefore}
            </p>

            <p class="mb-0">
              ${t.footerTrust3}
            </p>

          </div>

        </div>
      </div>
    </footer>
  `;
}

function renderSecurePortal() {
  const t = appState.translations;
  return `
    <div id="securePortal" class="secure-portal">
      <div class="secure-sheet">
        <button class="secure-close" onclick="closeSecurePortal()" aria-label="Close">×</button>

        <div class="secure-header">
          <div class="secure-icon-ring">
            <div class="secure-icon">🔐</div>
          </div>
          <h3 class="secure-title">${t.secureTitle || 'Secure Document'}</h3>
          <p class="secure-subtitle">${t.secureSubtitle || 'Identity verification required'}</p>
        </div>

        <div id="loginSection" class="secure-content">
          <label for="birthYearInput" class="secure-label">
            ${t.birthYearLabel || 'Birth Year'}
          </label>

          <input
            id="birthYearInput"
            type="number"
            inputmode="numeric"
            pattern="[0-9]*"
            min="1900"
            max="2100"
            class="secure-input"
            placeholder="${t.birthYearPlaceholder || 'Enter your birth year'}"
            autocomplete="off"
            required
          />

          <div id="portalErr" class="secure-error"></div>

          <button id="verifyBtn" class="secure-btn" onclick="verifyAndLoadDocument()">
            ${t.unlockDocument || 'Unlock Document'}
          </button>

          <div id="pdfLoading" class="secure-loading" style="display: none;">
            ${t.verifying || 'Verifying...'}
          </div>

          <p class="secure-hint">
            ${t.secureHint || 'This document contains sensitive travel information.'}
          </p>
        </div>
      </div>
    </div>
  `;
}

// ===============================
// UTILITY FUNCTIONS
// ===============================

/**
 * Format duration from HH:MM to readable format
 * Example: "02:30" → "2h 30m" (en) or "2 ש׳ 30 ד׳" (he)
 */
function formatDuration(duration, lang = 'en') {
  if (!duration) return '';

  const parts = duration.toString().trim().split(':');
  if (parts.length !== 2) return duration;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (lang === 'he') {
    return `${hours} ש׳ ${minutes} ד׳`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Add duration to a time
 * Example: addTimeAndDuration("11:00", "02:30") → "13:30"
 */
function addTimeAndDuration(time, duration) {
  if (!time || !duration) return '';

  // Parse time (HH:MM)
  const timeParts = time.toString().trim().split(':');
  if (timeParts.length !== 2) return time;

  let hours = parseInt(timeParts[0], 10);
  let minutes = parseInt(timeParts[1], 10);

  // Parse duration (HH:MM)
  const durationParts = duration.toString().trim().split(':');
  if (durationParts.length !== 2) return time;

  const durationHours = parseInt(durationParts[0], 10);
  const durationMinutes = parseInt(durationParts[1], 10);

  // Add duration
  minutes += durationMinutes;
  hours += durationHours;

  // Handle minute overflow
  if (minutes >= 60) {
    hours += Math.floor(minutes / 60);
    minutes = minutes % 60;
  }

  // Handle hour overflow (wrap to 24h)
  hours = hours % 24;

  // Format as HH:MM
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function groupData(data) {
  const groups = [];
  let lastKey = null;

  data.forEach(row => {
    const key = `${row['Start Date']}-${row['Finish Date']}`;
    if (key !== lastKey) {
      groups.push([]);
      lastKey = key;
    }
    groups[groups.length - 1].push(row);
  });

  return groups;
}

function getSectionKind(group) {
  const hasTravel = group.some(row => {
    const type = (row.Type || '').toString().toLowerCase();
    return type.includes('flight') || type.includes('ferry') || type.includes('taxi');
  });
  return hasTravel ? 'travel' : 'stay';
}

function formatSectionTitle(group) {
  if (!group || !group.length) return '';
  const first = group[0];
  return `${first['Start Date'] || ''} – ${first['Finish Date'] || ''}`;
}

function translateCity(city) {
  if (!city || !appState.cityMap) return city || '';
  const key = city.toString().trim();
  const entry = appState.cityMap[key];
  if (!entry) return city;
  return entry[appState.language] || entry.en || city;
}

function safe(v, fallback = '-') {
  if (v !== undefined && v !== null && v !== '') {
    return escapeHtml(v);
  }
  return fallback;
}

function escapeHtml(text) {
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = text.toString();
  return div.innerHTML;
}

// ===============================
// UI INITIALIZATION
// ===============================
function initializeUI() {
  const backToTop = document.getElementById('backToTop');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 320) {
      backToTop.classList.add('show');
    } else {
      backToTop.classList.remove('show');
    }
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  initializeTimeline();
  initializeOfflineDetection();
  initializeInstallPrompt();
}

function initializeTimeline() {
  const daySections = document.querySelectorAll('.timeline');
  const floatingDate = document.getElementById('floatingDate');

  if (!daySections.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const title = entry.target.querySelector('.card-title')?.innerText;
          if (title && floatingDate) {
            floatingDate.textContent = title;
            floatingDate.classList.add('show');
          }

          daySections.forEach(sec => sec.classList.add('is-past'));
          entry.target.classList.add('is-active');
          entry.target.classList.remove('is-past');
        }
      });
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );

  daySections.forEach(sec => observer.observe(sec));
}

function initializeOfflineDetection() {
  function updateStatus() {
    if (!navigator.onLine) {
      showOfflineBadge(true);
    } else {
      showOfflineBadge(false);
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

function showOfflineBadge(show) {
  const badge = document.getElementById('offlineBadge');
  const t = appState.translations;

  if (show) {
    badge.textContent = t?.offlineMode || 'Offline Mode';
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

function initializeInstallPrompt() {
  let deferredPrompt;
  const installPrompt = document.getElementById('installPrompt');
  const installButton = document.getElementById('installButton');
  const closeInstall = document.getElementById('closeInstall');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!localStorage.getItem('installDismissed')) {
      setTimeout(() => {
        installPrompt.classList.add('show');
      }, 5000);
    }
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install outcome:', outcome);
      deferredPrompt = null;
      installPrompt.classList.remove('show');
    });
  }

  if (closeInstall) {
    closeInstall.addEventListener('click', () => {
      installPrompt.classList.remove('show');
      localStorage.setItem('installDismissed', 'true');
    });
  }
}

function updateLoadingText() {
  if (appState.translations && appState.translations.loadingItinerary) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = appState.translations.loadingItinerary;
    }
  }
}

// ===============================
// ERROR HANDLING
// ===============================
function showError(message) {
  const loading = document.getElementById('loadingScreen');
  const errorScreen = document.getElementById('errorScreen');
  const errorMessage = document.getElementById('errorMessage');

  loading.style.display = 'none';
  errorScreen.style.display = 'flex';
  errorMessage.textContent = message;
}

// ===============================
// DOCUMENT HANDLING
// ===============================
let currentDocumentContext = null;
let downloadAllMode = false;

async function openDocument(rowIndex, docIndex, docId) {
  const cacheKey = `${appState.spreadsheetId}_${rowIndex}_${docIndex}`;

  // Check if document is cached
  const cached = await getCachedDocument(cacheKey);

  if (cached) {
    // Open cached document directly (no verification needed)
    console.log('📄 Opening cached document');
    openPDFInNewTab(cached.data);
  } else {
    // Show verification portal
    console.log('🔒 Document not cached, showing verification portal');
    downloadAllMode = false;
    currentDocumentContext = { rowIndex, docIndex, docId, cacheKey };
    showSecurePortal();
  }
}

function showSecurePortal() {
  const portal = document.getElementById('securePortal');
  const input = document.getElementById('birthYearInput');
  const error = document.getElementById('portalErr');

  if (portal && input && error) {
    portal.classList.add('active');
    input.value = '';
    error.textContent = '';
    error.style.display = 'none';

    setTimeout(() => input.focus(), 300);
  }
}

function closeSecurePortal() {
  const portal = document.getElementById('securePortal');
  if (portal) {
    portal.classList.remove('active');
  }
  currentDocumentContext = null;
}

async function verifyAndLoadDocument() {
  if (!currentDocumentContext) return;

  const input = document.getElementById('birthYearInput');
  const error = document.getElementById('portalErr');
  const loading = document.getElementById('pdfLoading');
  const btn = document.getElementById('verifyBtn');

  const birthYear = input.value.trim();

  if (!birthYear) {
    error.textContent = appState.translations.emptyBirthYear || 'Please enter your birth year';
    error.style.display = 'block';
    return;
  }

  // Check if this is download all mode or single document mode
  if (downloadAllMode) {
    await handleBatchDownload(birthYear, error, loading, btn);
  } else {
    await handleSingleDocument(birthYear, error, loading, btn);
  }
}

async function handleSingleDocument(birthYear, error, loading, btn) {
  // Show loading
  loading.style.display = 'block';
  btn.disabled = true;

  try {
    const url = `${CONFIG.API_URL}?action=getSecurePdf&spreadsheetId=${appState.spreadsheetId}&rowIndex=${currentDocumentContext.rowIndex}&docIndex=${currentDocumentContext.docIndex}&inputYear=${birthYear}&clientCode=${appState.clientCode}`;

    const response = await fetch(url);
    const result = await response.json();

    if (result.success && result.data) {
      // Cache the document
      await cacheDocument(currentDocumentContext.cacheKey, result.data);

      // Update cached IDs list
      appState.cachedDocIds = await getAllCachedDocumentIds();

      // Open document
      openPDFInNewTab(result.data);

      // Close portal
      closeSecurePortal();

      // Refresh UI to show updated offline badges
      renderItinerary();

      console.log('✅ Document cached successfully');
    } else {
      error.textContent = getErrorMessage(result.error);
      error.style.display = 'block';
    }
  } catch (err) {
    console.error('Document verification error:', err);
    error.textContent = appState.translations.connectionError || 'Connection error. Please try again.';
    error.style.display = 'block';
  } finally {
    loading.style.display = 'none';
    btn.disabled = false;
  }
}

async function handleBatchDownload(birthYear, error, loading, btn) {
  const allDocs = currentDocumentContext.allDocs;

  // Close portal
  closeSecurePortal();

  // Show progress on the download button
  const downloadBtn = document.querySelector('.btn-download-all');
  if (downloadBtn) {
    downloadBtn.textContent = `📥 Downloading... 0/${allDocs.length}`;
    downloadBtn.disabled = true;
  }

  let successCount = 0;
  let failCount = 0;

  // Download all documents
  for (let i = 0; i < allDocs.length; i++) {
    const doc = allDocs[i];

    try {
      const url = `${CONFIG.API_URL}?action=getSecurePdf&spreadsheetId=${appState.spreadsheetId}&rowIndex=${doc.rowIndex}&docIndex=${doc.docIndex}&inputYear=${birthYear}&clientCode=${appState.clientCode}`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        await cacheDocument(doc.cacheKey, result.data);
        successCount++;
        console.log(`✅ Cached document ${i + 1}/${allDocs.length}`);
      } else {
        failCount++;
        console.warn(`❌ Failed to cache document ${i + 1}:`, result.error);

        if (result.error === 'INVALID_VERIFICATION') {
          // Invalid birth year - stop immediately
          alert(appState.translations.invalidVerification || 'Invalid birth year. Download cancelled.');
          break;
        }
      }

      // Update progress
      if (downloadBtn) {
        downloadBtn.textContent = `📥 Downloading... ${i + 1}/${allDocs.length}`;
      }

    } catch (err) {
      failCount++;
      console.error(`❌ Error downloading document ${i + 1}:`, err);
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Update cached IDs list
  appState.cachedDocIds = await getAllCachedDocumentIds();

  // Show result
  const t = appState.translations;
  if (successCount > 0) {
    alert(`✅ ${t.downloadSuccess || 'Successfully downloaded'} ${successCount} ${t.documents || 'document'}${successCount > 1 ? 's' : ''} ${t.forOffline || 'for offline access'}!${failCount > 0 ? `\n⚠️ ${failCount} ${t.failed || 'failed'}.` : ''}`);
  } else {
    alert(`❌ ${t.downloadFailed || 'Failed to download documents'}. ${t.checkBirthYear || 'Please check your birth year and try again'}.`);
  }

  // Refresh UI
  renderItinerary();
}

async function downloadAllDocuments() {
  if (appState.isOffline) {
    const t = appState.translations;
    alert(t.connectionError || 'You must be online to download documents.');
    return;
  }

  // Collect all document references
  const allDocs = [];
  appState.data.forEach(row => {
    if (row['Doc Link']) {
      const docIds = row['Doc Link'].toString().split(/\n|,|;/).map(d => d.trim()).filter(Boolean);
      docIds.forEach((docId, i) => {
        const cacheKey = `${appState.spreadsheetId}_${row._rowIndex}_${i}`;
        if (!appState.cachedDocIds.includes(cacheKey)) {
          allDocs.push({
            rowIndex: row._rowIndex,
            docIndex: i,
            docId: docId,
            cacheKey: cacheKey
          });
        }
      });
    }
  });

  if (allDocs.length === 0) {
    const t = appState.translations;
    alert(t.allDocumentsCached || 'All documents are already cached offline!');
    return;
  }

  // Show verification portal in "download all" mode
  downloadAllMode = true;
  currentDocumentContext = { allDocs };
  showSecurePortal();
}

function openPDFInNewTab(base64Data) {
  try {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    // Check if iOS Safari (which has issues with blob URLs in window.open)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (isIOS) {
      // For iOS, create a download link and trigger it
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `document_${Date.now()}.pdf`;
      link.target = '_blank';

      // Trigger the link
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      // For other browsers, use window.open
      const newWindow = window.open(blobUrl, '_blank');

      if (!newWindow) {
        // Fallback if popup blocked
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `document_${Date.now()}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Clean up blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
  } catch (err) {
    console.error('Error opening PDF:', err);
    alert('Error opening document. Please try again.');
  }
}

function getErrorMessage(errorCode) {
  const t = appState.translations;
  const errorMap = {
    TOO_MANY_ATTEMPTS: t.tooManyAttempts || 'Too many attempts',
    INVALID_VERIFICATION: t.invalidVerification || 'Invalid verification',
    DOCUMENT_NOT_FOUND: t.documentNotFound || 'Document not found',
    SECURITY_ERROR: t.securityError || 'Security error',
    CONFIG_ERROR: t.configError || 'Configuration error',
    INVALID_SESSION: t.invalidSession || 'Invalid session'
  };
  return errorMap[errorCode] || (t.verificationFailed || 'Verification failed. Please try again.');
}
