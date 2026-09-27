import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Erro de renderização numa página não derruba o app inteiro: mostra a mensagem e permite tentar de novo. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[macpit] erro de renderização', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    // trocar de página limpa o erro
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="max-w-2xl space-y-3 rounded-xl border border-danger bg-danger-soft p-5">
        <h1 className="text-lg font-semibold text-danger">Algo deu errado nesta página</h1>
        <pre className="overflow-auto whitespace-pre-wrap text-xs text-danger">{this.state.error.message}</pre>
        <p className="text-sm text-text2">Os processos e ações continuam rodando no servidor — é só a tela.</p>
        <button onClick={() => this.setState({ error: null })} className="btn">
          Tentar de novo
        </button>
      </div>
    );
  }
}
