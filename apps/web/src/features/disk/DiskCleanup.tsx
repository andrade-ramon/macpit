import { useEffect, useRef, useState } from 'react';
import type { CleanupPlan, CleanupResult } from '@macpit/shared';
import { CLEANUP_DEFAULT_FILES, CLEANUP_MAX_FILES, CLEANUP_MAX_MIN_BYTES } from '@macpit/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { api } from '../../lib/api';
import { fmtBytes } from '../../lib/format';

export function DiskCleanup() {
  const [path, setPath] = useState('~/Downloads');
  const [maxFiles, setMaxFiles] = useState(String(CLEANUP_DEFAULT_FILES));
  const [minSizeMb, setMinSizeMb] = useState('0');
  const minFileBytes = Math.ceil(Number(minSizeMb) * 1_000_000);
  const validSize =
    minSizeMb.trim() !== '' &&
    Number.isFinite(Number(minSizeMb)) &&
    Number(minSizeMb) >= 0 &&
    minFileBytes <= CLEANUP_MAX_MIN_BYTES;
  const validLimit =
    Number.isInteger(Number(maxFiles)) && Number(maxFiles) >= 1 && Number(maxFiles) <= CLEANUP_MAX_FILES;
  const [plan, setPlan] = useState<CleanupPlan>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CleanupResult>();
  const [busy, setBusy] = useState<'scan' | 'execute'>();
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const filtered =
    plan?.files.filter((file) =>
      `${file.path} ${file.category === 'cache' ? 'cache' : 'revisão manual'}`
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
    ) ?? [];
  const [now, setNow] = useState(() => Date.now());
  const controller = useRef<AbortController | undefined>(undefined);
  const queries = useQueryClient();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, []);
  const expired = !!plan && plan.expiresAt <= now;
  const chosen = plan?.files.filter((file) => selected.has(file.id)) ?? [];
  const bytes = chosen.reduce((total, file) => total + file.bytes, 0);
  const scan = async () => {
    if (busy || !validLimit || !validSize) return;
    controller.current = new AbortController();
    setBusy('scan');
    setError(undefined);
    setPlan(undefined);
    setResult(undefined);
    setSelected(new Set());
    setFilter('');
    setPage(0);
    try {
      setPlan(
        await api<CleanupPlan>('/api/disk/cleanup/scan', {
          method: 'POST',
          body: JSON.stringify({ path, maxFiles: Number(maxFiles), minFileBytes }),
          signal: controller.current.signal,
        }),
      );
      setNow(Date.now());
    } catch (err) {
      if (!controller.current.signal.aborted) setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const execute = async () => {
    if (!plan || busy || expired || !chosen.length) return;
    setBusy('execute');
    setError(undefined);
    try {
      setResult(
        await api<CleanupResult>('/api/disk/cleanup/execute', {
          method: 'POST',
          body: JSON.stringify({ planId: plan.id, fileIds: chosen.map((file) => file.id), confirm: true }),
        }),
      );
      await queries.invalidateQueries({ queryKey: ['disk'] });
      await queries.invalidateQueries({ queryKey: ['disk-usage'] });
    } catch (err) {
      setError(`${(err as Error).message} Confira a Lixeira e analise novamente antes de tentar outra limpeza.`);
    } finally {
      setBusy(undefined);
      setConfirm(false);
      setPlan(undefined);
      setSelected(new Set());
    }
  };
  return (
    <section className="card flex flex-col gap-3" aria-label="Limpeza assistida">
      <h2 className="card-title m-0">Limpeza assistida</h2>
      <p className="m-0 text-sm text-text2">
        Analise Downloads ou uma pasta de projetos. Sugestões incluem caches reconhecidos e downloads antigos ou
        grandes. Nada começa selecionado.
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void scan();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Pasta para analisar
          <input
            className="input w-full"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            disabled={!!busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Limite de arquivos
          <input
            className="input w-36"
            type="number"
            min={1}
            max={CLEANUP_MAX_FILES}
            step={1}
            value={maxFiles}
            disabled={!!busy}
            onChange={(event) => setMaxFiles(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tamanho mínimo (MB)
          <input
            className="input w-36"
            type="number"
            min={0}
            max={CLEANUP_MAX_MIN_BYTES / 1_000_000}
            step="any"
            value={minSizeMb}
            disabled={!!busy}
            onChange={(event) => setMinSizeMb(event.target.value)}
          />
        </label>
        <button className="btn btn-md btn-primary" disabled={!!busy || !path.trim() || !validLimit || !validSize}>
          {busy === 'scan' ? 'Analisando…' : 'Analisar para limpeza'}
        </button>
        {busy === 'scan' && (
          <button type="button" className="btn btn-md" onClick={() => controller.current?.abort()}>
            Cancelar análise
          </button>
        )}
      </form>
      <p className="m-0 text-xs text-text2">
        Até {CLEANUP_MAX_FILES.toLocaleString('pt-BR')} candidatos por análise, com até 2 minutos de busca. O limite
        conta os arquivos oferecidos na prévia. Tamanho mínimo vale para todas as sugestões: 100 MB = 100.000.000 bytes;
        0 desativa o filtro.
      </p>
      {busy && (
        <p role="status" className="m-0 text-sm text-text2">
          {busy === 'scan'
            ? 'Analisando arquivos sem alterar o disco…'
            : 'Conferindo a seleção e enviando arquivos à Lixeira…'}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}
      {plan && (
        <>
          <p className="m-0 break-all text-sm text-text2">
            {plan.files.length} candidatos em {plan.root}. Prévia válida por 10 minutos.
          </p>
          {plan.partial && (
            <p role="alert" className="m-0 text-sm text-warn">
              Análise parcial. Apenas os arquivos listados podem ser selecionados.
            </p>
          )}
          {plan.warnings.length > 0 && (
            <details>
              <summary className="text-sm text-warn">Avisos da análise</summary>
              {plan.warnings.map((warning, index) => (
                <p className="break-all text-xs text-text2" key={index}>
                  {warning}
                </p>
              ))}
            </details>
          )}
          {expired && (
            <p role="alert" className="text-sm text-warn">
              Prévia expirada. Analise novamente.
            </p>
          )}
          {!plan.files.length ? (
            <p className="m-0 text-sm text-text2">
              Nenhum candidato encontrado pelas regras de limpeza. Isso não significa que a pasta esteja vazia.
            </p>
          ) : (
            <>
              <label className="flex min-w-0 flex-col gap-1 text-sm">
                Filtrar prévia
                <input
                  className="input w-full"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Caminho ou categoria"
                />
              </label>
              <div
                className="max-h-[480px] overflow-auto rounded-lg border border-line"
                aria-label="Arquivos da prévia"
              >
                {filtered.slice(page * 100, (page + 1) * 100).map((file) => (
                  <div
                    key={file.id}
                    className="flex flex-col gap-2 border-b border-line p-3 last:border-b-0 hover:bg-panel2"
                  >
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${file.path}`}
                        checked={selected.has(file.id)}
                        disabled={!!busy || expired || (!selected.has(file.id) && selected.size >= 500)}
                        onChange={() =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (next.has(file.id)) next.delete(file.id);
                            else next.add(file.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 break-all font-mono text-xs">{file.path}</span>
                      <span className="shrink-0">{fmtBytes(file.bytes)}</span>
                    </label>
                    <span className="text-xs text-text2">
                      {file.category === 'cache' ? 'Cache reconhecido' : 'Revisão manual'} · Modificado em{' '}
                      {new Date(file.modifiedAt).toLocaleString('pt-BR')}
                    </span>
                    <details className="text-xs leading-relaxed text-text2">
                      <summary>Motivo e impacto</summary>
                      <p>{file.reason}</p>
                      <p>{file.impact}</p>
                    </details>
                    <button
                      className="btn btn-sm self-start"
                      disabled={!!busy || expired}
                      onClick={() => {
                        void api('/api/disk/cleanup/open', {
                          method: 'POST',
                          body: JSON.stringify({ planId: plan.id, fileId: file.id }),
                        }).catch((err: Error) => setError(err.message));
                      }}
                    >
                      Mostrar no Finder
                    </button>
                  </div>
                ))}
              </div>
              {filtered.length > 100 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
                    Página anterior
                  </button>
                  <span>
                    Página {page + 1} de {Math.ceil(filtered.length / 100)} · {filtered.length} arquivos
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={(page + 1) * 100 >= filtered.length}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Próxima página
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  {selected.size} arquivos selecionados · {fmtBytes(bytes)} estimados
                </span>
                <button
                  className="btn btn-md"
                  disabled={!!busy || !selected.size}
                  onClick={() => setSelected(new Set())}
                >
                  Desmarcar todos
                </button>
                <button
                  className="btn btn-md btn-danger-outline ml-auto"
                  disabled={!!busy || expired || !selected.size}
                  onClick={() => setConfirm(true)}
                >
                  Revisar limpeza
                </button>
              </div>
              <p className="m-0 text-xs text-text2">
                Até 500 arquivos por limpeza. O espaço só será liberado após esvaziar a Lixeira pelo Finder; o macpit
                não a esvazia.
              </p>
            </>
          )}
        </>
      )}
      {result && (
        <div role="status" className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Resultado da limpeza</h3>
          <p className="m-0 text-sm">
            {result.items.filter((item) => item.status === 'moved').length} enviados à Lixeira ·{' '}
            {fmtBytes(result.movedBytes)}. {result.items.filter((item) => item.status === 'skipped').length} ignorados ·{' '}
            {result.items.filter((item) => item.status === 'failed').length} falhas.
          </p>
          <p className="m-0 text-xs text-text2">
            Recupere pelo Finder movendo o arquivo da Lixeira para o caminho original mostrado abaixo. O uso do volume
            continua atualizado pelas métricas do disco.
          </p>
          <div className="max-h-72 overflow-auto">
            {result.items.map((item) => (
              <p key={item.id} className={`break-all text-xs ${item.status === 'moved' ? 'text-text2' : 'text-warn'}`}>
                {item.path} — {item.message}
              </p>
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Mover ${chosen.length} arquivos para a Lixeira?`}
        hint={`${fmtBytes(bytes)} estimados. Você poderá recuperá-los manualmente pelo Finder. O espaço só será liberado ao esvaziar a Lixeira.`}
        confirmLabel="Confirmar e mover para a Lixeira"
        busy={busy === 'execute'}
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
        onConfirm={() => {
          void execute();
        }}
      >
        <div className="max-h-52 overflow-auto text-xs text-text2">
          {chosen.map((file) => (
            <p className="break-all" key={file.id}>
              {file.path} · {fmtBytes(file.bytes)}
            </p>
          ))}
        </div>
      </ConfirmDialog>
    </section>
  );
}
