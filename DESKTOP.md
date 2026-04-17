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

## Bridge surface (what the app can do on your machine)

| Tool | Risk | Notes |
|---|---|---|
| `read_file(path)` | low | Blocked for `/etc`, `/usr`, `/System`, `C:\Windows`, `C:\Program Files` |
| `list_dir(path)` | low | same path safety |
| `write_file(path, content)` | high | always asks for confirmation |
| `run_shell(command)` | high | 30s timeout, 5MB output cap |
| `screenshot()` | medium | needs `screenshot-desktop` |
| `mouse_move / mouse_click / type_text / key_press` | high | needs `@nut-tree-fork/nut-js` |

All high-risk calls show an approval modal regardless of settings. Disable any tool by removing it from `src/lib/tools.ts`.

## Suggested models

- `qwen2.5:14b` or `llama3.1:8b` — best for tool calling
- `llava` or `qwen2.5vl` — vision (drop images into the chat box)
