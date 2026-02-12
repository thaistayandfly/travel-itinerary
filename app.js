// ===============================
// CONFIGURATION
// ===============================
const CONFIG = {
  // Google Apps Script web app URL
  API_URL: 'https://script.google.com/macros/s/AKfycbxIy-khGEmI_o4trkap9Bq706KXqbeS6-lDUKYB6QUZu2V7qVLiAcRuu33lTuOKnfRtug/exec',
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

async function deleteDocument(cacheKey) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONFIG.DOCS_STORE], 'readwrite');
    const store = transaction.objectStore(CONFIG.DOCS_STORE);
    const request = store.delete(cacheKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clean up orphaned cache entries that no longer exist in current data
 * This prevents the cache counter from showing incorrect numbers
 */
async function cleanupOrphanedCache() {
  if (!appState.data || !appState.spreadsheetId) return;

  try {
    // Get all currently valid document cache keys from the data
    const validKeys = new Set();
    appState.data.forEach(row => {
      if (row['Doc Link']) {
        const docIds = row['Doc Link'].toString().split(/\n|,|;/).map(d => d.trim()).filter(Boolean);
        docIds.forEach((docId, i) => {
          const cacheKey = `${appState.spreadsheetId}_${row._rowIndex}_${i}`;
          validKeys.add(cacheKey);
        });
      }
    });

    // Get all cached keys
    const cachedKeys = await getAllCachedDocumentIds();

    // Find orphaned keys (cached but not in current data)
    const orphanedKeys = cachedKeys.filter(key => !validKeys.has(key));

    // Delete orphaned entries
    if (orphanedKeys.length > 0) {
      console.log(`🧹 Cleaning up ${orphanedKeys.length} orphaned cache entries`);
      for (const key of orphanedKeys) {
        await deleteDocument(key);
      }

      // Refresh cached doc IDs
      appState.cachedDocIds = await getAllCachedDocumentIds();
      console.log(`✅ Cache cleaned. ${appState.cachedDocIds.length} documents remain`);
    }
  } catch (error) {
    console.error('Error cleaning cache:', error);
  }
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

    // Safari PWA Fix: If we have query params but not hash params, convert to hash-based URL
    if (params.client && params.shid && window.location.search && !window.location.hash) {
      const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
      const hashParams = `client=${params.client}&shid=${params.shid}&lang=${params.lang}`;
      const newUrl = `${baseUrl}#${hashParams}`;
      console.log('🔄 Converting query params to hash params:', newUrl);
      window.location.replace(newUrl);
      return;
    }

    // If no URL parameters, check if we have saved parameters (for installed PWA)
    if (!params.client || !params.shid) {
      console.log('⚠️ Missing URL parameters, checking saved data...');
      const savedParams = await getSavedItineraryParams();

      if (savedParams && savedParams.client && savedParams.shid) {
        console.log('✅ Found saved parameters:', savedParams);

        // Check if we're in standalone mode (PWA installed)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
          || window.navigator.standalone
          || document.referrer.includes('android-app://');

        // Safari PWA Fix: Always redirect to hash-based URL to persist params in PWA mode
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
        const hashParams = `client=${savedParams.client}&shid=${savedParams.shid}&lang=${savedParams.lang || 'en'}`;
        const newUrl = `${baseUrl}#${hashParams}`;

        // Only redirect if we're not already at this URL
        const currentHash = window.location.hash.substring(1);
        if (currentHash !== hashParams) {
          console.log('🔄 Redirecting to hash-based URL:', newUrl);
          window.location.replace(newUrl);
          return;
        }

        // If we're already at the correct hash URL, use the params
        console.log('📱 Running in PWA mode with hash params');
        params.client = savedParams.client;
        params.shid = savedParams.shid;
        params.lang = savedParams.lang || 'en';
      } else {
        console.error('❌ No saved parameters found');

        // Safari-specific: Show helpful error with recovery option
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
          || window.navigator.standalone;

        if (isSafari && isStandalone) {
          // Safari PWA - show recovery UI
          showSafariPWARecoveryUI();
        } else {
          showError('Missing required parameters: client and shid');
        }
        return;
      }
    }

    // Save parameters for future use (when PWA is installed)
    console.log('💾 Saving parameters for PWA...');
    await saveItineraryParams(params);

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
  // Safari PWA Fix: Support both query params (?client=...) and hash params (#client=...)
  // Hash params are more persistent in Safari PWA mode

  let client = null;
  let shid = null;
  let lang = 'en';

  // Try hash parameters first (Safari PWA friendly)
  if (window.location.hash) {
    const hash = window.location.hash.substring(1); // Remove #
    const hashParams = new URLSearchParams(hash);

    client = hashParams.get('client');
    shid = hashParams.get('shid');
    lang = hashParams.get('lang') || 'en';

    if (client && shid) {
      console.log('📱 Loaded params from URL hash (Safari PWA mode)');
      return { client, shid, lang };
    }
  }

  // Fallback to query parameters (standard mode)
  const queryParams = new URLSearchParams(window.location.search);
  client = queryParams.get('client');
  shid = queryParams.get('shid');
  lang = queryParams.get('lang') || 'en';

  if (client && shid) {
    console.log('🔍 Loaded params from URL query');
  }

  return { client, shid, lang };
}

async function saveItineraryParams(params) {
  try {
    const paramsData = {
      client: params.client,
      shid: params.shid,
      lang: params.lang
    };

    // Save to localStorage (fast, synchronous)
    localStorage.setItem('itinerary_params', JSON.stringify(paramsData));
    console.log('✅ Saved to localStorage');

    // Save to IndexedDB (more persistent on iOS) - properly wrapped in Promise
    if (db) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG.DOCS_STORE], 'readwrite');
        const store = transaction.objectStore(CONFIG.DOCS_STORE);
        const request = store.put({
          id: '__app_params__',
          data: JSON.stringify(paramsData),
          timestamp: Date.now()
        });

        request.onsuccess = () => {
          console.log('✅ Saved to IndexedDB');
          resolve();
        };
        request.onerror = () => {
          console.error('❌ IndexedDB save failed:', request.error);
          reject(request.error);
        };

        // Also listen for transaction complete to ensure data is flushed
        transaction.oncomplete = () => {
          console.log('✅ IndexedDB transaction completed');
        };
      });
    }

    // Safari-specific: Also save to sessionStorage as backup
    sessionStorage.setItem('itinerary_params', JSON.stringify(paramsData));
    console.log('✅ Saved to sessionStorage (Safari backup)');

    // CRITICAL for Safari PWA: Save to Cache API (most persistent in PWA mode)
    if ('caches' in window) {
      try {
        const cache = await caches.open('itinerary-params-cache');
        const response = new Response(JSON.stringify(paramsData), {
          headers: { 'Content-Type': 'application/json' }
        });
        await cache.put('/params.json', response);
        console.log('✅ Saved to Cache API (Safari PWA)');
      } catch (cacheError) {
        console.warn('Cache API save failed:', cacheError);
      }
    }

    console.log('✅ Itinerary parameters saved for installed PWA (all storages)');
  } catch (error) {
    console.error('Failed to save itinerary params:', error);
  }
}

