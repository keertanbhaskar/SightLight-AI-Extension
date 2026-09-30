import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tasksApi } from '@/api/tasks';
import { TaskStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const TasksPage = () => {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', statusFilter, searchQuery, page],
    queryFn: () =>
      tasksApi.getTasks({
        status_filter: statusFilter || undefined,
        search: searchQuery || undefined,
        page,
        page_size: pageSize,
      }),
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
      <span className={`px-2 py-1 rounded text-xs font-medium border ${colors[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refetch();
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark-text mb-2">Task History</h1>
        <p className="text-dark-muted">View and manage all task executions</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="input pr-20"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-primary text-sm py-1"
              >
                Search
              </button>
            </div>
          </form>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TaskStatus | '');
              setPage(1);
            }}
            className="input md:w-48"
          >
            <option value="">All Statuses</option>
            <option value={TaskStatus.COMPLETED}>Completed</option>
            <option value={TaskStatus.FAILED}>Failed</option>
            <option value={TaskStatus.RUNNING}>Running</option>
            <option value={TaskStatus.STOPPED}>Stopped</option>
            <option value={TaskStatus.PENDING}>Pending</option>
          </select>
        </div>

        {/* Results count */}
        <div className="mt-4 text-sm text-dark-muted">
          {data && (
            <span>
              Showing {Math.min((page - 1) * pageSize + 1, data.total)} -{' '}
              {Math.min(page * pageSize, data.total)} of {data.total} tasks
            </span>
          )}
        </div>
      </div>

      {/* Tasks list */}
      {isLoading ? (
        <div className="card">
          <div className="text-center py-8 text-dark-muted">Loading tasks...</div>
        </div>
      ) : data?.tasks && data.tasks.length > 0 ? (
        <>
          <div className="space-y-3">
            {data.tasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="card block hover:border-primary-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 mr-4">
                    <p className="text-dark-text font-medium mb-2">{task.instruction}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dark-muted">
                      <span className="font-mono">
                        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                      </span>
                      {task.duration_ms && (
                        <span>Duration: {(task.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      <span>Steps: {task.steps_count}</span>
                      {task.started_at && (
                        <span>
                          Started: {new Date(task.started_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>{getStatusBadge(task.status)}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-dark-muted text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="text-center py-12">
            <p className="text-dark-muted mb-2">No tasks found</p>
            <p className="text-sm text-dark-muted">
              {searchQuery || statusFilter
                ? 'Try adjusting your filters'
                : 'Run the browser extension to start tracking tasks'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
