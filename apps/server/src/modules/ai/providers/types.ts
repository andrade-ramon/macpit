import type { AiSettings, AiUsageSchema } from '@macpit/shared';
import type { z } from 'zod';

export interface AiProviderRequest extends AiSettings {
  apiKey: string;
  system: string;
  input: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
}
export interface AiProviderResult {
  text: string;
  usage?: z.infer<typeof AiUsageSchema>;
}
export type AiGenerate = (request: AiProviderRequest) => Promise<AiProviderResult>;
