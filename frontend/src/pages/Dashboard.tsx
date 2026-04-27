import { useEffect, useState } from 'react';
import UserBanner from '../components/Dashboard/UserBanner';
import NavHeader from '../components/shared/NavHeader';
import { BookOpen, CheckCircle2, Clock, Target, Flag, ChevronRight } from 'lucide-react';
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
// ─── Compact stats strip ──────────────────────────────────────────────────────
function StatsStrip({
  total,
  completed,
  inProgress,
  isDarkMode,
}: {
  total: number;
  completed: number;
  inProgress: number;
  isDarkMode: boolean;
}) {
  const notStarted = total - completed - inProgress;
  const stats = [
    { label: 'Total', value: total, icon: BookOpen, color: isDarkMode ? 'text-dark-accent-green' : 'text-emerald-600' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600' },
    { label: 'In Progress', value: inProgress, icon: Clock, color: isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600' },
    { label: 'Not Started', value: notStarted, icon: Target, color: isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500' },
  ];

  return (
    <div className={`flex items-center divide-x rounded-xl border overflow-hidden mb-8 ${
      isDarkMode ? 'bg-dark-surface border-dark-border divide-dark-border' : 'bg-white border-gray-200 divide-gray-200 shadow-sm'
    }`}>
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="flex-1 flex items-center gap-3 px-5 py-4">
          <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
          <div>
            <p className={`text-xs ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`}>{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* User Banner */}
        <UserBanner userName={user?.username || 'Learner'} streak={dashboardData.current_streak} />

        {/* Learning Paths heading */}
        <h2 className={`text-3xl font-bold mb-6 ${isDarkMode ? 'text-dark-accent-purple' : 'text-purple-600'}`}>
          Learning Paths
        </h2>

        {dashboardData.courses.length > 0 ? (
          dashboardData.courses.map((course) => (
            <div key={course.course_slug} className="mb-12">
              {/* Course header */}
              <div className="mb-3">
                <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                  {course.course_name}
                </h3>
                {course.course_description && (
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
                    {course.course_description}
                  </p>
                )}
              </div>

              {/* Stats strip scoped to this course */}
              <StatsStrip
                total={dashboardData.total_units}
                completed={dashboardData.completed_count}
                inProgress={dashboardData.in_progress_count}
                isDarkMode={isDarkMode}
              />

              {/* Roadmap */}
              <div className="relative">
                {/* Central spine */}
                <div className={`absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 ${isDarkMode ? 'bg-dark-border' : 'bg-gray-200'}`} />

                <div className="relative grid grid-cols-2 gap-x-8 gap-y-10">
                  {course.topics.map((topic, idx) => {
                    const isLeft = idx % 2 === 0;
                    return (
                      <div
                        key={topic.topic}
                        className={`flex ${isLeft ? 'justify-end pr-6' : 'col-start-2 justify-start pl-6'}`}
                        style={isLeft ? {} : { gridColumn: 2 }}
                      >
                        {/* Horizontal connector to spine */}
                        <div className="relative flex items-center">
                          <div className={`absolute ${isLeft ? 'right-[-24px]' : 'left-[-24px]'} w-6 h-0.5 ${
                            topic.completion_percentage === 100
                              ? 'bg-dark-accent-green/60'
                              : isDarkMode ? 'bg-dark-border' : 'bg-gray-200'
                          }`} />

                          {/* Node */}
                          <button
                            onClick={() => handleTopicClick(topic.topic)}
                            className="group flex items-center gap-3 focus:outline-none"
                          >
                            {/* Circle */}
                            <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-md transition-transform group-hover:scale-110 ${
                              topic.completion_percentage === 100
                                ? 'bg-dark-accent-green border-dark-accent-green text-dark-bg'
                                : topic.in_progress_units > 0
                                ? 'bg-dark-accent-purple border-dark-accent-purple text-white'
                                : isDarkMode
                                ? 'bg-dark-elevated border-dark-border text-dark-text-muted'
                                : 'bg-white border-gray-300 text-gray-400'
                            }`}>
                              {topic.completion_percentage === 100
                                ? <CheckCircle2 size={18} />
                                : <Flag size={16} />
                              }
                            </div>

                            {/* Card */}
                            <div className={`rounded-xl border px-4 py-3 w-44 transition-all group-hover:shadow-md ${
                              topic.completion_percentage === 100
                                ? isDarkMode
                                  ? 'bg-dark-accent-green/10 border-dark-accent-green/30'
                                  : 'bg-emerald-50 border-emerald-300'
                                : topic.in_progress_units > 0
                                ? isDarkMode
                                  ? 'bg-dark-accent-purple/10 border-dark-accent-purple/30'
                                  : 'bg-purple-50 border-purple-300'
                                : isDarkMode
                                ? 'bg-dark-surface border-dark-border group-hover:border-dark-accent-purple/40'
                                : 'bg-white border-gray-200 group-hover:border-purple-300'
                            }`}>
                              <p className={`font-semibold text-sm leading-snug ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                                {topic.topic}
                              </p>
                              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}`}>
                                {topic.total_units} exercise{topic.total_units !== 1 ? 's' : ''}
                              </p>

                              {topic.completion_percentage > 0 && (
                                <div className={`mt-2 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-dark-border' : 'bg-gray-200'}`}>
                                  <div
                                    className={`h-full rounded-full ${topic.completion_percentage === 100 ? 'bg-dark-accent-green' : 'bg-dark-accent-purple'}`}
                                    style={{ width: `${topic.completion_percentage}%` }}
                                  />
                                </div>
                              )}

                              {topic.completion_percentage === 100 ? (
                                <p className="text-xs font-semibold text-dark-accent-green mt-1">✓ Completed</p>
                              ) : topic.in_progress_units > 0 ? (
                                <p className={`text-xs mt-1 ${isDarkMode ? 'text-dark-accent-purple' : 'text-purple-600'}`}>
                                  {topic.completed_units}/{topic.total_units} done
                                </p>
                              ) : (
                                <div className={`flex items-center gap-1 mt-1 text-xs ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`}>
                                  <span>Start</span><ChevronRight size={10} />
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
            <p className={`mb-2 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              Start your Kubernetes learning journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
