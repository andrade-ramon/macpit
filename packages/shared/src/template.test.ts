import { describe, expect, it } from 'vitest';
import { extractPlaceholders, renderCommand, TemplateError, validateTemplate } from './template.js';

const P = [{ name: 'port', default: '5432' }, { name: 'host' }];

describe('renderCommand', () => {
  it('troca por referência a variável entre aspas e põe o valor no ambiente', () => {
    const r = renderCommand('ssh -N -L {{port}}:db:5432 {{host}}', P, { host: 'bastion' });
    expect(r.command).toBe('ssh -N -L "${MACPIT_PARAM_PORT}":db:5432 "${MACPIT_PARAM_HOST}"');
    expect(r.env).toEqual({ MACPIT_PARAM_PORT: '5432', MACPIT_PARAM_HOST: 'bastion' });
  });

  it('valor malicioso não vira comando (fica só no ambiente)', () => {
    const r = renderCommand('echo {{host}}', P, { host: '$(rm -rf ~); `id`' });
    expect(r.command).toBe('echo "${MACPIT_PARAM_HOST}"');
    expect(r.env.MACPIT_PARAM_HOST).toBe('$(rm -rf ~); `id`');
  });

  it('dentro de aspas duplas não adiciona aspas', () => {
    expect(renderCommand('echo "conectando em {{host}}:{{port}}"', P, { host: 'h' }).command).toBe(
      'echo "conectando em ${MACPIT_PARAM_HOST}:${MACPIT_PARAM_PORT}"',
    );
  });

  it('aspas simples, não declarado e sem valor viram erro', () => {
    expect(() => renderCommand("echo '{{host}}'", P, { host: 'h' })).toThrow(/aspas simples/);
    expect(() => renderCommand('echo {{nada}}', P)).toThrow(/não declarado/);
    expect(() => renderCommand('echo {{host}}', P)).toThrow(/informe um valor/);
    expect(() => renderCommand('echo {{host', P)).toThrow(TemplateError);
    expect(() => renderCommand('echo {{a b}}', P)).toThrow(/inválido/);
  });

  it('respeita escapes e aspas simples fechadas', () => {
    expect(renderCommand("echo 'x' {{host}} \\'", P, { host: 'h' }).command).toBe(
      "echo 'x' \"${MACPIT_PARAM_HOST}\" \\'",
    );
    expect(renderCommand('echo "a\\"b {{host}}"', P, { host: 'h' }).command).toBe('echo "a\\"b ${MACPIT_PARAM_HOST}"');
  });

  it('recusa contextos em que o shell REAVALIA o valor como expressão (achado do security-reviewer)', () => {
    const N = [{ name: 'n' }];
    for (const cmd of [
      'sleep $(( {{n}} ))',
      'echo $(( 1 + {{n}} ))',
      '(( {{n}} > 0 )) && echo ok',
      '[[ {{n}} -gt 0 ]] && echo ok',
      'let x={{n}}+1',
      'a=(1 2 3); echo ${a[{{n}}]}',
      'echo ${HOME:{{n}}}',
      'a[{{n}}]=x',
    ]) {
      expect(() => renderCommand(cmd, N, { n: '1' }), cmd).toThrow(TemplateError);
    }
    // contextos normais continuam aceitos
    expect(renderCommand('[ "{{n}}" = "1" ] && echo {{n}}', N, { n: '1' }).command).toBe(
      '[ "${MACPIT_PARAM_N}" = "1" ] && echo "${MACPIT_PARAM_N}"',
    );
    expect(renderCommand('echo $(date) {{n}}', N, { n: '1' }).command).toBe('echo $(date) "${MACPIT_PARAM_N}"');
  });

  it('comentários: apóstrofo não abre aspas e placeholder em comentário fica literal', () => {
    const N = [{ name: 'p' }];
    expect(renderCommand("echo {{p}} # don't worry", N, { p: 'x' }).command).toBe(
      'echo "${MACPIT_PARAM_P}" # don\'t worry',
    );
    expect(renderCommand('# só comentário {{p}}\necho {{p}}', N, { p: 'x' }).command).toBe(
      '# só comentário {{p}}\necho "${MACPIT_PARAM_P}"',
    );
    // "#" no meio de palavra não é comentário
    expect(renderCommand('echo a#{{p}}', N, { p: 'x' }).command).toBe('echo a#"${MACPIT_PARAM_P}"');
  });

  it('sem placeholders devolve o comando igual', () => {
    expect(renderCommand('ls -la', [])).toEqual({ command: 'ls -la', env: {} });
  });

  it('nome do parâmetro não diferencia maiúsculas', () => {
    expect(renderCommand('echo {{HOST}}', P, { host: 'h' }).env).toEqual({ MACPIT_PARAM_HOST: 'h' });
  });
});

describe('extractPlaceholders / validateTemplate', () => {
  it('lista nomes únicos na ordem', () => {
    expect(extractPlaceholders('a {{x}} b {{ y }} {{x}}')).toEqual(['x', 'y']);
    expect(extractPlaceholders('quebrado {{')).toEqual([]);
  });

  it('valida sem valores reais', () => {
    expect(validateTemplate('ssh {{host}}', P)).toBeUndefined();
    expect(validateTemplate("ssh '{{host}}'", P)).toMatch(/aspas simples/);
    expect(validateTemplate('ssh {{outro}}', P)).toMatch(/não declarado/);
  });
});
