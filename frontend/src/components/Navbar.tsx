import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="bg-dark-800 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-xl font-bold text-white">
              <span className="text-accent-orange">SIM</span>RACING
            </Link>
            {user && (
              <div className="hidden md:flex items-center gap-4">
                <Link to="/" className="text-gray-300 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <Link to="/stations" className="text-gray-300 hover:text-white transition-colors">
                  Postes
                </Link>
                <Link to="/configs" className="text-gray-300 hover:text-white transition-colors">
                  Configs
                </Link>
                <Link to="/sessions" className="text-gray-300 hover:text-white transition-colors">
                  Sessions
                </Link>
                <Link to="/leaderboard" className="text-gray-300 hover:text-white transition-colors">
                  Classement
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400 hidden sm:block capitalize">
                  {user.first_name} {user.last_name} ({user.role})
                </span>
                <button onClick={logout} className="btn-secondary text-sm">
                  Déconnexion
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/login')} className="btn-primary text-sm">
                Connexion
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
