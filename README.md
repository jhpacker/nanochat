# NanoChat

A single-file HTML playground for Chrome's built-in on-device AI APIs (Gemini Nano Prompt API, Summarizer, Translator, Writer, Rewriter, Proofreader, Language Detector).

100% local — runs entirely on your machine. No network calls, no server, no API keys.

## Requirements

- **Chrome 138+** on desktop (Windows 10+, macOS 13+, Linux, or ChromeOS Chromebook Plus)
- ~22 GB free disk space (for the Gemini Nano model component)
- 16 GB RAM **or** a GPU with 4+ GB VRAM
- The first time you use a feature, Chrome may need to download the model component. Watch progress at `chrome://on-device-internals`.

## Download and open

### Option 1 — clone with git

```bash
git clone https://github.com/jhpacker/nanochat.git
```

### Option 2 — download as ZIP

1. Go to https://github.com/jhpacker/nanochat
2. Click the green **Code** button → **Download ZIP**
3. Unzip it anywhere on your machine

### Open it

Double-click `index.html` and it should open in your default browser. If that browser isn't Chrome, right-click → **Open With → Google Chrome**.

The address bar will show something like:

```
file:///Users/yourname/Downloads/nanochat/index.html
```

That `file://` URL is all you need — no web server required.

## Troubleshooting

- **Tabs are greyed out / struck through** → that API isn't available in your Chrome build. Some are still in origin trial (Writer, Rewriter, Proofreader) and may need flags enabled at `chrome://flags`.
- **"Model component is being downloaded"** → wait for Chrome to finish downloading Gemini Nano. Check status at `chrome://on-device-internals`.
- **Audio input fails** → audio requires a GPU. CPU-only machines can't use it.
