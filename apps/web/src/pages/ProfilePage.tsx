import { useAuth } from '@/hooks/useAuth';

const ProfilePage = () => {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-3xl font-bold text-dark-text mb-6">Profile</h1>
      <div className="card">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-dark-muted">Name</label>
            <p className="text-dark-text">{user?.name}</p>
          </div>
          <div>
            <label className="text-sm text-dark-muted">Email</label>
            <p className="text-dark-text">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm text-dark-muted">Account Created</label>
            <p className="text-dark-text">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
