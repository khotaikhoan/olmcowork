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
});
