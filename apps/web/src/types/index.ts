// User types
export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// Task types
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  STOPPED = 'stopped',
}

export interface Task {
  id: string;
  user_id: string;
  instruction: string;
  status: TaskStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  steps_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  page_size: number;
}

// Execution types
export enum ExecutionState {
  IDLE = 'idle',
  OBSERVING = 'observing',
  PERCEIVING = 'perceiving',
  PLANNING = 'planning',
  SAFETY_CHECK = 'safety_check',
  ACTING = 'acting',
  VERIFYING = 'verifying',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export enum ActionType {
  CLICK = 'click',
  TYPE = 'type',
  SCROLL = 'scroll',
  OBSERVE = 'observe',
  WAIT = 'wait',
}

export enum ActionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum PerceptionSource {
  VISION = 'vision',
  DOM = 'dom',
  HYBRID = 'hybrid',
}

export interface Action {
  id: string;
  execution_id: string;
  action_type: ActionType;
  target_label: string | null;
  target_confidence: number | null;
  perception_source: PerceptionSource | null;
  status: ActionStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Execution {
  id: string;
  task_id: string;
  state: ExecutionState;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  actions: Action[];
}

// Settings types
export enum PerceptionMode {
  AUTO = 'auto',
  VISION = 'vision',
  DOM = 'dom',
}

export enum Theme {
  DARK = 'dark',
  LIGHT = 'light',
  SYSTEM = 'system',
}

export interface UserSettings {
  id: string;
  user_id: string;
  perception_mode: PerceptionMode;
  confidence_threshold: number;
  max_steps: number;
  max_runtime: number;
  require_confirmation: boolean;
  theme: Theme;
  created_at: string;
  updated_at: string;
}

// Analytics types
export interface OverviewMetrics {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  success_rate: number;
  avg_execution_time_ms: number;
  avg_steps_per_task: number;
}

export interface TasksPerDay {
  date: string;
  total: number;
  completed: number;
  failed: number;
  stopped: number;
}

export interface PerceptionDistribution {
  vision_count: number;
  dom_count: number;
  hybrid_count: number;
}

export interface ActionDistribution {
  action_type: string;
  count: number;
  success_count: number;
  fail_count: number;
}

export interface AnalyticsResponse {
  overview: OverviewMetrics;
  tasks_timeline: TasksPerDay[];
  perception_distribution: PerceptionDistribution;
  action_distribution: ActionDistribution[];
}

// Health types
export interface HealthResponse {
  status: string;
  environment: string;
  api_version: string;
}

export interface DatabaseHealthResponse {
  status: string;
  connected: boolean;
  message: string;
}
