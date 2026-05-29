import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import UserMenu from './UserMenu';

interface NavHeaderProps {
  title?: string;
}

export default function NavHeader({ title }: NavHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: '/' },
    { label: 'Courses', path: '/courses' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleLogoClick = () => {
    if (user) {
      navigate('/');
    } else {
      navigate('/auth');
    }
  };

  return (
    <header className="h-14 bg-dark-surface border-b border-dark-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleLogoClick}
        >
          <div className="w-8 h-8 bg-gradient-to-br from-dark-accent-blue to-dark-accent-green rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
            </svg>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                isActive(item.path)
                  ? 'text-dark-accent-purple bg-dark-accent-purple/10'
                  : 'text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-active'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Optional title for quiz/unit pages */}
        {title && (
          <>
            <div className="h-5 w-px bg-dark-border" />
            <span className="text-sm text-dark-text-secondary">{title}</span>
          </>
        )}
      </div>

      {/* Right side - User Menu */}
      <div className="flex items-center">
        <UserMenu />
      </div>
    </header>
  );
}
