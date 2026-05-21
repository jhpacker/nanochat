chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('index.html');
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url === url);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
});
