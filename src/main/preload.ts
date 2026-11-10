// Ponte segura entre a interface (renderer) e o processo principal.
// A interface só consegue chamar o que for exposto aqui.
import { contextBridge, ipcRenderer } from 'electron';

const chamar =
  (canal: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld('uatStudio', {
  abrirAppPoc: chamar('browser:abrir-poc'),
  projeto: {
    atual: chamar('projeto:atual'),
    recentes: chamar('projeto:recentes'),
    escolherPasta: chamar('projeto:escolher-pasta'),
    criar: chamar('projeto:criar'),
    abrir: chamar('projeto:abrir'),
    fechar: chamar('projeto:fechar'),
    definirAmbiente: chamar('projeto:definir-ambiente'),
  },
  dados: {
    listar: chamar('dados:listar'),
    guardar: chamar('dados:guardar'),
    apagar: chamar('dados:apagar'),
  },
});
