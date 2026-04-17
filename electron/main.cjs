// Electron main process. CommonJS (.cjs) because package.json is "type": "module".
const { app, BrowserWindow, ipcMain, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { exec, spawn } = require("child_process");
const os = require("os");
const http = require("http");

// Optional auto-updater (only active in packaged builds with GitHub Releases configured).
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
} catch {
  // electron-updater not installed yet — skip silently in dev.
}

let win = null;
let ollamaProc = null;

// Cache last updater status so the renderer can sync after refresh / late mount.
let updaterState = { state: "idle", currentVersion: null };

function emitUpdater(payload) {
  updaterState = { ...updaterState, ...payload };
  win?.webContents.send("updater:status", updaterState);
}

function setupAutoUpdate() {
  updaterState.currentVersion = app.getVersion();
  if (!autoUpdater || !app.isPackaged) {
    emitUpdater({ state: "disabled" });
    return;
  }
  emitUpdater({ state: "checking" });
  autoUpdater.on("checking-for-update", () => emitUpdater({ state: "checking" }));
  autoUpdater.on("update-available", (info) => {
    emitUpdater({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    emitUpdater({ state: "none" });
  });
  autoUpdater.on("download-progress", (p) => {
    emitUpdater({ state: "downloading", percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    emitUpdater({ state: "ready", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    emitUpdater({ state: "error", message: String(err?.message || err) });
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

ipcMain.handle("bridge:updater_state", async () => updaterState);

// Compare semver-ish strings: returns 1 if a>b, -1 if a<b, 0 equal.
function cmpVersion(a, b) {
  const pa = String(a || "0").replace(/^v/, "").split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0").replace(/^v/, "").split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

// Fallback: query GitHub Releases directly. Works in dev mode too so the user
// always gets feedback when clicking "Check for updates".
async function checkGithubLatest() {
  // Try to read repo from package.json `repository` or `build.publish`
  let owner = "", repo = "";
  try {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    const pub = pkg?.build?.publish;
    const arr = Array.isArray(pub) ? pub : pub ? [pub] : [];
    const gh = arr.find((p) => p?.provider === "github");
    if (gh?.owner && gh?.repo) { owner = gh.owner; repo = gh.repo; }
    if (!owner && typeof pkg?.repository === "string") {
      const m = pkg.repository.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (m) { owner = m[1]; repo = m[2]; }
    } else if (!owner && pkg?.repository?.url) {
      const m = pkg.repository.url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (m) { owner = m[1]; repo = m[2]; }
    }
  } catch {}
  if (!owner || !repo) throw new Error("GitHub repo not configured in package.json");

  const https = require("https");
  return await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/releases/latest`,
      headers: { "User-Agent": "ollama-cowork-updater", Accept: "application/vnd.github+json" },
    }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const j = JSON.parse(body);
          if (res.statusCode && res.statusCode >= 400) return reject(new Error(j.message || `HTTP ${res.statusCode}`));
          resolve({ tag: j.tag_name, name: j.name, prerelease: j.prerelease, draft: j.draft, url: j.html_url });
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

ipcMain.handle("bridge:check_updates", async () => {
  emitUpdater({ state: "checking" });

  // Packaged build: use electron-updater (handles download + install).
  if (autoUpdater && app.isPackaged) {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, output: r?.updateInfo?.version ? `Latest: ${r.updateInfo.version}` : "No update info" };
    } catch (e) {
      emitUpdater({ state: "error", message: String(e?.message || e) });
      return { ok: false, output: String(e?.message || e) };
    }
  }

  // Dev mode (or updater missing): fall back to GitHub API so the user gets feedback.
  try {
    const latest = await checkGithubLatest();
    const current = app.getVersion();
    const cmp = cmpVersion(latest.tag, current);
    if (cmp > 0 && !latest.draft) {
      emitUpdater({ state: "available", version: String(latest.tag).replace(/^v/, "") });
      return { ok: true, output: `New version available: ${latest.tag}` };
    }
    emitUpdater({ state: "none" });
    return { ok: true, output: `Up to date (current v${current}, latest ${latest.tag})` };
  } catch (e) {
    emitUpdater({ state: "error", message: String(e?.message || e) });
    return { ok: false, output: String(e?.message || e) };
  }
});

ipcMain.handle("bridge:install_update", async () => {
  if (!autoUpdater) return { ok: false, output: "electron-updater not installed" };
  if (updaterState.state !== "ready") {
    return { ok: false, output: `No update ready (state: ${updaterState.state})` };
  }
  setTimeout(() => autoUpdater.quitAndInstall(), 200);
  return { ok: true, output: "Installing…" };
});

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
  setupAutoUpdate();
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

// ----- Vision: Set-of-Marks annotation cache (last screenshot's marks) -----
let lastVisionMarks = []; // [{id, x, y, w, h}]
let lastVisionDisplay = null;

function detectMarksFromBuffer(width, height) {
  // Tối giản: chia màn hình thành lưới 6x4 = 24 ô, đánh số mỗi ô.
  // Đây là baseline để vision model có thể chỉ "ô số mấy" nếu không
  // tìm được element thật. Trong tương lai có thể thay bằng OS accessibility tree.
  const cols = 6;
  const rows = 4;
  const marks = [];
  let id = 1;
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      marks.push({
        id: id++,
        x: c * w,
        y: r * h,
        w,
        h,
      });
    }
  }
  return marks;
}

async function annotateImage(buf, marks) {
  // Dùng nativeImage của Electron + canvas đơn giản qua sharp nếu có,
  // fallback: trả ảnh gốc + danh sách marks (renderer có thể tự overlay).
  // Để gọn, ta trả ảnh gốc — vision model nhận tọa độ marks qua text mô tả.
  return buf;
}

ipcMain.handle("bridge:vision_annotate", async () => {
  if (!screenshotDesktop) {
    return { ok: false, output: "screenshot-desktop not installed" };
  }
  try {
    const buf = await screenshotDesktop({ format: "png" });
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const marks = detectMarksFromBuffer(width, height);
    lastVisionMarks = marks;
    lastVisionDisplay = display;
    const annotated = await annotateImage(buf, marks);
    return {
      ok: true,
      output: `Captured ${width}x${height}. Marks (id @ x,y w×h):\n${marks
        .map((m) => `${m.id} @ ${m.x},${m.y} ${m.w}×${m.h}`)
        .join("\n")}\nReply with vision_click(action='click', mark_id=N).`,
      image: annotated.toString("base64"),
      marks,
    };
  } catch (e) {
    return { ok: false, output: `Error: ${e.message}` };
  }
});

ipcMain.handle("bridge:vision_click", async (_e, { markId, button }) => {
  if (!nut) return { ok: false, output: "Native input module not installed." };
  const mark = lastVisionMarks.find((m) => m.id === Number(markId));
  if (!mark) {
    return {
      ok: false,
      output: `Mark #${markId} not found. Call vision_annotate first.`,
    };
  }
  const cx = Math.round(mark.x + mark.w / 2);
  const cy = Math.round(mark.y + mark.h / 2);
  try {
    await nut.mouse.setPosition(new nut.Point(cx, cy));
    const btn =
      button === "right" ? nut.Button.RIGHT : button === "middle" ? nut.Button.MIDDLE : nut.Button.LEFT;
    await nut.mouse.click(btn);
    return { ok: true, output: `Clicked mark #${markId} at (${cx}, ${cy})` };
  } catch (e) {
    return { ok: false, output: e.message };
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

// ----- Ollama process control -----
function checkOllamaUp(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:11434/api/tags", { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

ipcMain.handle("bridge:ollama_status", async () => {
  const up = await checkOllamaUp();
  return { ok: true, output: up ? "running" : "stopped", running: up, managed: !!ollamaProc };
});

ipcMain.handle("bridge:start_ollama", async () => {
  const already = await checkOllamaUp();
  if (already) return { ok: true, output: "Ollama is already running.", running: true };
  try {
    const env = { ...process.env, OLLAMA_ORIGINS: "*" };
    ollamaProc = spawn("ollama", ["serve"], { env, detached: false, stdio: "ignore" });
    ollamaProc.on("exit", () => { ollamaProc = null; });
    ollamaProc.on("error", () => { ollamaProc = null; });
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkOllamaUp()) return { ok: true, output: "Ollama started.", running: true };
    }
    return { ok: false, output: "Started process but Ollama did not become ready in 10s." };
  } catch (e) {
    return { ok: false, output: `Failed to start Ollama: ${e.message}. Is the 'ollama' CLI in PATH?` };
  }
});

ipcMain.handle("bridge:stop_ollama", async () => {
  return new Promise((resolve) => {
    const killCmd = process.platform === "win32"
      ? 'taskkill /F /IM ollama.exe /T'
      : "pkill -f 'ollama serve' || pkill -f ollama";
    exec(killCmd, (err, _stdout, stderr) => {
      ollamaProc = null;
      const matched = !err || (process.platform !== "win32" && err.code === 1);
      resolve({
        ok: matched,
        output: matched ? "Ollama stopped (process killed, RAM freed)." : `Failed to stop: ${stderr || err.message}`,
        running: false,
      });
    });
  });
});

// ----- Local cron runner: chạy local jobs trong app desktop -----
// Đơn giản: poll mỗi 60s, nếu cron tới hạn → gọi Ollama trực tiếp.
// Job cần có job_type='local' và app phải đang mở.
let localJobsCache = [];
let localJobsTimer = null;

function shouldRunCron(cron, lastRunAt, now) {
  const parts = String(cron).trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h] = parts;
  const last = lastRunAt ? new Date(lastRunAt).getTime() : 0;
  const elapsedMin = (now.getTime() - last) / 60000;
  if (m.startsWith("*/")) {
    const n = parseInt(m.slice(2), 10);
    if (!n) return false;
    return elapsedMin >= n - 0.5;
  }
  const minute = parseInt(m, 10);
  if (Number.isNaN(minute)) return false;
  if (h === "*") return now.getMinutes() === minute && elapsedMin >= 0.5;
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return false;
  return now.getHours() === hour && now.getMinutes() === minute && elapsedMin >= 0.5;
}

async function callOllamaLocal(prompt, model) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: model || "llama3.1:8b",
      messages: [{ role: "user", content: prompt }],
      stream: false,
    });
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 11434,
        path: "/api/chat",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(body);
            resolve(j.message?.content ?? body);
          } catch {
            resolve(body);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function runLocalJobOnce(job) {
  const out = await callOllamaLocal(job.prompt, job.model);
  job.last_run_at = new Date().toISOString();
  return out;
}

ipcMain.handle("bridge:run_local_job", async (_e, job) => {
  try {
    const out = await runLocalJobOnce(job);
    return { ok: true, output: String(out).slice(0, 5000) };
  } catch (e) {
    return { ok: false, output: e.message };
  }
});

ipcMain.handle("bridge:reload_local_jobs", async (_e, jobs) => {
  localJobsCache = Array.isArray(jobs) ? jobs : [];
  return { ok: true, output: `Loaded ${localJobsCache.length} local jobs` };
});

function startLocalCronTimer() {
  if (localJobsTimer) return;
  localJobsTimer = setInterval(async () => {
    const now = new Date();
    for (const j of localJobsCache) {
      if (!j.enabled) continue;
      if (!shouldRunCron(j.cron, j.last_run_at, now)) continue;
      try {
        await runLocalJobOnce(j);
        win?.webContents.send("local-job:done", { id: j.id, ok: true });
      } catch (e) {
        win?.webContents.send("local-job:done", { id: j.id, ok: false, error: e.message });
      }
    }
  }, 60_000);
}
app.whenReady().then(startLocalCronTimer);

app.on("before-quit", () => {
  if (ollamaProc) { try { ollamaProc.kill(); } catch {} }
  if (localJobsTimer) clearInterval(localJobsTimer);
});
