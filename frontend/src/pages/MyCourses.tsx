import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavHeader from '../components/shared/NavHeader';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import type { MyCourseItem } from '../types/api';
import { BookOpen, Play, Pause, Loader2 } from 'lucide-react';

export default function MyCourses() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme === 'dark';
  const [courses, setCourses] = useState<MyCourseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getMyCourses();
      setCourses(data);
    } catch (err) {
      console.error('Failed to fetch enrolled courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (courseSlug: string) => {
    await apiClient.setCourseStatus(courseSlug, 'active');
    fetchCourses();
  };

  const handlePause = async (courseSlug: string) => {
    await apiClient.setCourseStatus(courseSlug, 'paused');
    fetchCourses();
  };

  const handleUnenroll = async (courseSlug: string, courseName: string) => {
    if (!window.confirm(`Unenroll from "${courseName}"? Your progress will be saved.`)) return;
    await apiClient.unenrollCourse(courseSlug);
    fetchCourses();
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
        <NavHeader />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="w-8 h-8 animate-spin text-dark-accent-blue" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
      <NavHeader />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className={`text-3xl font-bold mb-1 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              My Courses
            </h1>
            <p className={`text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              {courses.length} enrolled course{courses.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/courses')}
            className={`text-sm px-4 py-2 border rounded-lg transition-colors ${isDarkMode ? 'border-dark-border text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-accent-purple/50' : 'border-gray-300 text-gray-600 hover:text-gray-900 hover:border-purple-300'}`}
          >
            Browse Courses
          </button>
        </div>

        {courses.length === 0 ? (
          <div className={`rounded-xl border p-12 text-center ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-dark-text-muted" />
            <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              No enrolled courses
            </h2>
            <p className={`mb-4 text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
              Browse available courses and enroll to start learning
            </p>
            <button
              onClick={() => navigate('/courses')}
              className="px-4 py-2 bg-dark-accent-purple text-white rounded-lg text-sm font-medium hover:bg-dark-accent-purple/80 transition-colors"
            >
              Browse Courses →
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map(course => (
              <div
                key={course.course_slug}
                className={`rounded-xl border p-5 flex flex-col gap-3 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-semibold leading-tight ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                    {course.course_name}
                  </h3>
                  <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    course.status === 'active'
                      ? 'bg-dark-accent-green/10 text-dark-accent-green border-dark-accent-green/30'
                      : 'bg-dark-border text-dark-text-muted border-dark-border'
                  }`}>
                    {course.status === 'active' ? '● Active' : '◌ Paused'}
                  </span>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-dark-text-muted mb-1">
                    <span>{course.completed_units}/{course.total_units} units</span>
                    <span>{course.completion_pct}%</span>
                  </div>
                  <div className={`w-full rounded-full h-1.5 ${isDarkMode ? 'bg-dark-border' : 'bg-gray-200'}`}>
                    <div
                      className="bg-dark-accent-purple h-1.5 rounded-full transition-all"
                      style={{ width: `${course.completion_pct}%` }}
                    />
                  </div>
                </div>

                {/* Dates */}
                <p className="text-[11px] text-dark-text-muted">
                  Enrolled {formatDate(course.enrolled_at)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  {course.status === 'active' ? (
                    <button
                      onClick={() => handlePause(course.course_slug)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded transition-colors ${isDarkMode ? 'border-dark-border text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-accent-purple/50' : 'border-gray-300 text-gray-600 hover:text-gray-900'}`}
                    >
                      <Pause size={12} /> Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(course.course_slug)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-dark-accent-purple text-white rounded hover:bg-dark-accent-purple/80 transition-colors"
                    >
                      <Play size={12} /> Start
                    </button>
                  )}
                  <button
                    onClick={() => handleUnenroll(course.course_slug, course.course_name)}
                    className="text-xs px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors ml-auto"
                  >
                    Unenroll
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
