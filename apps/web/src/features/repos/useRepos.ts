import type { ProjectOverview, Repo, RepoList, RepoSettings, RepoVarsInput } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const LIST = ['repos'];
const SETTINGS = ['settings', 'repos'];

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api<ProjectOverview>(`/api/repos/${encodeURIComponent(id)}/project`),
    refetchInterval: 3_000,
    retry: false,
  });
}

export function useRepos() {
  return useQuery({ queryKey: LIST, queryFn: () => api<RepoList>('/api/repos'), staleTime: 30_000 });
}

export function useRepoSettings() {
  return useQuery({ queryKey: SETTINGS, queryFn: () => api<RepoSettings>('/api/settings/repos') });
}

export function useSaveRepoSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: RepoSettings) =>
      api<RepoSettings>('/api/settings/repos', { method: 'PUT', body: JSON.stringify(s) }),
    onSuccess: (s) => {
      qc.setQueryData(SETTINGS, s);
      void qc.invalidateQueries({ queryKey: LIST });
    },
  });
}

export function useScanRepos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<RepoList>('/api/repos/scan', { method: 'POST' }),
    onSuccess: (list) => qc.setQueryData(LIST, list),
  });
}

export function useSaveRepoVars() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RepoVarsInput }) =>
      api<Repo>(`/api/repos/${id}/vars`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (repo) =>
      qc.setQueryData<RepoList>(LIST, (old) =>
        old ? { ...old, repos: old.repos.map((r) => (r.id === repo.id ? repo : r)) } : old,
      ),
  });
}

/** Salva quais repositórios importar (atualiza a lista na hora). */
export function useSaveRepoSelection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api<RepoList>('/api/repos/selection', { method: 'PUT', body: JSON.stringify({ paths }) }),
    onMutate: (paths) => {
      const set = new Set(paths);
      qc.setQueryData<RepoList>(LIST, (old) =>
        old ? { ...old, hasSelection: true, repos: old.repos.map((r) => ({ ...r, imported: set.has(r.path) })) } : old,
      );
    },
    onSuccess: (list) => qc.setQueryData(LIST, list),
    onError: () => void qc.invalidateQueries({ queryKey: LIST }),
  });
}
