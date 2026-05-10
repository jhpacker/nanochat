# NanoChat

A single-file HTML playground for Chrome's built-in on-device AI APIs (Gemini Nano Prompt API, Summarizer, Translator, Writer, Rewriter, Proofreader, Language Detector).

100% local — runs entirely on your machine. No network calls, no server, no API keys.

## Requirements

- **Chrome 138+** on desktop (Windows 10+, macOS 13+, Linux, or ChromeOS Chromebook Plus)
- ~22 GB free disk space (for the Gemini Nano model component)
- 16 GB RAM **or** a GPU with 4+ GB VRAM
- The first time you use a feature, Chrome may need to download the model component. Watch progress at `chrome://on-device-internals`.

## Download and open

### Option 1 — copy/paste (easiest, no git, no download)

1. Open the raw HTML: https://raw.githubusercontent.com/jhpacker/nanochat/main/index.html
2. Select all (`Cmd/Ctrl+A`) and copy (`Cmd/Ctrl+C`)
3. Paste into any text editor and save as `nanochat.html` anywhere on your machine
4. Double-click the file to open it in Chrome

### Option 2 — download as ZIP

1. Go to https://github.com/jhpacker/nanochat
2. Click the green **Code** button → **Download ZIP**
3. Unzip it, then double-click `index.html`

### Option 3 — clone with git

```bash
git clone https://github.com/jhpacker/nanochat.git
open nanochat/index.html
```

### About the file:// URL

However you get the file onto your disk, opening it gives you a URL like:

```
file:///Users/yourname/Downloads/nanochat.html
```

That's it — no web server required. If your default browser isn't Chrome, right-click the file → **Open With → Google Chrome**.

## Troubleshooting

- **Tabs are greyed out / struck through** → that API isn't available in your Chrome build. Some are still in origin trial (Writer, Rewriter, Proofreader) and may need flags enabled at `chrome://flags`.
- **"Model component is being downloaded"** → wait for Chrome to finish downloading Gemini Nano. Check status at `chrome://on-device-internals`.
- **Audio input fails** → audio requires a GPU. CPU-only machines can't use it.
