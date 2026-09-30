import { apiClient } from './client';
import { UserSettings, PerceptionMode, Theme } from '@/types';

export interface UpdateSettingsData {
  perception_mode?: PerceptionMode;
  confidence_threshold?: number;
  max_steps?: number;
  max_runtime?: number;
  require_confirmation?: boolean;
  theme?: Theme;
}

export const settingsApi = {
  getSettings: async (): Promise<UserSettings> => {
    const response = await apiClient.get<UserSettings>('/settings');
    return response.data;
  },

  updateSettings: async (data: UpdateSettingsData): Promise<UserSettings> => {
    const response = await apiClient.put<UserSettings>('/settings', data);
    return response.data;
  },
};
