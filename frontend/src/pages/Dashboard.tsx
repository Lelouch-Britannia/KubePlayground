import { useEffect, useState } from 'react';
import UserBanner from '../components/Dashboard/UserBanner';
import TopicCard from '../components/Dashboard/TopicCard';
import NavHeader from '../components/shared/NavHeader';
import { BookOpen, CheckCircle2, Clock, Target } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { DashboardData } from '../types/api';

const DEFAULT_DASHBOARD_DATA: DashboardData = {
  total_units: 0,
  completed_count: 0,
  in_progress_count: 0,
  current_streak: 0,
  courses: []
};

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [dashboardData, setDashboardData] = useState<DashboardData>(DEFAULT_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);

  const isDarkMode = theme === 'dark';

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getDashboard();
      setDashboardData(data as DashboardData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setDashboardData(DEFAULT_DASHBOARD_DATA);
    } finally {
      setLoading(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    for (const course of dashboardData.courses) {
      const topicData = course.topics.find(t => t.topic === topic);
      if (topicData && topicData.units.length > 0) {
        window.location.href = `/unit/${topicData.units[0].slug}`;
        return;
      }
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
        <div className={`text-2xl ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
          Loading your dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg text-dark-text-primary' : 'bg-gray-50 text-gray-900'}`}>
      <NavHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <UserBanner userName={user?.username || 'Learner'} streak={dashboardData.current_streak} />

        {/* Learning Paths heading */}
        <h2 className={`text-3xl font-bold mb-6 ${isDarkMode ? 'text-dark-accent-purple' : 'text-purple-600'}`}>
          Learning Paths
        </h2>

        {dashboardData.courses.length > 0 ? (
          dashboardData.courses.map((course) => (
            <div key={course.course_slug} className="mb-10">
              {/* Course header */}
              <div className="mb-4">
                <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                  {course.course_name}
                </h3>
                {course.course_description && (
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
                    {course.course_description}
                  </p>
                )}
              </div>

              {/* Stats strip */}
              <div className={`flex items-center divide-x rounded-xl border overflow-hidden mb-6 ${
                isDarkMode ? 'bg-dark-surface border-dark-border divide-dark-border' : 'bg-white border-gray-200 divide-gray-200 shadow-sm'
              }`}>
                {[
                  { label: 'Total', value: dashboardData.total_units, icon: BookOpen, color: isDarkMode ? 'text-dark-accent-green' : 'text-emerald-600' },
                  { label: 'Completed', value: dashboardData.completed_count, icon: CheckCircle2, color: isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600' },
                  { label: 'In Progress', value: dashboardData.in_progress_count, icon: Clock, color: isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600' },
                  { label: 'Not Started', value: dashboardData.total_units - dashboardData.completed_count - dashboardData.in_progress_count, icon: Target, color: isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex-1 flex items-center gap-3 px-5 py-4">
                    <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                    <div>
                      <p className={`text-xs ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`}>{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Topic cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {course.topics.map((topic) => (
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
            </div>
          ))
        ) : (
          <div className={`border rounded-xl p-8 text-center ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200 shadow-sm'}`}>
            <div className={`w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-dark-accent-blue/20' : 'bg-blue-100'}`}>
              <BookOpen className={`w-8 h-8 ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              Welcome to KubePlayground!
            </h3>
            <p className={`${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              Start your Kubernetes learning journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
