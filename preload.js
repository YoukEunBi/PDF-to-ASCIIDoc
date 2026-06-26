'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles:     ()      => ipcRenderer.invoke('select-files'),
  selectOutputDir: ()      => ipcRenderer.invoke('select-output-dir'),
  convert:         (opts)  => ipcRenderer.invoke('convert', opts),
  showInExplorer:  (path)  => ipcRenderer.invoke('show-in-explorer', path),
  onProgress:      (cb)    => ipcRenderer.on('progress', (_, data) => cb(data)),
  // Electron 32+: file.path 대신 이 API로 드롭된 파일 경로를 얻음
  getPathForFile:  (file)  => webUtils.getPathForFile(file),
});
