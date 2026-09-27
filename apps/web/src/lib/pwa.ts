import { useSyncExternalStore } from 'react';

/** Evento do Chrome/Edge que permite abrir o diálogo "Instalar app" a partir de um botão. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Rodando como app instalado (janela própria, sem barra do navegador)? */
export function isStandalone(): boolean {
  return (
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Registra o service worker (só no build de produção: no `pnpm dev` o Vite serve os módulos direto).
 * Quando um SW novo assume (após um novo build), recarrega a página uma vez: os chunks antigos
 * saíram do cache e um import dinâmico falharia.
 */
export function setupPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // guarda para o botão "Instalar app"
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return; // 1ª instalação: nada a recarregar
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
      console.warn('[macpit] service worker não registrado', err);
    });
  });
}

export type InstallState =
  /** já está rodando como app instalado */
  | 'standalone'
  /** o navegador ofereceu instalação (Chrome/Edge): dá para mostrar o botão */
  | 'available'
  /** instalado agora há pouco (nesta sessão) */
  | 'installed'
  /** sem prompt (Safari, Firefox, já instalado em outra janela…) — mostrar instruções */
  | 'manual';

function snapshot(): InstallState {
  if (isStandalone()) return 'standalone';
  if (installed) return 'installed';
  return deferred ? 'available' : 'manual';
}

export function useInstallPrompt(): { state: InstallState; install: () => Promise<boolean> } {
  const state = useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, snapshot);
  const install = async () => {
    if (!deferred) return false;
    const prompt = deferred;
    deferred = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') installed = true;
    notify();
    return outcome === 'accepted';
  };
  return { state, install };
}

/** Instruções quando o navegador não oferece o botão (Safari etc.). */
export function manualInstallHint(userAgent = navigator.userAgent): string {
  const isSafari = /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(userAgent);
  if (isSafari) return 'No Safari: menu Arquivo → “Adicionar ao Dock…”.';
  if (/Edg\//.test(userAgent)) return 'No Edge: menu ⋯ → Aplicativos → “Instalar este site como aplicativo”.';
  if (/Chrome\//.test(userAgent))
    return 'No Chrome: ícone de instalar na barra de endereço, ou menu ⋮ → “Transmitir, salvar e compartilhar” → “Instalar página como app…”.';
  return 'Use um navegador com suporte a apps web (Chrome, Edge ou Safari 17+).';
}
