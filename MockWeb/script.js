const API_KEY = "243a9812";
const container = document.getElementById("moviesContainer");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const homeBtn = document.getElementById("homeBtn");

// Curated top-earning titles (last year)
const topMovies = [
  "Oppenheimer",
  "Barbie",
  "Avatar",
  "John Wick",
  "Mission Impossible",
  "Fast X",
  "Guardians of the Galaxy",
  "The Batman",
  "Dune",
  "Spider-Man",
  "Aquaman",
  "Transformers",
  "Indiana Jones",
  "Wonka",
  "Napoleon",
  "The Marvels",
  "The Flash",
  "Creed",
  "The Hunger Games",
  "Trolls"
];

async function fetchTitle(title) {
  const res = await fetch(
    `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${API_KEY}&plot=full`
  );
  return res.json();
}

function createCard(data) {
  return `
    <div class="card movie-card shadow-sm">
      <div class="card-body">
        <h5 class="card-title">${data.Title}</h5>

        <h6 class="card-subtitle mb-2 text-muted">
          ${data.Year} • ${data.Type.toUpperCase()}
        </h6>

        <div class="summary">
          ${data.Plot !== "N/A" ? data.Plot : "Summary not available."}
        </div>

        <p class="mb-0">
          <strong>Box Office:</strong> ${data.BoxOffice || "N/A"}
        </p>
      </div>
    </div>
  `;
}

async function loadHomePage() {
  container.innerHTML = "";
  searchInput.value = "";

  for (let title of topMovies) {
    const data = await fetchTitle(title);
    if (data.Response === "True") {
      container.innerHTML += createCard(data);
    }
  }
}

// Search handler
searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  container.innerHTML = "";

  const data = await fetchTitle(query);
  if (data.Response === "True") {
    container.innerHTML = createCard(data);
  } else {
    container.innerHTML = `<p class="text-center">No results found.</p>`;
  }
});

// Home button click
homeBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadHomePage();
});

// Initial load
loadHomePage();