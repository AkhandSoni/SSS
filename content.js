/* ===========================
   SCube – Content Script
   Google highlight safe
   No-keyword spoiler detection
   =========================== */

let movies = [];
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
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".scube-blur")) return NodeFilter.FILTER_REJECT;
        if (node.nodeValue.trim().length < 30) return NodeFilter.FILTER_REJECT;
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

  const sentenceObj = collectSentence(parent);
  if (!sentenceObj) return;

  if (!isNearSelectedTitle(parent)) return;
  if (!isNarrativeSentence(sentenceObj.text)) return;

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
   Proximity-based title match
---------------------------- */
function isNearSelectedTitle(startEl) {
  const titles = movies.map(m => m.title.toLowerCase());

  let el = startEl;
  let collected = "";
  let steps = 0;

  while (el && steps < 12) {
    if (el.previousElementSibling) {
      el = el.previousElementSibling;
    } else {
      el = el.parentElement;
    }

    if (!el) break;

    if (el.innerText) {
      collected += " " + el.innerText.toLowerCase();
      if (titles.some(t => collected.includes(t))) {
        return true;
      }
    }
    steps++;
  }
  return false;
}

/* ---------------------------
   Narrative detection (series-safe)
---------------------------- */
function isNarrativeSentence(text) {
  const hasLength = text.length >= 40;
  const hasStructure = /[.!?]/.test(text);
  const hasAction =
    /\b(was|were|had|did|became|lost|killed|married|betrayed)\b/i.test(text) ||
    /\b\w+ed\b/.test(text);

  // Action is a signal, not a requirement
  return hasLength && hasStructure;
}

/* ---------------------------
   Apply blur
---------------------------- */
function applyBlur(parent, sentenceObj) {
  const { text, nodes } = sentenceObj;

  const span = document.createElement("span");
  span.className = "scube-blur";
  span.textContent = text;

  let hover = false;
  let click = false;

  span.addEventListener("mouseenter", () => hover = true);
  span.addEventListener("mouseleave", () => {
    hover = false;
    click = false;
    span.classList.remove("reveal");
  });

  span.addEventListener("mousedown", () => {
    click = true;
    if (hover) span.classList.add("reveal");
  });

  span.addEventListener("mouseup", () => {
    click = false;
    if (!hover) span.classList.remove("reveal");
  });

  nodes.forEach(n => parent.removeChild(n));
  parent.appendChild(span);
}