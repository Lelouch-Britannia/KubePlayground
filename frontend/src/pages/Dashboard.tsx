import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserBanner from '../components/Dashboard/UserBanner';
import TopicCard from '../components/Dashboard/TopicCard';
import NavHeader from '../components/shared/NavHeader';
import { BookOpen, CheckCircle2, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { DashboardData } from '../types/api';

const DEFAULT_DASHBOARD_DATA: DashboardData = {
  total_units: 0,
  completed_count: 0,
  in_progress_count: 0,
  current_streak: 0,
  courses: [],
  active_course: null,
  paused_courses: [],
};

const PAGE_SIZE = 3;

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<DashboardData>(DEFAULT_DASHBOARD_DATA);
  const [longestStreak, setLongestStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  // page index per course slug
  const [coursePages, setCoursePages] = useState<Record<string, number>>({});

  const isDarkMode = theme === 'dark';

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const [data, profile] = await Promise.all([
        apiClient.getDashboard(),
        apiClient.getProfileSummary().catch(() => null),
      ]);
      setDashboardData(data as DashboardData);
      const p = profile as any;
      if (p?.streak?.longest_streak != null) setLongestStreak(p.streak.longest_streak);
      if (p?.streak?.current_streak != null) {
        setDashboardData(prev => ({ ...prev, current_streak: p.streak.current_streak }));
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setDashboardData(DEFAULT_DASHBOARD_DATA);
    } finally {
      setLoading(false);
    }
  };

  const getPage = (slug: string) => coursePages[slug] ?? 0;

  const setPage = (slug: string, page: number) =>
    setCoursePages(prev => ({ ...prev, [slug]: page }));

  const handleTopicClick = (topic: string) => {
    const courseList = dashboardData.active_course
      ? [dashboardData.active_course]
      : (dashboardData.courses ?? []);
    for (const course of courseList) {
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

  const hasActiveCourse = !!dashboardData.active_course;
  const hasPausedCourses = (dashboardData.paused_courses?.length ?? 0) > 0;
  const hasLegacyCourses = (dashboardData.courses?.length ?? 0) > 0 && !hasActiveCourse && !hasPausedCourses;

  // Determine which courses to render in the topic cards section
  const coursesToRender = hasActiveCourse
    ? [dashboardData.active_course!]
    : hasLegacyCourses
    ? (dashboardData.courses ?? [])
    : [];

  const showStats = hasActiveCourse || hasPausedCourses || hasLegacyCourses;

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg text-dark-text-primary' : 'bg-gray-50 text-gray-900'}`}>
      <NavHeader />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <UserBanner userName={user?.username || 'Learner'} streak={dashboardData.current_streak} longestStreak={longestStreak} />

        {/* Learning Paths heading */}
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-3xl font-bold ${isDarkMode ? 'text-dark-accent-purple' : 'text-purple-600'}`}>
            Learning Paths
          </h2>
        </div>

        {/* Empty state — no enrollment at all */}
        {!hasActiveCourse && !hasPausedCourses && !hasLegacyCourses && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <BookOpen className={`w-16 h-16 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`} />
            <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              No active course
            </h2>
            <p className={`text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              Enroll in a course to start your learning journey
            </p>
            <button
              onClick={() => navigate('/courses')}
              className="px-4 py-2 bg-dark-accent-purple text-white rounded-lg text-sm font-medium hover:bg-dark-accent-purple/80 transition-colors"
            >
              Browse Courses →
            </button>
          </div>
        )}

        {/* All paused state */}
        {!hasActiveCourse && hasPausedCourses && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                No active course
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {dashboardData.paused_courses!.map(course => (
                <div key={course.course_slug} className={`border rounded-xl p-4 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
                  <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                    {course.course_name}
                  </h3>
                  <div className={`w-full rounded-full h-1.5 mb-3 ${isDarkMode ? 'bg-dark-border' : 'bg-gray-200'}`}>
                    <div className="bg-dark-accent-purple h-1.5 rounded-full" style={{ width: `${course.completion_pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}`}>
                      {course.completion_pct}% complete
                    </span>
                    <button
                      onClick={async () => {
                        await apiClient.setCourseStatus(course.course_slug, 'active');
                        fetchDashboard();
                      }}
                      className="text-xs px-3 py-1 bg-dark-accent-purple text-white rounded hover:bg-dark-accent-purple/80 transition-colors"
                    >
                      Start
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active course or legacy courses — topic cards + stats */}
        {coursesToRender.length > 0 && (
          <>
            {coursesToRender.map((course) => {
              const totalTopics = course.topics.length;
              const totalPages = Math.ceil(totalTopics / PAGE_SIZE);
              const page = getPage(course.course_slug);
              const visibleTopics = course.topics.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

              return (
                <div key={course.course_slug} className="mb-10">
                  {/* Course header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                        {course.course_name}
                      </h3>
                    </div>
                    {hasActiveCourse && (
                      <button
                        onClick={async () => {
                          await apiClient.setCourseStatus(dashboardData.active_course!.course_slug, 'paused');
                          fetchDashboard();
                        }}
                        className={`text-xs px-3 py-1 border rounded transition-colors ${isDarkMode ? 'border-dark-border text-dark-text-muted hover:text-dark-text-primary' : 'border-gray-300 text-gray-500 hover:text-gray-900'}`}
                      >
                        Pause
                      </button>
                    )}
                  </div>

                  {/* Stats strip */}
                  {showStats && (
                    <div className={`flex items-center divide-x rounded-xl border overflow-hidden mb-6 ${
                      isDarkMode ? 'bg-dark-surface border-dark-border divide-dark-border' : 'bg-white border-gray-200 divide-gray-200 shadow-sm'
                    }`}>
                      {[
                        { label: 'Total', value: dashboardData.total_units, icon: BookOpen, color: isDarkMode ? 'text-dark-accent-green' : 'text-emerald-600' },
                        { label: 'Completed', value: dashboardData.completed_count, icon: CheckCircle2, color: isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600' },
                        { label: 'Not Started', value: dashboardData.total_units - dashboardData.completed_count, icon: Target, color: isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500' },
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
                  )}

                  {/* Topic cards + pagination controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
                    {visibleTopics.map((topic) => (
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

                  {/* Pagination — only shown when there are more than PAGE_SIZE topics */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setPage(course.course_slug, page - 1)}
                        disabled={page === 0}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          isDarkMode
                            ? 'bg-dark-surface border border-dark-border hover:border-dark-accent-purple/50 text-dark-text-secondary hover:text-dark-text-primary'
                            : 'bg-white border border-gray-200 hover:border-purple-300 text-gray-600 hover:text-gray-900 shadow-sm'
                        }`}
                      >
                        <ChevronLeft size={16} /> Previous
                      </button>

                      {/* Page dots */}
                      <div className="flex items-center gap-2">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPage(course.course_slug, i)}
                            className={`rounded-full transition-all ${
                              i === page
                                ? `w-6 h-2.5 ${isDarkMode ? 'bg-dark-accent-purple' : 'bg-purple-600'}`
                                : `w-2.5 h-2.5 ${isDarkMode ? 'bg-dark-border hover:bg-dark-text-muted' : 'bg-gray-300 hover:bg-gray-400'}`
                            }`}
                          />
                        ))}
                      </div>

                      <button
                        onClick={() => setPage(course.course_slug, page + 1)}
                        disabled={page === totalPages - 1}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                          isDarkMode
                            ? 'bg-dark-surface border border-dark-border hover:border-dark-accent-purple/50 text-dark-text-secondary hover:text-dark-text-primary'
                            : 'bg-white border border-gray-200 hover:border-purple-300 text-gray-600 hover:text-gray-900 shadow-sm'
                        }`}
                      >
                        Next <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
