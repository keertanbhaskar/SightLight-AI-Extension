import { apiClient } from './client';
import { AnalyticsResponse, OverviewMetrics } from '@/types';

export const analyticsApi = {
  getOverview: async (): Promise<OverviewMetrics> => {
    const response = await apiClient.get<OverviewMetrics>('/analytics/overview');
    return response.data;
  },

  getAnalytics: async (days: number = 30): Promise<AnalyticsResponse> => {
    const response = await apiClient.get<AnalyticsResponse>('/analytics', {
      params: { days },
    });
    return response.data;
  },
};
