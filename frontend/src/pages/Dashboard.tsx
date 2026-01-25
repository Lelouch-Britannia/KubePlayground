import { useEffect, useState } from 'react';
import UserBanner from '../components/Dashboard/UserBanner';
import TopicCard from '../components/Dashboard/TopicCard';
import UserMenu from '../components/shared/UserMenu';
import { BookOpen, CheckCircle2, Clock, Target } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { DashboardData } from '../types/api';

// Default data for new users or when API is unavailable
const DEFAULT_DASHBOARD_DATA: DashboardData = {
  total_units: 0,
  completed_count: 0,
  in_progress_count: 0,
  current_streak: 0,
  topics: []
};

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [dashboardData, setDashboardData] = useState<DashboardData>(DEFAULT_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);

  const isDarkMode = theme === 'dark';

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getDashboard();
      setDashboardData(data as DashboardData);
    } catch (err) {
      // Use default data on error - new users will see zeros
      console.error('Dashboard fetch error:', err);
      setDashboardData(DEFAULT_DASHBOARD_DATA);
      // Don't show error for new users, just show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    // Navigate to first unit in topic
    const topicData = dashboardData?.topics.find(t => t.topic === topic);
    if (topicData && topicData.units.length > 0) {
      window.location.href = `/unit/${topicData.units[0].slug}`;
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${
        isDarkMode ? 'bg-dark-bg' : 'bg-white'
      }`}>
        <div className={`text-2xl ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
          Loading your dashboard...
        </div>
      </div>
    );
  }

  // No error state needed - we show default zero values instead

  return (
    <div className={`min-h-screen transition-colors ${
      isDarkMode ? 'bg-dark-bg text-dark-text-primary' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${
        isDarkMode
          ? 'border-dark-border bg-dark-surface/80'
          : 'border-gray-200 bg-white/80'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dark-accent-blue to-dark-accent-green rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
              </svg>
            </div>
            <span className={`text-xl font-bold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              KubePlayground
            </span>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Container */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* User Banner */}
        <UserBanner
          userName={user?.username || 'Learner'}
          streak={dashboardData.current_streak}
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className={`border rounded-xl p-5 transition-colors ${
            isDarkMode
              ? 'bg-dark-surface border-dark-border hover:border-dark-accent-green/50'
              : 'bg-white border-gray-200 hover:border-emerald-300 shadow-sm'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-accent-green/20' : 'bg-emerald-100'
              }`}>
                <BookOpen className={`w-6 h-6 ${isDarkMode ? 'text-dark-accent-green' : 'text-emerald-600'}`} />
              </div>
              <div>
                <p className={`text-base ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>Total Units</p>
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-dark-accent-green' : 'text-emerald-600'}`}>
                  {dashboardData.total_units}
                </p>
              </div>
            </div>
          </div>

          <div className={`border rounded-xl p-5 transition-colors ${
            isDarkMode
              ? 'bg-dark-surface border-dark-border hover:border-dark-accent-yellow/50'
              : 'bg-white border-gray-200 hover:border-amber-300 shadow-sm'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-accent-yellow/20' : 'bg-amber-100'
              }`}>
                <CheckCircle2 className={`w-6 h-6 ${isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600'}`} />
              </div>
              <div>
                <p className={`text-base ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>Completed</p>
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600'}`}>
                  {dashboardData.completed_count}
                </p>
              </div>
            </div>
          </div>

          <div className={`border rounded-xl p-5 transition-colors ${
            isDarkMode
              ? 'bg-dark-surface border-dark-border hover:border-dark-accent-blue/50'
              : 'bg-white border-gray-200 hover:border-blue-300 shadow-sm'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-accent-blue/20' : 'bg-blue-100'
              }`}>
                <Clock className={`w-6 h-6 ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`} />
              </div>
              <div>
                <p className={`text-base ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>In Progress</p>
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`}>
                  {dashboardData.in_progress_count}
                </p>
              </div>
            </div>
          </div>

          <div className={`border rounded-xl p-5 transition-colors ${
            isDarkMode
              ? 'bg-dark-surface border-dark-border hover:border-dark-text-secondary/50'
              : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-text-secondary/20' : 'bg-gray-100'
              }`}>
                <Target className={`w-6 h-6 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`} />
              </div>
              <div>
                <p className={`text-base ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>Not Started</p>
                <p className={`text-3xl font-bold ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
                  {dashboardData.total_units - dashboardData.completed_count - dashboardData.in_progress_count}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Topics Section */}
        <div>
          <h2 className={`text-3xl font-bold mb-6 ${isDarkMode ? 'text-dark-accent-purple' : 'text-purple-600'}`}>
            Learning Paths
          </h2>
          {dashboardData.topics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dashboardData.topics.map((topic) => (
                <TopicCard
                  key={topic.topic}
                  topic={topic.topic}
                  totalUnits={topic.total_units}
                  completedUnits={topic.completed_units}
                  inProgressUnits={topic.in_progress_units}
                  completionPercentage={topic.completion_percentage}
                  onClick={() => handleTopicClick(topic.topic)}
                />
              ))}
            </div>
          ) : (
            <div className={`border rounded-xl p-8 text-center ${
              isDarkMode
                ? 'bg-dark-surface border-dark-border'
                : 'bg-white border-gray-200 shadow-sm'
            }`}>
              <div className={`w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-dark-accent-blue/20' : 'bg-blue-100'
              }`}>
                <BookOpen className={`w-8 h-8 ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`} />
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                Welcome to KubePlayground!
              </h3>
              <p className={`mb-4 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
                Start your Kubernetes learning journey. Content will appear here once available.
              </p>
              <p className={`text-sm ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`}>
                Your streak and progress will be tracked as you complete exercises.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
