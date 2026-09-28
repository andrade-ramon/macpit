import type { NotificationSettings } from '@macpit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLayout } from '../components/layout/LayoutContext';
import { Workspace } from '../components/layout/Workspace';
import { Segmented, Switch } from '../components/ui/Switch';
import { InstallCard } from '../features/pwa/InstallCard';
import { RestartCard } from '../features/settings/RestartCard';
import { SHORTCUT_HELP } from '../features/shortcuts/shortcuts';
import { useHealth } from '../hooks/useHealth';
import { api } from '../lib/api';
import { PALETTES, setDensity, setPalette, useAppearance, type Density } from '../lib/theme';

const KEY = ['settings', 'notifications'];
const SECTIONS = [
  { id: 'settings-server', label: 'Servidor do macpit' },
  { id: 'settings-notifications', label: 'Notificações' },
  { id: 'settings-appearance', label: 'Aparência' },
  { id: 'settings-install', label: 'Instalar como app' },
  { id: 'settings-login', label: 'Iniciar com o Mac' },
];

function Row({ children }: { children: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 border-t border-line px-1">{children}</label>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="card flex max-w-[820px] scroll-mt-4 flex-col gap-3.5">
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { setHelp } = useLayout();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: health } = useHealth();
  const { palette, density } = useAppearance();
  const [active, setActive] = useState(SECTIONS[0]!.id);
  const [copied, setCopied] = useState(false);
  const { data, error } = useQuery({
    queryKey: KEY,
    queryFn: () => api<NotificationSettings>('/api/settings/notifications'),
  });
  const save = useMutation({
    mutationFn: (s: NotificationSettings) =>
      api<NotificationSettings>('/api/settings/notifications', { method: 'PUT', body: JSON.stringify(s) }),
    onSuccess: (s) => qc.setQueryData(KEY, s),
  });
  const test = useMutation({
    mutationFn: () => api<{ ok: true }>('/api/settings/notifications/test', { method: 'POST' }),
  });
  const set = (patch: Partial<NotificationSettings>) => data && save.mutate({ ...data, ...patch });
  const goto = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const copy = () =>
    void navigator.clipboard?.writeText('./scripts/install-launchagent.sh').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const left = (
    <div className="flex flex-col gap-0.5">
      <div className="eyebrow mb-2">Configurações</div>
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => goto(s.id)}
          className={`flex h-10 items-center rounded-[9px] border-0 px-3 text-left hover:bg-panel2 ${
            active === s.id ? 'bg-panel2 font-semibold text-text' : 'bg-transparent font-medium text-text2'
          }`}
        >
          {s.label}
        </button>
      ))}
      <button
        onClick={() => setHelp(true)}
        className="flex h-10 items-center rounded-[9px] border-0 bg-transparent px-3 text-left font-medium text-text2 hover:bg-panel2"
      >
        Atalhos de teclado
      </button>
    </div>
  );

  const right = (
    <>
      <div className="eyebrow">Atalhos de teclado</div>
      <div className="flex flex-col gap-0.5">
        {SHORTCUT_HELP.map((s) => (
          <div key={s.keys} className="flex min-h-[38px] items-center gap-3 px-1 text-[13px] text-text2">
            <kbd className="kbd min-w-14">{s.keys}</kbd>
            {s.description}
          </div>
        ))}
      </div>
      <p className="m-0 text-xs text-text3">
        Atalhos de uma tecla ficam desligados enquanto você digita (inclusive no terminal).
      </p>
    </>
  );

  return (
    <Workspace
      label="Configurações"
      left={left}
      right={right}
      mainClassName="flex flex-col gap-4 overflow-auto px-6 pb-6 pt-[18px]"
    >
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Configurações</h1>

      <RestartCard />

      <Section id="settings-notifications">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">Notificações do macOS</h2>
            <p className="m-0 mt-0.5 text-[13px] text-text2">
              Usa <code>osascript</code>. Se não aparecer, permita “Script Editor” em Ajustes → Notificações.
              {health?.isRoot && ' Rodando como root, as notificações podem não aparecer na sua sessão.'}
            </p>
          </div>
          {data && (
            <Switch
              size="lg"
              checked={data.enabled}
              onChange={(v) => set({ enabled: v })}
              label="Enviar notificações"
            />
          )}
        </div>
        {error && <p className="m-0 text-sm text-danger">{error.message}</p>}
        {data && (
          <fieldset
            disabled={!data.enabled}
            className="m-0 flex flex-col gap-0.5 border-0 p-0"
            style={{ opacity: data.enabled ? 1 : 0.45 }}
          >
            <Row>
              <span>Execuções de ações</span>
              <select
                value={data.runs}
                onChange={(e) => set({ runs: e.target.value as NotificationSettings['runs'] })}
                className="input h-[38px]"
              >
                <option value="failures">só quando falharem</option>
                <option value="all">ao terminar (sucesso ou falha)</option>
                <option value="none">nunca</option>
              </select>
            </Row>
            <Row>
              <span>Serviços: caiu, sem resposta na porta, reiniciando, conectado</span>
              <input
                type="checkbox"
                checked={data.services}
                onChange={(e) => set({ services: e.target.checked })}
                className="h-[18px] w-[18px] accent-[var(--accent)]"
              />
            </Row>
            <Row>
              <span>
                Disco acima do limite de alerta{' '}
                <button type="button" onClick={() => navigate('/disk')} className="link-btn text-[13px]">
                  ajustar limite
                </button>
              </span>
              <input
                type="checkbox"
                checked={data.disk}
                onChange={(e) => set({ disk: e.target.checked })}
                className="h-[18px] w-[18px] accent-[var(--accent)]"
              />
            </Row>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => test.mutate()} disabled={test.isPending || !data?.enabled} className="btn btn-md">
            Enviar notificação de teste
          </button>
          {test.isSuccess && <span className="text-xs text-accent">enviada — apareceu no canto da tela?</span>}
          {test.error && <span className="text-xs text-danger">{test.error.message}</span>}
          {save.error && <span className="text-xs text-danger">{save.error.message}</span>}
        </div>
      </Section>

      <Section id="settings-appearance">
        <div>
          <h2 className="m-0 text-base font-semibold">Aparência</h2>
          <p className="m-0 mt-0.5 text-[13px] text-text2">
            Escolha a paleta. O terminal das ações fica sempre escuro.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Paleta de cores">
          {PALETTES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={palette === t.id}
              onClick={() => setPalette(t.id)}
              className="flex flex-col gap-2.5 rounded-xl border-2 bg-bg p-3 text-left"
              style={{ borderColor: palette === t.id ? 'var(--accent)' : 'var(--line)' }}
            >
              <span className="flex gap-1">
                <span className="h-7 w-7 rounded-[7px] border border-line2" style={{ background: t.swatch[0] }} />
                <span className="h-7 w-7 rounded-[7px]" style={{ background: t.swatch[1] }} />
                <span className="h-7 w-7 rounded-[7px]" style={{ background: t.swatch[2] }} />
              </span>
              <span className="font-semibold">{t.name}</span>
              <span className="text-xs text-text2">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3 border-t border-line px-1">
          <span>Densidade das tabelas</span>
          <Segmented<Density>
            value={density}
            onChange={setDensity}
            label="Densidade das tabelas"
            className="bg-bg"
            options={[
              { value: 'comfortable', label: 'Confortável' },
              { value: 'compact', label: 'Compacta' },
            ]}
          />
        </div>
      </Section>

      <InstallCard />

      <Section id="settings-login">
        <div>
          <h2 className="m-0 text-base font-semibold">Iniciar com o Mac</h2>
          <p className="m-0 mt-0.5 text-[13px] text-text2">
            Sobe ao fazer login e, com ele, os serviços marcados como “iniciar junto”.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[10px] bg-black px-3 py-2.5">
          <code className="flex-1 text-[12.5px] text-term-text">./scripts/install-launchagent.sh</code>
          <button onClick={copy} className="btn btn-sm">
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="m-0 text-xs text-text3">
          Remover: <code>--uninstall</code> · Ver estado: <code>--status</code> · Abrir o painel:{' '}
          <code>./scripts/open.sh</code>
        </p>
      </Section>
    </Workspace>
  );
}
