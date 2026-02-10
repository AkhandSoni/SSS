const API_KEY = "243a9812";
const input = document.getElementById("movieInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("moviesList");
const statusBar = document.getElementById("status");
const statusText = statusBar.querySelector('.status-text');
const countBadge = document.getElementById("movieCount");
const toggleAllBtn = document.getElementById("toggleAllBtn");
const suggestionsBox = document.getElementById("suggestions");

let movies = [];
let searchTimeout;

chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  render();
});

// Helper function to refresh current tab
function refreshCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.reload(tabs[0].id);
    }
  });
}

// Helper function to update status
function setStatus(message, type = 'success') {
  statusText.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

// Autocomplete search
input.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  
  clearTimeout(searchTimeout);
  
  if (query.length < 2) {
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
    return;
  }
  
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (data.Response === "True" && data.Search) {
        showSuggestions(data.Search.slice(0, 5));
      } else {
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "none";
      }
    } catch (error) {
      suggestionsBox.innerHTML = "";
      suggestionsBox.style.display = "none";
    }
  }, 300);
});

function showSuggestions(results) {
  suggestionsBox.innerHTML = "";
  
  results.forEach(movie => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `
      <div class="sug-content">
        <span class="sug-title">${movie.Title}</span>
        <span class="sug-year">${movie.Year}</span>
      </div>
    `;
    
    item.onclick = () => {
      input.value = movie.Title;
      suggestionsBox.innerHTML = "";
      suggestionsBox.style.display = "none";
      addMovie();
    };
    
    suggestionsBox.appendChild(item);
  });
  
  suggestionsBox.style.display = "block";
}

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-section")) {
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
  }
});

async function addMovie() {
  const name = input.value.trim();
  if (!name) return;

  // Clear UI state for new request
  suggestionsBox.innerHTML = "";
  suggestionsBox.style.display = "none";

  addBtn.disabled = true;
  setStatus("Searching...", "loading");

  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&t=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (data.Response === "False") throw new Error();

    // Check for duplicates
    if (movies.some(m => m.title === data.Title)) {
      setStatus("Already protected", "");
    } else {
      // Add movie with default enabled state
      movies.push({ 
        id: Date.now(), 
        title: data.Title, 
        year: data.Year,
        enabled: true
      });

      chrome.storage.local.set({ movies }, () => {
        input.value = "";
        setStatus(`Protected: ${data.Title}`, "success");
        render();
        refreshCurrentTab();
      });
    }
  } catch {
    setStatus("Not found", "error");
  } finally {
    addBtn.disabled = false;
  }
}

addBtn.onclick = addMovie;

input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addMovie();
  }
});

document.getElementById("resetBtn").onclick = () => {
  if(confirm("Remove all protected content?")) {
    movies = [];
    chrome.storage.local.set({ movies }, () => {
      render();
      setStatus("All content cleared", "");
      refreshCurrentTab();
    });
  }
};

toggleAllBtn.onclick = () => {
  if (!movies.length) return;
  
  const allEnabled = movies.every(m => m.enabled !== false);
  
  movies.forEach(m => {
    m.enabled = !allEnabled;
  });
  
  chrome.storage.local.set({ movies }, () => {
    render();
    setStatus(allEnabled ? "All shields disabled" : "All shields enabled", allEnabled ? "" : "success");
    refreshCurrentTab();
  });
};

function toggleMovie(id) {
  const movie = movies.find(m => m.id === id);
  if (movie) {
    movie.enabled = !movie.enabled;
    chrome.storage.local.set({ movies }, () => {
      render();
      setStatus(movie.enabled ? `Enabled: ${movie.title}` : `Disabled: ${movie.title}`, movie.enabled ? "success" : "");
      refreshCurrentTab();
    });
  }
}

function render() {
  list.innerHTML = "";
  countBadge.textContent = movies.length;
  
  if (movies.length > 0) {
    const allEnabled = movies.every(m => m.enabled !== false);
    toggleAllBtn.classList.toggle('all-active', allEnabled);
  } else {
    toggleAllBtn.classList.remove('all-active');
  }

  if (!movies.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
        </svg>
        <p>No protected content yet</p>
      </div>
    `;
    return;
  }

  movies.forEach(m => {
    if (m.enabled === undefined) m.enabled = true;
    
    const card = document.createElement("div");
    card.className = "movie-card";
    card.innerHTML = `
      <div class="movie-info">
        <div class="m-title">${m.title}</div>
        <div class="m-year">${m.year}</div>
      </div>
      <div class="card-actions">
        <button class="toggle-btn ${m.enabled ? 'active' : ''}" title="${m.enabled ? 'Disable' : 'Enable'} Shield">
          ${m.enabled ? '✓' : '○'}
        </button>
        <button class="del-btn" title="Remove">×</button>
      </div>
    `;
    
    card.querySelector(".toggle-btn").onclick = () => toggleMovie(m.id);
    
    card.querySelector(".del-btn").onclick = () => {
      movies = movies.filter(x => x.id !== m.id);
      chrome.storage.local.set({ movies }, () => {
        render();
        setStatus(`Removed: ${m.title}`, "");
        refreshCurrentTab();
      });
    };
    
    list.appendChild(card);
  });
}