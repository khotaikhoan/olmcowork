// Electron main process. CommonJS (.cjs) because package.json is "type": "module".
const { app, BrowserWindow, ipcMain, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { exec } = require("child_process");
const os = require("os");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Ollama Cowork",
    backgroundColor: "#0f0f10",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ----- Path safety: block obviously dangerous paths -----
const DENY_PREFIXES = ["/etc", "/System", "/usr", "/bin", "/sbin", "/var", "C:\\Windows", "C:\\Program Files"];
function pathAllowed(p) {
  if (!p || typeof p !== "string") return false;
  const norm = path.resolve(p);
  for (const d of DENY_PREFIXES) {
    if (norm.startsWith(d)) return false;
  }
  return true;
}

// ----- Optional native modules (loaded lazily so the app still runs without them) -----
function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}
const screenshotDesktop = tryRequire("screenshot-desktop");

// ----- IPC handlers -----
ipcMain.handle("bridge:info", () => ({
  platform: process.platform,
  arch: process.arch,
  home: os.homedir(),
  version: app.getVersion(),
  hasScreenshot: !!screenshotDesktop,
}));

ipcMain.handle("bridge:read_file", async (_e, { path: p }) => {
  if (!pathAllowed(p)) return { ok: false, output: `Denied: path ${p} is not allowed.` };
  try {
    const content = await fs.readFile(p, "utf-8");
    const max = 200_000;
    return {
      ok: true,
      output: content.length > max ? content.slice(0, max) + `\n…[truncated ${content.length - max} chars]` : content,
    };
  } catch (e) {
    return { ok: false, output: `Error: ${e.message}` };
  }
});

ipcMain.handle("bridge:list_dir", async (_e, { path: p }) => {
  if (!pathAllowed(p)) return { ok: false, output: `Denied: path ${p} is not allowed.` };
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    const list = entries.map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n");
    return { ok: true, output: list || "(empty)" };
  } catch (e) {
    return { ok: false, output: `Error: ${e.message}` };
  }
});

ipcMain.handle("bridge:write_file", async (_e, { path: p, content }) => {
  if (!pathAllowed(p)) return { ok: false, output: `Denied: path ${p} is not allowed.` };
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content ?? "", "utf-8");
    return { ok: true, output: `Wrote ${(content ?? "").length} bytes to ${p}` };
  } catch (e) {
    return { ok: false, output: `Error: ${e.message}` };
  }
});

ipcMain.handle("bridge:run_shell", async (_e, { command }) => {
  return new Promise((resolve) => {
    exec(command, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) {
        resolve({ ok: false, output: `Error: ${err.message}` });
      } else {
        const out = `$ ${command}\n${stdout || ""}${stderr ? "\n[stderr]\n" + stderr : ""}\n(exit ${err?.code ?? 0})`;
        resolve({ ok: !err, output: out });
      }
    });
  });
});

ipcMain.handle("bridge:screenshot", async () => {
  if (!screenshotDesktop) {
    return {
      ok: false,
      output: "screenshot-desktop module not installed. Run `npm i screenshot-desktop` to enable.",
    };
  }
  try {
    const buf = await screenshotDesktop({ format: "png" });
    const display = screen.getPrimaryDisplay();
    return {
      ok: true,
      output: `Captured ${display.size.width}x${display.size.height} screenshot (${buf.length} bytes).`,
      image: buf.toString("base64"),
    };
  } catch (e) {
    return { ok: false, output: `Error: ${e.message}` };
  }
});

// Mouse/keyboard via @nut-tree-fork/nut-js (optional native module)
const nut = tryRequire("@nut-tree-fork/nut-js");

ipcMain.handle("bridge:mouse_move", async (_e, { x, y }) => {
  if (!nut) return { ok: false, output: "Native input module not installed." };
  try {
    await nut.mouse.setPosition(new nut.Point(x, y));
    return { ok: true, output: `Moved cursor to (${x}, ${y})` };
  } catch (e) {
    return { ok: false, output: e.message };
  }
});

ipcMain.handle("bridge:mouse_click", async (_e, { x, y, button }) => {
  if (!nut) return { ok: false, output: "Native input module not installed." };
  try {
    if (typeof x === "number" && typeof y === "number") {
      await nut.mouse.setPosition(new nut.Point(x, y));
    }
    const btn = button === "right" ? nut.Button.RIGHT : button === "middle" ? nut.Button.MIDDLE : nut.Button.LEFT;
    await nut.mouse.click(btn);
    return { ok: true, output: `Clicked ${button || "left"} at (${x}, ${y})` };
  } catch (e) {
    return { ok: false, output: e.message };
  }
});

ipcMain.handle("bridge:type_text", async (_e, { text }) => {
  if (!nut) return { ok: false, output: "Native input module not installed." };
  try {
    await nut.keyboard.type(text);
    return { ok: true, output: `Typed ${text.length} characters` };
  } catch (e) {
    return { ok: false, output: e.message };
  }
});

ipcMain.handle("bridge:key_press", async (_e, { key }) => {
  if (!nut) return { ok: false, output: "Native input module not installed." };
  try {
    const k = nut.Key[key];
    if (!k) return { ok: false, output: `Unknown key: ${key}` };
    await nut.keyboard.pressKey(k);
    await nut.keyboard.releaseKey(k);
    return { ok: true, output: `Pressed ${key}` };
  } catch (e) {
    return { ok: false, output: e.message };
  }
});
