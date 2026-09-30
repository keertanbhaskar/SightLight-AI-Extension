import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/api/analytics';
import { tasksApi } from '@/api/tasks';
import { healthApi } from '@/api/health';
import { TaskStatus, Task } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const DashboardPage = () => {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['overview'],
    queryFn: analyticsApi.getOverview,
  });

  const { data: recentTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['recent-tasks'],
    queryFn: () => tasksApi.getTasks({ page: 1, page_size: 5 }),
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.checkHealth,
    refetchInterval: 30000, // Check every 30 seconds
  });

  const { data: dbHealth } = useQuery({
    queryKey: ['db-health'],
    queryFn: healthApi.checkDatabase,
    refetchInterval: 30000,
  });

  const getStatusBadge = (status: TaskStatus) => {
    const colors: Record<TaskStatus, string> = {
      [TaskStatus.COMPLETED]: 'bg-green-500/10 text-green-400 border-green-500/20',
      [TaskStatus.FAILED]: 'bg-red-500/10 text-red-400 border-red-500/20',
      [TaskStatus.RUNNING]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      [TaskStatus.STOPPED]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      [TaskStatus.PENDING]: 'bg-dark-border text-dark-muted border-dark-border',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs border ${colors[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (overviewLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark-text mb-2">Dashboard</h1>
        <p className="text-dark-muted">Agent control center overview</p>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Total Tasks</div>
          <div className="text-3xl font-bold text-dark-text font-mono">
            {overview?.total_tasks || 0}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Completed</div>
          <div className="text-3xl font-bold text-green-400 font-mono">
            {overview?.completed_tasks || 0}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Failed</div>
          <div className="text-3xl font-bold text-red-400 font-mono">
            {overview?.failed_tasks || 0}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Success Rate</div>
          <div className="text-3xl font-bold text-primary-400 font-mono">
            {overview?.success_rate?.toFixed(1) || 0}%
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Avg Execution Time</div>
          <div className="text-3xl font-bold text-dark-text font-mono">
            {overview?.avg_execution_time_ms
              ? `${(overview.avg_execution_time_ms / 1000).toFixed(1)}s`
              : '0s'}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Avg Steps</div>
          <div className="text-3xl font-bold text-dark-text font-mono">
            {overview?.avg_steps_per_task?.toFixed(1) || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Tasks */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-4">Recent Tasks</h2>
          {recentTasks?.tasks && recentTasks.tasks.length > 0 ? (
            <div className="space-y-3">
              {recentTasks.tasks.map((task: Task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between p-3 bg-dark-bg rounded border border-dark-border hover:border-primary-600 transition-colors"
                >
                  <div className="flex-1 mr-4">
                    <p className="text-dark-text font-medium mb-1 line-clamp-1">
                      {task.instruction}
                    </p>
                    <div className="flex items-center space-x-3 text-xs text-dark-muted">
                      <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
                      {task.duration_ms && (
                        <span>• {(task.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      <span>• {task.steps_count} steps</span>
                    </div>
                  </div>
                  <div>{getStatusBadge(task.status)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-dark-muted">
              <p>No tasks yet</p>
              <p className="text-sm mt-2">Run the browser extension to start tracking tasks</p>
            </div>
          )}
        </div>

        {/* Agent Status */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-4">Agent Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
              <div>
                <div className="text-dark-text font-medium">Extension</div>
                <div className="text-xs text-dark-muted">Chrome Extension</div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span className="text-sm text-dark-muted">Not Connected</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
              <div>
                <div className="text-dark-text font-medium">Vision Model</div>
                <div className="text-xs text-dark-muted">UIDET-Nano</div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span className="text-sm text-dark-muted">Pending</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
              <div>
                <div className="text-dark-text font-medium">Runtime</div>
                <div className="text-xs text-dark-muted">WebGPU/WASM</div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <span className="text-sm text-dark-muted">Not Initialized</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
              <div>
                <div className="text-dark-text font-medium">Backend</div>
                <div className="text-xs text-dark-muted">FastAPI</div>
              </div>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    health?.status === 'healthy' ? 'bg-green-400' : 'bg-red-400'
                  }`}
                ></div>
                <span className="text-sm text-dark-muted">
                  {health?.status === 'healthy' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-dark-bg rounded">
              <div>
                <div className="text-dark-text font-medium">Database</div>
                <div className="text-xs text-dark-muted">PostgreSQL</div>
              </div>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    dbHealth?.connected ? 'bg-green-400' : 'bg-red-400'
                  }`}
                ></div>
                <span className="text-sm text-dark-muted">
                  {dbHealth?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
