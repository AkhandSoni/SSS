// Popup.js - Manages the extension popup UI and settings

let settings = {
  enabled: true,
  blackoutMode: false,
  trackedSeries: [],
  sensitivity: 0.4,
  stats: {
    blockedToday: 0,
    lastReset: new Date().toDateString()
  }
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderUI();
  attachEventListeners();
});

// Load settings from storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'enabled',
      'blackoutMode',
      'trackedSeries',
      'sensitivity',
      'stats'
    ], (result) => {
      settings = {
        enabled: result.enabled !== false,
        blackoutMode: result.blackoutMode || false,
        trackedSeries: result.trackedSeries || [],
        sensitivity: result.sensitivity || 0.4,
        stats: result.stats || {
          blockedToday: 0,
          lastReset: new Date().toDateString()
        }
      };

      // Reset daily stats if new day
      const today = new Date().toDateString();
      if (settings.stats.lastReset !== today) {
        settings.stats.blockedToday = 0;
        settings.stats.lastReset = today;
        saveSettings();
      }

      resolve();
    });
  });
}

// Save settings to storage
async function saveSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      console.log('Settings saved:', settings);
      resolve();
    });
  });
}

// Render UI based on current settings
function renderUI() {
  // Enable toggle
  document.getElementById('enableToggle').checked = settings.enabled;

  // Sensitivity slider
  const sensitivityPercent = Math.round(settings.sensitivity * 100);
  document.getElementById('sensitivitySlider').value = sensitivityPercent;
  document.getElementById('sensitivityPercent').textContent = sensitivityPercent + '%';

  // Blackout mode button
  const blackoutBtn = document.getElementById('blackoutBtn');
  if (settings.blackoutMode) {
    blackoutBtn.classList.add('active');
    blackoutBtn.textContent = '⚫ BLACKOUT MODE ACTIVE';
  } else {
    blackoutBtn.classList.remove('active');
    blackoutBtn.textContent = '⚫ BLACKOUT MODE';
  }

  // Render series list
  renderSeriesList();

  // Update stats
  document.getElementById('blockedCount').textContent = settings.stats.blockedToday;
  document.getElementById('seriesCount').textContent = settings.trackedSeries.length;
}

// Render tracked series list
function renderSeriesList() {
  const seriesListEl = document.getElementById('seriesList');

  if (settings.trackedSeries.length === 0) {
    seriesListEl.innerHTML = `
      <div class="empty-state">
        📖 No series tracked yet<br>
        Add a series to start protecting your experience
      </div>
    `;
    return;
  }

  seriesListEl.innerHTML = settings.trackedSeries.map((series, index) => `
    <div class="series-item">
      <div class="series-header">
        <div class="series-name">${escapeHtml(series.name)}</div>
        <button class="delete-btn" data-index="${index}">Delete</button>
      </div>
    </div>
  `).join('');

  // Attach delete listeners
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      deleteSeries(index);
    });
  });
}

// Delete series
async function deleteSeries(index) {
  if (confirm('Are you sure you want to remove this series from tracking?')) {
    settings.trackedSeries.splice(index, 1);
    await saveSettings();
    renderUI();
    showNotification('Series removed');
  }
}

// Attach event listeners
function attachEventListeners() {
  // Enable toggle
  document.getElementById('enableToggle').addEventListener('change', async (e) => {
    settings.enabled = e.target.checked;
    await saveSettings();
    showNotification(settings.enabled ? 'Protection enabled' : 'Protection disabled');
  });

  // Sensitivity slider
  document.getElementById('sensitivitySlider').addEventListener('input', (e) => {
    const percent = parseInt(e.target.value);
    document.getElementById('sensitivityPercent').textContent = percent + '%';
    settings.sensitivity = percent / 100;
  });

  document.getElementById('sensitivitySlider').addEventListener('change', async () => {
    await saveSettings();
    showNotification('Sensitivity updated');
  });

  // Blackout mode
  document.getElementById('blackoutBtn').addEventListener('click', async () => {
    settings.blackoutMode = !settings.blackoutMode;
    await saveSettings();
    renderUI();
    showNotification(
      settings.blackoutMode 
        ? '⚫ Blackout mode activated - Maximum protection!' 
        : 'Blackout mode deactivated'
    );
  });

  // Add series button
  document.getElementById('addSeriesBtn').addEventListener('click', () => {
    document.getElementById('addSeriesForm').classList.add('active');
    document.getElementById('seriesName').focus();
  });

  // Cancel add series
  document.getElementById('cancelSeriesBtn').addEventListener('click', () => {
    document.getElementById('addSeriesForm').classList.remove('active');
    clearAddSeriesForm();
  });

  // Save series
  document.getElementById('saveSeriesBtn').addEventListener('click', async () => {
    const name = document.getElementById('seriesName').value.trim();

    if (!name) {
      alert('Please enter a series name');
      return;
    }

    // Create new series
    const newSeries = {
      name,
      addedDate: new Date().toISOString()
    };

    settings.trackedSeries.push(newSeries);
    await saveSettings();
    
    document.getElementById('addSeriesForm').classList.remove('active');
    clearAddSeriesForm();
    renderUI();
    showNotification(`Added "${name}" to Lore Vault!`);
  });

  // Enter key to save
  document.getElementById('addSeriesForm').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('saveSeriesBtn').click();
    }
  });
}

// Clear add series form
function clearAddSeriesForm() {
  document.getElementById('seriesName').value = '';
}

// Show notification
function showNotification(message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideDown 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove after 2 seconds
  setTimeout(() => {
    notification.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  @keyframes slideUp {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
  }
`;
document.head.appendChild(style);

// Listen for messages from content script (for stats updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'spoilerBlocked') {
    settings.stats.blockedToday++;
    saveSettings();
    document.getElementById('blockedCount').textContent = settings.stats.blockedToday;
  }
});