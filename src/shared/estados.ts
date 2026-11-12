// Nomes dos resultados na linguagem das equipas de QA, com um símbolo (para quem não distingue cores).
// Os códigos OK/KO/ERRO continuam nos ficheiros, nos relatórios e nos filtros; na interface mostram-se assim:
//   OK   → ✓ Passou     (tudo coincide)
//   KO   → ✗ Falhou     (chegou ao fim, mas um valor é diferente do esperado)
//   ERRO → ! Bloqueado  (não chegou ao fim)
export type Resultado = 'OK' | 'KO' | 'ERRO';

export const ROTULO_RESULTADO: Record<Resultado, string> = { OK: 'Passou', KO: 'Falhou', ERRO: 'Bloqueado' };
export const SIMBOLO_RESULTADO: Record<Resultado, string> = { OK: '✓', KO: '✗', ERRO: '!' };
export const EXPLICACAO_RESULTADO: Record<Resultado, string> = {
  OK: 'OK: chegou ao fim e todos os valores coincidem.',
  KO: 'KO: chegou ao fim, mas pelo menos um valor é diferente do esperado.',
  ERRO: 'ERRO: não chegou ao fim (elemento não encontrado, ecrã errado, falha de rede...).',
};

/** "✓ Passou" */
export function rotuloComSimbolo(r: Resultado): string {
  return `${SIMBOLO_RESULTADO[r]} ${ROTULO_RESULTADO[r]}`;
}
