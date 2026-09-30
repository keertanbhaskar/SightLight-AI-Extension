import { apiClient } from './client';
import { Task, TaskListResponse, TaskStatus } from '@/types';

export const tasksApi = {
  getTasks: async (params?: {
    status_filter?: TaskStatus;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<TaskListResponse> => {
    const response = await apiClient.get<TaskListResponse>('/tasks', { params });
    return response.data;
  },

  getTask: async (taskId: string): Promise<Task> => {
    const response = await apiClient.get<Task>(`/tasks/${taskId}`);
    return response.data;
  },

  createTask: async (instruction: string): Promise<Task> => {
    const response = await apiClient.post<Task>('/tasks', { instruction });
    return response.data;
  },

  deleteTask: async (taskId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}`);
  },
};
