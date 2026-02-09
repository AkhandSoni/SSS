/* ===========================
   SCube – Content Script
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
    movies = changes.movies.newValue || [];
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
   Scan text nodes
---------------------------- */
function scan(root) {
  if (!movies.length) return;

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
  const titles = movies.map(m => m.title.toLowerCase());

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

/* ---------------------------
   No-keyword spoiler logic
---------------------------- */
function isSpoilerSentence(text) {
  return (
    /\b(was|were|had|did)\b/i.test(text) ||
    /\b\w+ed\b/.test(text)
  );
}