async function getSavedItineraryParams() {
  try {
    // CRITICAL for Safari PWA: Try Cache API FIRST (most persistent in PWA mode)
    if ('caches' in window) {
      try {
        const cache = await caches.open('itinerary-params-cache');
        const response = await cache.match('/params.json');
        if (response) {
          const data = await response.json();
          console.log('📱 Loaded params from Cache API (Safari PWA)');
          return data;
        }
      } catch (cacheError) {
        console.warn('Cache API read failed:', cacheError);
      }
    }

    // Try IndexedDB second (reliable on iOS browser mode)
    if (db) {
      try {
        const result = await new Promise((resolve, reject) => {
          const transaction = db.transaction([CONFIG.DOCS_STORE], 'readonly');
          const store = transaction.objectStore(CONFIG.DOCS_STORE);
          const request = store.get('__app_params__');

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        if (result && result.data) {
          console.log('📱 Loaded params from IndexedDB');
          return JSON.parse(result.data);
        }
      } catch (idbError) {
        console.warn('IndexedDB read failed:', idbError);
      }
    }

    // Fallback to localStorage
    const saved = localStorage.getItem('itinerary_params');
    if (saved) {
      console.log('📱 Loaded params from localStorage');
      return JSON.parse(saved);
    }

    // Safari-specific: Try sessionStorage as last resort
    const sessionSaved = sessionStorage.getItem('itinerary_params');
    if (sessionSaved) {
      console.log('📱 Loaded params from sessionStorage (Safari backup)');
      return JSON.parse(sessionSaved);
    }
  } catch (error) {
    console.error('Failed to load saved itinerary params:', error);
  }

  console.warn('⚠️ No saved parameters found in any storage');
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
    // Note: cache: 'no-store' + timestamp is sufficient. Custom headers trigger CORS preflight.
    const response = await fetch(url, {
      cache: 'no-store'
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

    // Clean up orphaned cached documents
    await cleanupOrphanedCache();

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
      await cleanupOrphanedCache();
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

  await cleanupOrphanedCache();

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

    <!-- Custom Notification Modal -->
    <div id="notificationModal" class="notification-modal">
      <div class="notification-sheet">
        <button class="notification-close" onclick="closeNotification()" aria-label="Close">×</button>
        <div class="notification-content">
          <div class="notification-icon-ring">
            <div id="notificationIcon" class="notification-icon"></div>
          </div>
          <h3 id="notificationTitle" class="notification-title"></h3>
          <p id="notificationMessage" class="notification-message"></p>
          <button id="notificationBtn" class="notification-btn" onclick="closeNotification()">OK</button>
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

// Setup PWA from pasted URL
async function setupPWAFromURL() {
  const input = document.getElementById('setupUrlInput');
  const continueBtn = document.getElementById('setupContinueBtn');
  const cancelBtn = document.getElementById('setupCancelBtn');

  if (!input) {
    console.error('Setup input not found');
    return;
  }

  const url = input.value.trim();
  if (!url) {
    alert('Please paste your itinerary URL');
    return;
  }

  // Show loading state
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.innerHTML = '⏳ Setting up...';
  }
  if (cancelBtn) {
    cancelBtn.disabled = true;
  }
  if (input) {
    input.disabled = true;
  }

  try {
    // Extract parameters from the URL (works with both ? and # formats)
    const urlObj = new URL(url);
    let client = null;
    let shid = null;
    let lang = 'en';

    // Try hash params first
    if (urlObj.hash) {
      const hash = urlObj.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      client = hashParams.get('client');
      shid = hashParams.get('shid');
      lang = hashParams.get('lang') || 'en';
    }

    // Fallback to query params
    if (!client || !shid) {
      client = urlObj.searchParams.get('client');
      shid = urlObj.searchParams.get('shid');
      lang = urlObj.searchParams.get('lang') || 'en';
    }

    if (!client || !shid) {
      alert('Invalid URL. Please make sure you copied the complete itinerary link.');
      // Reset button state
      if (continueBtn) {
        continueBtn.disabled = false;
        continueBtn.innerHTML = 'Continue';
      }
      if (cancelBtn) cancelBtn.disabled = false;
      if (input) input.disabled = false;
      return;
    }

    console.log('✅ Extracted params:', { client, shid, lang });

    // Update button to show saving state
    if (continueBtn) {
      continueBtn.innerHTML = '💾 Saving...';
    }

    // Save parameters
    await saveItineraryParams({ client, shid, lang });
    console.log('💾 Parameters saved successfully');

    // Update button to show redirect state
    if (continueBtn) {
      continueBtn.innerHTML = '🔄 Loading itinerary...';
    }

    // Small delay to ensure saves are flushed
    await new Promise(resolve => setTimeout(resolve, 500));

    // Redirect to hash-based URL - this will reload the page
    const baseUrl = window.location.origin + window.location.pathname;
    const newUrl = `${baseUrl}#client=${client}&shid=${shid}&lang=${lang}`;
    console.log('🔄 Redirecting to:', newUrl);

    // Force reload to ensure everything is fresh
    window.location.href = newUrl;

    // Fallback: If redirect didn't work, manually reload after short delay
    setTimeout(() => {
      window.location.reload();
    }, 1000);

  } catch (error) {
    console.error('URL parsing error:', error);
    alert('Invalid URL format. Please paste the complete itinerary link.');

    // Reset button state on error
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.innerHTML = 'Continue';
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (input) input.disabled = false;
  }
}

function showSafariPWARecoveryUI() {
  const loading = document.getElementById('loadingScreen');
  const errorScreen = document.getElementById('errorScreen');
  const errorMessage = document.getElementById('errorMessage');

  loading.style.display = 'none';
  errorScreen.style.display = 'flex';

  // Safari PWA setup screen - ask user to paste their URL
  errorMessage.innerHTML = `
    <div style="text-align: center; max-width: 500px; margin: 0 auto;">
      <h3 style="margin-bottom: 15px;">📲 Setup Required</h3>
      <p style="margin-bottom: 20px; color: #666;">
        To use this app from your home screen, please paste your itinerary URL below:
      </p>

      <input
        type="text"
        id="setupUrlInput"
        placeholder="Paste your itinerary link here..."
        style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 15px;"
      />

      <button
        id="setupContinueBtn"
        class="btn btn-primary"
        style="width: 100%; padding: 12px; font-size: 16px; margin-bottom: 10px;"
      >
        Continue
      </button>

      <button
        id="setupCancelBtn"
        class="btn btn-secondary"
        style="width: 100%; padding: 12px; font-size: 16px;"
      >
        Cancel
      </button>

      <p style="margin-top: 20px; font-size: 12px; color: #999;">
        💡 Tip: Copy your itinerary URL from the email or message you received
      </p>
    </div>
  `;

  // Add event listeners (Safari doesn't like inline onclick in innerHTML)
  setTimeout(() => {
    const input = document.getElementById('setupUrlInput');
    const continueBtn = document.getElementById('setupContinueBtn');
    const cancelBtn = document.getElementById('setupCancelBtn');

    if (input) {
      input.focus();
      // Allow pressing Enter to continue
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          setupPWAFromURL();
        }
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', setupPWAFromURL);
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Try to go back or close
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.close();
        }
      });
    }
  }, 100);
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
  const btn = document.getElementById('verifyBtn');
  const t = appState.translations;

  if (portal && input && error) {
    portal.classList.add('active');
    input.value = '';
    error.textContent = '';
    error.style.display = 'none';

    // Update button text based on mode
    if (btn) {
      if (downloadAllMode) {
        btn.textContent = t.startDownload || 'Start Download';
      } else {
        btn.textContent = t.unlockDocument || 'Unlock Document';
      }
    }

    // Add keyboard shortcuts
    setupPortalKeyboardShortcuts();

    // Add backdrop click handler
    setupPortalBackdropClick();

    setTimeout(() => input.focus(), 300);
  }
}

