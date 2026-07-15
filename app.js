const form = document.querySelector('#appeal-form');
const field = document.querySelector('#location');
const locationButton = document.querySelector('#location-button');
const suggestions = document.querySelector('#constituency-suggestions');
const toast = document.querySelector('#toast');
let toastTimer;

const modal = document.querySelector('#result-modal');
const modalConstituency = document.querySelector('#modal-constituency');
const modalState = document.querySelector('#modal-state');
const modalMp = document.querySelector('#modal-mp');
const modalStatus = document.querySelector('#modal-status');
const modalCloseBtn = document.querySelector('#modal-close-btn');
const modalActionBtn = document.querySelector('#modal-action-btn');

const CONSTITUENCY_GEOJSON = 'https://gist.githack.com/planemad/1e2b63f6b9806970db749f19980ffd25/raw/d0b13d1b8df9c4f9b88e16de1271661ff6b64923/india_pc_2024_simplified.geojson';
const PINDB_URL = 'pindb.json';
const MPDB_URL = 'mps_detail.json';
const TEMPLATE_URL = 'email_templates.json';

let constituencies = null;
let pindb = null;
let mpRecords = [];
let templateConfig = null;
let constituencyOptions = [];
let selectedMp = null;
let dbResolve;
const dbPromise = new Promise(resolve => { dbResolve = resolve; });

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function openModal(constituency, state, mp, status) {
  modalConstituency.textContent = constituency;
  modalState.textContent = state || 'Not available';
  modalMp.textContent = mp.mp_name;
  modalStatus.textContent = status;
  modalActionBtn.disabled = false;
  modal.classList.add('show');
  modal.style.display = 'flex';
}

function closeModal() {
  modal.classList.remove('show');
  setTimeout(() => {
    if (!modal.classList.contains('show')) modal.style.display = 'none';
  }, 300);
}

modalCloseBtn.addEventListener('click', closeModal);
modal.addEventListener('click', event => {
  if (event.target === modal) closeModal();
});
modalActionBtn.addEventListener('click', () => {
  if (selectedMp) openMailClient(selectedMp);
});

function cacheBoundingBoxes(features) {
  features.forEach(feature => { feature.bbox = turf.bbox(feature); });
}

function isPointInBBox(pointCoords, bbox) {
  return pointCoords[0] >= bbox[0] && pointCoords[1] >= bbox[1] &&
    pointCoords[0] <= bbox[2] && pointCoords[1] <= bbox[3];
}

function findMatchingConstituency(pointCoords) {
  if (!constituencies) return null;
  const point = turf.point(pointCoords);
  const candidates = constituencies.filter(feature => !feature.bbox || isPointInBBox(pointCoords, feature.bbox));
  return candidates.find(feature => turf.booleanPointInPolygon(point, feature));
}

