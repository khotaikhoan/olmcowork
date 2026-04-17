// Electron main process. CommonJS (.cjs) because package.json is "type": "module".
const { app, BrowserWindow, ipcMain, screen, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
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
    emitUpdater({
      state: "downloading",
      percent: Math.round(p.percent),
      bytesPerSecond: Math.round(p.bytesPerSecond || 0),
      transferred: p.transferred || 0,
      total: p.total || 0,
    });
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

  // Packaged build: try electron-updater first (handles download + install).
  if (autoUpdater && app.isPackaged) {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, output: r?.updateInfo?.version ? `Latest: ${r.updateInfo.version}` : "No update info" };
    } catch (e) {
      // Fall through to GitHub API fallback so the user still sees whether
      // a newer release exists (electron-updater commonly fails when
      // app-update.yml is missing in @electron/packager builds).
      console.warn("autoUpdater failed, falling back to GitHub API:", e?.message || e);
    }
  }

  // Dev mode (or updater missing/failed): fall back to GitHub Releases API.
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
// Marks now carry optional metadata (role, label, source) so the vision/LLM has
// semantic context, not just coordinates.
let lastVisionMarks = []; // [{id, x, y, w, h, role?, label?, source}]
let lastVisionDisplay = null;
let lastVisionSource = "grid"; // "ax-mac" | "uia-win" | "grid"

function execP(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 8000, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

// macOS: dùng AppleScript `System Events` để lấy AX tree của frontmost app.
// Lọc các UI element có role thuộc whitelist (button, link, menu item, checkbox,
// text field, combo box, popup button) và có position+size hợp lệ.
const MAC_AX_SCRIPT = `
on run
  set output to ""
  tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    set output to "APP=" & appName & linefeed
    try
      set roleList to {"AXButton","AXLink","AXMenuItem","AXMenuButton","AXCheckBox","AXRadioButton","AXTextField","AXTextArea","AXComboBox","AXPopUpButton","AXSearchField"}
      set allWindows to windows of frontApp
      repeat with w in allWindows
        my collectElements(w, roleList)
      end repeat
    end try
  end tell
  return output & my dump()
end run

property dumpBuf : ""
on dump()
  return dumpBuf
end dump

on collectElements(parent, roleList)
  tell application "System Events"
    try
      set kids to entire contents of parent
      repeat with el in kids
        try
          set r to role of el
          if roleList contains r then
            set p to position of el
            set s to size of el
            set lbl to ""
            try
              set lbl to description of el
            end try
            if lbl is "" then
              try
                set lbl to title of el
              end try
            end if
            if lbl is "" then
              try
                set lbl to value of el
              end try
            end if
            if lbl is missing value then set lbl to ""
            set line to r & "|" & (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s) & "|" & lbl
            set my dumpBuf to my dumpBuf & line & linefeed
          end if
        end try
      end repeat
    end try
  end tell
end collectElements
`;

async function detectMarksMacAX() {
  // Ghi script vào tmp rồi gọi osascript để tránh escape phức tạp.
  const tmp = path.join(os.tmpdir(), `cowork-ax-${Date.now()}.applescript`);
  await fs.writeFile(tmp, MAC_AX_SCRIPT, "utf-8");
  const { stdout } = await execP(`osascript ${JSON.stringify(tmp)}`);
  fs.unlink(tmp).catch(() => {});
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let appName = "";
  const marks = [];
  let id = 1;
  for (const ln of lines) {
    if (ln.startsWith("APP=")) { appName = ln.slice(4); continue; }
    const parts = ln.split("|");
    if (parts.length < 5) continue;
    const [role, x, y, w, h, ...rest] = parts;
    const px = parseInt(x, 10), py = parseInt(y, 10);
    const pw = parseInt(w, 10), ph = parseInt(h, 10);
    if (!Number.isFinite(px) || !Number.isFinite(py) || pw <= 1 || ph <= 1) continue;
    if (pw > 4000 || ph > 4000) continue; // bỏ window root
    const label = rest.join("|").trim().slice(0, 80);
    marks.push({ id: id++, x: px, y: py, w: pw, h: ph, role, label, source: "ax-mac", app: appName });
  }
  return marks;
}

// Windows: PowerShell + UIAutomation (System.Windows.Automation). Lấy frontmost
// window (foreground) và walker.GetFirstChild để duyệt control type clickable.
const WIN_UIA_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$hwnd = [W]::GetForegroundWindow()
$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
if ($root -eq $null) { exit 0 }
Write-Output ("APP=" + $root.Current.Name)
$types = @(
  [System.Windows.Automation.ControlType]::Button,
  [System.Windows.Automation.ControlType]::Hyperlink,
  [System.Windows.Automation.ControlType]::MenuItem,
  [System.Windows.Automation.ControlType]::CheckBox,
  [System.Windows.Automation.ControlType]::RadioButton,
  [System.Windows.Automation.ControlType]::Edit,
  [System.Windows.Automation.ControlType]::ComboBox,
  [System.Windows.Automation.ControlType]::ListItem,
  [System.Windows.Automation.ControlType]::TabItem
)
$cond = [System.Windows.Automation.Condition]::TrueCondition
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
foreach ($el in $all) {
  try {
    $ct = $el.Current.ControlType
    if ($types -notcontains $ct) { continue }
    $r = $el.Current.BoundingRectangle
    if ($r.Width -le 1 -or $r.Height -le 1) { continue }
    $name = $el.Current.Name
    if ($name -eq $null) { $name = "" }
    $name = $name -replace "[\r\n\|]", " "
    if ($name.Length -gt 80) { $name = $name.Substring(0,80) }
    $role = $ct.LocalizedControlType
    Write-Output ("$role|$([int]$r.X)|$([int]$r.Y)|$([int]$r.Width)|$([int]$r.Height)|$name")
  } catch {}
}
`;

async function detectMarksWinUIA() {
  const tmp = path.join(os.tmpdir(), `cowork-uia-${Date.now()}.ps1`);
  await fs.writeFile(tmp, WIN_UIA_SCRIPT, "utf-8");
  const { stdout } = await execP(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`,
  );
  fs.unlink(tmp).catch(() => {});
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let appName = "";
  const marks = [];
  let id = 1;
  for (const ln of lines) {
    if (ln.startsWith("APP=")) { appName = ln.slice(4); continue; }
    const parts = ln.split("|");
    if (parts.length < 5) continue;
    const [role, x, y, w, h, ...rest] = parts;
    const px = parseInt(x, 10), py = parseInt(y, 10);
    const pw = parseInt(w, 10), ph = parseInt(h, 10);
    if (!Number.isFinite(px) || !Number.isFinite(py) || pw <= 1 || ph <= 1) continue;
    if (pw > 4000 || ph > 4000) continue;
    const label = rest.join("|").trim().slice(0, 80);
    marks.push({ id: id++, x: px, y: py, w: pw, h: ph, role, label, source: "uia-win", app: appName });
  }
  return marks;
}

