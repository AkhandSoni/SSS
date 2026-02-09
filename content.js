/* ===========================
   SCube – Content Script
   Google highlight safe
   No-keyword spoiler detection
   =========================== */

let movies = [];  // Store full movie list with titles
let scheduled = false;

/* Elements we must never touch */
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "CODE",
  "PRE"
]);

/* ---------------------------
   Load movie data
---------------------------- */
chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  console.log('[SCube] Loaded', movies.length, 'movies:', movies.map(m => m.title));
  scheduleScan();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.movies) {
    movies = changes.movies.newValue || [];
    console.log('[SCube] Movies updated:', movies.map(m => m.title));
    scheduleScan();
  }
});

/* ---------------------------
   Observe DOM (throttled)
---------------------------- */
const observer = new MutationObserver(() => scheduleScan());

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

function scheduleScan() {
  if (scheduled) return;
  scheduled = true;

  setTimeout(() => {
    scan(document.body);
    scheduled = false;
  }, 400);
}

/* ---------------------------
   Scan text nodes safely
---------------------------- */
function scan(root) {
  if (!movies.length) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip dangerous tags, but ALLOW <mark> and Google highlight spans
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;

        if (parent.classList.contains("scube-blur")) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node.nodeValue.trim().length < 10) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    processNodeWithContext(node);
  }
}

/* ---------------------------
   Context-aware processing
---------------------------- */
function processNodeWithContext(textNode) {
  const parent = textNode.parentElement;
  if (!parent) return;

  // Merge visible sibling text (handles Google highlights)
  let combinedText = "";
  let nodes = [];

  parent.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length) {
      combinedText += n.nodeValue;
      nodes.push(n);
    }
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "MARK") {
      combinedText += n.textContent;
      nodes.push(n);
    }
  });

  if (!combinedText) return;

  if (!isSpoilerSentence(combinedText)) return;

  // Replace only once per parent
  if (parent.querySelector(".scube-blur")) return;

  const span = document.createElement("span");
  span.className = "scube-blur";
  span.textContent = combinedText;

  let isHovering = false;
  let isMouseDown = false;

  span.addEventListener("mouseenter", () => {
    isHovering = true;
  });

  span.addEventListener("mouseleave", () => {
    isHovering = false;
    isMouseDown = false;
    span.classList.remove("reveal");
  });

  span.addEventListener("mousedown", () => {
    isMouseDown = true;
    if (isHovering && isMouseDown) {
      span.classList.add("reveal");
    }
  });

  span.addEventListener("mouseup", () => {
    isMouseDown = false;
    if (!isHovering) {
      span.classList.remove("reveal");
    }
  });

  // Remove original nodes
  nodes.forEach(n => parent.removeChild(n));
  parent.appendChild(span);
}

/* ---------------------------
   NO-KEYWORD spoiler logic
---------------------------- */
function isSpoilerSentence(text) {
  const lower = text.toLowerCase();

  // 1️⃣ MUST explicitly mention the movie title (exact match, case-insensitive)
  const mentionedMovies = movies.filter(m => lower.includes(m.title.toLowerCase()));
  if (mentionedMovies.length === 0) return false;

  // 2️⃣ Multiple indicators needed to reduce false positives:
  const hasPastTense = /\b(was|were|had|did)\b/i.test(text) || /\b\w+ed\b/.test(text);
  const hasSpoilerLanguage = /\b(ending|twist|reveal|death|secret|betrayal|spoiler|discovered)\b/i.test(text);
  const isLongEnough = text.length >= 50 && /[.!?]/.test(text);

  // 3️⃣ Must have: (past tense OR spoiler language) AND be long/proper sentence
  return (hasPastTense || hasSpoilerLanguage) && isLongEnough;
}