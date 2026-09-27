import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/** Erro de domínio com status HTTP; tratado no error handler global. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Valida com zod e lança 400 com os problemas encontrados. */
export function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
    throw new HttpError(400, `requisição inválida — ${detail}`, 'invalid_request');
  }
  return result.data;
}

export function sendError(reply: FastifyReply, err: HttpError) {
  return reply.code(err.statusCode).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
}