function closeSecurePortal() {
  const portal = document.getElementById('securePortal');
  if (portal) {
    portal.classList.remove('active');

    // Remove event listeners
    document.removeEventListener('keydown', handlePortalEscapeKey);
    portal.removeEventListener('click', handlePortalBackdropClick);
  }
  currentDocumentContext = null;
}

// Handle ESC key to close portal
function handlePortalEscapeKey(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    closeSecurePortal();
  }
}

// Handle Enter key to trigger verification
function handlePortalEnterKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    verifyAndLoadDocument();
  }
}

// Handle clicking outside the modal to close it
function handlePortalBackdropClick(e) {
  // Only close if clicking directly on the portal backdrop, not the sheet
  if (e.target.id === 'securePortal') {
    closeSecurePortal();
  }
}

// Setup keyboard shortcuts for the portal
function setupPortalKeyboardShortcuts() {
  const input = document.getElementById('birthYearInput');

  // ESC key to close (document level)
  document.addEventListener('keydown', handlePortalEscapeKey);

  // ENTER key to submit (on input field)
  if (input) {
    input.addEventListener('keydown', handlePortalEnterKey);
  }
}

// Setup backdrop click to close
function setupPortalBackdropClick() {
  const portal = document.getElementById('securePortal');
  if (portal) {
    portal.addEventListener('click', handlePortalBackdropClick);
  }
}