function getName(feature) {
  const properties = feature.properties || {};
  const rawName = properties.PC_NAME || properties.pc_name || properties.name || 'Unknown constituency';
  return rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function getState(feature) {
  const properties = feature.properties || {};
  return properties.ST_NAME || properties.st_name || properties.state || properties.STATE || '';
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function buildConstituencyOptions() {
  const byConstituency = new Map();
  mpRecords.forEach(mp => {
    const key = `${normalizeText(mp.constituency)}|${normalizeText(mp.state)}`;
    if (key && !byConstituency.has(key)) {
      byConstituency.set(key, { constituency: mp.constituency, state: mp.state });
    }
  });
  constituencyOptions = [...byConstituency.values()]
    .sort((a, b) => a.constituency.localeCompare(b.constituency));
}

function hideSuggestions() {
  suggestions.hidden = true;
  suggestions.replaceChildren();
  field.removeAttribute('aria-activedescendant');
}

function renderSuggestions(query) {
  if (!/^[a-z]/i.test(query) || !constituencyOptions.length) {
    hideSuggestions();
    return;
  }
  const normalizedQuery = normalizeText(query);
  const matches = constituencyOptions
    .filter(option => normalizeText(option.constituency).includes(normalizedQuery))
    .slice(0, 8);
  suggestions.replaceChildren(...matches.map((option, index) => {
    const item = document.createElement('li');
    item.id = `suggestion-${index}`;
    item.role = 'option';
    item.tabIndex = -1;
    const name = document.createElement('strong');
    name.textContent = option.constituency;
    const state = document.createElement('span');
    state.textContent = option.state;
    item.append(name, state);
    item.addEventListener('mousedown', event => event.preventDefault());
    item.addEventListener('click', () => {
      field.value = option.constituency;
      hideSuggestions();
      runSearch(option.constituency, option.state);
    });
    return item;
  }));
  suggestions.hidden = matches.length === 0;
}

field.addEventListener('input', () => {
  if (/^\d/.test(field.value)) {
    hideSuggestions();
    field.value = field.value.replace(/\D/g, '').slice(0, 6);
    if (field.value.length === 6) runSearch();
    return;
  }
  renderSuggestions(field.value.trim());
});

field.addEventListener('focus', () => renderSuggestions(field.value.trim()));
document.addEventListener('click', event => {
  if (!event.target.closest('.search-control')) hideSuggestions();
});

async function fetchGeoJson() {
  let geoResponse = null;
  if ('caches' in window) {
    try {
      const cache = await caches.open('constituency-cache-v2');
      geoResponse = await cache.match(CONSTITUENCY_GEOJSON);
      if (!geoResponse) {
        await cache.add(CONSTITUENCY_GEOJSON);
        geoResponse = await cache.match(CONSTITUENCY_GEOJSON);
      }
    } catch (cacheErr) {
      console.warn('Cache API fallback:', cacheErr);
    }
  }
  if (!geoResponse) geoResponse = await fetch(CONSTITUENCY_GEOJSON);
  if (!geoResponse.ok) throw new Error('Network error loading map.');
  return geoResponse.json();
}

async function initPreload() {
  try {
    const [geoData, pinResponse, mpResponse, templateResponse] = await Promise.all([
      fetchGeoJson(), fetch(PINDB_URL), fetch(MPDB_URL), fetch(TEMPLATE_URL)
    ]);
    if (!pinResponse.ok || !mpResponse.ok || !templateResponse.ok) {
      throw new Error('Failed to load appeal data.');
    }
    constituencies = geoData.features;
    cacheBoundingBoxes(constituencies);
    pindb = await pinResponse.json();
    mpRecords = await mpResponse.json();
    templateConfig = await templateResponse.json();
    buildConstituencyOptions();
  } catch (error) {
    console.error('Error preloading data:', error);
  } finally {
    dbResolve();
  }
}

window.addEventListener('load', initPreload);

function findMp(constituency, state) {
  const normalized = normalizeText(constituency);
  const normalizedState = normalizeText(state);
  const matches = mpRecords.filter(mp => normalizeText(mp.constituency) === normalized ||
    normalizeText(mp.constituency).includes(normalized));
  return matches.find(mp => !normalizedState || normalizeText(mp.state) === normalizedState) || matches[0] || null;
}

function attendancePercent(mp) {
  if (mp.attendance === null || mp.attendance === undefined) return null;
  return Number(mp.attendance) / templateConfig.campaign.last_session_sittings * 100;
}

function ruleMatches(rule, mp) {
  const attendance = attendancePercent(mp);
  const questions = mp.questions_asked === null || mp.questions_asked === undefined
    ? null : Number(mp.questions_asked);
  if (rule.mpsno !== undefined && Number(mp.mpsno) !== Number(rule.mpsno)) return false;
  if (rule.is_minister !== undefined && Boolean(mp.is_minister) !== rule.is_minister) return false;
  if (rule.party !== undefined && mp.party !== rule.party) return false;
  if (rule.party_not !== undefined && mp.party === rule.party_not) return false;
  if (rule.attendance_lt !== undefined && (attendance === null || attendance >= rule.attendance_lt)) return false;
  if (rule.attendance_gte !== undefined && (attendance === null || attendance < rule.attendance_gte)) return false;
  if (rule.questions_eq !== undefined && questions !== rule.questions_eq) return false;
  if (rule.questions_gt !== undefined && (questions === null || questions <= rule.questions_gt)) return false;
  if (rule.questions_lte !== undefined && questions !== null && questions > rule.questions_lte) return false;
  return true;
}

function selectTemplate(mp) {
  const specialTemplateId = templateConfig.special_templates[String(mp.mpsno)];
  const templateId = specialTemplateId ||
    templateConfig.rules.find(rule => ruleMatches(rule, mp))?.template_id ||
    templateConfig.default_template_id;
  return templateConfig.templates.find(template => template.id === templateId);
}

function fastDay() {
  const [year, month, day] = templateConfig.campaign.protest_start_date.split('-').map(Number);
  const start = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function renderEmail(mp) {
  const template = selectTemplate(mp);
  if (!template) throw new Error('No email template is available for this MP.');
  const values = {
    mp_name: mp.mp_name,
    constituency: mp.constituency,
    party: mp.party || 'your party',
    attendance: mp.attendance ?? 'not available',
    questions: mp.questions_asked ?? 0,
    fast_day: fastDay()
  };
  const replaceTokens = text => text.replace(/\{([a-z_]+)\}/g,
    (_, token) => String(values[token] ?? `{${token}}`));
  return { subject: replaceTokens(template.subject), body: replaceTokens(template.body) };
}

function openMailClient(mp) {
  if (!mp) return;
  const recipient = mp.email_official || mp.email_personal;
  if (!recipient) {
    modalStatus.textContent = 'No email address is available for this MP.';
    showToast('No email address is available for this MP.');
    return;
  }
  const email = renderEmail(mp);
  modalStatus.textContent = 'Opening your email app...';
  window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  showToast(`Opening your email app for ${mp.mp_name}.`);
}

async function resolveConstituency(constituency, state) {
  const mp = findMp(constituency, state);
  if (!mp) throw new Error(`No MP record found for ${constituency}.`);
  selectedMp = mp;
  field.value = mp.constituency;
  openModal(mp.constituency, state || mp.state, mp, 'Opening your email app...');
  openMailClient(mp);
}

let isSearching = false;
async function runSearch(value = field.value.trim(), state) {
  if (isSearching) return;
  if (!value) {
    showToast('Enter your PIN code or constituency to begin.');
    field.focus();
    return;
  }
  isSearching = true;
  hideSuggestions();
  const appealBtn = document.querySelector('.appeal-button');
  const originalContent = appealBtn.innerHTML;
  appealBtn.disabled = true;
  appealBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin-pulse 1.5s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg> Loading...';
  try {
    await dbPromise;
    if (!constituencies || !pindb || !templateConfig || !mpRecords.length) {
      throw new Error('Appeal data could not be loaded. Please refresh the page.');
    }
    if (/^\d{6}$/.test(value)) {
      const entry = pindb[value];
      if (!entry) throw new Error('PIN code not found in our database.');
      const [lat, lon] = entry;
      const match = findMatchingConstituency([lon, lat]);
      if (!match) throw new Error('No constituency boundary found for this PIN code.');
      await resolveConstituency(getName(match), getState(match));
    } else {
      const mp = findMp(value, state);
      if (!mp) throw new Error('Constituency not found. Choose a suggestion or enter a 6-digit PIN code.');
      await resolveConstituency(mp.constituency, mp.state);
    }
  } catch (error) {
    showToast(error.message || 'Lookup failed.');
  } finally {
    appealBtn.innerHTML = originalContent;
    appealBtn.disabled = false;
    isSearching = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  runSearch();
});

locationButton.addEventListener('click', async () => {
  if (!navigator.geolocation) {
    showToast('GPS is not supported by this browser.');
    return;
  }
  locationButton.disabled = true;
  locationButton.setAttribute('aria-busy', 'true');
  showToast('Requesting your location...');
  await dbPromise;
  if (!constituencies || !mpRecords.length) {
    locationButton.disabled = false;
    locationButton.removeAttribute('aria-busy');
    showToast('Database could not be loaded. Please refresh the page.');
    return;
  }
  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    locationButton.disabled = false;
    locationButton.removeAttribute('aria-busy');
    const match = findMatchingConstituency([longitude, latitude]);
    if (match) {
      try {
        await resolveConstituency(getName(match), getState(match));
      } catch (error) {
        showToast(error.message);
      }
    } else {
      showToast('No constituency found for your location (you may be outside India).');
    }
  }, () => {
    locationButton.disabled = false;
    locationButton.removeAttribute('aria-busy');
    showToast('Location access was not available.');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
});
