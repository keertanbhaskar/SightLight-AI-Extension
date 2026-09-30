import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const MainLayout = () => {
  const { user, logout } = useAuth();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/tasks', label: 'Tasks' },
    { path: '/analytics', label: 'Analytics' },
    { path: '/settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <span className="text-xl font-bold text-dark-text font-mono">
                SIGHTLITE
              </span>
              <span className="ml-3 text-xs text-dark-muted border border-dark-border px-2 py-1 rounded">
                v1.0.0
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex space-x-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-muted hover:text-dark-text hover:bg-dark-border'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* User menu */}
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <div className="text-dark-text font-medium">{user?.name}</div>
                <div className="text-dark-muted text-xs">{user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="text-sm text-dark-muted hover:text-dark-text transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-dark-muted">
            <p>On-Device Visual Perception for Lightweight Browser Agents</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
