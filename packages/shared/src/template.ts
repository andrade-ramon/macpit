/**
 * Parâmetros `{{nome}}` em comandos de ações.
 *
 * Os valores **nunca** são colados no texto do comando: cada `{{nome}}` vira uma referência a variável de
 * ambiente (`"${MACPIT_PARAM_NOME}"`) e o valor vai no ambiente do processo. Assim um valor como
 * `x; rm -rf ~` é só texto para o shell. O contexto de aspas é respeitado:
 * - fora de aspas → `"${MACPIT_PARAM_X}"` (entre aspas duplas, sem word-splitting)
 * - dentro de aspas duplas → `${MACPIT_PARAM_X}`
 * - dentro de aspas simples → erro (o shell não expandiria a variável)
 */

export interface TemplateParam {
  name: string;
  default?: string;
}

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export const paramEnvName = (name: string) => `MACPIT_PARAM_${name.toUpperCase()}`;

type Quote = 'none' | 'single' | 'double';

interface Placeholder {
  name: string;
  start: number;
  end: number;
  quote: Quote;
}

/** Início de palavra para o shell (onde `#` começa comentário e `[[`/`((` são palavras-chave). */
const WORD_START = /[\s;&|()]/;

/**
 * Onde o shell **reavalia o conteúdo de uma variável como expressão** (e portanto um valor como
 * `a[$(id)]` executaria código mesmo vindo de variável de ambiente). Placeholder aqui = erro.
 */
const EVAL_CONTEXT_MSG =
  'está num contexto em que o shell avalia o valor como expressão (aritmética, [[ ]], ${…}, índice de array ou let) — um valor malicioso executaria código; use o parâmetro fora desse contexto (ex.: n={{n}}; valide antes de usar)';

