import { SavedPanelsSchema, type Panel, type SavedPanel } from '@macpit/shared';
import type { SettingsStore } from '../../db/settings.js';
import { HttpError } from '../../lib/http.js';
import type { RepoService } from '../repos/service.js';

const KEY = 'panels.saved';

export class PanelService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly repos: RepoService,
  ) {}

  private saved(): SavedPanel[] {
    return this.settings.get(KEY, SavedPanelsSchema, []);
  }

  async list(): Promise<Panel[]> {
    const { repos } = await this.repos.listFresh();
    return this.saved().map((panel) => ({
      ...panel,
      available: repos.some((r) => r.id === panel.id && r.path === panel.repoPath),
    }));
  }

  async save(repoId: string): Promise<Panel> {
    const { repos } = await this.repos.listFresh();
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) throw new HttpError(404, 'repositório não encontrado', 'not_found');
    // Leia depois do await: duas solicitações concorrentes não perdem a atualização uma da outra.
    const panels = this.saved();
    const existing = panels.find((p) => p.id === repo.id);
    if (existing) return { ...existing, available: true };
    if (panels.length >= 200) throw new HttpError(409, 'limite de 200 painéis salvos atingido', 'panels_limit');
    const panel = SavedPanelsSchema.element.parse({
      id: repo.id,
      name: repo.github ?? repo.name,
      repoPath: repo.path,
      savedAt: Date.now(),
    });
    this.settings.set(KEY, [panel, ...panels]);
    return { ...panel, available: true };
  }

  remove(id: string): void {
    this.settings.set(
      KEY,
      this.saved().filter((p) => p.id !== id),
    );
  }
}
