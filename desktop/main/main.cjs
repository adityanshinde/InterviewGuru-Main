const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/**
 * NSIS-installed app: auto-update from GitHub Releases (needs latest.yml + Setup on each release).
 * Portable .exe: no in-place updates — users re-download from GitHub / your site.
 */
function setupAutoUpdater() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log('[Updater] Portable build — download a new .exe from GitHub for updates. Use the Setup installer for auto-updates.');
    return;
  }
  if (process.platform !== 'win32') {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] New version available:', info.version);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Downloaded', info.version, '— will install when you quit the app.');
  });
  autoUpdater.on('error', (err) => {
    console.warn('[Updater]', err?.message || err);
  });

  autoUpdater.checkForUpdatesAndNotify().catch((e) => console.warn('[Updater] initial check:', e?.message || e));

  const sixHoursMs = 6 * 60 * 60 * 1000;
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((e) => console.warn('[Updater] check failed:', e?.message || e));
  }, sixHoursMs);
}

// Invisible in Dock (macOS)
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.name = 'InterviewGuru';

let win = null;

function createWindow() {
  /** Option A: load production https:// site (pk_live + Clerk OK). Requires INTERVIEWGURU_WEB_APP_URL in packaged .env */
  let useRemoteWeb = false;
  let remoteAppUrl = '';

  if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
    const envPaths = [
      path.join(process.resourcesPath, '.env'),
      path.join(path.dirname(process.execPath), '.env'),
    ];
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('[InterviewGuru] Loaded', envPath);
        break;
      }
    }
    const base = process.env.INTERVIEWGURU_WEB_APP_URL?.trim();
    if (base) {
      useRemoteWeb = true;
      remoteAppUrl = `${base.replace(/\/$/, '')}/app`;
    } else {
      if (!process.env.PORT) {
        process.env.PORT = '3000';
      }
      process.env.INTERVIEWGURU_USAGE_STORE = path.join(app.getPath('userData'), 'usage-store.json');
    }
  }

  /**
   * True desktop see-through (Parakeet-style overlay): Electron requires frameless + transparent.
   * Windows with frame:true + transparent often stays visually opaque (DWM paints a solid backing).
   */
  /** Default size: comfortable on 1080p / 1366×768 without dominating the screen */
  const winOpts = {
    width: 953,
    height: 744,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      preload: useRemoteWeb ? path.join(__dirname, 'preload.cjs') : undefined,
      nodeIntegration: !useRemoteWeb,
      contextIsolation: useRemoteWeb,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  };
  if (process.platform === 'darwin') {
    winOpts.titleBarStyle = 'hidden';
    winOpts.trafficLightPosition = { x: 14, y: 16 };
  }
  win = new BrowserWindow(winOpts);

  try {
    win.setBackgroundColor('#00000000');
  } catch (e) {
    console.warn('[Window] setBackgroundColor:', e?.message || e);
  }

  // Windows-specific resize handling
  if (process.platform === 'win32') {
    win.setResizable(true);
    console.log('✅ Windows resize enabled');
  }

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setContentProtection(false); // Invisible on screen share (Zoom, Teams, OBS)
  win.setVisibleOnAllWorkspaces(true);
  
  // ============================================================
  // STEALTH CURSOR: Click-through OFF by default so buttons work.
  // User can toggle with Ctrl+Shift+X for full stealth mode.
  // ============================================================
  let isClickThrough = false;

  win.on('will-resize', () => {
    win.setIgnoreMouseEvents(false);
  });

  win.on('resize', () => {
    if (isClickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // ============================================================
  // IPC: Renderer tells us when chat input is focused / blurred.
  // We temporarily disable click-through so keyboard works.
  // ============================================================
  ipcMain.on('chat-input-focused', () => {
    // Allow keyboard input — disable click-through (but mouse still shows on app behind)
    win.setIgnoreMouseEvents(false);
    // Bring window to front so keystrokes reach it, but don't steal cursor
    win.showInactive(); // show without moving focus away from other app's mouse position
    win.focus();
  });

  ipcMain.on('chat-input-blurred', () => {
    // Re-enter click-through — cursor returns fully to app behind
    if (isClickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // ============================================================
  // System Audio Capture (WASAPI Loopback)
  // This handler intercepts getDisplayMedia() in the renderer and
  // auto-selects the primary screen with system audio loopback.
  // MUST be registered for getDisplayMedia to work in Electron.
  // ============================================================
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({
        video: sources[0],
        audio: 'loopback'
      });
    }).catch(err => {
      console.error('Error in displayMediaRequestHandler:', err);
      callback(null);
    });
  });

  // Fallback: IPC handler for getUserMedia approach
  ipcMain.handle('get-source-id', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (sources.length === 0) return null;
      return sources[0].id; // Primary monitor
    } catch (err) {
      console.error('Error getting desktop sources:', err);
      return null;
    }
  });

  // Auto-grant all permissions (Microphone, Screen Share, etc.)
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  // ============================================================
  // Packaged: production URL (Option A) OR embedded local server
  // ============================================================
  if (app.isPackaged) {
    if (useRemoteWeb) {
      console.log('[InterviewGuru] Loading remote app (Clerk uses your real domain):', remoteAppUrl);
      win.loadURL(remoteAppUrl);
    } else {
      const serverModule = require(path.join(__dirname, '../../backend/api/server.cjs'));
      const boot = serverModule.serverBootstrap ?? serverModule.startServer?.();
      if (boot && typeof boot.then === 'function') {
        boot
          .then((result) => {
            const port = typeof result === 'number' ? result : parseInt(process.env.PORT || '3000', 10);
            win.loadURL(`http://127.0.0.1:${port}/app`);
          })
          .catch((err) => {
            console.error('Failed to start embedded Node server:', err);
          });
      } else {
        win.loadURL('http://127.0.0.1:3000/app');
      }
    }
  } else {
    const devPort = process.env.INTERVIEWGURU_DEV_PORT;
    const port =
      devPort && /^\d+$/.test(devPort.trim())
        ? parseInt(devPort.trim(), 10)
        : 3000;
    win.loadURL(`http://127.0.0.1:${port}/app`);
  }

  if (!app.isPackaged) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }

  // ============================================================
  // IPC: UI controls
  // ============================================================
  ipcMain.on('set-always-on-top', (event, flag) => {
    win.setAlwaysOnTop(flag, 'screen-saver');
  });

  ipcMain.on('set-skip-taskbar', (event, flag) => {
    win.setSkipTaskbar(flag);
    console.log('[Stealth] Taskbar hidden:', flag);
  });

  ipcMain.on('set-stealth-mode', (event, flag) => {
    win.setContentProtection(flag);
    console.log('[Stealth] Content protection:', flag);
  });

  ipcMain.on('close-app', () => {
    console.log('[App] Exit signal received. Terminating process...');
    app.exit(0);
    process.exit(0);
  });

  ipcMain.on('QUIT_NOW', () => {
    console.log('[App] Hard QUIT requested.');
    app.exit(0);
    process.exit(0);
  });

  ipcMain.on('resize-window', (event, newWidth, newHeight) => {
    if (!win) return;
    /** Maximized windows ignore setBounds until restored (Windows frameless). */
    if (win.isMaximized()) {
      win.unmaximize();
    }
    const bounds = win.getBounds();
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: Math.floor(Math.max(400, Number(newWidth) || bounds.width)),
      height: Math.floor(Math.max(500, Number(newHeight) || bounds.height)),
    });
  });

  ipcMain.on('window-minimize', () => {
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize-toggle', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  // Emergency Global Quit Shortcut
  globalShortcut.register('CommandOrControl+Q', () => {
    console.log('[App] Global Quit hotkey triggered.');
    app.exit(0);
    process.exit(0);
  });

  ipcMain.on('update-hotkeys', (event, hotkeys) => {
    // Unregister only the user-configurable ones, keep built-ins
    try { globalShortcut.unregister(hotkeys.toggleClickThrough); } catch (e) { }
    try { globalShortcut.unregister(hotkeys.toggleHide); } catch (e) { }

    globalShortcut.register(hotkeys.toggleClickThrough, () => {
      isClickThrough = !isClickThrough;
      win.setIgnoreMouseEvents(isClickThrough, { forward: true });
    });

    globalShortcut.register(hotkeys.toggleHide, () => {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.setAlwaysOnTop(true, 'screen-saver');
      }
    });
  });

  // ============================================================
  // GLOBAL KEYBOARD SHORTCUTS
  // ============================================================

  // Ctrl+Shift+Space ── Focus Chat Input (STEALTH)
  // Temporarily disables click-through so keyboard goes to InterviewGuru.
  // After typing + Enter, the renderer sends 'chat-input-blurred' and
  // click-through re-enables automatically. Cursor never visibly moves.
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    win.setIgnoreMouseEvents(false); // Allow keyboard focus
    win.showInactive();
    win.focus();
    win.webContents.send('focus-chat-input'); // Tell renderer to open chat + focus textarea
  });

  // Ctrl+Shift+X ── Toggle Click-Through manually
  globalShortcut.register('CommandOrControl+Shift+X', () => {
    isClickThrough = !isClickThrough;
    win.setIgnoreMouseEvents(isClickThrough, { forward: true });
    console.log('Click-through:', isClickThrough ? 'ON' : 'OFF');
  });

  // Ctrl+Shift+H ── Hide / Show overlay
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our existing window instead.
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    if (app.isPackaged) {
      setupAutoUpdater();
    }
  });
}
