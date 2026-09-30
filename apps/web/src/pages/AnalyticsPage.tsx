import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/analytics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

const AnalyticsPage = () => {
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => analyticsApi.getAnalytics(days),
  });

  const COLORS = {
    primary: '#0ea5e9',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    vision: '#8b5cf6',
    dom: '#06b6d4',
    hybrid: '#ec4899',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading analytics...</div>
      </div>
    );
  }

  // Transform timeline data
  const timelineData = analytics?.tasks_timeline.map((item) => ({
    date: format(new Date(item.date), 'MMM dd'),
    total: item.total,
    completed: item.completed,
    failed: item.failed,
    stopped: item.stopped,
  }));

  // Transform perception distribution
  const perceptionData = [
    { name: 'Vision', value: analytics?.perception_distribution.vision_count || 0 },
    { name: 'DOM', value: analytics?.perception_distribution.dom_count || 0 },
    { name: 'Hybrid', value: analytics?.perception_distribution.hybrid_count || 0 },
  ].filter((item) => item.value > 0);

  const PERCEPTION_COLORS = [COLORS.vision, COLORS.dom, COLORS.hybrid];

  // Transform action distribution
  const actionData = analytics?.action_distribution.map((item) => ({
    name: item.action_type.toUpperCase(),
    total: item.count,
    success: item.success_count,
    failed: item.fail_count,
  }));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark-text mb-2">Analytics</h1>
          <p className="text-dark-muted">Performance metrics and insights</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="input w-32"
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="card text-center">
          <div className="text-2xl font-bold text-dark-text font-mono">
            {analytics?.overview.total_tasks || 0}
          </div>
          <div className="text-xs text-dark-muted mt-1">Total Tasks</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-400 font-mono">
            {analytics?.overview.completed_tasks || 0}
          </div>
          <div className="text-xs text-dark-muted mt-1">Completed</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-400 font-mono">
            {analytics?.overview.failed_tasks || 0}
          </div>
          <div className="text-xs text-dark-muted mt-1">Failed</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-primary-400 font-mono">
            {analytics?.overview.success_rate?.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-dark-muted mt-1">Success Rate</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-dark-text font-mono">
            {analytics?.overview.avg_execution_time_ms
              ? (analytics.overview.avg_execution_time_ms / 1000).toFixed(1)
              : 0}
            s
          </div>
          <div className="text-xs text-dark-muted mt-1">Avg Time</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-dark-text font-mono">
            {analytics?.overview.avg_steps_per_task?.toFixed(1) || 0}
          </div>
          <div className="text-xs text-dark-muted mt-1">Avg Steps</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Tasks Timeline */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-text mb-4">Tasks Over Time</h2>
          {timelineData && timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                <XAxis dataKey="date" stroke="#737373" style={{ fontSize: '12px' }} />
                <YAxis stroke="#737373" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#121212',
                    border: '1px solid #1f1f1f',
                    borderRadius: '6px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke={COLORS.success}
                  strokeWidth={2}
                  name="Completed"
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke={COLORS.danger}
                  strokeWidth={2}
                  name="Failed"
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={COLORS.primary}
                  strokeWidth={2}
                  name="Total"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-dark-muted">
              No data available
            </div>
          )}
        </div>

        {/* Perception Distribution */}
        <div className="card">
          <h2 className="text-lg font-semibold text-dark-text mb-4">
            Perception Source Distribution
          </h2>
          {perceptionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={perceptionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {perceptionData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PERCEPTION_COLORS[index % PERCEPTION_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#121212',
                    border: '1px solid #1f1f1f',
                    borderRadius: '6px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-dark-muted">
              No perception data yet
            </div>
          )}
        </div>
      </div>

      {/* Action Distribution */}
      <div className="card">
        <h2 className="text-lg font-semibold text-dark-text mb-4">Action Type Distribution</h2>
        {actionData && actionData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={actionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis dataKey="name" stroke="#737373" style={{ fontSize: '12px' }} />
              <YAxis stroke="#737373" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#121212',
                  border: '1px solid #1f1f1f',
                  borderRadius: '6px',
                }}
              />
              <Legend />
              <Bar dataKey="success" fill={COLORS.success} name="Success" />
              <Bar dataKey="failed" fill={COLORS.danger} name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-dark-muted">
            No action data available
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
