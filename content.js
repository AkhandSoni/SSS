// content.js - SCube spoiler detection with detailed debugging

(function() {
  'use strict';

  console.log('=== SCube Content Script Starting ===');

  // Configuration
  const CONFIG = {
    similarityThreshold: 0.60, // Lower threshold for testing
    modelName: 'Xenova/all-MiniLM-L6-v2',
    minSentenceLength: 40
  };

  // State
  let movieList = [];
  let blurEnabled = true;
  let pipeline = null;
  let plotData = new Map(); // title -> { sentences, embeddings }
  let blurredElements = [];

  // === INITIALIZATION ===
  async function init() {
    console.log('SCube: 🚀 Initializing content script...');
    
    try {
      // Load settings
      const settings = await loadFromStorage();
      movieList = settings.movieList || [];
      blurEnabled = settings.blurEnabled !== false;
      
      console.log('SCube: 📋 Loaded settings:', {
        movies: movieList,
        count: movieList.length,
        blurEnabled: blurEnabled
      });

      // Only proceed if we have movies and blur is enabled
      if (!blurEnabled) {
        console.log('SCube: ⏸️ Blur is disabled');
        return;
      }

      if (movieList.length === 0) {
        console.log('SCube: 📭 No movies in list');
        return;
      }

      // Initialize AI
      console.log('SCube: 🤖 Loading AI model...');
      await loadModel();
      
      if (!pipeline) {
        console.error('SCube: ❌ Failed to load AI model');
        return;
      }

      // Load plots
      console.log('SCube: 📚 Loading plots...');
      await loadPlots();

      if (plotData.size === 0) {
        console.log('SCube: ⚠️ No plots loaded successfully');
        return;
      }

      // Process page
      console.log('SCube: 🔍 Processing page...');
      await scanAndBlur();
      
      console.log('SCube: ✅ Initialization complete!');

    } catch (error) {
      console.error('SCube: ❌ Initialization failed:', error);
    }
  }

  // === STORAGE ===
  function loadFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['movieList', 'blurEnabled'], (result) => {
        console.log('SCube: 💾 Storage loaded:', result);
        resolve(result);
      });
    });
  }

  // === AI MODEL ===
  async function loadModel() {
    if (pipeline) {
      console.log('SCube: ✅ Model already loaded');
      return;
    }

    try {
      // Check if transformers.js exists
      if (typeof window.transformers === 'undefined') {
        console.error('SCube: ❌ transformers.js NOT FOUND!');
        console.error('SCube: ℹ️ Make sure transformers.min.js is in the extension folder');
        return;
      }

      console.log('SCube: ✅ transformers.js found');
      const { pipeline: pipelineFunc } = window.transformers;
      
      console.log('SCube: ⏳ Creating pipeline (this may take 20-60 seconds on first load)...');
      pipeline = await pipelineFunc('feature-extraction', CONFIG.modelName);
      
      console.log('SCube: ✅ AI Model loaded successfully!');
      
    } catch (error) {
      console.error('SCube: ❌ Model loading error:', error);
      pipeline = null;
    }
  }

  // === PLOT LOADING ===
  async function loadPlots() {
    console.log(`SCube: 📚 Loading plots for ${movieList.length} titles...`);
    plotData.clear();

    for (const title of movieList) {
      console.log(`SCube: 🔍 Fetching "${title}" from Wikipedia...`);
      
      try {
        const plot = await fetchWikipedia(title);
        
        if (!plot) {
          console.warn(`SCube: ⚠️ No plot found for "${title}"`);
          continue;
        }

        console.log(`SCube: ✅ Got plot for "${title}" (${plot.length} characters)`);

        // Split into sentences
        const sentences = splitSentences(plot);
        console.log(`SCube: 📝 Split into ${sentences.length} sentences`);

        if (sentences.length === 0) continue;

        // Get embeddings
        console.log(`SCube: 🧮 Computing embeddings for "${title}"...`);
        const embeddings = await getEmbeddings(sentences);
        
        if (embeddings.length > 0) {
          plotData.set(title, { sentences, embeddings });
          console.log(`SCube: ✅ Stored ${embeddings.length} embeddings for "${title}"`);
        }

      } catch (error) {
        console.error(`SCube: ❌ Error loading "${title}":`, error);
      }
    }

    console.log(`SCube: ✅ Loaded ${plotData.size}/${movieList.length} plots successfully`);
  }

  // Fetch from Wikipedia
  async function fetchWikipedia(title) {
    try {
      // Search
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*`;
      const searchResp = await fetch(searchUrl);
      const searchData = await searchResp.json();

      if (!searchData.query?.search?.[0]) {
        return null;
      }

      const pageTitle = searchData.query.search[0].title;
      console.log(`SCube: 🔗 Found Wikipedia page: "${pageTitle}"`);

      // Get content
      const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`;
      const contentResp = await fetch(contentUrl);
      const contentData = await contentResp.json();

      const pages = contentData.query.pages;
      const page = pages[Object.keys(pages)[0]];

      return page.extract || null;

    } catch (error) {
      console.error('SCube: Wikipedia fetch error:', error);
      return null;
    }
  }

  // Split into sentences
  function splitSentences(text) {
    if (!text) return [];
    
    return text
      .replace(/([.!?])\s+/g, '$1\n')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length >= CONFIG.minSentenceLength);
  }

  // Get embeddings
  async function getEmbeddings(texts) {
    if (!pipeline || !texts.length) return [];

    try {
      console.log(`SCube: 🧮 Getting embeddings for ${texts.length} texts...`);
      const output = await pipeline(texts, { pooling: 'mean', normalize: true });
      
      const embeddings = [];
      for (let i = 0; i < texts.length; i++) {
        embeddings.push(Array.from(output[i].data));
      }

      console.log(`SCube: ✅ Got ${embeddings.length} embeddings`);
      return embeddings;

    } catch (error) {
      console.error('SCube: Embedding error:', error);
      return [];
    }
  }

  // === SCANNING AND BLURRING ===
  async function scanAndBlur() {
    console.log('SCube: 🔍 Scanning page for spoilers...');

    if (!pipeline || plotData.size === 0) {
      console.log('SCube: ⚠️ Cannot scan - no model or plots');
      return;
    }

    const textNodes = getTextNodes();
    console.log(`SCube: 📄 Found ${textNodes.length} text nodes to check`);

    let blurCount = 0;

    for (const node of textNodes) {
      const text = node.textContent;
      const sentences = splitSentences(text);

      for (const sentence of sentences) {
        const spoiler = await checkSpoiler(sentence);
        
        if (spoiler) {
          console.log(`SCube: 🚨 SPOILER FOUND (${spoiler.similarity.toFixed(3)}): "${sentence.substring(0, 60)}..."`);
          blurSentence(node, sentence);
          blurCount++;
        }
      }
    }

    console.log(`SCube: ✅ Scan complete - blurred ${blurCount} sentences`);
  }

  // Get all text nodes
  function getTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.classList.contains('scube-blur')) {
            return NodeFilter.FILTER_REJECT;
          }

          const text = node.textContent.trim();
          if (text.length < 30) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    return nodes;
  }

  // Check if sentence is spoiler
  async function checkSpoiler(sentence) {
    try {
      const sentenceEmbed = (await getEmbeddings([sentence]))[0];
      if (!sentenceEmbed) return null;

      let maxSim = 0;
      let matchTitle = null;

      for (const [title, data] of plotData.entries()) {
        for (const plotEmbed of data.embeddings) {
          const sim = cosine(sentenceEmbed, plotEmbed);
          if (sim > maxSim) {
            maxSim = sim;
            matchTitle = title;
          }
        }
      }

      if (maxSim >= CONFIG.similarityThreshold) {
        return { title: matchTitle, similarity: maxSim };
      }

      return null;

    } catch (error) {
      console.error('SCube: Check error:', error);
      return null;
    }
  }

  // Cosine similarity
  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Blur a sentence in a text node
  function blurSentence(textNode, sentence) {
    try {
      const parent = textNode.parentElement;
      if (!parent) return;

      const fullText = textNode.textContent;
      const index = fullText.indexOf(sentence);
      if (index === -1) return;

      // Create blur span
      const span = document.createElement('span');
      span.className = 'scube-blur';
      span.textContent = sentence;
      span.title = '👁️ Hover to reveal spoiler';

      // Split text
      const before = fullText.substring(0, index);
      const after = fullText.substring(index + sentence.length);

      // Replace
      const beforeNode = document.createTextNode(before);
      const afterNode = document.createTextNode(after);

      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(span, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);

      blurredElements.push(span);

    } catch (error) {
      console.error('SCube: Blur error:', error);
    }
  }

  // Remove all blurs
  function removeBlurs() {
    console.log('SCube: 🧹 Removing all blurs...');
    
    document.querySelectorAll('.scube-blur').forEach(el => {
      const text = el.textContent;
      el.replaceWith(document.createTextNode(text));
    });

    blurredElements = [];
    console.log('SCube: ✅ Blurs removed');
  }

  // === MESSAGE LISTENER ===
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('SCube: 📨 Message received:', msg.action);

    if (msg.action === 'refreshBlur') {
      movieList = msg.movieList || [];
      blurEnabled = msg.blurEnabled;

      console.log('SCube: 🔄 Refreshing with:', {
        movies: movieList,
        blur: blurEnabled
      });

      removeBlurs();

      if (blurEnabled && movieList.length > 0) {
        init();
      }

      sendResponse({ success: true });
    }

    return true;
  });

  // === STYLES ===
  const style = document.createElement('style');
  style.textContent = `
    .scube-blur {
      filter: blur(6px);
      background: rgba(0, 0, 0, 0.15);
      padding: 3px 6px;
      border-radius: 4px;
      cursor: help;
      transition: all 0.3s ease;
      display: inline;
      user-select: none;
    }
    
    .scube-blur:hover {
      filter: blur(0);
      background: rgba(0, 212, 255, 0.2);
    }
  `;
  document.head.appendChild(style);

  // === START ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('=== SCube Content Script Loaded ===');

})();