// ===============================
// CUSTOM NOTIFICATION MODAL
// ===============================
function showNotification(title, message, type = 'success') {
  const modal = document.getElementById('notificationModal');
  const icon = document.getElementById('notificationIcon');
  const titleEl = document.getElementById('notificationTitle');
  const messageEl = document.getElementById('notificationMessage');
  const iconRing = modal.querySelector('.notification-icon-ring');

  // Set content
  titleEl.textContent = title;
  messageEl.textContent = message;

  // Set icon and styling based on type
  if (type === 'success') {
    icon.textContent = '✅';
    iconRing.style.background = 'rgba(34,197,94,0.15)';
  } else if (type === 'error') {
    icon.textContent = '⚠️';
    iconRing.style.background = 'rgba(239,68,68,0.15)';
  } else if (type === 'info') {
    icon.textContent = 'ℹ️';
    iconRing.style.background = 'rgba(59,130,246,0.15)';
  }

  // Show modal
  modal.classList.add('active');

  // Add keyboard and backdrop listeners
  setupNotificationListeners();
}

function closeNotification() {
  const modal = document.getElementById('notificationModal');
  if (modal) {
    modal.classList.remove('active');

    // Remove event listeners
    document.removeEventListener('keydown', handleNotificationEscapeKey);
    modal.removeEventListener('click', handleNotificationBackdropClick);
  }
}

