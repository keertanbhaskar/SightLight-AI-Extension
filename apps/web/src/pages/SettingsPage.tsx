import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, UpdateSettingsData } from '@/api/settings';
import { PerceptionMode, Theme } from '@/types';

const SettingsPage = () => {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
  });

  const [formData, setFormData] = useState<UpdateSettingsData>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({
        perception_mode: settings.perception_mode,
        confidence_threshold: settings.confidence_threshold,
        max_steps: settings.max_steps,
        max_runtime: settings.max_runtime,
        require_confirmation: settings.require_confirmation,
        theme: settings.theme,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateSettingsData) => settingsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-dark-muted">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-dark-text mb-2">Settings</h1>
        <p className="text-dark-muted">Configure agent behavior and preferences</p>
      </div>

      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-md">
          <p className="text-green-400">Settings saved successfully!</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Perception Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-6">Perception</h2>

          <div className="space-y-6">
            <div>
              <label className="label">Perception Mode</label>
              <select
                value={formData.perception_mode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    perception_mode: e.target.value as PerceptionMode,
                  })
                }
                className="input"
              >
                <option value={PerceptionMode.AUTO}>Auto (Vision → DOM fallback)</option>
                <option value={PerceptionMode.VISION}>Vision Only</option>
                <option value={PerceptionMode.DOM}>DOM Only</option>
              </select>
              <p className="mt-2 text-sm text-dark-muted">
                Auto: Try vision first, fallback to DOM if unavailable
              </p>
            </div>

            <div>
              <label className="label">
                Confidence Threshold: {(formData.confidence_threshold || 0.75) * 100}%
              </label>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={formData.confidence_threshold || 0.75}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    confidence_threshold: parseFloat(e.target.value),
                  })
                }
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-dark-muted mt-1">
                <span>50%</span>
                <span>95%</span>
              </div>
              <p className="mt-2 text-sm text-dark-muted">
                Minimum confidence required for target selection
              </p>
            </div>
          </div>
        </div>

        {/* Execution Limits */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-6">Execution Limits</h2>

          <div className="space-y-6">
            <div>
              <label className="label">Maximum Steps: {formData.max_steps || 15}</label>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={formData.max_steps || 15}
                onChange={(e) =>
                  setFormData({ ...formData, max_steps: parseInt(e.target.value) })
                }
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-dark-muted mt-1">
                <span>5</span>
                <span>30</span>
              </div>
              <p className="mt-2 text-sm text-dark-muted">
                Maximum actions per task execution
              </p>
            </div>

            <div>
              <label className="label">
                Maximum Runtime: {formData.max_runtime || 60} seconds
              </label>
              <input
                type="range"
                min="10"
                max="120"
                step="10"
                value={formData.max_runtime || 60}
                onChange={(e) =>
                  setFormData({ ...formData, max_runtime: parseInt(e.target.value) })
                }
                className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-dark-muted mt-1">
                <span>10s</span>
                <span>120s</span>
              </div>
              <p className="mt-2 text-sm text-dark-muted">
                Maximum time allowed for task execution
              </p>
            </div>
          </div>
        </div>

        {/* Safety Settings */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-6">Safety</h2>

          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="require_confirmation"
              checked={formData.require_confirmation ?? true}
              onChange={(e) =>
                setFormData({ ...formData, require_confirmation: e.target.checked })
              }
              className="mt-1 w-4 h-4 rounded border-dark-border bg-dark-surface"
            />
            <div className="flex-1">
              <label htmlFor="require_confirmation" className="text-dark-text font-medium cursor-pointer">
                Require Confirmation for High-Impact Actions
              </label>
              <p className="text-sm text-dark-muted mt-1">
                Prompt before executing purchases, deletions, submissions, and other
                irreversible actions
              </p>
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="card">
          <h2 className="text-xl font-semibold text-dark-text mb-6">Appearance</h2>

          <div>
            <label className="label">Theme</label>
            <select
              value={formData.theme}
              onChange={(e) =>
                setFormData({ ...formData, theme: e.target.value as Theme })
              }
              className="input"
            >
              <option value={Theme.DARK}>Dark</option>
              <option value={Theme.LIGHT}>Light</option>
              <option value={Theme.SYSTEM}>System</option>
            </select>
            <p className="mt-2 text-sm text-dark-muted">
              Choose your preferred color theme
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-dark-muted">
            Settings are synchronized with the browser extension
          </p>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {updateMutation.isError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md">
            <p className="text-red-400 text-sm">
              Failed to save settings. Please try again.
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default SettingsPage;
