import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { User, LogOut, Settings, ChevronDown, Sun, Moon } from 'lucide-react';

export default function UserMenu() {
  const { user, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const isDarkMode = theme === 'dark';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setIsOpen(false);
    navigate('/logout');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode
              ? 'hover:bg-dark-hover'
              : 'hover:bg-gray-100'
          }`}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-dark-text-secondary" />
          ) : (
            <Moon className="w-5 h-5 text-gray-500" />
          )}
        </button>

        <Link
          to="/auth"
          className="px-4 py-2 bg-gradient-to-r from-dark-accent-blue to-dark-accent-green hover:opacity-90 rounded-lg text-white font-medium transition-all duration-200 shadow-lg shadow-dark-accent-blue/20"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode
              ? 'hover:bg-dark-hover'
              : 'hover:bg-gray-100'
          }`}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-dark-text-secondary" />
          ) : (
            <Moon className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {/* User Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 ${
            isDarkMode
              ? 'bg-dark-surface/50 hover:bg-dark-hover border-dark-border/50'
              : 'bg-white hover:bg-gray-50 border-gray-200'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-dark-accent-blue to-dark-accent-green flex items-center justify-center text-white font-semibold text-sm">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className={`font-medium hidden sm:block max-w-[120px] truncate ${
            isDarkMode ? 'text-dark-text-primary' : 'text-gray-700'
          }`}>
            {user?.username}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
            isDarkMode ? 'text-dark-text-secondary' : 'text-gray-400'
          }`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute right-0 mt-2 w-64 backdrop-blur-xl border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in ${
          isDarkMode
            ? 'bg-dark-surface/95 border-dark-border/50'
            : 'bg-white/95 border-gray-200'
        }`}>
          {/* User Info */}
          <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-dark-border/50' : 'border-gray-200'}`}>
            <p className={`font-medium truncate ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              {user?.username}
            </p>
            <p className={`text-sm truncate ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              {user?.email}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isDarkMode
                  ? 'text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </Link>
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isDarkMode
                  ? 'text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </div>

          {/* Logout */}
          <div className={`border-t py-2 ${isDarkMode ? 'border-dark-border/50' : 'border-gray-200'}`}>
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isDarkMode
                  ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                  : 'text-red-600 hover:bg-red-50 hover:text-red-700'
              }`}
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
