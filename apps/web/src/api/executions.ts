import { apiClient } from './client';
import { Execution } from '@/types';

export const executionsApi = {
  getTaskExecutions: async (taskId: string): Promise<Execution[]> => {
    const response = await apiClient.get<{ executions: Execution[] }>(
      `/executions/tasks/${taskId}/executions`
    );
    return response.data.executions;
  },

  getExecution: async (executionId: string): Promise<Execution> => {
    const response = await apiClient.get<Execution>(`/executions/${executionId}`);
    return response.data;
  },
};
