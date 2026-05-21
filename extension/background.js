const NANOCHAT_URL = chrome.runtime.getURL('index.html');
const PENDING_KEY = 'nanochat_pending_context';
const MAX_CTX_CHARS = 30000;
const IMAGE_MAX = 10;
const IMAGE_MIN_AREA = 200 * 200;
const IMAGE_MAX_EDGE = 512;

function truncate(s) {
  if (!s) return '';
  return s.length > MAX_CTX_CHARS ? s.slice(0, MAX_CTX_CHARS) + '\n…[truncated]' : s;
}

chrome.runtime.onInstalled.addListener(() => {
  // Order matters — items appear in the right-click menu in registration order.
  chrome.contextMenus.create({
    id: 'nanochat-summarize-page',
    title: 'Summarize this page in NanoChat',
    contexts: ['page', 'selection'],
  });
  chrome.contextMenus.create({
    id: 'nanochat-summarize-page-images',
    title: 'Summarize this page in NanoChat (with images)',
    contexts: ['page', 'selection'],
  });
  chrome.contextMenus.create({
    id: 'nanochat-ask-page',
    title: 'Ask NanoChat about this page',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'nanochat-ask-page-images',
    title: 'Ask NanoChat about this page (with images)',
    contexts: ['page'],
  });
});

// Picks an existing NanoChat tab when one exists, preferring the source
// window so the user isn't yanked across displays. Returns null if none.
// Uses chrome.runtime.getContexts (MV3) rather than chrome.tabs.query, which
// silently returns [] when filtered by URL without the "tabs" permission.
async function pickExistingNanoChat(preferredWindowId) {
  let tabs = [];
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['TAB'],
      documentUrls: [NANOCHAT_URL],
    });
    tabs = contexts.map(c => ({ id: c.tabId, windowId: c.windowId }));
  } catch {
    return null;
  }
  if (tabs.length === 0) return null;
  let target = preferredWindowId != null ? tabs.find(t => t.windowId === preferredWindowId) : null;
  if (!target) {
    try {
      const focused = await chrome.windows.getLastFocused({});
      target = tabs.find(t => t.windowId === focused.id) || tabs[0];
    } catch {
      target = tabs[0];
    }
  }
  return target;
}

async function focusTab(target) {
  try { await chrome.tabs.update(target.id, { active: true }); } catch {}
  try { await chrome.windows.update(target.windowId, { focused: true }); } catch {}
}

async function createNanoChatTab(preferredWindowId) {
  const createOpts = { url: NANOCHAT_URL };
  if (preferredWindowId != null) {
    try {
      await chrome.windows.get(preferredWindowId);
      createOpts.windowId = preferredWindowId;
    } catch {
      // Source window gone — fall back to last-focused.
    }
  }
  return chrome.tabs.create(createOpts);
}

// Used by the "Open NanoChat" link in the popup — no context to deliver.
async function openOrFocusNanoChat(preferredWindowId) {
  const existing = await pickExistingNanoChat(preferredWindowId);
  if (existing) {
    await focusTab(existing);
    return { tabId: existing.id, freshlyCreated: false };
  }
  const created = await createNanoChatTab(preferredWindowId);
  return { tabId: created.id, freshlyCreated: true };
}

// Injected into the page. Returns plain JSON (Blobs aren't structured-cloneable
// across executeScript), so images are encoded as data URLs. Canvas readback
// uses the bitmap the browser already painted — zero network, zero cache hits.
// Cross-origin images without CORS taint the canvas and convertToBlob throws;
// those are counted as `skipped` rather than fetched (preserves the app's
// "no network calls" promise).
async function extractPageContent({ includeImages, maxImages, minArea, maxEdge }) {
  const text = document.body ? document.body.innerText : '';
  const title = document.title;
  const url = location.href;
  const images = [];
  let totalCandidates = 0;
  let skipped = 0;

  if (includeImages) {
    const imgs = Array.from(document.images || []);
    const candidates = imgs
      .map(img => {
        const rect = img.getBoundingClientRect();
        return { img, w: rect.width, h: rect.height, area: rect.width * rect.height };
      })
      .filter(c => c.area >= minArea)
      .filter(c => c.img.complete && c.img.naturalWidth > 0)
      .sort((a, b) => b.area - a.area);

    totalCandidates = candidates.length;
    const top = candidates.slice(0, maxImages);

    for (const c of top) {
      try {
        const nw = c.img.naturalWidth;
        const nh = c.img.naturalHeight;
        const scale = Math.min(1, maxEdge / Math.max(nw, nh));
        const w = Math.max(1, Math.round(nw * scale));
        const h = Math.max(1, Math.round(nh * scale));
        const canvas = new OffscreenCanvas(w, h);
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(c.img, 0, 0, w, h);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(blob);
        });
        images.push({
          dataUrl,
          alt: c.img.alt || '',
          src: c.img.currentSrc || c.img.src || '',
          renderedWidth: Math.round(c.w),
          renderedHeight: Math.round(c.h),
        });
      } catch {
        skipped++;
      }
    }
  }

  return { text, title, url, images, imageStats: { totalCandidates, included: images.length, skipped } };
}

