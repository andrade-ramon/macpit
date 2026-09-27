import { describe, expect, it } from 'vitest';
import { ClientMessageSchema } from './ws.js';

describe('ClientMessageSchema', () => {
  it('aceita subscribe válido', () => {
    expect(ClientMessageSchema.parse({ type: 'subscribe', channel: 'run:abc-1' })).toEqual({
      type: 'subscribe',
      channel: 'run:abc-1',
    });
  });

  it('rejeita canal com caracteres inválidos', () => {
    expect(ClientMessageSchema.safeParse({ type: 'subscribe', channel: 'a b;rm' }).success).toBe(false);
  });

  it('rejeita tipo desconhecido', () => {
    expect(ClientMessageSchema.safeParse({ type: 'exec', channel: 'x' }).success).toBe(false);
  });
});