// Fallback grid 6x4
function detectMarksGrid(width, height) {
  const cols = 6, rows = 4;
  const marks = [];
  let id = 1;
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      marks.push({ id: id++, x: c * w, y: r * h, w, h, role: "grid", label: `cell ${id - 1}`, source: "grid" });
    }
  }
  return marks;
}

ipcMain.handle("bridge:vision_annotate", async () => {
  if (!screenshotDesktop) {
    return { ok: false, output: "screenshot-desktop not installed" };
  }
  try {
    const buf = await screenshotDesktop({ format: "png" });
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;

    let marks = [];
    let source = "grid";
    let axError = "";
    try {
      if (process.platform === "darwin") {
        marks = await detectMarksMacAX();
        source = "ax-mac";
      } else if (process.platform === "win32") {
        marks = await detectMarksWinUIA();
        source = "uia-win";
      }
    } catch (e) {
      axError = String(e?.message || e);
    }

    if (!marks || marks.length === 0) {
      marks = detectMarksGrid(width, height);
      source = "grid";
    }

    lastVisionMarks = marks;
    lastVisionDisplay = display;
    lastVisionSource = source;

    const appLine = marks[0]?.app ? `Frontmost app: ${marks[0].app}\n` : "";
    const noteFallback = source === "grid"
      ? (process.platform === "linux"
          ? "(Linux: AX tree không khả dụng → fallback grid 6x4)\n"
          : `(Fallback grid 6x4 — AX/UIA không trả element. ${axError ? "Lỗi: " + axError + ". " : ""}Trên macOS hãy cấp quyền: System Settings → Privacy & Security → Accessibility cho Ollama Cowork.)\n`)
      : `Source: ${source} (${marks.length} elements)\n`;

    const lines = marks.map((m) => {
      const lbl = m.label ? ` "${m.label}"` : "";
      const role = m.role || "?";
      return `${m.id}. [${role}]${lbl} @ ${m.x},${m.y} ${m.w}×${m.h}`;
    }).join("\n");

    return {
      ok: true,
      output: `Captured ${width}x${height}. ${appLine}${noteFallback}${lines}\nReply with vision_click(action='click', mark_id=N).`,
      image: buf.toString("base64"),
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

// ----- App focus lock: list running apps + frontmost app -----
// Per-platform helpers used by the Control-mode "App lock" dropdown so the AI
// can be told to only interact with one specific application.

async function getFrontmostAppNative() {
  if (process.platform === "darwin") {
    const { stdout } = await execP(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    );
    return stdout.trim();
  }
  if (process.platform === "win32") {
    const ps = `
Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
}
"@
$h = [W]::GetForegroundWindow()
$pid = 0
[void][W]::GetWindowThreadProcessId($h, [ref]$pid)
try { (Get-Process -Id $pid).ProcessName } catch { "" }
`;
    const { stdout } = await execP(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`);
    return stdout.trim();
  }
  // Linux: try xdotool
  const { stdout } = await execP(`xdotool getactivewindow getwindowname 2>/dev/null`);
  return stdout.trim();
}

async function listAppsNative() {
  if (process.platform === "darwin") {
    const { stdout } = await execP(
      `osascript -e 'tell application "System Events" to get name of every application process whose visible is true'`,
    );
    return stdout
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.platform === "win32") {
    const { stdout } = await execP(
      `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique"`,
    );
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Linux: wmctrl -l
  const { stdout } = await execP(`wmctrl -l 2>/dev/null | awk '{$1=$2=$3=""; print substr($0,4)}'`);
  const apps = new Set();
  stdout.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (t) apps.add(t);
  });
  return Array.from(apps);
}

ipcMain.handle("bridge:get_frontmost_app", async () => {
  try {
    const name = await getFrontmostAppNative();
    return { ok: !!name, output: name || "(unknown)", app: name || null };
  } catch (e) {
    return { ok: false, output: e.message, app: null };
  }
});

ipcMain.handle("bridge:list_apps", async () => {
  try {
    const apps = await listAppsNative();
    return { ok: true, output: `${apps.length} apps`, apps };
  } catch (e) {
    return { ok: false, output: e.message, apps: [] };
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

// ──────────────────────────────────────────────────────────────────────────
// Phase 3+: Playwright browser automation (Chromium) — stealth, multi-tab,
// smart selectors (text/role/label), download/upload, configurable headless.
// Single shared browser+context, multiple pages (tabs). Lazy-launched.
// ──────────────────────────────────────────────────────────────────────────
let pw = null;            // playwright(-extra) chromium
let pwBrowser = null;
let pwContext = null;
let pwPages = [];         // ordered tabs
let pwActiveIdx = 0;
let pwHeadless = true;    // updated from user_settings via IPC
const PW_DOWNLOAD_DIR = path.join(app.getPath("downloads"), "OllamaCowork");

function pwActivePage() {
  // Drop closed pages, clamp index.
  pwPages = pwPages.filter((p) => p && !p.isClosed());
  if (!pwPages.length) return null;
  if (pwActiveIdx >= pwPages.length) pwActiveIdx = pwPages.length - 1;
  if (pwActiveIdx < 0) pwActiveIdx = 0;
  return pwPages[pwActiveIdx];
}

async function ensurePwPage() {
  if (!pw) {
    // Try playwright-extra + stealth first; fall back to plain playwright-core.
    try {
      const { chromium } = require("playwright-extra");
      const stealth = require("puppeteer-extra-plugin-stealth")();
      chromium.use(stealth);
      pw = { chromium };
    } catch {
      try {
        pw = require("playwright-core");
      } catch {
        throw new Error("playwright-core không có sẵn. Cài: npm i playwright-core playwright-extra puppeteer-extra-plugin-stealth");
      }
    }
  }
  if (!pwBrowser || !pwBrowser.isConnected()) {
    try { fsSync.mkdirSync(PW_DOWNLOAD_DIR, { recursive: true }); } catch {}
    const launchOpts = { headless: pwHeadless, channel: "chrome" };
    try {
      pwBrowser = await pw.chromium.launch(launchOpts);
    } catch {
      pwBrowser = await pw.chromium.launch({ headless: pwHeadless });
    }
    pwContext = await pwBrowser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      acceptDownloads: true,
    });
    // Track new tabs (popups, target=_blank).
    pwContext.on("page", (p) => {
      if (!pwPages.includes(p)) pwPages.push(p);
    });
    const first = await pwContext.newPage();
    pwPages = [first];
    pwActiveIdx = 0;
  }
  let page = pwActivePage();
  if (!page) {
    page = await pwContext.newPage();
    pwPages.push(page);
    pwActiveIdx = pwPages.length - 1;
  }
  return page;
}

async function pwShutdown() {
  try { await pwContext?.close(); } catch {}
  try { await pwBrowser?.close(); } catch {}
  pwPages = [];
  pwActiveIdx = 0;
  pwContext = null;
  pwBrowser = null;
}

ipcMain.handle("bridge:browser_set_headless", async (_e, { headless }) => {
  const next = !!headless;
  if (next === pwHeadless) return { ok: true, output: `headless=${pwHeadless}` };
  pwHeadless = next;
  // Force relaunch on next call so the new mode takes effect.
  await pwShutdown();
  return { ok: true, output: `Browser will relaunch in headless=${pwHeadless} on next use.` };
});

/**
 * Resolve a Playwright Locator from one of: selector (CSS), text, role+name, label, placeholder.
 * Returns null + reason if no resolver provided.
 */
function resolveLocator(page, args) {
  if (args.selector) return { loc: page.locator(String(args.selector)).first(), how: `css=${args.selector}` };
  if (args.role) {
    const opts = {};
    if (args.name) opts.name = String(args.name);
    if (args.exact !== undefined) opts.exact = !!args.exact;
    return { loc: page.getByRole(String(args.role), opts).first(), how: `role=${args.role}${args.name ? `[name="${args.name}"]` : ""}` };
  }
  if (args.text) return { loc: page.getByText(String(args.text), { exact: !!args.exact }).first(), how: `text=${args.text}` };
  if (args.label) return { loc: page.getByLabel(String(args.label), { exact: !!args.exact }).first(), how: `label=${args.label}` };
  if (args.placeholder) return { loc: page.getByPlaceholder(String(args.placeholder), { exact: !!args.exact }).first(), how: `placeholder=${args.placeholder}` };
  if (args.testId) return { loc: page.getByTestId(String(args.testId)).first(), how: `testId=${args.testId}` };
  return { loc: null, how: null };
}

ipcMain.handle("bridge:browser", async (_e, payload) => {
  const { action, ...args } = payload || {};
  try {
    if (action === "close") {
      await pwShutdown();
      return { ok: true, output: "Browser closed." };
    }
    let page = await ensurePwPage();
    switch (action) {
      // ── Navigation ─────────────────────────────────────────────────────
      case "navigate": {
        const url = String(args.url ?? "");
        if (!/^https?:\/\//i.test(url)) {
          return { ok: false, output: "navigate requires absolute http(s) URL." };
        }
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const title = await page.title();
        return { ok: true, output: `Navigated to ${page.url()} (status ${resp?.status() ?? "?"}, title "${title}")` };
      }
      case "back":
        await page.goBack({ waitUntil: "domcontentloaded" });
        return { ok: true, output: `Back → ${page.url()}` };
      case "forward":
        await page.goForward({ waitUntil: "domcontentloaded" });
        return { ok: true, output: `Forward → ${page.url()}` };
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded" });
        return { ok: true, output: `Reloaded ${page.url()}` };

      // ── Tabs ────────────────────────────────────────────────────────────
      case "new_tab": {
        const np = await pwContext.newPage();
        pwPages.push(np);
        pwActiveIdx = pwPages.length - 1;
        if (args.url && /^https?:\/\//i.test(String(args.url))) {
          await np.goto(String(args.url), { waitUntil: "domcontentloaded", timeout: 30_000 });
        }
        return { ok: true, output: `Opened tab #${pwActiveIdx} (${np.url() || "blank"}). Total tabs: ${pwPages.length}` };
      }
      case "list_tabs": {
        pwPages = pwPages.filter((p) => p && !p.isClosed());
        const lines = await Promise.all(
          pwPages.map(async (p, i) => `${i === pwActiveIdx ? "*" : " "} ${i}. ${await p.title().catch(() => "?")} — ${p.url()}`),
        );
        return { ok: true, output: lines.join("\n") || "(no tabs)" };
      }
      case "switch_tab": {
        const idx = Number(args.index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= pwPages.length) {
          return { ok: false, output: `switch_tab: index ${idx} out of range (0..${pwPages.length - 1})` };
        }
        pwActiveIdx = idx;
        await pwPages[idx].bringToFront();
        return { ok: true, output: `Switched to tab #${idx} (${pwPages[idx].url()})` };
      }
      case "close_tab": {
        const idx = Number.isFinite(Number(args.index)) ? Number(args.index) : pwActiveIdx;
        if (idx < 0 || idx >= pwPages.length) return { ok: false, output: `close_tab: bad index ${idx}` };
        await pwPages[idx].close();
        pwPages.splice(idx, 1);
        if (!pwPages.length) {
          const np = await pwContext.newPage();
          pwPages.push(np);
        }
        pwActiveIdx = Math.min(pwActiveIdx, pwPages.length - 1);
        return { ok: true, output: `Closed tab #${idx}. Active=${pwActiveIdx}, total=${pwPages.length}` };
      }

      // ── Smart-selector actions (selector/text/role/label/placeholder/testId) ──
      case "click_selector":
      case "click": {
        const { loc, how } = resolveLocator(page, args);
        if (!loc) return { ok: false, output: "click requires one of: selector, role+name, text, label, placeholder, testId." };
        await loc.click({ timeout: 10_000 });
        return { ok: true, output: `Clicked ${how}` };
      }
      case "fill": {
        const { loc, how } = resolveLocator(page, args);
        if (!loc) return { ok: false, output: "fill requires a locator (selector/role/label/placeholder/testId)." };
        const value = String(args.value ?? "");
        await loc.fill(value, { timeout: 10_000 });
        return { ok: true, output: `Filled ${how} (${value.length} chars)` };
      }
      case "press": {
        const { loc } = resolveLocator(page, args);
        const key = String(args.key ?? "Enter");
        if (loc) {
          await loc.press(key, { timeout: 10_000 });
        } else {
          await page.keyboard.press(key);
        }
        return { ok: true, output: `Pressed ${key}` };
      }
      case "wait_for": {
        const { loc, how } = resolveLocator(page, args);
        if (!loc) return { ok: false, output: "wait_for requires a locator." };
        await loc.waitFor({ timeout: Number(args.timeout) || 15_000, state: args.state || "visible" });
        return { ok: true, output: `Locator appeared: ${how}` };
      }

      // ── Reading ─────────────────────────────────────────────────────────
      case "get_html": {
        const { loc } = resolveLocator(page, args);
        const html = loc ? await loc.innerHTML({ timeout: 10_000 }) : await page.content();
        const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/\s+/g, " ").trim();
        const truncated = cleaned.length > 16_000;
        return { ok: true, output: `URL: ${page.url()}\nTitle: ${await page.title()}\n\nHTML${truncated ? " (truncated to 16KB)" : ""}:\n${cleaned.slice(0, 16_000)}` };
      }
      case "get_text": {
        const { loc } = resolveLocator(page, args);
        const text = await (loc ?? page.locator("body").first()).innerText({ timeout: 10_000 });
        const truncated = text.length > 16_000;
        return { ok: true, output: `URL: ${page.url()}\n\nText${truncated ? " (truncated to 16KB)" : ""}:\n${text.slice(0, 16_000)}` };
      }
      case "screenshot": {
        const buf = await page.screenshot({ type: "png", fullPage: !!args.fullPage });
        return { ok: true, output: `Screenshot ${buf.length} bytes (${page.url()})`, image: buf.toString("base64") };
      }
      case "eval": {
        const expression = String(args.expression ?? "");
        if (!expression) return { ok: false, output: "eval requires expression." };
        const result = await page.evaluate(expression);
        return { ok: true, output: typeof result === "string" ? result : JSON.stringify(result).slice(0, 8000) };
      }

      // ── Files: download (click element that triggers it) + upload ──────
      case "download": {
        // Wait for download triggered by clicking a locator (or by user-supplied URL navigation).
        const { loc, how } = resolveLocator(page, args);
        try { fsSync.mkdirSync(PW_DOWNLOAD_DIR, { recursive: true }); } catch {}
        const [ download ] = await Promise.all([
          page.waitForEvent("download", { timeout: Number(args.timeout) || 30_000 }),
          loc ? loc.click() : (args.url ? page.goto(String(args.url)) : Promise.resolve()),
        ]);
        const suggested = download.suggestedFilename();
        const target = path.join(PW_DOWNLOAD_DIR, suggested);
        await download.saveAs(target);
        return { ok: true, output: `Downloaded "${suggested}" → ${target}${how ? ` (via ${how})` : ""}` };
      }
      case "upload": {
        const { loc, how } = resolveLocator(page, args);
        if (!loc) return { ok: false, output: "upload requires locator pointing at <input type=file>." };
        const files = Array.isArray(args.files) ? args.files.map(String) : [String(args.file ?? "")];
        if (!files.filter(Boolean).length) return { ok: false, output: "upload requires file or files[]." };
        // Path safety: reuse the same allowlist as readFile/writeFile.
        for (const f of files) {
          if (!pathAllowed(f)) return { ok: false, output: `upload blocked by path safety: ${f}` };
        }
        await loc.setInputFiles(files, { timeout: 10_000 });
        return { ok: true, output: `Uploaded ${files.length} file(s) to ${how}` };
      }

      default:
        return { ok: false, output: `Unknown browser action: ${action}` };
    }
  } catch (e) {
    return { ok: false, output: `browser.${action} failed: ${e?.message ?? String(e)}` };
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Phase 4: Deep system access — sudo via biometrics, native scripts, raw FS.
// All three IPC handlers are intentionally PERMISSIVE; armed-mode (renderer)
// is the front-line gate. The death-path list below is the LAST line of
// defense and applies even when armed.
// ──────────────────────────────────────────────────────────────────────────
const HOME = os.homedir();
function deathPath(p) {
  if (!p || typeof p !== "string") return true;
  const norm = path.resolve(p);
  const lower = norm.toLowerCase();
  const denyExact = [
    "/etc/sudoers", "/etc/shadow", "/etc/passwd",
    "c:\\windows\\system32\\config\\sam",
    "c:\\windows\\system32\\config\\system",
    "c:\\windows\\system32\\config\\security",
  ];
  if (denyExact.includes(lower)) return true;
  const denyPrefix = [
    "/system", "/etc/sudoers.d",
    "/private/etc/sudoers", "/private/var/db/sudo",
    "c:\\windows\\system32\\drivers", "c:\\windows\\system32\\config",
  ];
  for (const d of denyPrefix) {
    if (lower === d || lower.startsWith(d + path.sep) || lower.startsWith(d + "/")) return true;
  }
  const sshDir = path.join(HOME, ".ssh");
  if (norm.startsWith(sshDir + path.sep)) {
    const base = path.basename(norm).toLowerCase();
    if (base.startsWith("id_") && !base.endsWith(".pub")) return true;
  }
  if (norm.startsWith(path.join(HOME, ".gnupg", "private-keys-v1.d"))) return true;
  const credSubpaths = [
    path.join("Library", "Application Support", "Google", "Chrome", "Default", "Login Data"),
    path.join("Library", "Application Support", "Google", "Chrome", "Default", "Cookies"),
    path.join("Library", "Keychains"),
  ];
  for (const c of credSubpaths) {
    if (norm.startsWith(path.join(HOME, c))) return true;
  }
  return false;
}

// Sudo shell — re-prompts every call. macOS osascript-with-admin triggers
// Touch ID if pam_tid.so is configured for sudo, otherwise password dialog.
ipcMain.handle("bridge:sudo_shell", async (_e, { command }) => {
  const cmd = String(command ?? "").trim();
  if (!cmd) return { ok: false, output: "sudo_shell: empty command." };
  const dangerous = [
    /\brm\s+-rf\s+\/(\s|$)/i,
    /\bmkfs\b/i,
    /\bdd\s+if=.+of=\/dev\//i,
    /:\(\)\s*\{.*:\|:.*\};:/,
  ];
  if (dangerous.some((re) => re.test(cmd))) {
    return { ok: false, output: `sudo_shell BLOCKED — destructive pattern. Refused: ${cmd.slice(0, 80)}` };
  }
  return new Promise((resolve) => {
    let exec_cmd;
    const opts = { timeout: 60_000, maxBuffer: 5 * 1024 * 1024 };
    if (process.platform === "darwin") {
      const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      exec_cmd = `osascript -e 'do shell script "${escaped}" with administrator privileges'`;
    } else if (process.platform === "win32") {
      const tmpOut = path.join(os.tmpdir(), `cowork-sudo-${Date.now()}.out`);
      const ps = `Start-Process -Wait -Verb RunAs -FilePath cmd -ArgumentList '/c ${cmd.replace(/'/g, "''")} > ${tmpOut} 2>&1'; Get-Content ${tmpOut}; Remove-Item ${tmpOut} -ErrorAction SilentlyContinue`;
      exec_cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/"/g, '\\"')}"`;
    } else {
      exec_cmd = `pkexec --disable-internal-agent bash -c ${JSON.stringify(cmd)}`;
    }
    exec(exec_cmd, opts, (err, stdout, stderr) => {
      const cancelled =
        /User cancel/i.test(stderr || "") ||
        /Authorization cancel/i.test(stderr || "") ||
        /(-128)/.test(stderr || "") ||
        /Request dismissed/i.test(stderr || "");
      if (cancelled) return resolve({ ok: false, output: "sudo cancelled by user (auth dialog dismissed)." });
      const out = `# sudo $ ${cmd}\n${stdout || ""}${stderr ? "\n[stderr]\n" + stderr : ""}\n(exit ${err?.code ?? 0})`;
      resolve({ ok: !err, output: out });
    });
  });
});

// Native scripts: AppleScript / PowerShell / bash — full power.
ipcMain.handle("bridge:run_script", async (_e, { language, script }) => {
  const lang = String(language ?? "").toLowerCase();
  const src = String(script ?? "");
  if (!src.trim()) return { ok: false, output: "run_script: empty script." };
  if (lang === "applescript" && process.platform !== "darwin") {
    return { ok: false, output: "AppleScript chỉ chạy trên macOS." };
  }
  if (lang === "powershell" && process.platform !== "win32") {
    return { ok: false, output: "PowerShell chỉ chạy trên Windows." };
  }
  const ext = lang === "applescript" ? ".applescript" : lang === "powershell" ? ".ps1" : ".sh";
  const tmp = path.join(os.tmpdir(), `cowork-script-${Date.now()}${ext}`);
  await fs.writeFile(tmp, src, "utf-8");
  let cmd;
  if (lang === "applescript") cmd = `osascript ${JSON.stringify(tmp)}`;
  else if (lang === "powershell") cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmp}"`;
  else cmd = `bash ${JSON.stringify(tmp)}`;
  return new Promise((resolve) => {
    exec(cmd, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      fs.unlink(tmp).catch(() => {});
      const out = `# ${lang}\n${stdout || ""}${stderr ? "\n[stderr]\n" + stderr : ""}\n(exit ${err?.code ?? 0})`;
      resolve({ ok: !err, output: out });
    });
  });
});

// Raw file — bypasses allowed_paths but enforces death-path list.
ipcMain.handle("bridge:raw_file", async (_e, { action, path: p, content }) => {
  if (!p) return { ok: false, output: "raw_file: missing path." };
  const norm = path.resolve(p);
  if (deathPath(norm)) {
    return { ok: false, output: `raw_file BLOCKED — ${norm} is on the permanent denylist.` };
  }
  try {
    if (action === "read") {
      const buf = await fs.readFile(norm, "utf-8");
      const max = 200_000;
      return { ok: true, output: buf.length > max ? buf.slice(0, max) + `\n…[truncated ${buf.length - max} chars]` : buf };
    }
    if (action === "write") {
      await fs.mkdir(path.dirname(norm), { recursive: true });
      await fs.writeFile(norm, content ?? "", "utf-8");
      return { ok: true, output: `Wrote ${(content ?? "").length} bytes → ${norm}` };
    }
    if (action === "list_dir") {
      const entries = await fs.readdir(norm, { withFileTypes: true });
      const list = entries.map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n");
      return { ok: true, output: list || "(empty)" };
    }
    if (action === "delete") {
      const stat = await fs.stat(norm).catch(() => null);
      if (!stat) return { ok: false, output: `Not found: ${norm}` };
      if (stat.isDirectory()) {
        return { ok: false, output: `raw_file.delete refuses directories. Use sudo_shell with rm -rf if you really mean it.` };
      }
      await fs.unlink(norm);
      return { ok: true, output: `Deleted ${norm}` };
    }
    return { ok: false, output: `raw_file: unknown action ${action}` };
  } catch (e) {
    return { ok: false, output: `raw_file.${action} failed: ${e.message}` };
  }
});

app.on("before-quit", async () => {
  if (ollamaProc) { try { ollamaProc.kill(); } catch {} }
  if (localJobsTimer) clearInterval(localJobsTimer);
  await pwShutdown();
});
