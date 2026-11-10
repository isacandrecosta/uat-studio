// Ponte segura entre a interface (renderer) e o processo principal.
// A interface só consegue chamar o que for exposto aqui.
import { contextBridge, ipcRenderer } from 'electron';

const chamar =
  (canal: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(canal, ...args);

/** Regista um ouvinte e devolve a função para o desligar. */
const ouvir = (canal: string) => (callback: (dados: unknown) => void) => {
  const ouvinte = (_evento: unknown, dados: unknown): void => callback(dados);
  ipcRenderer.on(canal, ouvinte);
  return () => ipcRenderer.removeListener(canal, ouvinte);
};

contextBridge.exposeInMainWorld('uatStudio', {
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
  gravador: {
    estado: chamar('gravador:estado'),
    iniciar: chamar('gravador:iniciar'),
    removerPasso: chamar('gravador:remover-passo'),
    terminar: chamar('gravador:terminar'),
    aoAtualizar: ouvir('gravador:atualizado'),
  },
});
