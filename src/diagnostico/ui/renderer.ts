// Janela do diagnóstico: lista de verificações com o estado a verde/vermelho.
// Tudo dentro de uma função para não chocar com os nomes do renderer principal.
(() => {
  const ROTULOS: Record<DiagEstado, string> = {
    pendente: 'Por correr',
    'a-correr': 'A verificar…',
    ok: 'OK',
    falha: 'Falhou',
    aviso: 'Aviso',
    saltado: 'Não testado',
  };

  function obter<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Elemento em falta: #${id}`);
    return el as T;
  }

  const lista = obter<HTMLUListElement>('lista');
  const campoUrl = obter<HTMLInputElement>('campo-url');
  const botaoCorrer = obter<HTMLButtonElement>('btn-correr');
  const botaoCopiar = obter<HTMLButtonElement>('btn-copiar');
  const resumo = obter<HTMLElement>('resumo');

  function atualizarLinha(resultado: DiagResultado): void {
    const linha = lista.querySelector<HTMLLIElement>(`li[data-id="${resultado.id}"]`);
    if (!linha) return;
    linha.dataset.estado = resultado.estado;
    linha.querySelector('.etiqueta')!.textContent = ROTULOS[resultado.estado];
    linha.querySelector('.detalhe')!.textContent = resultado.detalhe;
  }

  function criarLinha(verificacao: DiagVerificacao): void {
    const linha = document.createElement('li');
    linha.dataset.id = verificacao.id;
    linha.dataset.estado = 'pendente';

    const bola = document.createElement('span');
    bola.className = 'bola';
    bola.setAttribute('aria-hidden', 'true');

    const texto = document.createElement('div');
    texto.className = 'texto';
    const nome = document.createElement('p');
    nome.className = 'nome';
    nome.textContent = verificacao.nome;
    const descricao = document.createElement('p');
    descricao.className = 'descricao';
    descricao.textContent = verificacao.descricao;
    const detalhe = document.createElement('p');
    detalhe.className = 'detalhe';
    texto.append(nome, descricao, detalhe);

    const etiqueta = document.createElement('span');
    etiqueta.className = 'etiqueta';
    etiqueta.textContent = ROTULOS.pendente;

    linha.append(bola, texto, etiqueta);
    lista.append(linha);
  }

  function mostrarResumo(resultados: DiagResultado[]): void {
    const falhas = resultados.filter((r) => r.estado === 'falha').length;
    const avisos = resultados.filter((r) => r.estado === 'aviso').length;
    if (falhas > 0) {
      resumo.dataset.estado = 'falha';
      resumo.textContent =
        `${falhas} verificaç${falhas === 1 ? 'ão falhou' : 'ões falharam'}. ` +
        'Copia o resultado e pede a IT um ambiente aprovado para a ferramenta.';
    } else if (avisos > 0) {
      resumo.dataset.estado = 'aviso';
      resumo.textContent = `Tudo o que é essencial funciona (${avisos} aviso${avisos === 1 ? '' : 's'}).`;
    } else {
      resumo.dataset.estado = 'ok';
      resumo.textContent = 'Tudo OK: este PC consegue correr o UAT Studio.';
    }
  }

  async function correr(): Promise<void> {
    botaoCorrer.disabled = true;
    botaoCopiar.disabled = true;
    campoUrl.disabled = true;
    resumo.dataset.estado = 'a-correr';
    resumo.textContent = 'A verificar… O Edge vai abrir e fechar sozinho.';
    for (const linha of Array.from(lista.querySelectorAll<HTMLLIElement>('li'))) {
      atualizarLinha({ id: linha.dataset.id ?? '', estado: 'pendente', detalhe: '' });
    }
    try {
      mostrarResumo(await window.uatDiagnostico.correr(campoUrl.value));
      botaoCopiar.disabled = false;
    } catch (erro) {
      resumo.dataset.estado = 'falha';
      const texto = erro instanceof Error ? erro.message : String(erro);
      resumo.textContent = `Não foi possível correr o diagnóstico: ${texto.replace(/^Error invoking remote method '[^']+': (Error: |TypeError: )?/, '')}`;
    } finally {
      botaoCorrer.disabled = false;
      campoUrl.disabled = false;
    }
  }

  botaoCorrer.addEventListener('click', () => void correr());
  campoUrl.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !botaoCorrer.disabled) void correr();
  });

  botaoCopiar.addEventListener('click', async () => {
    await window.uatDiagnostico.copiar();
    botaoCopiar.textContent = 'Copiado';
    setTimeout(() => (botaoCopiar.textContent = 'Copiar resultado'), 2000);
  });

  window.uatDiagnostico.aoAtualizar(atualizarLinha);

  void window.uatDiagnostico.info().then((info) => {
    campoUrl.placeholder = info.urlPadrao;
    info.verificacoes.forEach(criarLinha);
    // Sinal para os testes automáticos: a janela está pronta.
    document.body.dataset.pronto = 'sim';
  });
})();
