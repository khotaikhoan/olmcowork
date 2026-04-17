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
  mouseMove: (x, y) => invoke("bridge:mouse_move", { x, y }),
  mouseClick: (x, y, button) => invoke("bridge:mouse_click", { x, y, button }),
  typeText: (text) => invoke("bridge:type_text", { text }),
  keyPress: (key) => invoke("bridge:key_press", { key }),
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
