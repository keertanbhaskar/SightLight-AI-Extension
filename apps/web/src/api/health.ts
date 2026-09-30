import { apiClient } from './client';
import { HealthResponse, DatabaseHealthResponse } from '@/types';

export const healthApi = {
  checkHealth: async (): Promise<HealthResponse> => {
    const response = await apiClient.get<HealthResponse>('/health');
    return response.data;
  },

  checkDatabase: async (): Promise<DatabaseHealthResponse> => {
    const response = await apiClient.get<DatabaseHealthResponse>('/health/database');
    return response.data;
  },
};
