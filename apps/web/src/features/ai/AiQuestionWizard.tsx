import { useEffect, useRef, useState } from 'react';

/** Mantém o vínculo pergunta/resposta no contrato de prompt já existente. */
function answersPrompt(questions: string[], answers: string[]) {
  return `Respostas às perguntas da IA:\n\n${questions.map((question, index) => `${index + 1}. Pergunta: ${question}\nResposta: ${answers[index]?.trim() ?? ''}`).join('\n\n')}`;
}

export function AiQuestionWizard({
  questions,
  busy,
  limitReached,
  onSubmit,
  onCancel,
}: {
  questions: string[];
  busy: boolean;
  limitReached: boolean;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState(() => questions.map(() => ''));
  const [step, setStep] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const reviewing = step === questions.length;
  const complete = answers.every((answer) => answer.trim());
  const prompt = answersPrompt(questions, answers);
  const tooLong = prompt.length > 8000;

  useEffect(() => {
    if (step === questions.length) summary.current?.focus();
    else field.current?.focus();
  }, [step, questions.length]);

  return (
    <section
      aria-label="Responder perguntas da IA"
      className="flex flex-col gap-4 rounded-xl border border-line bg-panel2 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow" aria-live="polite">
          {reviewing ? 'Revise suas respostas' : `Pergunta ${step + 1} de ${questions.length}`}
        </span>
        <span className="text-xs text-text3">
          {answers.filter((answer) => answer.trim()).length} de {questions.length} respondidas
        </span>
      </div>
      <nav aria-label="Etapas das perguntas" className="flex flex-wrap gap-2">
        {questions.map((_, index) => (
          <button
            key={index}
            type="button"
            className={`btn btn-sm ${step === index ? 'btn-primary' : ''}`}
            disabled={busy || (index > step && !answers[index - 1]?.trim())}
            aria-label={`Ir para pergunta ${index + 1}`}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => setStep(index)}
          >
            {answers[index]?.trim() ? '✓ ' : ''}
            {index + 1}
          </button>
        ))}
      </nav>
      {reviewing ? (
        <>
          <h3 ref={summary} tabIndex={-1} className="m-0 text-base font-semibold">
            Tudo certo para enviar?
          </h3>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {questions.map((question, index) => (
              <li key={index} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium">
                    {index + 1}. {question}
                  </span>
                  <button
                    className="btn btn-sm shrink-0"
                    type="button"
                    disabled={busy}
                    aria-label={`Editar resposta ${index + 1}`}
                    onClick={() => setStep(index)}
                  >
                    Editar
                  </button>
                </div>
                <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-sm text-text2">{answers[index]}</p>
              </li>
            ))}
          </ol>
          <p className="m-0 text-xs text-text3">
            As respostas serão enviadas juntas ao provedor. Avançar entre perguntas não faz chamadas à IA.
          </p>
        </>
      ) : (
        <label className="flex flex-col gap-3 text-sm font-medium">
          {questions[step]}
          <textarea
            ref={field}
            value={answers[step]}
            disabled={busy}
            rows={4}
            maxLength={8000}
            className="input w-full resize-y font-normal"
            placeholder="Escreva sua resposta para esta pergunta…"
            onChange={(event) =>
              setAnswers((previous) => previous.map((answer, index) => (index === step ? event.target.value : answer)))
            }
          />
        </label>
      )}
      {tooLong && (
        <p role="alert" className="m-0 text-sm text-danger">
          Perguntas e respostas somam {prompt.length.toLocaleString('pt-BR')} caracteres. Reduza as respostas para
          enviar até 8.000.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>
          Voltar
        </button>
        {reviewing ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !complete || tooLong || limitReached}
            onClick={() => onSubmit(prompt)}
          >
            {busy ? 'Enviando…' : 'Enviar respostas à IA'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !answers[step]?.trim()}
            onClick={() => setStep(step + 1)}
          >
            {step === questions.length - 1 ? 'Revisar respostas' : 'Próxima'}
          </button>
        )}
        {busy && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar geração
          </button>
        )}
      </div>
    </section>
  );
}
