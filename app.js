// ===============================
// CONFIGURATION
// ===============================
const CONFIG = {
  // Google Apps Script web app URL
  API_URL: 'https://script.google.com/macros/s/AKfycbwUgMk4gi8TFuBg1dTKkJYuk0--wV4rdu5U1buDZcHZv7nhQCeJT7vtQpKGqOE33qU4Eg/exec',
  CACHE_KEY: 'itinerary_cache',
  CACHE_VERSION: 'v1'
};

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
  isOffline: false
};

// ===============================
// INITIALIZATION
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get URL parameters
    const params = getURLParams();

    if (!params.client || !params.shid) {
      showError('Missing required parameters: client and shid');
      return;
    }

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

// ===============================
// DATA FETCHING
// ===============================
async function fetchFromAPI() {
  const url = `${CONFIG.API_URL}?client=${appState.clientCode}&shid=${appState.spreadsheetId}&lang=${appState.language}&format=json`;

  try {
    const response = await fetch(url);

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
    </header>

    ${renderSections()}
    ${renderCostSummary()}
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
  return `
    <div class="info-block flight-block">
      <div class="info-header">
        <div class="info-icon">✈️</div>
        <div class="info-title">
          ${safe(row['Hotel / Airline'])}
          <span class="connection-badge">${t.directFlight || 'Flight'}</span>
        </div>
      </div>
      <div class="info-grid">
        <div class="info-item"><span>${t.from}</span>${translateCity(row['Current Location'])}</div>
        <div class="info-item"><span>${t.to}</span>${translateCity(row['Destination'])}</div>
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

  return html + '</div>';
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

// ===============================
// UTILITY FUNCTIONS
// ===============================
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
