// popup.js – Semantic Spoiler Shield (zero-shot AI version)

const SETTINGS = {
  enabled:        'sss_enabled',
  blackoutMode:   'sss_blackout',
  trackedSeries:  'sss_tracked_series',
  sensitivity:    'sss_sensitivity',
  stats:          'sss_stats'
};

let state = {
  enabled: true,
  blackoutMode: false,
  trackedSeries: [],
  sensitivity: 0.5,
  stats: { blockedToday: 0, lastReset: new Date().toDateString() }
};

const statusEl = () => document.getElementById('statusText');

// ─── Broadcast current settings to active tab ────────────────────────────────
async function pushSettingsToContentScript() {
  statusEl().textContent = 'Syncing…';
  statusEl().className = 'control-description syncing';

  try {
    const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
    if (!tab?.id) throw new Error('no active tab');

    chrome.tabs.sendMessage(tab.id, {
      action: 'settingsUpdated',
      enabled: state.enabled,
      sensitivity: state.sensitivity,
      trackedSeries: state.trackedSeries
    }, () => {
      if (chrome.runtime.lastError) {
        statusEl().textContent = 'Waiting for page…';
      } else {
        statusEl().textContent = state.enabled ? 'Active ✓' : 'Paused';
        statusEl().className = 'control-description ' + (state.enabled ? 'ready' : 'paused');
      }
    });
  } catch (err) {
    console.warn('Cannot sync settings right now', err);
    statusEl().textContent = 'Sync error';
  }
}

// ─── Load from chrome.storage.sync ───────────────────────────────────────────
async function load() {
  const data = await new Promise(r => chrome.storage.sync.get(Object.values(SETTINGS), r));

  state.enabled        = data[SETTINGS.enabled]        !== false;
  state.blackoutMode   = !!data[SETTINGS.blackoutMode];
  state.trackedSeries  = data[SETTINGS.trackedSeries]  || [];
  state.sensitivity    = Number(data[SETTINGS.sensitivity]) || 0.5;
  state.stats          = data[SETTINGS.stats] || { blockedToday:0, lastReset:new Date().toDateString() };

  const today = new Date().toDateString();
  if (state.stats.lastReset !== today) {
    state.stats.blockedToday = 0;
    state.stats.lastReset = today;
    chrome.storage.sync.set({ [SETTINGS.stats]: state.stats });
  }
}

// ─── Save + push to content script ───────────────────────────────────────────
async function save() {
  await chrome.storage.sync.set({
    [SETTINGS.enabled]:       state.enabled,
    [SETTINGS.blackoutMode]:  state.blackoutMode,
    [SETTINGS.trackedSeries]: state.trackedSeries,
    [SETTINGS.sensitivity]:   state.sensitivity,
    [SETTINGS.stats]:         state.stats
  });
  await pushSettingsToContentScript();
}

// ─── UI rendering ─────────────────────────────────────────────────────────────
function render() {
  document.getElementById('enableToggle').checked = state.enabled;

  const pct = Math.round(state.sensitivity * 100);
  document.getElementById('sensitivitySlider').value = pct;
  document.getElementById('sensitivityPercent').textContent = pct + '%';

  const btn = document.getElementById('blackoutBtn');
  btn.classList.toggle('active', state.blackoutMode);
  btn.textContent = state.blackoutMode ? '⚫ BLACKOUT ACTIVE' : '⚫ BLACKOUT MODE';

  renderSeriesList();

  document.getElementById('blockedCount').textContent = state.stats.blockedToday;
  document.getElementById('seriesCount').textContent  = state.trackedSeries.length;

  statusEl().textContent = state.enabled ? 'Active' : 'Paused';
  statusEl().className = 'control-description ' + (state.enabled ? 'ready' : 'paused');
}

function renderSeriesList() {
  const container = document.getElementById('seriesList');

  if (state.trackedSeries.length === 0) {
    container.innerHTML = `<div class="empty-state">No series protected yet<br>Add one to start AI shielding</div>`;
    return;
  }

  container.innerHTML = state.trackedSeries.map((s, i) => `
    <div class="series-item">
      <div class="series-header">
        <div class="series-name">${escapeHtml(s.name)}</div>
        <button class="delete-btn" data-idx="${i}">Delete</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.delete-btn').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.idx);
      if (confirm('Remove this series?')) {
        state.trackedSeries.splice(idx, 1);
        save().then(render);
      }
    });
  });
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('enableToggle').onchange = e => {
    state.enabled = e.target.checked;
    save();
  };

  document.getElementById('sensitivitySlider').oninput = e => {
    const v = e.target.value;
    document.getElementById('sensitivityPercent').textContent = v + '%';
    state.sensitivity = v / 100;
  };
  document.getElementById('sensitivitySlider').onchange = save;

  document.getElementById('blackoutBtn').onclick = () => {
    state.blackoutMode = !state.blackoutMode;
    save();
    render();
  };

  document.getElementById('addSeriesBtn').onclick = () => {
    document.getElementById('addSeriesForm').classList.add('active');
    document.getElementById('seriesName').focus();
  };

  document.getElementById('cancelSeriesBtn').onclick = () => {
    document.getElementById('addSeriesForm').classList.remove('active');
    document.getElementById('seriesName').value = '';
  };

  document.getElementById('saveSeriesBtn').onclick = async () => {
    const name = document.getElementById('seriesName').value.trim();
    if (!name) return alert('Please enter a name');

    state.trackedSeries.push({
      name,
      added: new Date().toISOString()
    });

    await save();
    document.getElementById('addSeriesForm').classList.remove('active');
    document.getElementById('seriesName').value = '';
    render();
  };

  // Stats increment from content script
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'spoilerBlocked') {
      state.stats.blockedToday++;
      save().then(() => {
        document.getElementById('blockedCount').textContent = state.stats.blockedToday;
      });
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await load();
  render();
  bindEvents();
  await pushSettingsToContentScript();  // initial sync
});

// Minimal XSS escape
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}