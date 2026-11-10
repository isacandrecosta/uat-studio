// Ponte segura entre a interface (renderer) e o processo principal.
// A interface só consegue chamar o que for exposto aqui.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('uatStudio', {
  abrirAppPoc: () => ipcRenderer.invoke('browser:abrir-poc'),
});
