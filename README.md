# NanoChat

A private, on-device AI chat app — like a nano version of ChatGPT — built on Chrome's built-in Gemini Nano model. Also includes Summarizer, Translator, Writer, Rewriter, Proofreader, and Language Detector tools, each backed by a Chrome built-in AI API.

100% local — runs entirely on your machine. No network calls, no server, no API keys. Chat history is encrypted at rest (AES-GCM, key in IndexedDB).

## Requirements

- **Chrome 138+** on desktop (Windows 10+, macOS 13+, Linux, or ChromeOS Chromebook Plus)
- ~22 GB free disk space (for the Gemini Nano model component)
- 16 GB RAM **or** a GPU with 4+ GB VRAM
- The first time you use a feature, Chrome may need to download the model component. Watch progress at `chrome://on-device-internals`.

## Install

NanoChat ships in two forms. The **extension** adds a toolbar popup and right-click menu so you can summarize or ask questions about the current page. The **single-file** form is one HTML file you double-click — no install, no permissions.

### Extension (recommended — adds page actions)

1. Clone or [download a ZIP](https://github.com/jhpacker/nanochat) of this repo and unzip it.
2. Open `chrome://extensions`, enable **Developer mode** (top right), click **Load unpacked**, and select the [`extension/`](extension/) folder.
3. Click the NanoChat toolbar icon to chat, or right-click any page for **Summarize / Ask about this page** entries. Each comes in a plain and a *(with images)* variant — the latter captions up to 10 large on-page images with the multimodal model and folds the descriptions into the chat context.

### Single-file (no install)

Pick whichever is easiest:

- **Copy/paste:** open [`index.html` raw](https://raw.githubusercontent.com/jhpacker/nanochat/main/index.html), select all + copy, paste into a text editor, save as `nanochat.html`, double-click to open in Chrome.
- **ZIP:** [download the repo](https://github.com/jhpacker/nanochat), unzip, double-click the root `index.html`.
- **Git:** `git clone https://github.com/jhpacker/nanochat.git && open nanochat/index.html`

You'll get a `file:///…/nanochat.html` URL — no web server required. If Chrome isn't your default browser, right-click the file → **Open With → Google Chrome**.

## Development

The root `index.html` is generated. The source of truth is the [`extension/`](extension/) directory (Manifest V3 extension form). To rebuild the single-file `index.html` after editing the chat-app sources under `extension/`:

```bash
node build.js
```

This inlines `extension/styles.css` and `extension/app.js` into `extension/index.html` and writes the result to the root `index.html`. The extension shell (`background.js`, `popup.*`, `manifest.json`) is not part of the single-file build.

The root `index.html` is checked in (it's the artifact powering the no-install copy/paste and ZIP flows above). A pre-commit hook keeps it in sync automatically — enable it once per clone:

```bash
git config core.hooksPath .githooks
```

With that set, committing any change to `extension/{index.html,app.js,styles.css}` reruns `node build.js` and re-stages the root `index.html`.

## Troubleshooting

- **Tabs are greyed out / struck through** → that API isn't available in your Chrome build. Some are still in origin trial (Writer, Rewriter, Proofreader) and may need flags enabled at `chrome://flags`.
- **"Model component is being downloaded"** → wait for Chrome to finish downloading Gemini Nano. Check status at `chrome://on-device-internals`.
- **Audio input fails** → audio requires a GPU. CPU-only machines can't use it.
