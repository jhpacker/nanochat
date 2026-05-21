  const $ = (id) => document.getElementById(id);

  // ---------- Copy chrome:// link ----------
  const copyInternalsBtn = $('copy-internals');
  copyInternalsBtn.addEventListener('click', async () => {
    const url = 'chrome://on-device-internals';
    const original = copyInternalsBtn.textContent;
    try {
      await navigator.clipboard.writeText(url);
      copyInternalsBtn.textContent = 'copied! paste into address bar';
    } catch {
      copyInternalsBtn.textContent = 'copy failed — paste manually';
    }
    setTimeout(() => { copyInternalsBtn.textContent = original; }, 2000);
  });

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled')) return;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ---------- On-load availability sweep ----------
  // Each entry: tab id → { global, statusEl, opts }
  const TAB_APIS = [
    { tab: 'prompt',      global: 'LanguageModel',    statusEl: 'prompt-status' },
    { tab: 'summarizer',  global: 'Summarizer',       statusEl: 'summarizer-status' },
    { tab: 'translator',  global: 'Translator',       statusEl: 'translator-status', opts: { sourceLanguage: 'en', targetLanguage: 'es' } },
    { tab: 'detector',    global: 'LanguageDetector', statusEl: 'detector-status' },
    { tab: 'writer',      global: 'Writer',           statusEl: 'writer-status' },
    { tab: 'rewriter',    global: 'Rewriter',         statusEl: 'rewriter-status' },
    { tab: 'proofreader', global: 'Proofreader',      statusEl: 'proofreader-status' },
  ];

  function disableTab(tabId, reason) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (!tab) return;
    tab.classList.add('disabled');
    tab.title = reason;
  }

  async function sweepAvailability() {
    await Promise.all(TAB_APIS.map(async ({ tab, global, statusEl, opts }) => {
      const el = $(statusEl);
      if (!(global in self)) {
        setStatus(el, 'not in self', 'error');
        disableTab(tab, `${global} is not exposed in this Chrome build`);
        return;
      }
      try {
        const a = await self[global].availability(opts);
        const cls = (a === 'available' || a === 'readily-available') ? 'ok'
                  : (a === 'unavailable') ? 'error' : 'warn';
        setStatus(el, a, cls);
        if (a === 'unavailable') {
          disableTab(tab, `${global}.availability() reported "unavailable"`);
        }
      } catch (e) {
        setStatus(el, `availability() failed: ${e.message}`, 'error');
        // Don't disable on error — the API exists, the user might still want to try.
      }
    }));
  }
  sweepAvailability();

  // ---------- Markdown rendering (snarkdown by Jason Miller, MIT) ----------
  // Source: https://github.com/developit/snarkdown — ~1KB
  const MD_TAGS = {
    '': ['<em>', '</em>'],
    _: ['<strong>', '</strong>'],
    '*': ['<strong>', '</strong>'],
    '~': ['<s>', '</s>'],
    '\n': ['<br />'],
    ' ': ['<br />'],
    '-': ['<hr />']
  };
  function mdOutdent(str) {
    return str.replace(RegExp('^' + (str.match(/^(\t| )+/) || '')[0], 'gm'), '');
  }
  function mdEncodeAttr(str) {
    return (str + '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function snarkdown(md, prevLinks) {
    const tokenizer = /((?:^|\n+)(?:\n---+|\* \*(?: \*)+)\n)|(?:^``` *(\w*)\n([\s\S]*?)\n```$)|((?:(?:^|\n+)(?:\t|  {2,}).+)+\n*)|((?:(?:^|\n)([>*+-]|\d+\.)\s+.*)+)|(?:!\[([^\]]*?)\]\(([^)]+?)\))|(\[)|(\](?:\(([^)]+?)\))?)|(?:(?:^|\n+)([^\s].*)\n(-{3,}|={3,})(?:\n+|$))|(?:(?:^|\n+)(#{1,6})\s*(.+)(?:\n+|$))|(?:`([^`].*?)`)|(  \n\n*|\n{2,}|__|\*\*|[_*]|~~)/gm;
    const context = [];
    let out = '';
    const links = prevLinks || {};
    let last = 0, chunk, prev, token, inner, t;
    function tag(token) {
      const desc = MD_TAGS[token[1] || ''];
      if (!desc) return token;
      // Self-closing tags (<br/>, <hr/>) — no open/close stack management,
      // otherwise repeats produce undefined for the missing close.
      if (desc.length === 1) return desc[0];
      const end = context[context.length - 1] == token;
      if (!end) context.push(token); else context.pop();
      return desc[end | 0];
    }
    function flush() {
      let str = '';
      while (context.length) str += tag(context[context.length - 1]);
      return str;
    }
    md = md.replace(/^\[(.+?)\]:\s*(.+)$/gm, (s, name, url) => {
      links[name.toLowerCase()] = url; return '';
    }).replace(/^\n+|\n+$/g, '');
    while ((token = tokenizer.exec(md))) {
      prev = md.substring(last, token.index);
      last = tokenizer.lastIndex;
      chunk = token[0];
      if (prev.match(/[^\\](\\\\)*\\$/)) {
        // escaped — leave chunk as-is
      } else if (t = (token[3] || token[4])) {
        chunk = '<pre class="code ' + (token[4] ? 'poetry' : token[2].toLowerCase()) + '"><code' + (token[2] ? ` class="language-${token[2].toLowerCase()}"` : '') + '>' + mdOutdent(mdEncodeAttr(t).replace(/^\n+|\n+$/g, '')) + '</code></pre>';
      } else if (t = token[6]) {
        if (t.match(/\./)) token[5] = token[5].replace(/^\d+/gm, '');
        inner = snarkdown(mdOutdent(token[5].replace(/^\s*[>*+.-]/gm, '')));
        if (t == '>') t = 'blockquote';
        else { t = t.match(/\./) ? 'ol' : 'ul'; inner = inner.replace(/^(.*)(\n|$)/gm, '<li>$1</li>'); }
        chunk = '<' + t + '>' + inner + '</' + t + '>';
      } else if (token[8]) {
        chunk = `<img src="${mdEncodeAttr(token[8])}" alt="${mdEncodeAttr(token[7])}">`;
      } else if (token[10]) {
        out = out.replace('<a>', `<a href="${mdEncodeAttr(token[11] || links[prev.toLowerCase()])}">`);
        chunk = flush() + '</a>';
      } else if (token[9]) {
        chunk = '<a>';
      } else if (token[12] || token[14]) {
        t = 'h' + (token[14] ? token[14].length : (token[13][0] == '=' ? 1 : 2));
        chunk = '<' + t + '>' + snarkdown(token[12] || token[15], links) + '</' + t + '>';
      } else if (token[16]) {
        chunk = '<code>' + mdEncodeAttr(token[16]) + '</code>';
      } else if (token[17] || token[1]) {
        chunk = tag(token[17] || '--');
      }
      out += prev;
      out += chunk;
    }
    return (out + md.substring(last) + flush()).replace(/^\n+|\n+$/g, '');
  }

  function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Defense-in-depth: snarkdown's output is mostly safe (URLs are HTML-encoded),
  // but it doesn't reject javascript:/data:/vbscript: URL schemes. Strip them, plus any on*= handlers.
  function sanitizeHTML(html) {
    return html
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/(href|src)\s*=\s*"(?:\s*(?:javascript|data|vbscript):)[^"]*"/gi, '$1="#"')
      .replace(/(href|src)\s*=\s*'(?:\s*(?:javascript|data|vbscript):)[^']*'/gi, "$1='#'");
  }
  // GFM tables (snarkdown doesn't support them). Pre-process to inline HTML
  // before snarkdown — snarkdown has no `|` patterns, so it leaves them alone.
  function processTables(md) {
    const lines = md.split('\n');
    const out = [];
    const sepRe = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
    const splitCells = (line) =>
      line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    let i = 0;
    while (i < lines.length) {
      if (i + 1 < lines.length && sepRe.test(lines[i + 1]) && lines[i].includes('|')) {
        const header = splitCells(lines[i]);
        const aligns = splitCells(lines[i + 1]).map(c => {
          const l = c.startsWith(':'), r = c.endsWith(':');
          return (l && r) ? 'center' : r ? 'right' : l ? 'left' : null;
        });
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() !== '' && lines[j].includes('|')) {
          rows.push(splitCells(lines[j]));
          j++;
        }
        const cellTag = (tag, cells) => cells.map((c, k) => {
          const a = aligns[k];
          return `<${tag}${a ? ` style="text-align:${a}"` : ''}>${snarkdown(c)}</${tag}>`;
        }).join('');
        let html = '<table><thead><tr>' + cellTag('th', header) + '</tr></thead><tbody>';
        for (const row of rows) html += '<tr>' + cellTag('td', row) + '</tr>';
        html += '</tbody></table>';
        out.push(html);
        i = j;
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join('\n');
  }

  function renderMarkdown(md) {
    return sanitizeHTML(snarkdown(processTables(escapeHTML(md))));
  }

  // ---------- Shared helpers ----------
  function setStatus(el, text, cls = '') {
    el.textContent = text;
    el.className = 'status ' + cls;
  }

  function makeMonitor(statusEl, prefix = 'downloading') {
    return (m) => {
      m.addEventListener('downloadprogress', (e) => {
        // Chrome fires loaded:0 then loaded:1 for already-cached models, which would
        // flash a misleading "downloading 0.0%" before create() resolves. Only show
        // genuine in-flight progress.
        if (e.loaded <= 0 || e.loaded >= 1) return;
        const pct = (e.loaded * 100).toFixed(1);
        setStatus(statusEl, `${prefix} ${pct}%`, 'warn');
      });
    };
  }

  async function checkAvailability(api, statusEl, opts = undefined) {
    if (!(api in self)) {
      setStatus(statusEl, `${api} not in self`, 'error');
      return null;
    }
    try {
      const a = await self[api].availability(opts);
      const cls = (a === 'available' || a === 'readily-available') ? 'ok'
                : (a === 'unavailable') ? 'error' : 'warn';
      setStatus(statusEl, a, cls);
      return a;
    } catch (e) {
      setStatus(statusEl, `availability() failed: ${e.message}`, 'error');
      return null;
    }
  }

  function showError(outEl, e) {
    outEl.classList.add('error');
    outEl.textContent = `error: ${e.message || e}`;
  }
  function clearOut(outEl) {
    outEl.classList.remove('error');
    outEl.textContent = '';
  }

  // ============================================================
  // PROMPT API
  // ============================================================
  const promptStatus = $('prompt-status');
  const logEl = $('log');
  const inputEl = $('input');
  const sendBtn = $('send');
  const resetBtn = $('reset');
  const tempEl = $('temperature');
  const topKEl = $('topK');
  const systemEl = $('system-prompt');
  const usageEl = $('usage-text');
  const usageDefaultsEl = $('usage-defaults');
  const jsonModeEl = $('json-mode');
  const jsonSchemaEl = $('json-schema');
  const multimodalEl = $('multimodal');
  const imgBtn = $('img-btn');
  const imgInput = $('img-input');
  const imgPreview = $('img-preview');
  const audioBtn = $('audio-btn');
  const audioInput = $('audio-input');
  const audioPreview = $('audio-preview');

  let session = null;
  let generating = false;
  let chatAbort = null;
  let attachedImages = []; // [{ blob, url }]
  let attachedAudio = [];  // [{ blob, name }]

  // ---------- Session storage ----------
  // currentMessages stores plain text turns for replay/persistence.
  // Image/audio blobs are not persisted (would blow chrome.storage.local quota fast);
  // they're shown in the live chat but not restored after reload.
  let currentSessionId = null;
  let currentMessages = []; // [{ role, text }]
  const SESSIONS_INDEX_KEY = 'nanochat_sessions_index';
  const SESSION_KEY_PREFIX = 'nanochat_session_';
  const sessionListEl = $('session-list');
  const newChatBtn = $('new-chat');
  const searchEl = $('session-search');
  const storageMetaEl = $('storage-meta');
  const clearAllBtn = $('clear-all-chats');
  let searchQuery = '';
  // Cache of full session bodies for search. Invalidated whenever sessions change.
  let bodyCache = null;

  // ---------- Storage (encrypted at rest) ----------
  // chrome.storage.local under MV3, localStorage on file://. Values written via
  // `storage` are AES-GCM ciphertext; the master key is a non-extractable
  // CryptoKey kept in IndexedDB. The key bytes never leave the browser's crypto
  // subsystem, so disk-scrape attackers see only ciphertext. This does NOT
  // defend against malware running as the user — that adversary just opens the
  // extension page and reads decrypted state. It does defeat casual inspection
  // of the Chrome profile dir and stops chat content from being grep-able.

  const rawStorage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? {
    async get(keys) {
      return new Promise(r => chrome.storage.local.get(keys, v => r(v)));
    },
    async getAll() {
      return new Promise(r => chrome.storage.local.get(null, v => r(v)));
    },
    async set(obj) {
      return new Promise(r => chrome.storage.local.set(obj, r));
    },
    async remove(keys) {
      return new Promise(r => chrome.storage.local.remove(keys, r));
    },
    async getBytesInUse() {
      return new Promise(r => chrome.storage.local.getBytesInUse(null, b => r(b)));
    }
  } : {
    async get(keys) {
      const out = {};
      const list = Array.isArray(keys) ? keys : keys ? [keys] : null;
      if (!list) return out;
      for (const k of list) {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = JSON.parse(v);
      }
      return out;
    },
    async getAll() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (v != null) {
          try { out[k] = JSON.parse(v); } catch { /* skip non-JSON keys we didn't write */ }
        }
      }
      return out;
    },
    async set(obj) {
      for (const k of Object.keys(obj)) localStorage.setItem(k, JSON.stringify(obj[k]));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) localStorage.removeItem(k);
    },
    async getBytesInUse() {
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        n += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
      return n;
    }
  };

  const KEY_DB = 'nanochat-keys';
  const KEY_STORE = 'keys';
  const KEY_ID = 'master';

  function openKeyDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(KEY_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(KEY_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet(db, k) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(KEY_STORE, 'readonly').objectStore(KEY_STORE).get(k);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(db, k, v) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, 'readwrite');
      tx.objectStore(KEY_STORE).put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Lazy + memoized — first storage call kicks this off; everyone else awaits the same promise.
  let cryptoKeyPromise;
  function ensureCryptoKey() {
    if (!cryptoKeyPromise) {
      cryptoKeyPromise = (async () => {
        const db = await openKeyDB();
        let key = await idbGet(db, KEY_ID);
        if (!key) {
          key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
          );
          await idbPut(db, KEY_ID, key);
        }
        return key;
      })();
    }
    return cryptoKeyPromise;
  }

  function isEncryptedEnvelope(v) {
    return v && typeof v === 'object' && v._enc === 1 && typeof v.iv === 'string' && typeof v.ct === 'string';
  }
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64ToBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function encryptValue(value) {
    const key = await ensureCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = new TextEncoder().encode(JSON.stringify(value));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
    return { _enc: 1, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
  }
  async function decryptValue(envelope) {
    const key = await ensureCryptoKey();
    const iv = b64ToBytes(envelope.iv);
    const ct = b64ToBytes(envelope.ct);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  const storage = {
    async get(keys) {
      const raw = await rawStorage.get(keys);
      const out = {};
      for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (isEncryptedEnvelope(v)) {
          // If IDB was cleared but the storage backend wasn't, the key is gone and
          // existing ciphertext is unrecoverable. Treat as missing so the app still boots.
          try { out[k] = await decryptValue(v); }
          catch (e) { console.warn('nanochat: decrypt failed for', k, e); }
        } else {
          // Plaintext from a pre-encryption build — surfaced as-is, re-encrypted on next set().
          out[k] = v;
        }
      }
      return out;
    },
    async set(obj) {
      const enc = {};
      for (const k of Object.keys(obj)) enc[k] = await encryptValue(obj[k]);
      await rawStorage.set(enc);
    },
    remove: (keys) => rawStorage.remove(keys),
    getBytesInUse: () => rawStorage.getBytesInUse(),
  };

  // One-shot migration: re-encrypt any plaintext nanochat_* values left from older builds.
  async function migrateToEncrypted() {
    const all = await rawStorage.getAll();
    const toEncrypt = {};
    for (const k of Object.keys(all)) {
      if (!k.startsWith('nanochat')) continue;
      // Skip the right-click/popup pending-context handoff — it's intentionally
      // plaintext (background.js can't decrypt) and is consumed within the same
      // boot cycle. Encrypting it here would make takePendingContext see an
      // envelope instead of a context object and silently bail.
      if (k === 'nanochat_pending_context') continue;
      if (!isEncryptedEnvelope(all[k])) toEncrypt[k] = all[k];
    }
    if (Object.keys(toEncrypt).length) await storage.set(toEncrypt);
  }

  function makeSessionId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Persisted control defaults ----------
  // IDs of controls whose values are auto-saved to chrome.storage.local and
  // restored on load. Loading a saved chat session may temporarily override
  // some of these (system prompt, temperature, topK); "+ New chat" snaps them
  // back to the user's saved defaults.
  const OPTIONS_KEY = 'nanochat_options';
  const PERSISTED_OPTION_IDS = [
    'temperature', 'topK', 'json-mode', 'json-schema', 'multimodal', 'system-prompt',
    'sum-type', 'sum-format', 'sum-length', 'sum-out-lang', 'sum-shared',
    'tr-from', 'tr-to',
    'wr-tone', 'wr-format', 'wr-length', 'wr-out-lang', 'wr-shared',
    'rw-tone', 'rw-format', 'rw-length', 'rw-shared',
    'pf-lang'
  ];
  let storedOptions = {}; // populated by loadOptions() at startup

  function readControl(el) {
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }
  function writeControl(el, val) {
    if (val == null) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  }

  async function loadOptions() {
    const got = await storage.get(OPTIONS_KEY);
    return got[OPTIONS_KEY] || {};
  }

  function applyStoredOptions(stored) {
    for (const id of PERSISTED_OPTION_IDS) {
      const el = $(id);
      if (el && id in stored) writeControl(el, stored[id]);
    }
  }

  let optionsDebounce;
  function scheduleSaveOptions() {
    clearTimeout(optionsDebounce);
    optionsDebounce = setTimeout(async () => {
      const obj = {};
      for (const id of PERSISTED_OPTION_IDS) {
        const el = $(id);
        if (el) obj[id] = readControl(el);
      }
      storedOptions = obj;
      await storage.set({ [OPTIONS_KEY]: obj });
    }, 300);
  }

  async function resetOptions() {
    await storage.remove(OPTIONS_KEY);
    storedOptions = {};
    location.reload();
  }

  function wireOptionPersistence() {
    for (const id of PERSISTED_OPTION_IDS) {
      const el = $(id);
      if (!el) continue;
      const isTyping = el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number';
      el.addEventListener(isTyping ? 'input' : 'change', scheduleSaveOptions);
    }
  }

  // ---------- Pending context (from right-click on a page) ----------
  // background.js writes { kind, text, title, url, ts } to chrome.storage.local
  // under PENDING_CONTEXT_KEY (plaintext — transient handoff, not chat data).
  // On consumption it's removed and folded into the next user message so the
  // chat history stays self-contained (regenerate / reload still see it).
  const PENDING_CONTEXT_KEY = 'nanochat_pending_context';
  const contextCardEl = $('context-card');
  let pendingContext = null;

  function renderContextCard() {
    if (!contextCardEl) return;
    if (!pendingContext) {
      contextCardEl.style.display = 'none';
      contextCardEl.innerHTML = '';
      inputEl.placeholder = 'Type a message. Enter to send, Shift+Enter for newline.';
      return;
    }
    const { kind, text, title, url, images, imageStats } = pendingContext;
    const safeTitle = escapeHtmlSafe(title || url || 'webpage');
    const safeUrl = escapeHtmlSafe(url || '');
    const preview = text.length > 240 ? text.slice(0, 240) + '…' : text;
    let imgBadge = '';
    if (images && images.length > 0) {
      const skipped = imageStats && imageStats.skipped > 0 ? ` · ${imageStats.skipped} skipped` : '';
      imgBadge = `<span class="ctx-meta">· ${images.length} image${images.length === 1 ? '' : 's'}${skipped}</span>`;
    }
    contextCardEl.innerHTML = `
      <div class="ctx-head">
        <span class="ctx-label">${kind === 'selection' ? 'Selection from' : 'Page'}</span>
        <a class="ctx-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="${safeUrl}">${safeTitle}</a>
        <span class="ctx-meta">${text.length.toLocaleString()} chars</span>
        ${imgBadge}
        <button class="ctx-dismiss" type="button" title="Dismiss context">×</button>
      </div>
      <div class="ctx-preview">${escapeHtmlSafe(preview)}</div>
    `;
    contextCardEl.style.display = 'block';
    contextCardEl.querySelector('.ctx-dismiss').addEventListener('click', clearPendingContext);
    inputEl.placeholder = `Ask a question about this ${kind}…`;
  }

  function clearPendingContext() {
    // If the context brought its own image attachments, drop them too — the
    // user is dismissing the whole package. (Manually attached images get
    // wiped along with this, but that's a niche edge case.)
    if (pendingContext && pendingContext.images && pendingContext.images.length > 0) {
      for (const a of attachedImages) URL.revokeObjectURL(a.url);
      attachedImages = [];
      renderImgPreview();
    }
    pendingContext = null;
    renderContextCard();
  }

  function buildContextPrefix(ctx) {
    const header = ctx.kind === 'selection'
      ? `Context — selection from "${ctx.title || ctx.url || 'webpage'}"${ctx.url ? ` (${ctx.url})` : ''}:`
      : `Context — page "${ctx.title || ctx.url || 'webpage'}"${ctx.url ? ` (${ctx.url})` : ''}:`;
    return `${header}\n\n${ctx.text}\n\n---\n\n`;
  }

  // Consumes a pending context: renders the card + prefill immediately (so the
  // user sees feedback without waiting for the LM session), then awaits
  // startNewChat() and optionally autoSends. `options.skipNewChat` lets the
  // boot path reuse the session initPrompt is about to create, avoiding a
  // double create()/destroy() race.
  async function consumePendingContext(ctx, options = {}) {
    if (!ctx) return;
    if (!ctx.text && (!ctx.images || ctx.images.length === 0)) return;
    if (generating) {
      try { chatAbort?.abort(); } catch {}
      await new Promise(r => setTimeout(r, 60));
    }
    pendingContext = ctx;
    const hasImages = !!(ctx.images && ctx.images.length > 0);

    // Render UI synchronously so the user sees the card + prefilled input
    // even while LanguageModel.create() is still running.
    if (ctx.prefill) inputEl.value = ctx.prefill;
    renderContextCard();
    const promptTab = document.querySelector('.tab[data-tab="prompt"]');
    if (promptTab && !promptTab.classList.contains('active')) promptTab.click();

    if (options.skipNewChat) {
      // Boot path: initPrompt is creating the session right now. Force the
      // multimodal flag before that create() runs.
      if (hasImages && !multimodalEl.checked) multimodalEl.checked = true;
    } else {
      await startNewChat({ keepContext: true, forceMultimodal: hasImages });
    }

    if (hasImages) {
      // Drop any stale attachments, then convert the data-URL image payloads
      // back to Blobs so dispatchPrompt sends them as multimodal parts.
      for (const a of attachedImages) URL.revokeObjectURL(a.url);
      attachedImages = [];
      for (const img of ctx.images) {
        try {
          const blob = await (await fetch(img.dataUrl)).blob();
          attachedImages.push({ blob, url: URL.createObjectURL(blob) });
        } catch {
          // Bad payload — skip silently.
        }
      }
      renderImgPreview();
    }
    inputEl.focus();
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    if (ctx.autoSend) {
      // Wait for the LM session to be ready (initPrompt may still be running
      // its create()). Poll up to ~10s, then attempt to send regardless —
      // dispatchPrompt bails gracefully if there's no session.
      for (let i = 0; i < 100 && !session; i++) await new Promise(r => setTimeout(r, 100));
      send();
    }
  }

  // Reads pending context from storage. Returns the context (and removes it)
  // if this tab is the intended target. Used both at boot and as a fallback.
  async function takePendingContext() {
    try {
      const got = await rawStorage.get(PENDING_CONTEXT_KEY);
      const ctx = got[PENDING_CONTEXT_KEY];
      if (!ctx) return null;
      if (!ctx.text && (!ctx.images || ctx.images.length === 0)) return null;
      // If background tagged a specific targetTabId, only that tab consumes.
      if (ctx.targetTabId != null) {
        let myTab = null;
        try { myTab = await chrome.tabs.getCurrent(); } catch {}
        if (myTab && myTab.id !== ctx.targetTabId) return null;
      }
      await rawStorage.remove(PENDING_CONTEXT_KEY);
      return ctx;
    } catch {
      return null;
    }
  }

  // storage.onChanged handles the existing-tab path: background writes the
  // pending context and the focused NanoChat tab picks it up. (For freshly-
  // created tabs, the change fires before our listener is registered, so we
  // also do a one-shot read in the boot IIFE.)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      const change = changes[PENDING_CONTEXT_KEY];
      if (!change || !change.newValue) return;
      const ctx = await takePendingContext();
      if (ctx) consumePendingContext(ctx);
    });
  }

  function deriveTitle(msgs) {
    const first = msgs.find(m => m.role === 'user');
    if (!first || !first.text) return 'New chat';
    const t = first.text.trim().replace(/\s+/g, ' ');
    return t.length > 50 ? t.slice(0, 50) + '…' : t;
  }

  async function listSessions() {
    const got = await storage.get(SESSIONS_INDEX_KEY);
    return got[SESSIONS_INDEX_KEY] || [];
  }

  async function saveCurrentSession() {
    if (!currentSessionId || currentMessages.length === 0) return;
    const idx = await listSessions();
    let meta = idx.find(s => s.id === currentSessionId);
    const title = deriveTitle(currentMessages);
    if (!meta) {
      meta = { id: currentSessionId, title, createdAt: Date.now(), updatedAt: Date.now() };
      idx.unshift(meta);
    } else {
      meta.updatedAt = Date.now();
      meta.title = title;
      // Move to top.
      idx.splice(idx.indexOf(meta), 1);
      idx.unshift(meta);
    }
    await storage.set({
      [SESSIONS_INDEX_KEY]: idx,
      [SESSION_KEY_PREFIX + currentSessionId]: {
        id: currentSessionId,
        messages: currentMessages,
        systemPrompt: systemEl.value,
        temperature: parseFloat(tempEl.value),
        topK: parseInt(topKEl.value, 10),
        updatedAt: Date.now()
      }
    });
    bodyCache = null;
    await renderSessionList();
  }

  async function loadSession(id) {
    if (generating) return;
    const got = await storage.get(SESSION_KEY_PREFIX + id);
    const data = got[SESSION_KEY_PREFIX + id];
    if (!data) return;
    currentSessionId = id;
    currentMessages = data.messages || [];
    if (data.systemPrompt != null) systemEl.value = data.systemPrompt;
    if (data.temperature != null && !Number.isNaN(data.temperature)) tempEl.value = data.temperature;
    if (data.topK != null && !Number.isNaN(data.topK)) topKEl.value = data.topK;
    clearPendingContext();
    repaintLog();
    // Rebuild the in-memory LM session with the prior conversation so the model has context.
    await createSession({ replay: currentMessages });
    await renderSessionList();
  }

  function repaintLog() {
    logEl.innerHTML = '';
    currentMessages.forEach((m, i) => {
      const body = addMessage(m.role, '', [], i);
      if (m.role === 'assistant') body.innerHTML = renderMarkdown(m.text);
      else body.textContent = m.text;
    });
  }

  // Drop messages from `index` onward, repaint, and rebuild the LM session
  // with the truncated history. Used by edit (user) and regenerate (assistant).
  async function truncateMessagesFrom(index) {
    currentMessages = currentMessages.slice(0, index);
    repaintLog();
    await createSession({ replay: currentMessages });
    if (currentMessages.length > 0) {
      saveCurrentSession();
      return;
    }
    // Edited away the entire conversation — drop the persisted session in
    // place (don't go through startNewChat: we want to keep the input value
    // and not reset persisted options).
    if (currentSessionId) {
      const idx = await listSessions();
      const next = idx.filter(s => s.id !== currentSessionId);
      await storage.set({ [SESSIONS_INDEX_KEY]: next });
      await storage.remove(SESSION_KEY_PREFIX + currentSessionId);
      bodyCache = null;
      currentSessionId = makeSessionId();
      await renderSessionList();
    }
  }

  async function editUserMessage(index) {
    if (generating) return;
    const m = currentMessages[index];
    if (!m || m.role !== 'user') return;
    inputEl.value = m.text;
    await truncateMessagesFrom(index);
    inputEl.focus();
    // Caret to end so the user can immediately keep editing.
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  }

  async function regenerateAssistant(index) {
    if (generating) return;
    const m = currentMessages[index];
    if (!m || m.role !== 'assistant') return;
    const prior = currentMessages[index - 1];
    if (!prior || prior.role !== 'user') return;
    const userText = prior.text;
    await truncateMessagesFrom(index - 1);
    dispatchPrompt({ text: userText });
  }

  async function deleteSession(id) {
    const idx = await listSessions();
    const next = idx.filter(s => s.id !== id);
    await storage.set({ [SESSIONS_INDEX_KEY]: next });
    await storage.remove(SESSION_KEY_PREFIX + id);
    bodyCache = null;
    if (currentSessionId === id) {
      await startNewChat();
    } else {
      await renderSessionList();
    }
  }

  async function startNewChat({ keepContext = false, forceMultimodal = false } = {}) {
    if (generating) return;
    // Restore the user's saved defaults — overrides any session-specific values
    // (e.g. system prompt, temp, topK) left over from a previously loaded chat.
    storedOptions = await loadOptions();
    applyStoredOptions(storedOptions);
    // forceMultimodal: applied *after* applyStoredOptions so it overrides the
    // user's saved preference for this one session (when an image-bearing
    // context arrives, we need a multimodal session to ingest the images).
    if (forceMultimodal && !multimodalEl.checked) multimodalEl.checked = true;
    currentSessionId = makeSessionId();
    currentMessages = [];
    logEl.innerHTML = '';
    if (!keepContext) clearPendingContext();
    await createSession();
    await renderSessionList();
  }

  function formatRelative(ts) {
    const d = Date.now() - ts;
    if (d < 60_000) return 'just now';
    if (d < 3600_000) return Math.floor(d / 60_000) + 'm ago';
    if (d < 86_400_000) return Math.floor(d / 3600_000) + 'h ago';
    if (d < 7 * 86_400_000) return Math.floor(d / 86_400_000) + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  function escapeHtmlSafe(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Highlight `q` (case-insensitive) inside `text`. Returns sanitized HTML with <mark>.
  function highlight(text, q) {
    const safe = escapeHtmlSafe(text);
    if (!q) return safe;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return safe.replace(re, m => '<mark>' + m + '</mark>');
  }

  // Pull a short snippet around the first match of `q` in any message.
  function findSnippet(messages, q) {
    if (!q) return null;
    const ql = q.toLowerCase();
    for (const m of messages) {
      const t = (m.text || '').toString();
      const i = t.toLowerCase().indexOf(ql);
      if (i >= 0) {
        const start = Math.max(0, i - 25);
        const end = Math.min(t.length, i + q.length + 50);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < t.length ? '…' : '';
        return { snippet: prefix + t.slice(start, end) + suffix, role: m.role };
      }
    }
    return null;
  }

  async function loadAllSessionBodies(idx) {
    if (bodyCache) return bodyCache;
    const keys = idx.map(s => SESSION_KEY_PREFIX + s.id);
    const got = keys.length ? await storage.get(keys) : {};
    bodyCache = {};
    for (const s of idx) {
      bodyCache[s.id] = got[SESSION_KEY_PREFIX + s.id] || { messages: [] };
    }
    return bodyCache;
  }

  async function renderSessionList() {
    const idx = await listSessions();
    const q = searchQuery.trim();
    sessionListEl.innerHTML = '';

    let visible = idx;
    let bodies = null;
    if (q) {
      bodies = await loadAllSessionBodies(idx);
      const ql = q.toLowerCase();
      visible = idx.filter(s => {
        if ((s.title || '').toLowerCase().includes(ql)) return true;
        const body = bodies[s.id];
        if (!body) return false;
        return (body.messages || []).some(m => (m.text || '').toLowerCase().includes(ql));
      });
    }

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'session-empty';
      empty.textContent = q
        ? 'No chats match "' + q + '".'
        : 'No saved chats yet.';
      sessionListEl.append(empty);
    } else {
      for (const s of visible) {
        const item = document.createElement('div');
        item.className = 'session-item' + (s.id === currentSessionId ? ' active' : '');
        const wrap = document.createElement('div');
        wrap.style.flex = '1';
        wrap.style.overflow = 'hidden';
        const title = document.createElement('div');
        title.className = 'session-title';
        title.innerHTML = highlight(s.title || 'Untitled', q);
        wrap.append(title);
        if (q && bodies) {
          const found = findSnippet(bodies[s.id]?.messages || [], q);
          if (found) {
            const snip = document.createElement('div');
            snip.className = 'session-snippet';
            snip.innerHTML = (found.role === 'user' ? 'you: ' : 'asst: ') + highlight(found.snippet, q);
            wrap.append(snip);
          }
        }
        const meta = document.createElement('div');
        meta.className = 'session-meta';
        meta.textContent = formatRelative(s.updatedAt);
        wrap.append(meta);
        wrap.addEventListener('click', () => loadSession(s.id));
        const del = document.createElement('button');
        del.className = 'session-del';
        del.textContent = '×';
        del.title = 'Delete this chat';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Delete "' + (s.title || 'this chat') + '"?')) deleteSession(s.id);
        });
        item.append(wrap, del);
        sessionListEl.append(item);
      }
    }

    const total = idx.length;
    const shown = visible.length;
    const countText = q ? (shown + ' of ' + total + ' chat' + (total === 1 ? '' : 's')) : (total + ' chat' + (total === 1 ? '' : 's'));
    try {
      const bytes = await storage.getBytesInUse();
      storageMetaEl.textContent = countText + ' · ' + (bytes / 1024).toFixed(1) + ' KB';
    } catch {
      storageMetaEl.textContent = countText;
    }
    clearAllBtn.disabled = total === 0;
  }

  async function clearAllChats() {
    if (generating) return;
    const idx = await listSessions();
    if (idx.length === 0) return;
    if (!confirm('Delete all ' + idx.length + ' saved chat' + (idx.length === 1 ? '' : 's') + '? This cannot be undone.')) return;
    await storage.remove(idx.map(s => SESSION_KEY_PREFIX + s.id).concat(SESSIONS_INDEX_KEY));
    bodyCache = null;
    await startNewChat();
  }

  newChatBtn.addEventListener('click', startNewChat);
  clearAllBtn.addEventListener('click', clearAllChats);

  // Debounced search to keep typing snappy.
  let searchDebounce;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchQuery = searchEl.value;
      renderSessionList();
    }, 100);
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchEl.value = ''; searchQuery = ''; renderSessionList(); }
  });

  function addMessage(role, text, imgs = [], index = null) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (index != null) div.dataset.index = String(index);
    const roleLabel = document.createElement('div');
    roleLabel.className = 'role';
    roleLabel.textContent = role;
    const body = document.createElement('div');
    body.textContent = text;
    div.append(roleLabel, body);
    for (const url of imgs) {
      const img = document.createElement('img');
      img.src = url;
      div.append(img);
    }
    // Per-message actions (edit user / regenerate assistant). Errors and the
    // streaming-in-progress assistant bubble pass index=null and get no actions.
    if (index != null && (role === 'user' || role === 'assistant')) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      if (role === 'user') {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'msg-action';
        editBtn.title = 'Edit and resend (drops everything below)';
        editBtn.textContent = '✎ Edit';
        editBtn.addEventListener('click', () => editUserMessage(Number(div.dataset.index)));
        actions.append(editBtn);
      } else {
        const regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'msg-action';
        regenBtn.title = 'Regenerate this reply (drops it and any following turns)';
        regenBtn.textContent = '↻ Regenerate';
        regenBtn.addEventListener('click', () => regenerateAssistant(Number(div.dataset.index)));
        actions.append(regenBtn);
      }
      div.append(actions);
    }
    logEl.append(div);
    logEl.scrollTop = logEl.scrollHeight;
    return body;
  }

  const usageBarEl = $('usage-bar');
  const usagePctEl = $('usage-pct');
  function updateUsage() {
    if (!session) return;
    // Newer property names: contextUsage / contextWindow.
    // Older Chrome exposes inputUsage / inputQuota. Fall back gracefully.
    const used = session.inputUsage ?? session.contextUsage ?? 0;
    const quota = session.inputQuota ?? session.contextWindow ?? 0;
    usageEl.textContent = `tokens: ${used} / ${quota}`;
    const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
    usageBarEl.style.width = pct.toFixed(1) + '%';
    usageBarEl.classList.toggle('warn', pct >= 70 && pct < 90);
    usageBarEl.classList.toggle('error', pct >= 90);
    usagePctEl.textContent = pct.toFixed(1) + '%';
  }

  function renderImgPreview() {
    imgPreview.innerHTML = '';
    attachedImages.forEach((a, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = a.url;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        URL.revokeObjectURL(a.url);
        attachedImages.splice(i, 1);
        renderImgPreview();
      });
      wrap.append(img, btn);
      imgPreview.append(wrap);
    });
  }

  imgBtn.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', (e) => {
    for (const file of e.target.files) {
      attachedImages.push({ blob: file, url: URL.createObjectURL(file) });
    }
    imgInput.value = '';
    renderImgPreview();
  });

  function renderAudioPreview() {
    audioPreview.innerHTML = '';
    attachedAudio.forEach((a, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      wrap.style.width = 'auto';
      wrap.style.height = 'auto';
      wrap.style.padding = '4px 8px';
      wrap.style.fontSize = '11px';
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.textContent = `🔊 ${a.name}`;
      const btn = document.createElement('button');
      btn.textContent = '×';
      btn.style.position = 'static';
      btn.style.background = 'transparent';
      btn.style.color = 'var(--muted)';
      btn.style.border = 'none';
      btn.addEventListener('click', () => {
        attachedAudio.splice(i, 1);
        renderAudioPreview();
      });
      wrap.append(btn);
      audioPreview.append(wrap);
    });
  }

  audioBtn.addEventListener('click', () => audioInput.click());
  audioInput.addEventListener('change', (e) => {
    for (const file of e.target.files) {
      attachedAudio.push({ blob: file, name: file.name });
    }
    audioInput.value = '';
    renderAudioPreview();
  });

  async function initPrompt() {
    if (!('LanguageModel' in self)) {
      setStatus(promptStatus, 'LanguageModel API not available', 'error');
      addMessage('error', 'This browser does not expose LanguageModel. Requires Chrome 138+ with the on-device model component installed. Enable chrome://flags#prompt-api-for-gemini-nano and check chrome://on-device-internals.');
      return;
    }

    setStatus(promptStatus, 'checking…');
    const expected = multimodalEl.checked
      ? { expectedInputs: [{ type: 'text' }, { type: 'image' }] }
      : undefined;
    const availability = await checkAvailability('LanguageModel', promptStatus, expected);
    if (!availability || availability === 'unavailable') return;

    try {
      const params = await LanguageModel.params();
      usageDefaultsEl.innerHTML =
        `defaults: temp ${params.defaultTemperature}, topK ${params.defaultTopK} ` +
        `<a href="#" id="reset-options" style="color:var(--accent);text-decoration:none;margin-left:6px" ` +
        `title="Clear saved option overrides and reload">[reset options]</a>`;
      $('reset-options').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Reset all saved options to defaults? Chat history is kept.')) resetOptions();
      });
      // Only fall back to model-reported defaults if the user hasn't saved their own.
      if (!('temperature' in storedOptions)) tempEl.value = params.defaultTemperature;
      if (!('topK' in storedOptions)) topKEl.value = params.defaultTopK;
    } catch {}

    if (availability === 'downloadable' || availability === 'downloading') {
      addMessage('assistant', 'Model component is being downloaded. Try again once it finishes.');
    }

    await createSession();
  }

  async function createSession({ replay } = {}) {
    if (session) {
      try { session.destroy(); } catch {}
      session = null;
    }
    setStatus(promptStatus, 'creating session…', 'warn');
    try {
      const opts = {
        temperature: parseFloat(tempEl.value),
        topK: parseInt(topKEl.value, 10),
        monitor: makeMonitor(promptStatus, 'downloading')
      };
      if (multimodalEl.checked) {
        opts.expectedInputs = [{ type: 'text' }, { type: 'image' }, { type: 'audio' }];
      }
      const sys = systemEl.value.trim();
      // Replay prior conversation as initialPrompts so the model has context after a reload.
      // Caller passes `replay`; otherwise fall back to the in-memory currentMessages so toggling
      // temp/topK/multimodal mid-chat doesn't drop history from the model's view.
      const history = replay || currentMessages;
      const initial = [];
      if (sys) initial.push({ role: 'system', content: sys });
      for (const m of history) {
        if (m.role === 'user' || m.role === 'assistant') {
          initial.push({ role: m.role, content: m.text });
        }
      }
      if (initial.length) opts.initialPrompts = initial;

      session = await LanguageModel.create(opts);
      session.addEventListener?.('contextoverflow', () => {
        addMessage('error', 'context overflow — session is full. Reset or clone to continue.');
        updateUsage();
      });
      setStatus(promptStatus, 'ready', 'ok');
      sendBtn.disabled = false;
      updateUsage();
    } catch (e) {
      setStatus(promptStatus, `create() failed: ${e.message}`, 'error');
      addMessage('error', `create() failed: ${e.message}`);
    }
  }

  // Dispatch a prompt to the model. Used by send() (user input) and
  // regenerateAssistant() (re-run a prior user turn without re-typing).
  // `images`/`audio` only flow from send() — they're not persisted, so a
  // regenerate after reload only has access to the text turn.
  async function dispatchPrompt({ text, images = [], audio = [] }) {
    if (!session) return;
    if (!text && images.length === 0 && audio.length === 0) return;

    // Fold a pending right-click context into the *persisted* user message so
    // the chat is self-contained (regenerate / reload still sees it).
    let effectiveText = text;
    if (pendingContext && pendingContext.text) {
      effectiveText = buildContextPrefix(pendingContext) + (text || '');
      clearPendingContext();
    }

    const imgUrls = images.map(a => a.url);
    const audioNames = audio.map(a => `🔊 ${a.name}`).join(' ');
    const userDisplay = audioNames ? (effectiveText ? effectiveText + '\n' + audioNames : audioNames) : effectiveText;

    if (!currentSessionId) currentSessionId = makeSessionId();
    const userIndex = effectiveText ? currentMessages.length : null;
    addMessage('user', userDisplay, imgUrls, userIndex);
    if (effectiveText) currentMessages.push({ role: 'user', text: effectiveText });

    let messageContent;
    if (images.length > 0 || audio.length > 0) {
      const parts = [];
      if (effectiveText) parts.push({ type: 'text', value: effectiveText });
      for (const a of images) parts.push({ type: 'image', value: a.blob });
      for (const a of audio) parts.push({ type: 'audio', value: a.blob });
      messageContent = [{ role: 'user', content: parts }];
    } else {
      messageContent = effectiveText;
    }

    const callOpts = {};
    if (jsonModeEl.checked) {
      try {
        callOpts.responseConstraint = JSON.parse(jsonSchemaEl.value);
      } catch (e) {
        addMessage('error', `Invalid JSON schema: ${e.message}`);
        return;
      }
    }

    // Assistant index = where the assistant turn will land after the upcoming push.
    const assistantIndex = currentMessages.length;
    const out = addMessage('assistant', '', [], assistantIndex);
    let raw = '';
    generating = true;
    chatAbort = new AbortController();
    callOpts.signal = chatAbort.signal;
    sendBtn.textContent = 'Stop';
    sendBtn.classList.add('stop');

    try {
      const stream = session.promptStreaming(messageContent, callOpts);
      for await (const chunk of stream) {
        raw += chunk;
        out.innerHTML = renderMarkdown(raw);
        logEl.scrollTop = logEl.scrollHeight;
      }
      // Clear attachments after a successful send (they're now in conversation history).
      for (const a of images) URL.revokeObjectURL(a.url);
      if (images === attachedImages) attachedImages = [];
      if (audio === attachedAudio) attachedAudio = [];
      renderImgPreview();
      renderAudioPreview();
      if (raw) currentMessages.push({ role: 'assistant', text: raw });
      saveCurrentSession();
    } catch (e) {
      const aborted = e.name === 'AbortError' || chatAbort?.signal.aborted;
      out.parentElement.classList.remove('assistant');
      out.parentElement.classList.add('error');
      out.textContent = aborted ? '(stopped)' : `error: ${e.message}`;
      // Aborted/errored assistant bubble was never pushed to currentMessages;
      // strip the dataset.index so it can't be regenerated by accident.
      delete out.parentElement.dataset.index;
      out.parentElement.querySelector('.msg-actions')?.remove();
    } finally {
      generating = false;
      chatAbort = null;
      sendBtn.textContent = 'Send';
      sendBtn.classList.remove('stop');
      updateUsage();
    }
  }

  async function send() {
    if (generating) { chatAbort && chatAbort.abort(); return; }
    if (!session) return;
    const text = inputEl.value.trim();
    if (!text && attachedImages.length === 0 && attachedAudio.length === 0 && !pendingContext) return;
    inputEl.value = '';
    await dispatchPrompt({ text, images: attachedImages, audio: attachedAudio });
  }

  sendBtn.addEventListener('click', send);
  // "Reset session" rebuilds the LM session but keeps the current chat's history (and replays it).
  resetBtn.addEventListener('click', () => createSession());
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  [tempEl, topKEl, multimodalEl].forEach(el => el.addEventListener('change', () => createSession()));

  // Load and apply saved option defaults before initPrompt runs (so it won't overwrite them).
  // Migration runs first so any pre-encryption plaintext is rewritten as ciphertext
  // before the first read.
  (async () => {
    await migrateToEncrypted();
    storedOptions = await loadOptions();
    applyStoredOptions(storedOptions);
    wireOptionPersistence();

    // Take any pending right-click/popup context BEFORE initPrompt so we can
    // render the card + prefill immediately, and so initPrompt's create()
    // opens a session with the correct (multimodal-aware) options. Without
    // this, the context sat behind a slow LanguageModel.create() and the user
    // saw a blank NanoChat tab.
    const pending = await takePendingContext();
    if (pending) {
      const hasImages = !!(pending.images && pending.images.length > 0);
      if (hasImages && !multimodalEl.checked) multimodalEl.checked = true;
      pendingContext = pending;
      if (pending.prefill) inputEl.value = pending.prefill;
      renderContextCard();
    }

    await initPrompt();
    renderSessionList();

    if (pending) await consumePendingContext(pending, { skipNewChat: true });
  })();

  // ---------- Shared probe ----------
  const PROBE_CODES = ['ar','bg','bn','cs','da','de','el','en','es','fi','fr','hi','hr','hu','id','it','iw','ja','kn','ko','lt','mr','nl','no','pl','pt','ro','ru','sk','sl','sv','ta','te','th','tr','uk','vi','zh','zh-Hant'];

  function renderProbe(containerEl, results) {
    containerEl.style.display = 'flex';
    const out = containerEl.querySelector('.out');
    const grouped = {};
    for (const r of results) (grouped[r.status] ||= []).push(r.lang);
    const lines = [];
    const order = ['available','readily-available','downloadable','downloading','unavailable'];
    for (const k of order) {
      if (grouped[k]) lines.push(`${k} (${grouped[k].length}): ${grouped[k].join(', ')}`);
    }
    for (const k of Object.keys(grouped)) {
      if (!order.includes(k)) lines.push(`${k} (${grouped[k].length}): ${grouped[k].join(', ')}`);
    }
    out.textContent = lines.join('\n');
  }

  document.querySelectorAll('.hide-probe').forEach(btn => {
    btn.addEventListener('click', () => { $(btn.dataset.target).style.display = 'none'; });
  });

  $('prompt-probe').addEventListener('click', async () => {
    if (!('LanguageModel' in self)) return;
    const container = $('prompt-probe-out');
    container.style.display = 'flex';
    container.querySelector('.out').textContent = 'probing…';
    const results = await Promise.all(PROBE_CODES.map(async lang => {
      try {
        const status = await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: [lang] }] });
        return { lang, status };
      } catch (e) { return { lang, status: 'error' }; }
    }));
    renderProbe(container, results);
  });

  $('tr-probe').addEventListener('click', async () => {
    if (!('Translator' in self)) return;
    const src = $('tr-from').value.trim() || 'en';
    const container = $('tr-probe-out');
    container.style.display = 'flex';
    container.querySelector('.out').textContent = `probing ${src} → …`;
    const results = await Promise.all(PROBE_CODES.map(async lang => {
      try {
        const status = await Translator.availability({ sourceLanguage: src, targetLanguage: lang });
        return { lang, status };
      } catch (e) { return { lang, status: 'error' }; }
    }));
    renderProbe(container, results);
  });

  // ============================================================
  // SUMMARIZER
  // ============================================================
  const sumStatus = $('summarizer-status');
  const sumOut = $('sum-out');
  const sumMeta = $('sum-meta');
  let sumAbort = null;

  $('sum-check').addEventListener('click', () => checkAvailability('Summarizer', sumStatus));

  async function runSummarizer(streaming) {
    if (!('Summarizer' in self)) { showError(sumOut, new Error('Summarizer not in self')); return; }
    const opts = {
      type: $('sum-type').value,
      format: $('sum-format').value,
      length: $('sum-length').value,
      sharedContext: $('sum-shared').value || undefined,
      monitor: makeMonitor(sumStatus, 'downloading')
    };
    const ol = $('sum-out-lang').value.trim();
    if (ol) opts.outputLanguage = ol;

    clearOut(sumOut);
    sumMeta.textContent = '';
    const t0 = performance.now();
    sumAbort = new AbortController();
    let summarizer;
    try {
      summarizer = await Summarizer.create(opts);
      setStatus(sumStatus, 'ready', 'ok');
      const text = $('sum-input').value;
      if (streaming) {
        const stream = summarizer.summarizeStreaming(text, { signal: sumAbort.signal });
        for await (const chunk of stream) sumOut.textContent += chunk;
      } else {
        sumOut.textContent = await summarizer.summarize(text, { signal: sumAbort.signal });
      }
      sumMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms`;
    } catch (e) {
      showError(sumOut, e);
    } finally {
      try { summarizer && summarizer.destroy(); } catch {}
      sumAbort = null;
    }
  }
  $('sum-run').addEventListener('click', () => runSummarizer(false));
  $('sum-stream').addEventListener('click', () => runSummarizer(true));
  $('sum-abort').addEventListener('click', () => sumAbort && sumAbort.abort());

  // ============================================================
  // TRANSLATOR
  // ============================================================
  const trStatus = $('translator-status');
  const trOut = $('tr-out');
  const trMeta = $('tr-meta');
  let trAbort = null;

  $('tr-check').addEventListener('click', () => checkAvailability('Translator', trStatus, {
    sourceLanguage: $('tr-from').value.trim(),
    targetLanguage: $('tr-to').value.trim()
  }));
  $('tr-swap').addEventListener('click', () => {
    const f = $('tr-from'), t = $('tr-to');
    [f.value, t.value] = [t.value, f.value];
  });

  async function runTranslator(streaming) {
    if (!('Translator' in self)) { showError(trOut, new Error('Translator not in self')); return; }
    clearOut(trOut);
    trMeta.textContent = '';
    const t0 = performance.now();
    trAbort = new AbortController();
    let translator;
    try {
      translator = await Translator.create({
        sourceLanguage: $('tr-from').value.trim(),
        targetLanguage: $('tr-to').value.trim(),
        monitor: makeMonitor(trStatus, 'downloading')
      });
      setStatus(trStatus, 'ready', 'ok');
      const text = $('tr-input').value;
      if (streaming) {
        const stream = translator.translateStreaming(text, { signal: trAbort.signal });
        for await (const chunk of stream) trOut.textContent += chunk;
      } else {
        trOut.textContent = await translator.translate(text, { signal: trAbort.signal });
      }
      trMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms`;
    } catch (e) {
      showError(trOut, e);
    } finally {
      try { translator && translator.destroy && translator.destroy(); } catch {}
      trAbort = null;
    }
  }
  $('tr-run').addEventListener('click', () => runTranslator(false));
  $('tr-stream').addEventListener('click', () => runTranslator(true));
  $('tr-abort').addEventListener('click', () => trAbort && trAbort.abort());

  // ============================================================
  // LANGUAGE DETECTOR
  // ============================================================
  const ldStatus = $('detector-status');
  const ldOut = $('ld-out');
  const ldMeta = $('ld-meta');
  let ldDetector = null;

  $('ld-check').addEventListener('click', () => checkAvailability('LanguageDetector', ldStatus));
  $('ld-create').addEventListener('click', async () => {
    if (!('LanguageDetector' in self)) { setStatus(ldStatus, 'not in self', 'error'); return; }
    try {
      ldDetector = await LanguageDetector.create({ monitor: makeMonitor(ldStatus, 'downloading') });
      setStatus(ldStatus, 'ready', 'ok');
    } catch (e) {
      setStatus(ldStatus, `create() failed: ${e.message}`, 'error');
    }
  });
  $('ld-run').addEventListener('click', async () => {
    clearOut(ldOut);
    ldMeta.textContent = '';
    if (!ldDetector) {
      try {
        ldDetector = await LanguageDetector.create({ monitor: makeMonitor(ldStatus, 'downloading') });
        setStatus(ldStatus, 'ready', 'ok');
      } catch (e) { showError(ldOut, e); return; }
    }
    const t0 = performance.now();
    try {
      const results = await ldDetector.detect($('ld-input').value);
      const top = results.slice(0, 5)
        .map(r => `${r.detectedLanguage}\t${(r.confidence * 100).toFixed(2)}%`)
        .join('\n');
      ldOut.textContent = top;
      ldMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms · ${results.length} candidates`;
    } catch (e) { showError(ldOut, e); }
  });

  // ============================================================
  // WRITER
  // ============================================================
  const wrStatus = $('writer-status');
  const wrOut = $('wr-out');
  const wrMeta = $('wr-meta');
  let wrAbort = null;

  $('wr-check').addEventListener('click', () => checkAvailability('Writer', wrStatus));

  async function runWriter(streaming) {
    if (!('Writer' in self)) { showError(wrOut, new Error('Writer not in self — needs origin trial token or chrome://flags')); return; }
    const opts = {
      tone: $('wr-tone').value,
      format: $('wr-format').value,
      length: $('wr-length').value,
      sharedContext: $('wr-shared').value || undefined,
      monitor: makeMonitor(wrStatus, 'downloading')
    };
    const ol = $('wr-out-lang').value.trim();
    if (ol) opts.outputLanguage = ol;

    clearOut(wrOut);
    wrMeta.textContent = '';
    const t0 = performance.now();
    wrAbort = new AbortController();
    let writer;
    try {
      writer = await Writer.create(opts);
      setStatus(wrStatus, 'ready', 'ok');
      const text = $('wr-input').value;
      if (streaming) {
        const stream = writer.writeStreaming(text, { signal: wrAbort.signal });
        for await (const chunk of stream) wrOut.textContent += chunk;
      } else {
        wrOut.textContent = await writer.write(text, { signal: wrAbort.signal });
      }
      wrMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms`;
    } catch (e) {
      showError(wrOut, e);
    } finally {
      try { writer && writer.destroy(); } catch {}
      wrAbort = null;
    }
  }
  $('wr-run').addEventListener('click', () => runWriter(false));
  $('wr-stream').addEventListener('click', () => runWriter(true));
  $('wr-abort').addEventListener('click', () => wrAbort && wrAbort.abort());

  // ============================================================
  // REWRITER
  // ============================================================
  const rwStatus = $('rewriter-status');
  const rwOut = $('rw-out');
  const rwMeta = $('rw-meta');
  let rwAbort = null;

  $('rw-check').addEventListener('click', () => checkAvailability('Rewriter', rwStatus));

  async function runRewriter(streaming) {
    if (!('Rewriter' in self)) { showError(rwOut, new Error('Rewriter not in self — needs origin trial token or chrome://flags')); return; }
    const opts = {
      tone: $('rw-tone').value,
      format: $('rw-format').value,
      length: $('rw-length').value,
      sharedContext: $('rw-shared').value || undefined,
      monitor: makeMonitor(rwStatus, 'downloading')
    };
    clearOut(rwOut);
    rwMeta.textContent = '';
    const t0 = performance.now();
    rwAbort = new AbortController();
    let rewriter;
    try {
      rewriter = await Rewriter.create(opts);
      setStatus(rwStatus, 'ready', 'ok');
      const text = $('rw-input').value;
      if (streaming) {
        const stream = rewriter.rewriteStreaming(text, { signal: rwAbort.signal });
        for await (const chunk of stream) rwOut.textContent += chunk;
      } else {
        rwOut.textContent = await rewriter.rewrite(text, { signal: rwAbort.signal });
      }
      rwMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms`;
    } catch (e) {
      showError(rwOut, e);
    } finally {
      try { rewriter && rewriter.destroy(); } catch {}
      rwAbort = null;
    }
  }
  $('rw-run').addEventListener('click', () => runRewriter(false));
  $('rw-stream').addEventListener('click', () => runRewriter(true));
  $('rw-abort').addEventListener('click', () => rwAbort && rwAbort.abort());

  // ============================================================
  // PROOFREADER
  // ============================================================
  const pfStatus = $('proofreader-status');
  const pfOut = $('pf-out');
  const pfMeta = $('pf-meta');
  const pfCorrections = $('pf-corrections');

  $('pf-check').addEventListener('click', () => checkAvailability('Proofreader', pfStatus));

  $('pf-run').addEventListener('click', async () => {
    if (!('Proofreader' in self)) { showError(pfOut, new Error('Proofreader not in self — origin trial only (Chrome 141–145), try Canary')); return; }
    clearOut(pfOut);
    pfCorrections.innerHTML = '';
    pfMeta.textContent = '';
    const t0 = performance.now();
    let pf;
    try {
      pf = await Proofreader.create({
        expectedInputLanguages: [$('pf-lang').value.trim() || 'en'],
        monitor: makeMonitor(pfStatus, 'downloading')
      });
      setStatus(pfStatus, 'ready', 'ok');
      const result = await pf.proofread($('pf-input').value);
      pfOut.textContent = result.correctedInput || result.corrected || '(no corrected text returned)';
      const corrections = result.corrections || [];
      pfMeta.textContent = `${(performance.now() - t0).toFixed(0)} ms · ${corrections.length} corrections`;
      const original = $('pf-input').value;
      for (const c of corrections) {
        const div = document.createElement('div');
        div.className = 'corr';
        const start = c.startIndex ?? c.offset ?? 0;
        const end = c.endIndex ?? (start + (c.length ?? 0));
        const orig = original.slice(start, end);
        div.innerHTML = `<div class="type">${c.type || 'edit'}</div>
          <div><del>${escapeHtml(orig)}</del> → <ins>${escapeHtml(c.correction || '')}</ins></div>
          ${c.explanation ? `<div style="color:var(--muted);font-size:11px;margin-top:2px">${escapeHtml(c.explanation)}</div>` : ''}`;
        pfCorrections.append(div);
      }
    } catch (e) {
      showError(pfOut, e);
    } finally {
      try { pf && pf.destroy && pf.destroy(); } catch {}
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
