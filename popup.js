const API_KEY = "243a9812";

const input = document.getElementById("movieInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("moviesList");
const status = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");

let movies = [];

chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  render();
});

addBtn.onclick = async () => {
  const name = input.value.trim();
  if (!name) return;

  status.textContent = "Fetching from OMDb...";
  status.className = "status loading";

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${API_KEY}&t=${encodeURIComponent(name)}&plot=full`
    );
    const data = await res.json();

    if (data.Response === "False") throw new Error("Not found");

    const keywords = extractKeywords(data);

    movies.push({
      id: Date.now(),
      title: data.Title,
      year: data.Year,
      keywords
    });

    chrome.storage.local.set({ movies });
    input.value = "";
    status.textContent = "Added & blurring spoilers 🧊";
    status.className = "status success";
    render();
  } catch {
    status.textContent = "Movie not found";
    status.className = "status error";
  }
};

resetBtn.onclick = () => {
  movies = [];
  chrome.storage.local.clear();
  render();
};

function extractKeywords(data) {
  // Simplified: we only use movie title in content.js now, but keep keywords for future use
  const title = (data.Title || "").toLowerCase();
  const plot = (data.Plot || "").toLowerCase();
  
  const stopwords = new Set([
    "the", "and", "or", "for", "with", "from", "that", "this", "is", "are",
    "was", "were", "have", "has", "on", "in", "at", "to", "be", "by"
  ]);

  // Extract 5+ char words from plot, exclude stopwords
  const keywords = new Set();
  plot.split(/[^a-z0-9]+/)
    .filter(w => w.length >= 5 && !stopwords.has(w))
    .forEach(w => keywords.add(w));

  return Array.from(keywords);
}

function render() {
  list.innerHTML = "";

  if (!movies.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎥</div>
        <div class="empty-state-text">No movies added</div>
      </div>
    `;
    return;
  }

  movies.forEach(m => {
    const div = document.createElement("div");
    div.className = "movie-item";
    div.innerHTML = `
      <div class="movie-info">
        <div class="movie-title">${m.title}</div>
        <div class="movie-year">${m.year}</div>
      </div>
      <button class="remove-btn">×</button>
    `;

    div.querySelector("button").onclick = () => {
      movies = movies.filter(x => x.id !== m.id);
      chrome.storage.local.set({ movies });
      render();
    };

    list.appendChild(div);
  });
}