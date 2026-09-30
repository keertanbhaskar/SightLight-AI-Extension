import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/api/tasks';
import { executionsApi } from '@/api/executions';
import { TaskStatus, ActionType, ActionStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const TaskDetailPage = () => {
  const { id } = useParams<{ id: string }>();

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => tasksApi.getTask(id!),
    enabled: !!id,
  });

  const { data: executions, isLoading: executionsLoading } = useQuery({
    queryKey: ['executions', id],
    queryFn: () => executionsApi.getTaskExecutions(id!),
    enabled: !!id,
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
      <span className={`px-3 py-1 rounded text-sm font-medium border ${colors[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const getActionIcon = (type: ActionType) => {
    switch (type) {
      case ActionType.CLICK:
        return '🖱️';
      case ActionType.TYPE:
        return '⌨️';
      case ActionType.SCROLL:
        return '📜';
      case ActionType.OBSERVE:
        return '👁️';
      case ActionType.WAIT:
        return '⏱️';
      default:
        return '•';
    }
  };

  const getActionStatusColor = (status: ActionStatus) => {
    switch (status) {
      case ActionStatus.SUCCESS:
        return 'text-green-400';
      case ActionStatus.FAILED:
        return 'text-red-400';
      default:
        return 'text-dark-muted';
    }
  };

  if (taskLoading || executionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading task details...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="card text-center py-12">
        <p className="text-dark-muted mb-4">Task not found</p>
        <Link to="/tasks" className="text-primary-500 hover:text-primary-400">
          Back to tasks
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/tasks"
          className="text-sm text-dark-muted hover:text-dark-text mb-4 inline-block"
        >
          ← Back to tasks
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-dark-text mb-2">{task.instruction}</h1>
            <p className="text-dark-muted text-sm font-mono">ID: {task.id}</p>
          </div>
          {getStatusBadge(task.status)}
        </div>
      </div>

      {/* Task info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Created</div>
          <div className="text-dark-text font-medium">
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </div>
          <div className="text-xs text-dark-muted mt-1 font-mono">
            {new Date(task.created_at).toLocaleString()}
          </div>
        </div>

        {task.started_at && (
          <div className="card">
            <div className="text-sm text-dark-muted mb-1">Started</div>
            <div className="text-dark-text font-medium">
              {formatDistanceToNow(new Date(task.started_at), { addSuffix: true })}
            </div>
            <div className="text-xs text-dark-muted mt-1 font-mono">
              {new Date(task.started_at).toLocaleString()}
            </div>
          </div>
        )}

        {task.duration_ms && (
          <div className="card">
            <div className="text-sm text-dark-muted mb-1">Duration</div>
            <div className="text-2xl font-bold text-dark-text font-mono">
              {(task.duration_ms / 1000).toFixed(2)}s
            </div>
          </div>
        )}

        <div className="card">
          <div className="text-sm text-dark-muted mb-1">Steps</div>
          <div className="text-2xl font-bold text-dark-text font-mono">
            {task.steps_count}
          </div>
        </div>
      </div>

      {/* Execution timeline */}
      <div className="card">
        <h2 className="text-xl font-semibold text-dark-text mb-6">Execution Timeline</h2>

        {executions && executions.length > 0 ? (
          <div className="space-y-6">
            {executions.map((execution) => (
              <div key={execution.id} className="border-l-2 border-dark-border pl-6 pb-6">
                <div className="mb-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-dark-text font-medium">Execution</span>
                    <span className="text-xs text-dark-muted font-mono">
                      {execution.id.slice(0, 8)}
                    </span>
                    <span className="text-xs px-2 py-1 bg-dark-border rounded">
                      {execution.state}
                    </span>
                  </div>
                  <div className="text-xs text-dark-muted space-x-3">
                    <span>{new Date(execution.started_at).toLocaleString()}</span>
                    {execution.duration_ms && (
                      <span>• {(execution.duration_ms / 1000).toFixed(2)}s</span>
                    )}
                  </div>
                  {execution.error_message && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                      {execution.error_message}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {execution.actions && execution.actions.length > 0 && (
                  <div className="space-y-2">
                    {execution.actions.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-start space-x-3 p-3 bg-dark-bg rounded border border-dark-border"
                      >
                        <span className="text-xl">{getActionIcon(action.action_type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-dark-text font-medium capitalize">
                              {action.action_type}
                            </span>
                            <span className={`text-xs ${getActionStatusColor(action.status)}`}>
                              {action.status}
                            </span>
                          </div>
                          {action.target_label && (
                            <div className="text-sm text-dark-muted mb-1">
                              Target: {action.target_label}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dark-muted">
                            {action.target_confidence && (
                              <span>
                                Confidence: {(action.target_confidence * 100).toFixed(1)}%
                              </span>
                            )}
                            {action.perception_source && (
                              <span className="capitalize">
                                Source: {action.perception_source}
                              </span>
                            )}
                            <span className="font-mono">
                              {new Date(action.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-dark-muted">
            <p>No executions recorded</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDetailPage;
