// Preload script — exposes a safe `window.bridge` API to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("bridge", {
  isElectron: true,
  info: () => invoke("bridge:info"),
  readFile: (path) => invoke("bridge:read_file", { path }),
  listDir: (path) => invoke("bridge:list_dir", { path }),
  writeFile: (path, content) => invoke("bridge:write_file", { path, content }),
  runShell: (command) => invoke("bridge:run_shell", { command }),
  screenshot: () => invoke("bridge:screenshot"),
  visionAnnotate: () => invoke("bridge:vision_annotate"),
  visionClick: (markId, button) => invoke("bridge:vision_click", { markId, button }),
  mouseMove: (x, y) => invoke("bridge:mouse_move", { x, y }),
  mouseClick: (x, y, button) => invoke("bridge:mouse_click", { x, y, button }),
  typeText: (text) => invoke("bridge:type_text", { text }),
  keyPress: (key) => invoke("bridge:key_press", { key }),
  // Local scheduled jobs (Electron-only)
  runLocalJob: (job) => invoke("bridge:run_local_job", job),
  reloadLocalJobs: () => invoke("bridge:reload_local_jobs"),
  // Focus app lock (Control mode)
  getFrontmostApp: () => invoke("bridge:get_frontmost_app"),
  listApps: () => invoke("bridge:list_apps"),
  // Phase 3: Playwright browser automation
  browser: (payload) => invoke("bridge:browser", payload),
  browserSetHeadless: (headless) => invoke("bridge:browser_set_headless", { headless }),
  browserSetUseRealProfile: (enabled) => invoke("bridge:browser_set_use_real_profile", { enabled }),
  browserStatus: () => invoke("bridge:browser_status"),
  browserClose: () => invoke("bridge:browser_close"),
  chromeDetect: () => invoke("bridge:chrome_detect"),
  chromeQuit: (force) => invoke("bridge:chrome_quit", { force: !!force }),
  chromeDebugProbe: () => invoke("bridge:chrome_debug_probe"),
  chromeRelaunchWithDebug: () => invoke("bridge:chrome_relaunch_with_debug"),
  onBrowserStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("browser:status", listener);
    return () => ipcRenderer.removeListener("browser:status", listener);
  },
  onBrowserAction: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("browser:action", listener);
    return () => ipcRenderer.removeListener("browser:action", listener);
  },
  // Phase 4: Deep system access (armed-mode required at the renderer layer)
  sudoShell: (command) => invoke("bridge:sudo_shell", { command }),
  runScript: (language, script) => invoke("bridge:run_script", { language, script }),
  rawFile: (action, path, content) => invoke("bridge:raw_file", { action, path, content }),
  startOllama: () => invoke("bridge:start_ollama"),
  stopOllama: () => invoke("bridge:stop_ollama"),
  ollamaStatus: () => invoke("bridge:ollama_status"),
  // Auto-updater
  checkUpdates: () => invoke("bridge:check_updates"),
  installUpdate: () => invoke("bridge:install_update"),
  getUpdaterState: () => invoke("bridge:updater_state"),
  onUpdaterStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
});
