import '@xterm/xterm/css/xterm.css';
import type { Run, RunEvent } from '@macpit/shared';
import { runChannel } from '@macpit/shared';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { getWsClient } from '../../lib/ws';
import { describeRun } from './actionUtils';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Terminal xterm.js ligado ao canal `run:<id>`: recebe replay + saída ao vivo, envia teclas
 * (`run:input`) e o tamanho da janela (`run:resize`). Ao reconectar o WS, o replay redesenha tudo.
 */
export function RunTerminal({ runId, onStatus }: { runId: string; onStatus: (run: Run) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const container = el.current;
    if (!container) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      lineHeight: 1.3,
      scrollback: 10_000,
      // terminal sempre preto (em qualquer paleta); cursor na cor de destaque
      theme: {
        background: '#000000',
        foreground: '#d4d8e2',
        cursor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fe0a0',
        selectionBackground: 'rgba(255,255,255,.18)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    const client = getWsClient();
    let running = false;

    const sendSize = () => {
      try {
        fit.fit();
      } catch {
        return; // container sem tamanho (ex.: escondido)
      }
      if (running) client.send({ type: 'run:resize', runId, cols: term.cols, rows: term.rows });
    };

    const off = client.subscribe(runChannel(runId), (data) => {
      const ev = data as RunEvent;
      if (ev.kind === 'gone') {
        running = false;
        term.reset();
        term.write(`${DIM}[esta execução não existe mais — foi removida do histórico]${RESET}\r\n`);
      } else if (ev.kind === 'replay') {
        term.reset();
        if (ev.truncated) term.write(`${DIM}[… início omitido — use "Baixar log" para ver tudo]${RESET}\r\n`);
        term.write(ev.data);
        running = ev.run.status === 'running';
        onStatusRef.current(ev.run);
        if (running) sendSize();
        else term.write(`\r\n${DIM}[${describeRun(ev.run)}]${RESET}\r\n`);
      } else if (ev.kind === 'output') {
        term.write(ev.data);
      } else {
        running = false;
        onStatusRef.current(ev.run);
        term.write(`\r\n${DIM}[${describeRun(ev.run)}]${RESET}\r\n`);
      }
    });
    const input = term.onData((d) => {
      if (running) client.send({ type: 'run:input', runId, data: d });
    });
    const ro = new ResizeObserver(() => sendSize());
    ro.observe(container);
    term.focus();

    return () => {
      off();
      input.dispose();
      ro.disconnect();
      term.dispose();
    };
  }, [runId]);

  return <div ref={el} className="h-full min-h-0 w-full overflow-hidden bg-black" />;
}

export default RunTerminal;
