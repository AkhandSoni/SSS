// content.js - Semantic Spoiler Shield (AI-only version)
// Uses zero-shot classification → no keywords, no plots, fully dynamic

(function () {
  'use strict';

  console.log('SCube AI: Semantic Spoiler Shield - Zero-shot version starting...');

  // ────────────────────────────────────────────────
  //  CONFIG
  // ────────────────────────────────────────────────
  const MODEL = 'Xenova/nli-deberta-v3-xsmall'; // ~120 MB, fast & good enough
  // Alternatives: 'Xenova/deberta-v3-base-tasksource-nli' or 'Xenova/facebook/bart-large-mnli'

  const MIN_SENTENCE_LENGTH = 50;
  const BATCH_SIZE = 6; // how many sentences to classify at once

  let classifier = null;
  let trackedSeries = [];
  let enabled = true;
  let sensitivity = 0.5; // 0.0 = very strict, 1.0 = very lenient
  let isProcessing = false;

  const blurredElements = new Set();

  // ────────────────────────────────────────────────
  //  UTILITIES
  // ────────────────────────────────────────────────
  function splitIntoSentences(text) {
    if (!text) return [];
    return text
      .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length >= MIN_SENTENCE_LENGTH);
  }

  function getSeriesNamesLower() {
    return trackedSeries.map(s => s.name.toLowerCase());
  }

  function mentionsAnySeries(text) {
    const lower = text.toLowerCase();
    return getSeriesNamesLower().some(name => lower.includes(name));
  }

  function getSpoilerLabels() {
    return trackedSeries.flatMap(s => [
      `This text contains a major spoiler for ${s.name}`,
      `This text contains a plot twist or key revelation about ${s.name}`,
      `This text is a safe discussion of ${s.name} with no spoilers`
    ]);
  }

  // ────────────────────────────────────────────────
  //  INITIALIZATION
  // ────────────────────────────────────────────────
  async function loadModelAndSettings() {
    try {
      const data = await chrome.storage.sync.get([
        'sss_enabled',
        'sss_sensitivity',
        'sss_tracked_series'
      ]);

      enabled = data.sss_enabled !== false;
      sensitivity = data.sss_sensitivity ?? 0.5;
      trackedSeries = data.sss_tracked_series ?? [];

      if (!enabled || trackedSeries.length === 0) {
        console.log('SCube AI: disabled or no series tracked → exiting');
        return false;
      }

      console.log(`SCube AI: Protecting ${trackedSeries.length} series | sensitivity = ${sensitivity}`);

      console.log('SCube AI: Loading zero-shot classifier... (may take 15–60 s first time)');
      const { pipeline } = window.transformers;
      classifier = await pipeline('zero-shot-classification', MODEL);

      console.log('SCube AI: Model loaded successfully');
      return true;
    } catch (err) {
      console.error('SCube AI: Initialization failed', err);
      return false;
    }
  }

  // ────────────────────────────────────────────────
  //  CLASSIFICATION
  // ────────────────────────────────────────────────
  async function classifyBatch(sentences) {
    if (!classifier || sentences.length === 0) return [];

    const labels = getSpoilerLabels();
    const hypothesisTemplate = 'This text {}.';

    try {
      const results = await classifier(sentences, labels, {
        multi_label: false,
        hypothesis_template: hypothesisTemplate
      });

      return results.map((res, i) => {
        const topIdx = res.scores.indexOf(Math.max(...res.scores));
        const topLabel = res.labels[topIdx];
        const topScore = res.scores[topIdx];

        const threshold = 0.52 + (1 - sensitivity) * 0.28; //  ~0.52–0.80 range

        if (topScore >= threshold && topLabel.includes('spoiler')) {
          const seriesMatch = trackedSeries.find(s =>
            topLabel.includes(s.name)
          );
          return {
            sentence: sentences[i],
            series: seriesMatch?.name || 'Unknown series',
            score: topScore
          };
        }
        return null;
      });
    } catch (err) {
      console.error('Classification batch failed:', err);
      return [];
    }
  }

  // ────────────────────────────────────────────────
  //  DOM PROCESSING
  // ────────────────────────────────────────────────
  function createSpoilerSpan(sentence, info) {
    const span = document.createElement('span');
    span.className = 'spoiler-shield-overlay';
    
    const risk = info.score > 0.78 ? 'high' : info.score > 0.65 ? 'medium' : 'low';
    span.dataset.riskLevel = risk;

    const blur = document.createElement('span');
    blur.className = 'spoiler-shield-blur';
    blur.textContent = sentence;

    const tooltip = document.createElement('div');
    tooltip.className = 'spoiler-shield-tooltip';
    tooltip.textContent =
      `Possible ${info.series} spoiler\nAI confidence: ${(info.score * 100).toFixed(0)}%`;

    span.appendChild(blur);
    span.appendChild(tooltip);

    // Hover reveal
    span.addEventListener('mouseenter', () => {
      blur.classList.add('spoiler-shield-revealed');
    });
    span.addEventListener('mouseleave', () => {
      blur.classList.remove('spoiler-shield-revealed');
    });

    blurredElements.add(span);
    return span;
  }

  function replaceTextNodeWithSpoiler(node, sentence, info) {
    const parent = node.parentElement;
    if (!parent) return;

    const fullText = node.textContent;
    const index = fullText.indexOf(sentence);
    if (index === -1) return;

    const before = document.createTextNode(fullText.substring(0, index));
    const after = document.createTextNode(fullText.substring(index + sentence.length));

    const spoilerSpan = createSpoilerSpan(sentence, info);

    parent.insertBefore(before, node);
    parent.insertBefore(spoilerSpan, node);
    parent.insertBefore(after, node);
    parent.removeChild(node);
  }

  async function processElement(root) {
    if (isProcessing) return;
    isProcessing = true;

    const selector = 'p, div, li, article, section, [class*="comment"], [data-testid="tweet"], ytd-comment-renderer';
    const elements = root.querySelectorAll(selector);

    for (const el of elements) {
      if (el.closest('.spoiler-shield-overlay')) continue;

      const text = el.textContent.trim();
      if (text.length < 100 || !mentionsAnySeries(text)) continue;

      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) continue;

      // Process in batches
      for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
        const batch = sentences.slice(i, i + BATCH_SIZE);
        const results = await classifyBatch(batch);

        for (let j = 0; j < results.length; j++) {
          const detection = results[j];
          if (detection) {
            console.log(`SCube AI: SPOILER → ${detection.series} (${(detection.score*100).toFixed(0)}%) → "${detection.sentence.substring(0,60)}..."`);
            // Find the original text node and replace
            // (simplified – in production you may want TreeWalker per element)
            replaceTextNodeWithSpoiler(el.firstChild, detection.sentence, detection);
          }
        }
      }
    }

    isProcessing = false;
  }

  // ────────────────────────────────────────────────
  //  OBSERVER + INITIAL SCAN
  // ────────────────────────────────────────────────
  function startWatching() {
    const observer = new MutationObserver(mutations => {
      for (const mut of mutations) {
        if (mut.type === 'childList') {
          mut.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              processElement(node);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // First pass
    processElement(document.body);
  }

  // ────────────────────────────────────────────────
  //  MESSAGES FROM POPUP
  // ────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'settingsUpdated') {
      enabled = msg.enabled;
      sensitivity = msg.sensitivity;
      trackedSeries = msg.trackedSeries || [];

      if (!enabled) {
        // optionally unblur everything
        console.log('SCube AI: protection disabled');
      } else if (trackedSeries.length > 0 && !classifier) {
        loadModelAndSettings().then(ok => {
          if (ok) startWatching();
        });
      } else {
        console.log('SCube AI: settings refreshed');
      }
      sendResponse({ ok: true });
    }
    return true;
  });

  // ────────────────────────────────────────────────
  //  START
  // ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      const ready = await loadModelAndSettings();
      if (ready) startWatching();
    });
  } else {
    loadModelAndSettings().then(ready => {
      if (ready) startWatching();
    });
  }

  console.log('SCube AI: content script loaded');
})();