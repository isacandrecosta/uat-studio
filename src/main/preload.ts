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
    abrirExemplo: chamar('projeto:abrir-exemplo'),
    apagarExemplo: chamar('projeto:apagar-exemplo'),
    abrirWiki: chamar('projeto:abrir-wiki'),
    definirAmbiente: chamar('projeto:definir-ambiente'),
  },
  dados: {
    listar: chamar('dados:listar'),
    guardar: chamar('dados:guardar'),
    apagar: chamar('dados:apagar'),
  },
  app: {
    modo: chamar('app:modo'),
    desempenho: chamar('app:desempenho'),
    sugestaoParalelo: chamar('app:sugestao-paralelo'),
  },
  blocos: {
    reparar: chamar('blocos:reparar'),
    parametrizar: chamar('blocos:parametrizar'),
  },
  pacotes: {
    exportar: chamar('pacotes:exportar'),
    abrir: chamar('pacotes:abrir'),
    importar: chamar('pacotes:importar'),
  },
  gravador: {
    estado: chamar('gravador:estado'),
    iniciar: chamar('gravador:iniciar'),
    removerPasso: chamar('gravador:remover-passo'),
    capturar: chamar('gravador:capturar'),
    gravarSobrePrint: chamar('gravador:sobre-print'),
    terminar: chamar('gravador:terminar'),
    aoAtualizar: ouvir('gravador:atualizado'),
  },
  runs: {
    estado: chamar('run:estado'),
    iniciar: chamar('run:iniciar'),
    parar: chamar('run:parar'),
    pausar: chamar('run:pausar'),
    continuar: chamar('run:continuar'),
    saltar: chamar('run:saltar'),
    miniaturas: chamar('run:miniaturas'),
    responderManual: chamar('run:responder-manual'),
    pausarWorker: chamar('run:pausar-worker'),
    saltarJornada: chamar('run:saltar-jornada'),
    verificar: chamar('run:verificar'),
    historico: chamar('run:historico'),
    abrir: chamar('run:abrir'),
    lerTexto: chamar('run:ler-texto'),
    defeito: chamar('run:defeito'),
    defeitos: chamar('run:defeitos'),
    aceitarEsperados: chamar('run:aceitar-esperados'),
    guardarDefeito: chamar('run:defeito-guardar'),
    abrirTrace: chamar('run:abrir-trace'),
    pdf: chamar('run:pdf'),
    imagem: chamar('run:imagem'),
    aoAtualizar: ouvir('run:atualizado'),
  },
  variaveis: {
    ler: chamar('variaveis:ler'),
    gravar: chamar('variaveis:gravar'),
  },
  contadores: {
    ler: chamar('contadores:ler'),
    definir: chamar('contadores:definir'),
  },
  api: {
    testar: chamar('api:testar'),
  },
  cofre: {
    definir: chamar('cofre:definir'),
    preenchidos: chamar('cofre:preenchidos'),
    apagarPerfil: chamar('cofre:apagar-perfil'),
    segredosDeTeste: chamar('cofre:segredos-teste'),
    definirSegredoDeTeste: chamar('cofre:segredo-teste'),
  },
  casos: {
    importar: chamar('casos:importar'),
    exportar: chamar('casos:exportar'),
  },
});
