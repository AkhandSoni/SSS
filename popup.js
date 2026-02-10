const API_KEY = "243a9812";
const input = document.getElementById("movieInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("movieList"); // Fixed ID to match your HTML
const status = document.getElementById("status"); // Ensure this ID exists in your HTML if used

let movies = [];

// Initial load from storage
chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  render();
});

addBtn.onclick = async () => {
  const name = input.value.trim();
  if (!name) return;

  addBtn.disabled = true;
  
  // Checking for status bar element before updating
  if (status) {
    status.textContent = "SYNCHRONIZING WITH DATABASE...";
    status.className = "status-bar loading";
  }

  try {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${API_KEY}&t=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (data.Response === "False") throw new Error();

    // Prevent duplicates
    if (movies.some(m => m.title === data.Title)) {
      if (status) {
        status.textContent = "ALREADY PROTECTED";
        status.className = "status-bar error";
      }
    } else {
      movies.push({ id: Date.now(), title: data.Title, year: data.Year });
      chrome.storage.local.set({ movies }, () => {
        input.value = "";
        if (status) {
          status.textContent = "SHIELD ACTIVE FOR: " + data.Title.toUpperCase();
          status.className = "status-bar success";
        }
        render();
      });
    }
  } catch (err) {
    if (status) {
      status.textContent = "PROTOCOL FAILED: MOVIE NOT FOUND";
      status.className = "status-bar error";
    }
  } finally {
    addBtn.disabled = false;
  }
};

// Reset functionality
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.onclick = () => {
    if (confirm("Purge all protection protocols?")) {
      movies = [];
      chrome.storage.local.set({ movies }, () => render());
    }
  };
}

function render() {
  if (!list) return;
  list.innerHTML = "";

  // Update badge if it exists
  const countBadge = document.getElementById("movieCount");
  if (countBadge) {
    countBadge.textContent = movies.length;
  }

  if (!movies.length) {
    list.innerHTML = `<div style="text-align:center; padding:40px; opacity:0.5; font-size:12px;">NO ACTIVE SHIELDS</div>`;
    return;
  }

  // Create items using the classes from your modern CSS
  movies.forEach(m => {
    const item = document.createElement("div");
    item.className = "movie-item"; 
    item.innerHTML = `
      <div>
        <span style="display:block; font-weight:600;">${m.title}</span>
        <span style="font-size:11px; opacity:0.6;">${m.year}</span>
      </div>
      <button class="delete-btn" data-id="${m.id}">×</button>
    `;

    // Delete functionality
    item.querySelector(".delete-btn").onclick = (e) => {
      const idToDelete = Number(e.target.getAttribute("data-id"));
      movies = movies.filter(x => x.id !== idToDelete);
      chrome.storage.local.set({ movies }, () => render());
    };
    
    list.appendChild(item);
  });
}

// This listens to the entire page for any clicks on our spoilers
document.addEventListener('click', (event) => {
  // Find the closest element with our class (in case you click the padding)
  const spoiler = event.target.closest('.scube-blur');
  
  if (spoiler) {
    // If it's already revealed, don't do anything (or toggle back)
    spoiler.classList.toggle('reveal');
    
    // Prevent the click from triggering links or other page actions
    event.preventDefault();
    event.stopPropagation();
  }
}, true); // The 'true' ensures we catch the click before the website blocks it