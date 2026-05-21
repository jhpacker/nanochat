(async () => {
  const root = document.getElementById('root');
  const NANOCHAT_URL = chrome.runtime.getURL('index.html');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Already on NanoChat → just close (preserves the old "focus" behavior since
  // the tab is already active). Avoids a useless menu.
  if (tab && tab.url === NANOCHAT_URL) {
    window.close();
    return;
  }

  // Restricted scheme (chrome://, chrome-extension://, view-source:, etc.)
  // → scripting can't run. Offer only "Open NanoChat".
  const restricted = !tab || !tab.url || /^(chrome|edge|about|view-source|chrome-extension|file|devtools):/i.test(tab.url);

  render();

  function render() {
    root.innerHTML = '';

    if (restricted) {
      root.append(makeHeader(tab && tab.title ? tab.title : 'NanoChat'));
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = "Page actions aren't available on this kind of tab. Open NanoChat to start a chat manually.";
      root.append(note);
      const div = document.createElement('div');
      div.className = 'divider';
      root.append(div);
      root.append(makeOpenRow());
      return;
    }

    root.append(makeHeader(tab.title || tab.url));

    root.append(makeAction(
      'Summarize this page',
      'One-shot summary, auto-sent.',
      () => invoke('summarize-page', { includeImages: false }),
    ));
    root.append(makeAction(
      'Summarize this page (with images)',
      'Captions up to 10 large images first. (experimental)',
      () => invoke('summarize-page', { includeImages: true }),
    ));
    root.append(makeAction(
      'Ask about this page',
      'Load page content into a new chat.',
      () => invoke('ask-page', { includeImages: false }),
    ));
    root.append(makeAction(
      'Ask about this page (with images)',
      'Loads page + captioned images. (experimental)',
      () => invoke('ask-page', { includeImages: true }),
    ));

    const div = document.createElement('div');
    div.className = 'divider';
    root.append(div);
    root.append(makeOpenRow());
  }

  function makeHeader(title) {
    const h = document.createElement('div');
    h.className = 'header';
    const label = document.createElement('span');
    label.textContent = 'Active tab';
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = title;
    t.title = tab && tab.url ? tab.url : '';
    h.append(label, t);
    return h;
  }

  function makeAction(label, sub, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action';
    const main = document.createElement('span');
    main.textContent = label;
    const subEl = document.createElement('span');
    subEl.className = 'sub';
    subEl.textContent = sub;
    btn.append(main, subEl);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function makeOpenRow() {
    const row = document.createElement('div');
    row.className = 'linkrow';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'link';
    open.textContent = 'Open New NanoChat ›';
    open.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'nanochat:open', windowId: tab && tab.windowId });
      window.close();
    });
    row.append(open);
    return row;
  }

  async function invoke(action, extra = {}) {
    // Visual busy state — popup will close as soon as background acks.
    const buttons = root.querySelectorAll('.action, .link');
    buttons.forEach(b => { b.disabled = true; });
    const note = document.createElement('div');
    note.className = 'note busy';
    note.textContent = extra.includeImages ? 'Capturing page + images…' : 'Sending to NanoChat…';
    root.append(note);
    try {
      await chrome.runtime.sendMessage({
        type: 'nanochat:popup-action',
        action,
        tab: { id: tab.id, title: tab.title, url: tab.url, windowId: tab.windowId },
        options: {
          includeImages: !!extra.includeImages,
        },
      });
    } catch {}
    window.close();
  }
})();
