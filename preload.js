'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles:     ()           => ipcRenderer.invoke('select-files'),
  selectOutputDir: ()           => ipcRenderer.invoke('select-output-dir'),
  convert:         (opts)       => ipcRenderer.invoke('convert', opts),
  showInExplorer:  (path)       => ipcRenderer.invoke('show-in-explorer', path),
  onProgress:      (cb)         => ipcRenderer.on('progress', (_, data) => cb(data)),
});
