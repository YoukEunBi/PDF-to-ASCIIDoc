'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    title: 'PDF → AsciiDoc 변환기',
    icon: fs.existsSync(path.join(__dirname, 'assets', 'icon.png'))
      ? path.join(__dirname, 'assets', 'icon.png')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#1e1e2e',
    show: false,
  });

  win.loadFile('index.html');
  win.once('ready-to-show', () => { win.show(); win.webContents.openDevTools(); });

  // 메인 프로세스에서 드롭 파일 경로를 받아 렌더러로 전달
  // (렌더러에서 file.path가 빈 문자열인 Electron 신버전 대응)
  win.webContents.session.on('will-download', (e) => e.preventDefault());

  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC: 드롭 경로 검증 (렌더러에서 path가 비었을 때 대비) ──
ipcMain.handle('resolve-drop-paths', async (_, paths) => {
  return paths.filter(p => p && require('fs').existsSync(p));
});

// ── IPC: 파일 선택 다이얼로그 ──
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'PDF 파일 선택',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

// ── IPC: 출력 폴더 선택 ──
ipcMain.handle('select-output-dir', async () => {
  const result = await dialog.showOpenDialog({
    title: '출력 폴더 선택',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: 변환 실행 ──
ipcMain.handle('convert', async (event, { files, outputDir, makeHtml }) => {
  const { convertPdf } = require('./convert-core');
  const results = [];

  for (const filePath of files) {
    try {
      const baseName = path.basename(filePath, '.pdf');
      const outDir = outputDir || path.dirname(filePath);
      const adocPath = path.join(outDir, baseName + '.adoc');
      const htmlPath = path.join(outDir, baseName + '.html');

      event.sender.send('progress', { file: path.basename(filePath), status: 'converting' });

      await convertPdf(filePath, adocPath, { makeHtml, htmlPath });

      results.push({ file: path.basename(filePath), adoc: adocPath, html: makeHtml ? htmlPath : null, ok: true });
      event.sender.send('progress', { file: path.basename(filePath), status: 'done' });
    } catch (err) {
      results.push({ file: path.basename(filePath), error: err.message, ok: false });
      event.sender.send('progress', { file: path.basename(filePath), status: 'error', error: err.message });
    }
  }

  return results;
});

// ── IPC: 파일 탐색기로 열기 ──
ipcMain.handle('show-in-explorer', async (_, filePath) => {
  const { shell } = require('electron');
  shell.showItemInFolder(filePath);
});
