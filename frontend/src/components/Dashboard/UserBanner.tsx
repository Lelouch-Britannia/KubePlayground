import { useTheme } from '../../contexts/ThemeContext';

interface UserBannerProps {
  userName?: string;
  streak?: number;
}

export default function UserBanner({ userName = 'Learner', streak = 0 }: UserBannerProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const displayName = userName;

  // Generate greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className={`rounded-xl p-6 mb-6 border transition-colors ${
      isDarkMode
        ? 'bg-gradient-to-r from-dark-surface to-dark-elevated border-dark-accent-purple/30'
        : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* User Avatar */}
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-dark-accent-blue to-dark-accent-green flex items-center justify-center shadow-glow-blue">
            <span className="text-2xl font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Greeting */}
          <div>
            <h1 className={`text-2xl font-bold mb-1 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              {getGreeting()}, {displayName}! Ready to learn?
            </h1>
            <p className={isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}>
              Continue your Kubernetes learning journey
            </p>
          </div>
        </div>

        {/* Streak Display */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-accent-orange/20' : 'bg-orange-100'
              }`}>
                <span className="text-2xl">🔥</span>
              </div>
              <div className="text-left">
                <p className={`text-sm ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`}>Current Streak</p>
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-dark-accent-orange' : 'text-orange-500'}`}>
                  {streak} <span className={`text-base font-normal ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>days</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