function handleNotificationEscapeKey(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    closeNotification();
  }
}

function handleNotificationBackdropClick(e) {
  if (e.target.id === 'notificationModal') {
    closeNotification();
  }
}

function setupNotificationListeners() {
  const modal = document.getElementById('notificationModal');

  // ESC key to close
  document.addEventListener('keydown', handleNotificationEscapeKey);

  // Click outside to close
  if (modal) {
    modal.addEventListener('click', handleNotificationBackdropClick);
  }
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
  const t = appState.translations;

  // Close portal
  closeSecurePortal();

  // Show progress on the download button
  const downloadBtn = document.querySelector('.btn-download-all');
  if (downloadBtn) {
    downloadBtn.textContent = `📥 ${t.downloading || 'Downloading'}... 0/${allDocs.length}`;
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
          showNotification(
            appState.translations.securityError || 'Verification Failed',
            appState.translations.invalidVerification || 'Invalid birth year. Download cancelled.',
            'error'
          );
          break;
        }
      }

      // Update progress
      if (downloadBtn) {
        downloadBtn.textContent = `📥 ${t.downloading || 'Downloading'}... ${i + 1}/${allDocs.length}`;
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
  if (successCount > 0) {
    // Only add 's' for English plural, Hebrew already has plural form
    const pluralSuffix = (successCount > 1 && appState.language === 'en') ? 's' : '';
    const message = `${t.downloadSuccess || 'Successfully downloaded'} ${successCount} ${t.documents || 'document'}${pluralSuffix} ${t.forOffline || 'for offline access'}!${failCount > 0 ? `\n\n⚠️ ${failCount} ${t.failed || 'failed'}.` : ''}`;
    showNotification(
      '✅ ' + (t.downloadSuccess || 'Download Complete'),
      message,
      failCount > 0 ? 'info' : 'success'
    );
  } else {
    showNotification(
      t.downloadFailed || 'Download Failed',
      t.checkBirthYear || 'Please check your birth year and try again.',
      'error'
    );
  }

  // Refresh UI
  renderItinerary();
}

async function downloadAllDocuments() {
  if (appState.isOffline) {
    const t = appState.translations;
    showNotification(
      t.offlineMode || 'Offline Mode',
      t.connectionError || 'You must be online to download documents.',
      'error'
    );
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
    showNotification(
      '✅ ' + (t.allDocumentsOffline || 'All Set'),
      t.allDocumentsCached || 'All documents are already cached offline!',
      'success'
    );
    return;
  }

  // Show verification portal in "download all" mode
  downloadAllMode = true;
  currentDocumentContext = { allDocs };
  showSecurePortal();
}

