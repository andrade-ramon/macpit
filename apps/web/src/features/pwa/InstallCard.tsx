import { useState } from 'react';
import { manualInstallHint, useInstallPrompt } from '../../lib/pwa';

/** Configurações → instalar o macpit como app (janela própria, ícone no Dock). */
export function InstallCard() {
  const { state, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  return (
    <section id="settings-install" className="card flex max-w-[820px] scroll-mt-4 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold">Instalar como app</h2>
          <p className="m-0 mt-0.5 text-[13px] text-text2">
            Janela própria e ícone no Dock (Chrome ou Edge; no Safari: Arquivo → Adicionar ao Dock).
          </p>
        </div>
        {state === 'available' && (
          <button
            onClick={() => void install().then((ok) => !ok && setDismissed(true))}
            className="btn btn-primary h-[42px] shrink-0 rounded-[10px] px-4 font-bold"
          >
            ⤓ Instalar app
          </button>
        )}
      </div>
      {state === 'standalone' && (
        <p className="m-0 text-[13px] text-accent">✔ Você está usando o macpit como app instalado.</p>
      )}
      {state === 'installed' && (
        <p className="m-0 text-[13px] text-accent">✔ Instalado! Abra pelo Dock ou pelo Launchpad.</p>
      )}
      {state === 'manual' && (
        <p className="m-0 text-[13px] text-text2">
          {manualInstallHint()} <span className="text-text3">(se já instalou, ele aparece no Dock/Launchpad)</span>
        </p>
      )}
      {dismissed && <p className="m-0 text-xs text-text3">Instalação cancelada.</p>}
      <p className="m-0 text-xs text-text3">
        O app é só a interface: os dados vêm sempre ao vivo do servidor local. Ele fica ligado a{' '}
        <code>127.0.0.1:7777</code>: se mudar <code>MACPIT_PORT</code>, instale de novo.
      </p>
    </section>
  );
}
