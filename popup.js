const API_KEY = "243a9812";
const input = document.getElementById("movieInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("moviesList");
const status = document.getElementById("status");
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
        showSuggestions(data.Search.slice(0, 5)); // Show top 5 results
      } else {
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "none";
      }
    } catch (error) {
      suggestionsBox.innerHTML = "";
      suggestionsBox.style.display = "none";
    }
  }, 300); // Debounce 300ms
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
  if (!e.target.closest(".input-group")) {
    suggestionsBox.innerHTML = "";
    suggestionsBox.style.display = "none";
  }
});

async function addMovie() {
  const name = input.value.trim();
  if (!name) return;

  // Hide suggestions
  suggestionsBox.innerHTML = "";
  suggestionsBox.style.display = "none";

  addBtn.disabled = true;
  status.textContent = "SYNCHRONIZING WITH DATABASE...";
  status.className = "status-bar loading";

  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&t=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (data.Response === "False") throw new Error();

    if (movies.some(m => m.title === data.Title)) {
      status.textContent = "ALREADY PROTECTED";
      status.className = "status-bar error";
    } else {
      movies.push({ 
        id: Date.now(), 
        title: data.Title, 
        year: data.Year,
        enabled: true
      });
      chrome.storage.local.set({ movies }, () => {
        input.value = "";
        status.textContent = "SHIELD ACTIVE FOR: " + data.Title.toUpperCase();
        status.className = "status-bar success";
        render();
        refreshCurrentTab();
      });
    }
  } catch {
    status.textContent = "PROTOCOL FAILED: MOVIE NOT FOUND";
    status.className = "status-bar error";
  } finally {
    addBtn.disabled = false;
  }
}

addBtn.onclick = addMovie;

// This only triggers when Enter is pressed INSIDE the input field
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addMovie();
  }
});

document.getElementById("resetBtn").onclick = () => {
  if(confirm("Purge all protection protocols?")) {
    movies = [];
    chrome.storage.local.set({ movies }, () => {
      render();
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
    status.textContent = allEnabled ? "ALL SHIELDS DEACTIVATED" : "ALL SHIELDS ACTIVATED";
    status.className = allEnabled ? "status-bar error" : "status-bar success";
    refreshCurrentTab();
  });
};

function toggleMovie(id) {
  const movie = movies.find(m => m.id === id);
  if (movie) {
    movie.enabled = !movie.enabled;
    chrome.storage.local.set({ movies }, () => {
      render();
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
    list.innerHTML = `<div style="text-align:center; padding:40px; color:#444; font-size:12px;">NO ACTIVE SHIELDS</div>`;
    return;
  }

  movies.forEach(m => {
    if (m.enabled === undefined) m.enabled = true;
    
    const card = document.createElement("div");
    card.className = "movie-card";
    card.innerHTML = `
      <div>
        <span class="m-title">${m.title}</span>
        <span class="m-year">${m.year}</span>
      </div>
      <div class="card-actions">
        <button class="toggle-btn ${m.enabled ? 'active' : ''}" title="${m.enabled ? 'Disable' : 'Enable'} Shield">
          ${m.enabled ? '🛡️' : '⭕'}
        </button>
        <button class="del-btn">✕</button>
      </div>
    `;
    
    card.querySelector(".toggle-btn").onclick = () => toggleMovie(m.id);
    
    card.querySelector(".del-btn").onclick = () => {
      movies = movies.filter(x => x.id !== m.id);
      chrome.storage.local.set({ movies }, () => {
        render();
        refreshCurrentTab();
      });
    };
    
    list.appendChild(card);
  });
}