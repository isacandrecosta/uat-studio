// O que o preload do diagnóstico expõe à janela (ver src/diagnostico/preload.ts).
export {};

declare global {
  type DiagEstado = 'pendente' | 'a-correr' | 'ok' | 'falha' | 'aviso' | 'saltado';

  interface DiagVerificacao {
    id: string;
    nome: string;
    descricao: string;
  }

  interface DiagResultado {
    id: string;
    estado: DiagEstado;
    detalhe: string;
  }

  interface Window {
    uatDiagnostico: {
      info(): Promise<{ verificacoes: DiagVerificacao[]; urlPadrao: string }>;
      correr(url: string): Promise<DiagResultado[]>;
      copiar(): Promise<boolean>;
      aoAtualizar(callback: (resultado: DiagResultado) => void): void;
    };
  }
}
