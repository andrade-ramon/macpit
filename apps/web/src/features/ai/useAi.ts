import { useQuery } from '@tanstack/react-query';
import type { AiPublicSettings } from '@macpit/shared';
import { api } from '../../lib/api';

export const AI_SETTINGS_KEY = ['settings', 'ai'];
export function useAiSettings() {
  return useQuery({
    queryKey: AI_SETTINGS_KEY,
    queryFn: () => api<AiPublicSettings>('/api/ai/settings'),
    retry: false,
  });
}
