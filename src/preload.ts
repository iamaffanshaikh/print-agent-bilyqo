import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('agent', {
  state:()=>ipcRenderer.invoke('state'),
  updateState:()=>ipcRenderer.invoke('update-state'),
  update:()=>ipcRenderer.invoke('update-check'),
  installUpdate:()=>ipcRenderer.invoke('update-install'),
  save:(value:unknown)=>ipcRenderer.invoke('save',value),
  test:()=>ipcRenderer.invoke('test'),
  cut:()=>ipcRenderer.invoke('cut'),
  rotate:()=>ipcRenderer.invoke('rotate'),
  copyToken:()=>ipcRenderer.invoke('copy-token')
});
