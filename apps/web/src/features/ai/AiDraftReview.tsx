import type { AiResult } from '@macpit/shared';

export function AiDraftReview({ result }: { result: AiResult }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0 whitespace-pre-wrap text-text2">{result.explanation}</p>
      {result.action && (
        <>
          <h3 className="m-0 font-semibold">{result.action.name}</h3>
          <pre className="term-box m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">
            {result.action.command}
          </pre>
          <p className="m-0 text-text2">
            {result.action.persistent ? 'Serviço' : 'Ação pontual'} · início e reinício automáticos desligados
          </p>
          {result.action.params.length > 0 && (
            <ul className="m-0 pl-5 text-text2">
              {result.action.params.map((p) => (
                <li key={p.name}>
                  {p.label || p.name} (
                  {p.secret
                    ? 'segredo solicitado ao executar'
                    : p.type === 'repo'
                      ? 'repositório escolhido localmente'
                      : (p.default ?? 'solicitado ao executar')}
                  )
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {result.questions.length > 0 && (
        <div>
          <h3 className="m-0 mb-1 font-semibold">Para continuar</h3>
          <ul className="m-0 pl-5">
            {result.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {result.requirements.length > 0 && (
        <div>
          <h3 className="m-0 mb-1 font-semibold">Requisitos</h3>
          <ul className="m-0 pl-5 text-text2">
            {result.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-line bg-panel2 p-3">
          <h3 className="m-0 mb-1 font-semibold">Efeitos e cuidados</h3>
          <ul className="m-0 pl-5">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