/** `let` no comando simples atual (antes do placeholder). */
const LET_BEFORE = /(?:^|[\s;&|(])let\s[^;&|\n]*$/;

/**
 * Varre o comando achando `{{nome}}` e o contexto de cada um: aspas, comentários e contextos de
 * reavaliação. Em caso de dúvida (ambiguidade do parser simplificado), prefere recusar.
 */
function scan(command: string): Placeholder[] {
  const found: Placeholder[] = [];
  let quote: Quote = 'none';
  let arith = 0; // dentro de $(( )) / (( ))
  let arithParens = 0; // parênteses simples dentro da aritmética
  let dbracket = false; // dentro de [[ ]]
  let brace = 0; // dentro de ${ }
  let subscript = 0; // dentro de nome[ ]
  const at = (i: number, s: string) => command.startsWith(s, i);

  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    const prev = i === 0 ? ' ' : command[i - 1]!;

    if (c === '\\' && quote !== 'single') {
      i++; // caractere escapado
      continue;
    }
    if (quote === 'single') {
      if (c === "'") quote = 'none';
      else if (c === '{' && command[i + 1] === '{') {
        const close = command.indexOf('}}', i + 2);
        const name = close === -1 ? '…' : command.slice(i + 2, close).trim();
        throw new TemplateError(
          `{{${name}}} está entre aspas simples, onde o shell não expande variáveis — use aspas duplas ou nenhuma`,
        );
      }
      continue;
    }
    // comentário: `#` no início de palavra, fora de aspas → até o fim da linha (fica literal)
    if (quote === 'none' && c === '#' && WORD_START.test(prev) && !brace && !arith) {
      const nl = command.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (c === "'" && quote === 'none') {
      quote = 'single';
      continue;
    }
    if (c === '"') {
      quote = quote === 'double' ? 'none' : 'double';
      continue;
    }

    // contextos de reavaliação
    if (at(i, '$((')) {
      arith++;
      i += 2;
      continue;
    }
    if (quote === 'none' && at(i, '((') && WORD_START.test(prev)) {
      arith++;
      i += 1;
      continue;
    }
    if (arith) {
      if (c === '(') arithParens++;
      else if (c === ')') {
        if (arithParens > 0) arithParens--;
        else if (command[i + 1] === ')') {
          arith--;
          i++;
          continue;
        }
      }
    }
    if (quote === 'none' && at(i, '[[') && WORD_START.test(prev)) {
      dbracket = true;
      i++;
      continue;
    }
    if (dbracket && at(i, ']]')) {
      dbracket = false;
      i++;
      continue;
    }
    if (at(i, '${')) {
      brace++;
      i++;
      continue;
    }
    if (brace && c === '}' && !at(i - 1, '}')) {
      brace--;
      continue;
    }
    if (quote === 'none' && c === '[' && /[A-Za-z0-9_]/.test(prev)) {
      subscript++;
      continue;
    }
    if (subscript && c === ']') {
      subscript--;
      continue;
    }

    if (c === '{' && command[i + 1] === '{') {
      const close = command.indexOf('}}', i + 2);
      if (close === -1) throw new TemplateError(`"{{" sem "}}" correspondente na posição ${i + 1}`);
      const name = command.slice(i + 2, close).trim();
      if (!PARAM_NAME_RE.test(name)) throw new TemplateError(`nome de parâmetro inválido: {{${name}}}`);
      if (arith || dbracket || brace || subscript || LET_BEFORE.test(command.slice(0, i))) {
        throw new TemplateError(`{{${name}}} ${EVAL_CONTEXT_MSG}`);
      }
      found.push({ name, start: i, end: close + 2, quote });
      i = close + 1;
    }
  }
  if (quote === 'single') {
    // aspas simples não fechadas: tudo depois está "em aspas simples" — se houver placeholder, recusa
    const lastQuote = command.lastIndexOf("'");
    if (command.indexOf('{{', lastQuote) !== -1) {
      throw new TemplateError('há aspas simples sem fechar antes de um {{parâmetro}}');
    }
  }
  return found;
}

/** Nomes dos `{{parâmetros}}` usados no comando, na ordem em que aparecem (sem repetição). */
export function extractPlaceholders(command: string): string[] {
  try {
    return [...new Set(scan(command).map((p) => p.name))];
  } catch {
    return [];
  }
}

/**
 * Gera o comando final (com referências a variáveis) e o ambiente com os valores.
 * Erros: placeholder não declarado, dentro de aspas simples, ou sem valor e sem padrão.
 */
export function renderCommand(
  command: string,
  params: readonly TemplateParam[],
  values: Readonly<Record<string, string>> = {},
): { command: string; env: Record<string, string> } {
  const declared = new Map(params.map((p) => [p.name.toLowerCase(), p]));
  const env: Record<string, string> = {};
  let out = '';
  let last = 0;
  for (const ph of scan(command)) {
    const param = declared.get(ph.name.toLowerCase());
    if (!param) throw new TemplateError(`parâmetro {{${ph.name}}} usado no comando mas não declarado`);
    if (ph.quote === 'single') {
      throw new TemplateError(
        `{{${ph.name}}} está entre aspas simples, onde o shell não expande variáveis — use aspas duplas ou nenhuma`,
      );
    }
    const value = values[param.name] ?? param.default;
    if (value === undefined) throw new TemplateError(`informe um valor para {{${param.name}}}`);
    if (value.includes('\0')) throw new TemplateError(`valor inválido para {{${param.name}}}`);
    const ref = `\${${paramEnvName(param.name)}}`;
    out += command.slice(last, ph.start) + (ph.quote === 'double' ? ref : `"${ref}"`);
    last = ph.end;
    env[paramEnvName(param.name)] = value;
  }
  return { command: out + command.slice(last), env };
}

/** Valida o template no momento de salvar (sem valores reais). Retorna a mensagem de erro ou `undefined`. */
export function validateTemplate(command: string, params: readonly TemplateParam[]): string | undefined {
  try {
    renderCommand(command, params, Object.fromEntries(params.map((p) => [p.name, 'x'])));
    return undefined;
  } catch (err) {
    return err instanceof TemplateError ? err.message : String(err);
  }
}
