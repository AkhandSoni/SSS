const API_KEY = "243a9812";
const input = document.getElementById("movieInput");
const addBtn = document.getElementById("addBtn");
const list = document.getElementById("moviesList");
const status = document.getElementById("status");
const countBadge = document.getElementById("movieCount");

let movies = [];

chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  render();
});

addBtn.onclick = async () => {
  const name = input.value.trim();
  if (!name) return;

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
      movies.push({ id: Date.now(), title: data.Title, year: data.Year });
      chrome.storage.local.set({ movies });
      input.value = "";
      status.textContent = "SHIELD ACTIVE FOR: " + data.Title.toUpperCase();
      status.className = "status-bar success";
      render();
    }
  } catch {
    status.textContent = "PROTOCOL FAILED: MOVIE NOT FOUND";
    status.className = "status-bar error";
  } finally {
    addBtn.disabled = false;
  }
};

document.getElementById("resetBtn").onclick = () => {
  if(confirm("Purge all protection protocols?")) {
    movies = [];
    chrome.storage.local.set({ movies }, () => render());
  }
};

function render() {
  list.innerHTML = "";
  countBadge.textContent = movies.length;

  if (!movies.length) {
    list.innerHTML = `<div style="text-align:center; padding:40px; color:#444; font-size:12px;">NO ACTIVE SHIELDS</div>`;
    return;
  }

  movies.forEach(m => {
    const card = document.createElement("div");
    card.className = "movie-card";
    card.innerHTML = `
      <div>
        <span class="m-title">${m.title}</span>
        <span class="m-year">${m.year}</span>
      </div>
      <button class="del-btn">✕</button>
    `;
    card.querySelector(".del-btn").onclick = () => {
      movies = movies.filter(x => x.id !== m.id);
      chrome.storage.local.set({ movies }, () => render());
    };
    list.appendChild(card);
  });
}