// Ponte segura entre a janela do diagnóstico e o processo principal.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('uatDiagnostico', {
  info: () => ipcRenderer.invoke('diag:info'),
  correr: (url: string) => ipcRenderer.invoke('diag:correr', url),
  copiar: () => ipcRenderer.invoke('diag:copiar'),
  aoAtualizar: (callback: (resultado: unknown) => void) => {
    ipcRenderer.on('diag:resultado', (_evento, resultado) => callback(resultado));
  },
});
