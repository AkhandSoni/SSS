/* ===========================
   SCube – Content Script
   Google highlight safe
   No-keyword spoiler detection
   =========================== */

let spoilerWords = [];
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
  spoilerWords = collectWords(res.movies || []);
  scheduleScan();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.movies) {
    spoilerWords = collectWords(changes.movies.newValue || []);
    scheduleScan();
  }
});

function collectWords(movies) {
  return movies.flatMap(m => m.keywords || []);
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
   Scan text nodes safely
---------------------------- */
function scan(root) {
  if (!spoilerWords.length) return;

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

  // 1️⃣ Must reference movie-specific info
  const movieMatch = spoilerWords.some(w => lower.includes(w));
  if (!movieMatch) return false;

  // 2️⃣ Must be a proper sentence
  if (text.length < 40) return false;
  if (!/[.!?]/.test(text)) return false;

  // 3️⃣ Grammar-based outcome signal (no keywords)
  const pastEventSignal =
    /\b(was|were|had|did)\b/i.test(text) ||
    /\b\w+ed\b/.test(text);

  return pastEventSignal;
}