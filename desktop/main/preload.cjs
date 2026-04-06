/**
 * Exposes limited IPC for renderer when loading https:// (Option A: production web app in Electron).
 * contextIsolation on — no nodeIntegration — safe with remote origin.
 */
const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'resize-window',
  'window-minimize',
  'window-maximize-toggle',
  'chat-input-focused',
  'chat-input-blurred',
  'set-skip-taskbar',
  'set-stealth-mode',
  'update-hotkeys',
  'close-app',
  'QUIT_NOW',
  'set-always-on-top',
]);

const INVOKE_CHANNELS = new Set(['get-source-id']);

/** @type {Map<Function, Function>} userCallback -> ipc-wrapped listener */
const focusListeners = new Map();

contextBridge.exposeInMainWorld('interviewGuruElectron', {
  send(channel, ...args) {
    if (!SEND_CHANNELS.has(channel)) return;
    ipcRenderer.send(channel, ...args);
  },
  invoke(channel, ...args) {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error('Invalid channel'));
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel, callback) {
    if (channel !== 'focus-chat-input' || typeof callback !== 'function') return;
    const wrapped = () => callback();
    focusListeners.set(callback, wrapped);
    ipcRenderer.on(channel, wrapped);
  },
  removeListener(channel, callback) {
    if (channel !== 'focus-chat-input') return;
    const wrapped = focusListeners.get(callback);
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped);
      focusListeners.delete(callback);
    }
  },
});
