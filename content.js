let protectionEnabled = true;
let threshold = 0.5; // similarity threshold for AI embeddings
let activeScan = true;
let noChangeCount = 0;

const processedNodes = new WeakSet();
let pendingNodes = new Set();
let mutationTimer = null;

// Cosine similarity placeholder (for future AI embedding use)
function cosineSimilarity(a,b){
  let dot=0,nA=0,nB=0;
  for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; nA+=a[i]**2; nB+=b[i]**2; }
  return dot/Math.sqrt(nA*nB);
}

// Collect new text nodes
function collectTextNodes(root=document.body){
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT,null,false);
  let node;
  const nodes = [];
  while(node=walker.nextNode()){
    if(node.textContent.trim().length>0 && !processedNodes.has(node)){
      nodes.push(node);
      pendingNodes.add(node);
    }
  }
  return nodes;
}

// Blur a single node
function blurText(node){
  const span=document.createElement('span');
  span.textContent=node.textContent;
  span.style.background='linear-gradient(135deg,#667eea,#764ba2)';
  span.style.color='transparent';
  span.style.borderRadius='3px';
  node.replaceWith(span);
}

// Process a batch of nodes
async function processBatch(nodes, series){
  for(const node of nodes){
    processedNodes.add(node);
    const text = node.textContent.trim().toLowerCase();

    for(const s of series){
      const seriesName = s.name.toLowerCase();

      // Skip if exact name
      if(text === seriesName) continue;

      // AI placeholder: in real version, compute similarity with embeddings
      // For now: approximate with "contains name" (replace with AI similarity)
      if(text.includes(seriesName)){
        blurText(node);
        break;
      }
    }
  }
}

// Main blur function (batched)
async function blurPage(){
  if(!protectionEnabled || !activeScan) return;

  chrome.storage.local.get(['scube_series'], async res=>{
    const series = res['scube_series'] || [];
    if(series.length===0) return;

    // Convert pendingNodes to array and clear it
    const nodesToProcess = Array.from(pendingNodes);
    pendingNodes.clear();

    if(nodesToProcess.length === 0){
      noChangeCount++;
      if(noChangeCount >= 2){
        activeScan = false;
        console.log("No changes detected for 2 scans. Scanning paused.");
      }
      return;
    } else {
      noChangeCount = 0;
    }

    // Process in batches to avoid freezing
    const batchSize = 20; // adjust depending on page size
    for(let i=0;i<nodesToProcess.length;i+=batchSize){
      const batch = nodesToProcess.slice(i, i+batchSize);
      await processBatch(batch, series);
      // Yield to browser for rendering
      await new Promise(r => requestAnimationFrame(r));
    }
  });
}

// MutationObserver callback (throttled)
function scheduleBlur(){
  if(mutationTimer) return;
  mutationTimer = setTimeout(()=>{
    mutationTimer = null;
    collectTextNodes();
    blurPage();
  }, 200); // 200ms throttle
}

// Observe page changes
const observer = new MutationObserver(scheduleBlur);
observer.observe(document.body,{childList:true,subtree:true});

// Resume scanning if a button is pressed
document.addEventListener('click', e=>{
  if(e.target.tagName === 'BUTTON'){
    activeScan = true;
    noChangeCount = 0;
    console.log("Button clicked: scanning resumed.");
  }
});

// Initial scan
collectTextNodes();
blurPage();