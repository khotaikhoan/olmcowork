# Ollama Cowork — Desktop Setup

A Claude-style chat + computer-use agent that runs on **your local Ollama** and stores conversations in Lovable Cloud.

## Run in browser (Phase 1/2)

The web app works in any modern browser as long as Ollama allows cross-origin requests:

```bash
# macOS / Linux — set this in the same shell that runs Ollama
OLLAMA_ORIGINS=* ollama serve
```

Then open the preview URL, sign up, open Settings → Test connection.

In browser mode the **computer-use tools are mocked** (no real shell/files/screen access).

## Run as Electron desktop app (Phase 3)

The desktop build replaces the mock executor with a real bridge that calls the OS directly. CORS is bypassed because requests go through the Electron main process / file protocol.

### One-time install

```bash
# clone the project, then from the project root:
npm install
npm install --save-dev electron @electron/packager
# Optional native modules — required for screenshot + mouse/keyboard control
npm install screenshot-desktop @nut-tree-fork/nut-js
```

> The native modules build C++ addons. On Linux you may need `build-essential libxtst-dev libpng-dev`. On macOS, grant **Accessibility** + **Screen Recording** permissions to the Electron app the first time it asks.

### Develop

```bash
# Terminal 1: vite dev server
npm run dev
# Terminal 2: launch Electron pointing at the dev server
npm run electron:dev
```

### Production build (current platform)

```bash
npm run electron:package
# → ./electron-release/OllamaCowork-<platform>-<arch>/
```

### Cross-platform builds

```bash
# macOS (zip)
npx electron-packager . OllamaCowork --platform=darwin --arch=arm64 --out=electron-release --overwrite

# Windows
npx electron-packager . OllamaCowork --platform=win32 --arch=x64 --out=electron-release --overwrite

# Linux
npx electron-packager . OllamaCowork --platform=linux --arch=x64 --out=electron-release --overwrite
```

## Bridge surface — Anthropic Computer Use spec

3 tools mapping to Anthropic's `computer_20241022`, `bash_20241022`, `text_editor_20241022`.

| Tool | Action | Risk | Notes |
|---|---|---|---|
| `bash` | — | high | 30s timeout, 5MB output cap |
| `text_editor` | `view` | low | Path safety filter |
| `text_editor` | `list_dir` | low | Path safety filter |
| `text_editor` | `create` | high | Overwrites file |
| `text_editor` | `str_replace` | high | Requires unique match |
| `computer` | `screenshot` | medium | Needs `screenshot-desktop` |
| `computer` | `mouse_move` / `*_click` | high | Needs `@nut-tree-fork/nut-js` |
| `computer` | `type` / `key` | high | Needs `@nut-tree-fork/nut-js` |

All high-risk calls show an approval modal regardless of settings. Path safety blocks `/etc`, `/usr`, `/System`, `C:\Windows`, `C:\Program Files`.

## Suggested models

- `qwen2.5:14b` or `llama3.1:8b` — best for tool calling
- `llava` or `qwen2.5vl` — vision (drop images into the chat box)
