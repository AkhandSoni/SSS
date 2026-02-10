/* ===========================
   S³ – Content Script
   Google-safe spoiler blur
   No keywords, no API
   =========================== */

let movies = [];
let scheduled = false;

/* Never touch these */
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
   Load movies
---------------------------- */
chrome.storage.local.get(["movies"], (res) => {
  movies = res.movies || [];
  scheduleScan();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.movies) {
    const oldMovies = movies;
    movies = changes.movies.newValue || [];
    
    // Check which movies were disabled
    const disabledTitles = [];
    oldMovies.forEach(oldMovie => {
      const newMovie = movies.find(m => m.id === oldMovie.id);
      if (newMovie && oldMovie.enabled && !newMovie.enabled) {
        disabledTitles.push(oldMovie.title);
      }
    });
    
    if (disabledTitles.length > 0) {
      removeBlursForMovies(disabledTitles);
    }
    
    scheduleScan();
  }
});

/* ---------------------------
   Remove blurs for specific movies
---------------------------- */
function removeBlursForMovies(titles) {
  document.querySelectorAll('.scube-blur').forEach(blur => {
    blur.replaceWith(document.createTextNode(blur.textContent));
  });
}

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
   Scan text nodes
---------------------------- */
function scan(root) {
  const enabledMovies = movies.filter(m => m.enabled !== false);
  if (!enabledMovies.length) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest(".scube-blur")) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.trim().length < 30) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    processNode(node);
  }
}

/* ---------------------------
   Process node with proximity
---------------------------- */
function processNode(textNode) {
  const parent = textNode.parentElement;
  if (!parent) return;

  const sentenceObj = collectSentence(parent);
  if (!sentenceObj) return;

  if (!isSpoilerSentence(sentenceObj.text)) return;

  if (!isNearMovieTitle(parent)) return;

  if (parent.querySelector(".scube-blur")) return;

  applyBlur(parent, sentenceObj);
}

/* ---------------------------
   Sentence collector
---------------------------- */
function collectSentence(parent) {
  let text = "";
  let nodes = [];

  parent.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()) {
      text += n.nodeValue;
      nodes.push(n);
    }
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "MARK") {
      text += n.textContent;
      nodes.push(n);
    }
  });

  if (text.length < 40) return null;
  if (!/[.!?]/.test(text)) return null;

  return { text, nodes };
}

/* ---------------------------
   Movie proximity check
---------------------------- */
function isNearMovieTitle(startEl) {
  const enabledMovies = movies.filter(m => m.enabled !== false);
  const titles = enabledMovies.map(m => m.title.toLowerCase());

  let el = startEl;
  let scannedText = "";
  let steps = 0;

  while (el && steps < 12) {
    if (el.previousElementSibling) {
      el = el.previousElementSibling;
    } else {
      el = el.parentElement;
    }

    if (!el) break;

    if (el.innerText) {
      scannedText += " " + el.innerText.toLowerCase();
      if (titles.some(t => scannedText.includes(t))) {
        return true;
      }
    }

    steps++;
  }

  return false;
}

/* ---------------------------
   Apply blur (Enhanced with accessibility)
---------------------------- */
function applyBlur(parent, sentenceObj) {
  const { text, nodes } = sentenceObj;

  const span = document.createElement("span");
  span.className = "scube-blur";
  span.textContent = text;
  span.setAttribute('role', 'button');
  span.setAttribute('aria-label', 'Spoiler content - click to reveal');
  span.setAttribute('tabindex', '0');

  // Set the penguin background directly
  const penguinUrl = chrome.runtime.getURL("Penguin_gif.gif");
  span.style.backgroundImage = `url("${penguinUrl}")`;
  span.style.backgroundPosition = '-30px center';

  // CLICK TO REVEAL: Captures the click on the entire inline-block area
  span.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    revealSpoiler(span);
  });
  
  // POINTER DOWN for better touch/click capture
  span.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // KEYBOARD SUPPORT: Space or Enter to reveal
  span.addEventListener("keydown", (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      revealSpoiler(span);
    }
  });

  // HIDE ON LEAVE: Resets the penguin immediately
  span.addEventListener("mouseleave", () => {
    hideSpoiler(span);
  });

  nodes.forEach(n => parent.removeChild(n));
  parent.appendChild(span);
}

/* ---------------------------
   Reveal/Hide helper functions
---------------------------- */
function revealSpoiler(span) {
  span.classList.add("reveal");
  span.setAttribute('aria-label', 'Spoiler revealed');
}

function hideSpoiler(span) {
  span.classList.remove("reveal");
  span.setAttribute('aria-label', 'Spoiler content - click to reveal');
}

/* ---------------------------
   No-keyword spoiler logic
---------------------------- */
function isSpoilerSentence(text) {
  return (
    /\b(was|were|had|did)\b/i.test(text) ||
    /\b\w+ed\b/.test(text)
  );
}