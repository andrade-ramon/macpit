import type { Action, ActionInput, ActionsImportResult, Run, ShellImport } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useActions() {
  // execuções mudam de estado por conta própria: revalida a cada poucos segundos
  return useQuery({ queryKey: ['actions'], queryFn: () => api<Action[]>('/api/actions'), refetchInterval: 3_000 });
}

export function useRuns(actionId?: string, limit = 20) {
  const qs = new URLSearchParams({ limit: String(limit), ...(actionId ? { actionId } : {}) });
  return useQuery({
    queryKey: ['runs', actionId ?? null, limit],
    queryFn: () => api<Run[]>(`/api/runs?${qs}`),
    refetchInterval: 5_000,
  });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ['run', id],
    queryFn: () => api<Run>(`/api/runs/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['actions'] });
    void qc.invalidateQueries({ queryKey: ['runs'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
}

export function useSaveAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ActionInput }) =>
      api<Action>(id ? `/api/actions/${id}` : '/api/actions', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/actions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useStartRun() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      actionId,
      cols,
      rows,
      params,
    }: {
      actionId: string;
      cols?: number;
      rows?: number;
      params?: Record<string, string>;
    }) => api<Run>(`/api/actions/${actionId}/run`, { method: 'POST', body: JSON.stringify({ cols, rows, params }) }),
    onSuccess: invalidate,
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (runId: string) => api<Run>(`/api/runs/${runId}/stop`, { method: 'POST' }),
    onSuccess: (_r, runId) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
}

export function useStopService() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: string | { actionId: string; repoPath: string }) => {
      const actionId = typeof input === 'string' ? input : input.actionId;
      return api<Action>(`/api/actions/${actionId}/stop`, {
        method: 'POST',
        ...(typeof input === 'string' ? {} : { body: JSON.stringify({ repoPath: input.repoPath }) }),
      });
    },
    onSuccess: invalidate,
  });
}

export function useImportActions() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { actions: unknown[]; onConflict?: 'skip' | 'duplicate' }) =>
      api<ActionsImportResult>('/api/actions/import', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

/** Lê aliases/funções do shell do usuário (roda o shell interativo no servidor). */
export function useShellEntries(enabled: boolean) {
  return useQuery({
    queryKey: ['shell-import'],
    queryFn: () => api<ShellImport>('/api/import/shell', { method: 'POST' }),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Só envia valores preenchidos: vazio = usar o padrão do parâmetro. */
export function filledParams(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
}
