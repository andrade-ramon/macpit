import type { AiResult } from '@macpit/shared';

/** Dados sintéticos. Nenhum comando ou segredo foi coletado da máquina. */
export const AI_DRAFT: AiResult = {
  status: 'draft',
  explanation: 'Mostra o texto fornecido como argumento.',
  questions: [],
  requirements: ['printf do shell'],
  warnings: [],
  action: {
    name: 'Texto sintético',
    command: 'printf "%s\\n" {{texto}}',
    group: 'Teste',
    icon: null,
    persistent: false,
    expectedPort: null,
    params: [{ name: 'texto', label: 'Texto', type: 'text', secret: false, default: null }],
  },
};
export const AI_KEY = 'chave-falsa-exclusiva-dos-testes';
