import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavHeader from '../components/shared/NavHeader';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import type { CourseChaptersResponse, TopicSummary } from '../types/api';
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, PlayCircle } from 'lucide-react';

export default function CourseChaptersPage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme === 'dark';
  const [data, setData] = useState<CourseChaptersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseSlug) {
      fetchCourseChapters();
    }
  }, [courseSlug]);

  const fetchCourseChapters = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getCourseChapters(courseSlug!);
      setData(response as CourseChaptersResponse);
    } catch (err) {
      console.error('Failed to fetch course chapters:', err);
      setError('Failed to load course chapters. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleTopicClick = (topic: TopicSummary) => {
    navigate(`/courses/${courseSlug}/topics/${topic.id}`);
  };

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return isDarkMode ? 'bg-dark-accent-yellow' : 'bg-amber-500';
    if (percentage > 0) return isDarkMode ? 'bg-dark-accent-blue' : 'bg-blue-500';
    return isDarkMode ? 'bg-dark-border' : 'bg-gray-300';
  };

  const getStatusIcon = (topic: TopicSummary) => {
    if (topic.completion_percentage === 100) {
      return <CheckCircle2 className={isDarkMode ? 'text-dark-accent-yellow' : 'text-amber-600'} />;
    }
    if (topic.completion_percentage > 0) {
      return <PlayCircle className={isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'} />;
    }
    return <BookOpen className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'} />;
  };

  if (loading) {
    return (
      <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
        <NavHeader />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-dark-accent-blue' : 'text-blue-600'}`} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
        <NavHeader />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className={`rounded-lg p-6 border ${
            isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <p>{error || 'Course not found'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
      <NavHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Back Button & Course Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/courses')}
            className={`flex items-center gap-2 mb-4 transition-colors ${
              isDarkMode
                ? 'text-dark-text-secondary hover:text-dark-accent-blue'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Courses</span>
          </button>

          <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
            {data.course.name}
          </h1>
          {data.course.description && (
            <p className={`text-lg mb-4 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
              {data.course.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm">
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
              {data.course.topics_count} {data.course.topics_count === 1 ? 'chapter' : 'chapters'}
            </span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>•</span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
              {data.course.total_units} {data.course.total_units === 1 ? 'unit' : 'units'}
            </span>
          </div>
        </div>

        {/* Topics Grid */}
        <div className="grid gap-4">
          {data.chapters.map((topic) => (
            <button
              key={topic.id}
              onClick={() => handleTopicClick(topic)}
              className={`p-6 rounded-xl border transition-all group text-left ${
                isDarkMode
                  ? 'bg-dark-surface border-dark-border hover:border-dark-accent-purple/50 hover:shadow-lg'
                  : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-lg'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl border-2 ${
                  topic.completion_percentage === 100
                    ? isDarkMode
                      ? 'bg-dark-accent-yellow/20 border-dark-accent-yellow'
                      : 'bg-amber-100 border-amber-500'
                    : topic.completion_percentage > 0
                    ? isDarkMode
                      ? 'bg-dark-accent-blue/20 border-dark-accent-blue'
                      : 'bg-blue-100 border-blue-500'
                    : isDarkMode
                      ? 'bg-dark-elevated border-dark-border'
                      : 'bg-gray-100 border-gray-300'
                }`}>
                  {topic.icon || '📖'}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-xl font-bold transition-colors ${
                      isDarkMode
                        ? 'text-dark-text-primary group-hover:text-dark-accent-blue'
                        : 'text-gray-900 group-hover:text-blue-600'
                    }`}>
                      {topic.name}
                    </h3>
                    <div className="w-6 h-6">
                      {getStatusIcon(topic)}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mb-3 text-sm">
                    <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
                      {topic.units_count} {topic.units_count === 1 ? 'unit' : 'units'}
                    </span>
                    <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>•</span>
                    <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
                      {topic.completed_units}/{topic.units_count} completed
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className={`w-full rounded-full h-2 overflow-hidden ${
                    isDarkMode ? 'bg-dark-border/50' : 'bg-gray-200'
                  }`}>
                    <div
                      className={`h-full transition-all duration-500 ${getProgressColor(topic.completion_percentage)}`}
                      style={{ width: `${topic.completion_percentage}%` }}
                    />
                  </div>
                </div>

                {/* Completion Badge */}
                {topic.completion_percentage === 100 && (
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    isDarkMode
                      ? 'bg-dark-accent-yellow/20 text-dark-accent-yellow'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    Complete
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