async function capturePageContent(tabId, { includeImages = false } = {}) {
  const empty = { text: '', title: '', url: '', images: [], imageStats: { totalCandidates: 0, included: 0, skipped: 0 } };
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
      args: [{
        includeImages,
        maxImages: IMAGE_MAX,
        minArea: IMAGE_MIN_AREA,
        maxEdge: IMAGE_MAX_EDGE,
      }],
    });
    return result.result || empty;
  } catch {
    return empty;
  }
}

// Single entry point used by both the right-click menu and the toolbar popup.
async function performAction(action, tab, options = {}) {
  if (!tab || !tab.id) return false;
  const { includeImages = false } = options;
  let context;

  if (action === 'ask-page') {
    const page = await capturePageContent(tab.id, { includeImages });
    context = {
      kind: 'page',
      text: truncate(page.text),
      title: page.title || tab.title || '',
      url: page.url || tab.url || '',
      ts: Date.now(),
      images: page.images,
      imageStats: page.imageStats,
    };
  } else if (action === 'summarize-page') {
    const page = await capturePageContent(tab.id, { includeImages });
    context = {
      kind: 'page',
      text: truncate(page.text),
      title: page.title || tab.title || '',
      url: page.url || tab.url || '',
      ts: Date.now(),
      prefill: 'Summarize this page concisely (3–5 bullet points).',
      autoSend: true,
      images: page.images,
      imageStats: page.imageStats,
    };
  } else {
    return false;
  }

  if (!context.text && (!context.images || context.images.length === 0)) return false;

  // Two cases:
  //  - Existing NanoChat tab: tag context with targetTabId so only that tab
  //    consumes (storage.onChanged broadcasts to all NanoChat tabs).
  //  - No existing tab: write storage first (no targetTabId), then create the
  //    new tab. Untargeted context is claimed by the next NanoChat tab to load
  //    via its on-boot storage read.
  const existing = await pickExistingNanoChat(tab.windowId);
  if (existing) {
    context.targetTabId = existing.id;
    await chrome.storage.local.set({ [PENDING_KEY]: context });
    await focusTab(existing);
  } else {
    await chrome.storage.local.set({ [PENDING_KEY]: context });
    await createNanoChatTab(tab.windowId);
  }
  return true;
}

// Maps a menu item ID to an action + options. Lets us add image-variant menu
// items without needing parallel performAction branches.
const MENU_ID_TO_ACTION = {
  'nanochat-summarize-page':         { action: 'summarize-page', includeImages: false },
  'nanochat-summarize-page-images':  { action: 'summarize-page', includeImages: true },
  'nanochat-ask-page':               { action: 'ask-page', includeImages: false },
  'nanochat-ask-page-images':        { action: 'ask-page', includeImages: true },
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const m = MENU_ID_TO_ACTION[info.menuItemId];
  if (!m) return;
  await performAction(m.action, tab, { includeImages: m.includeImages });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'nanochat:popup-action') {
    (async () => {
      const ok = await performAction(msg.action, msg.tab, msg.options || {});
      sendResponse({ ok });
    })();
    return true; // keep the channel open for the async sendResponse
  }
  if (msg && msg.type === 'nanochat:open') {
    openOrFocusNanoChat(msg.windowId).then(() => sendResponse({ ok: true }));
    return true;
  }
});