function openPDFInNewTab(base64Data) {
  try {
    // Use PDF.js viewer for all browsers
    // This provides consistent experience, no popup blockers, and full control
    createPDFJSViewer(base64Data);
  } catch (err) {
    console.error('Error opening PDF:', err);
    showNotification(
      'Error',
      'Error opening document. Please try again.',
      'error'
    );
  }
}

function createMobilePDFViewer(pdfUrl) {
  // Create full-screen PDF viewer overlay
  const viewer = document.createElement('div');
  viewer.id = 'pdfViewer';
  viewer.style.cssText = `
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 99999;
    display: flex;
    flex-direction: column;
  `;

  // Check if it's a blob URL (needs cleanup) or data URI (no cleanup needed)
  const isBlobUrl = pdfUrl.startsWith('blob:');

  // Create header with close button
  const header = document.createElement('div');
  header.style.cssText = `
    background: #1c1f24;
    color: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
  `;

  const title = document.createElement('span');
  title.textContent = 'Document';
  title.style.cssText = 'font-weight: 600;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    padding: 8px;
    cursor: pointer;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
  `;
  closeBtn.onclick = () => {
    document.body.removeChild(viewer);
    // Only revoke blob URLs, not data URIs
    if (isBlobUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create iframe with proper HTML wrapper for PDF
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    flex: 1;
    border: none;
    width: 100%;
    height: 100%;
    background: white;
  `;

  // For data URIs, wrap in proper HTML document
  if (pdfUrl.startsWith('data:')) {
    // Create an HTML wrapper that properly embeds the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          object {
            width: 100%;
            height: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <object data="${pdfUrl}" type="application/pdf" width="100%" height="100%">
          <p>Unable to display PDF. Your browser does not support embedded PDFs.</p>
        </object>
      </body>
      </html>
    `;

    // Create a data URI for the HTML wrapper
    const htmlDataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    iframe.src = htmlDataUri;
  } else {
    // For blob URLs, use directly
    iframe.src = pdfUrl;
  }

  viewer.appendChild(header);
  viewer.appendChild(iframe);
  document.body.appendChild(viewer);

  // Add ESC key listener
  const handleEsc = (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      document.body.removeChild(viewer);
      // Only revoke blob URLs, not data URIs
      if (isBlobUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// Universal PDF.js viewer for all browsers and devices
async function createPDFJSViewer(base64Data) {
  let viewer = null;

  try {
    // Check if PDF.js is loaded
    if (typeof pdfjsLib === 'undefined') {
      console.error('PDF.js library not loaded');
      throw new Error('PDF viewer library not available');
    }

    console.log('Creating PDF.js viewer...');

    // Create full-screen viewer overlay
    viewer = document.createElement('div');
    viewer.id = 'pdfJsViewer';
    viewer.style.cssText = `
      position: fixed;
      inset: 0;
      background: #1c1f24;
      z-index: 99999;
      display: flex;
      flex-direction: column;
    `;

    // Create header with controls
    const header = document.createElement('div');
    header.style.cssText = `
      background: #2a2d34;
      color: white;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 56px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      flex-shrink: 0;
    `;

    const title = document.createElement('span');
    title.textContent = 'Document';
    title.style.cssText = 'font-weight: 600; font-size: 16px;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; align-items: center; gap: 12px;';

    // Page navigation
    const pageInfo = document.createElement('span');
    pageInfo.id = 'pdfPageInfo';
    pageInfo.style.cssText = 'font-size: 14px; color: #aaa; min-width: 60px; text-align: center;';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀';
    prevBtn.style.cssText = `
      background: #3a3d44;
      border: none;
      color: white;
      font-size: 16px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: opacity 0.2s;
    `;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '▶';
    nextBtn.style.cssText = prevBtn.style.cssText;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      padding: 8px;
      cursor: pointer;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    `;

    controls.appendChild(prevBtn);
    controls.appendChild(pageInfo);
    controls.appendChild(nextBtn);
    controls.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(controls);

    // Create canvas container with scrolling
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      background: #1c1f24;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 20px;
      -webkit-overflow-scrolling: touch;
    `;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      max-width: 100%;
      height: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      background: white;
      display: block;
    `;

    canvasContainer.appendChild(canvas);
    viewer.appendChild(header);
    viewer.appendChild(canvasContainer);
    document.body.appendChild(viewer);

    console.log('Loading PDF document...');

    // Convert base64 to Uint8Array (proper binary format for PDF.js)
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Load PDF with Uint8Array (same as working example)
    const loadingTask = pdfjsLib.getDocument({ data: bytes });

    const pdf = await loadingTask.promise;
    console.log(`PDF loaded: ${pdf.numPages} pages`);

    let currentPage = 1;
    const numPages = pdf.numPages;

    async function renderPage(pageNum) {
      try {
        console.log(`Rendering page ${pageNum}...`);
        const page = await pdf.getPage(pageNum);

        // Calculate scale to fit container width (responsive)
        const containerWidth = window.innerWidth - 40; // Account for padding
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / baseViewport.width, 2.0); // Cap at 2x

        // Use simple scaling like working example
        const viewport = page.getViewport({ scale: scale });

        // Set canvas size directly to viewport (same as working example)
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        console.log(`Canvas: ${canvas.width}x${canvas.height}`);

        // Get rendering context
        const ctx = canvas.getContext('2d');

        // Render the PDF page (simple, like working example)
        await page.render({
          canvasContext: ctx,
          viewport: viewport
        }).promise;

        console.log(`Page ${pageNum} rendered successfully`);

        // Update UI
        pageInfo.textContent = `${pageNum} / ${numPages}`;
        prevBtn.disabled = pageNum === 1;
        nextBtn.disabled = pageNum === numPages;

        // Visual feedback for disabled buttons
        prevBtn.style.opacity = pageNum === 1 ? '0.3' : '1';
        prevBtn.style.cursor = pageNum === 1 ? 'default' : 'pointer';
        nextBtn.style.opacity = pageNum === numPages ? '0.3' : '1';
        nextBtn.style.cursor = pageNum === numPages ? 'default' : 'pointer';

      } catch (renderErr) {
        console.error(`Error rendering page ${pageNum}:`, renderErr);
        throw renderErr;
      }
    }

    // Initial render
    await renderPage(currentPage);

    // Navigation handlers
    prevBtn.onclick = async () => {
      if (currentPage > 1) {
        currentPage--;
        await renderPage(currentPage);
        canvasContainer.scrollTop = 0;
      }
    };

    nextBtn.onclick = async () => {
      if (currentPage < numPages) {
        currentPage++;
        await renderPage(currentPage);
        canvasContainer.scrollTop = 0;
      }
    };

    const cleanup = () => {
      if (viewer && viewer.parentNode) {
        document.body.removeChild(viewer);
      }
      document.removeEventListener('keydown', handleKeys);
    };

    closeBtn.onclick = cleanup;

    // Keyboard navigation
    const handleKeys = async (e) => {
      try {
        if (e.key === 'Escape' || e.key === 'Esc') {
          cleanup();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          if (currentPage > 1) {
            currentPage--;
            await renderPage(currentPage);
            canvasContainer.scrollTop = 0;
          }
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          if (currentPage < numPages) {
            currentPage++;
            await renderPage(currentPage);
            canvasContainer.scrollTop = 0;
          }
        }
      } catch (navErr) {
        console.error('Navigation error:', navErr);
      }
    };

    document.addEventListener('keydown', handleKeys);

  } catch (err) {
    console.error('PDF.js viewer error:', err);

    // Clean up viewer if it was created
    if (viewer && viewer.parentNode) {
      document.body.removeChild(viewer);
    }

    // Show user-friendly error
    showNotification(
      'Error',
      'Unable to load PDF document. Please try again.',
      'error'
    );
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
