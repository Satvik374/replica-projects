// Cadence desktop shell: native window, menus, and project/render file access.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isMac = process.platform === 'darwin';
const devUrl = process.env.CADENCE_DEV_URL || '';
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#131316',
    show: false,
    title: 'Cadence',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 12, y: 10 } }
      : { titleBarOverlay: { color: '#131316', symbolColor: '#9a9aa7', height: 32 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

/** Windows/Linux use the in-app menu bar, so expose window controls. */
ipcMain.handle('window:action', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') mainWindow.close();
});

/** Build the native application menu from the renderer's menu definition. */
ipcMain.handle('menu:set', (_event, tree) => {
  if (!Array.isArray(tree)) return;
  const toTemplate = (items) =>
    items.map((item) => {
      if (item.type === 'separator') return { type: 'separator' };
      const entry = {
        label: item.label,
        accelerator: item.accelerator || undefined,
        enabled: item.enabled !== false,
      };
      if (item.items) entry.submenu = toTemplate(item.items);
      else
        entry.click = () => {
          if (mainWindow) mainWindow.webContents.send('menu:command', item.command);
        };
      return entry;
    });
  Menu.setApplicationMenu(Menu.buildFromTemplate(toTemplate(tree)));
});

ipcMain.handle('project:save', async (_event, payload) => {
  let target = payload.path;
  if (!target) {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Cadence Project',
      defaultPath: `${payload.name || 'Untitled'}.cadence.json`,
      filters: [{ name: 'Cadence Project', extensions: ['cadence.json', 'json'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    target = res.filePath;
  }
  await fs.writeFile(target, payload.json, 'utf8');
  return { canceled: false, path: target };
});

ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Cadence Project',
    properties: ['openFile'],
    filters: [{ name: 'Cadence Project', extensions: ['json'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  const target = res.filePaths[0];
  const json = await fs.readFile(target, 'utf8');
  return { canceled: false, path: target, json };
});

ipcMain.handle('file:save-binary', async (_event, payload) => {
  let target = payload.path;
  if (!target) {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export',
      defaultPath: payload.defaultName,
      filters: payload.filters || [],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    target = res.filePath;
  }
  const buffer = Buffer.from(payload.base64, 'base64');
  await fs.writeFile(target, buffer);
  return { canceled: false, path: target };
});

ipcMain.handle('app:open-external', async (_event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) await shell.openExternal(url);
});

ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  electron: process.versions.electron,
}));
