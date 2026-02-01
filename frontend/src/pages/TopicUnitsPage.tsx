import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavHeader from '../components/shared/NavHeader';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import type { TopicUnitsResponse, LearningUnitSummary } from '../types/api';
import { ArrowLeft, CheckCircle2, Code, FileText, Loader2, PlayCircle } from 'lucide-react';

export default function TopicUnitsPage() {
  const { courseSlug, topicId } = useParams<{ courseSlug: string; topicId: string }>();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme === 'dark';
  const [data, setData] = useState<TopicUnitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (topicId) {
      fetchTopicUnits();
    }
  }, [topicId]);

  const fetchTopicUnits = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getTopicUnits(parseInt(topicId!));
      setData(response as TopicUnitsResponse);
    } catch (err) {
      console.error('Failed to fetch topic units:', err);
      setError('Failed to load units. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitClick = (unit: LearningUnitSummary) => {
    navigate(`/unit/${unit.slug}`);
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case 'beginner':
        return isDarkMode ? 'text-green-400' : 'text-green-600';
      case 'intermediate':
        return isDarkMode ? 'text-yellow-400' : 'text-yellow-600';
      case 'advanced':
        return isDarkMode ? 'text-red-400' : 'text-red-600';
      default:
        return isDarkMode ? 'text-dark-text-muted' : 'text-gray-500';
    }
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'completed') {
      return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          isDarkMode ? 'bg-dark-accent-yellow/20 text-dark-accent-yellow' : 'bg-amber-100 text-amber-700'
        }`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Completed
        </div>
      );
    }
    if (status === 'in_progress') {
      return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          isDarkMode ? 'bg-dark-accent-blue/20 text-dark-accent-blue' : 'bg-blue-100 text-blue-700'
        }`}>
          <PlayCircle className="w-3.5 h-3.5" />
          In Progress
        </div>
      );
    }
    return null;
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
        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className={`rounded-lg p-6 border ${
            isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <p>{error || 'Topic not found'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
      <NavHeader />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Back Button & Topic Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/courses/${courseSlug}`)}
            className={`flex items-center gap-2 mb-4 transition-colors ${
              isDarkMode
                ? 'text-dark-text-secondary hover:text-dark-accent-blue'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Course</span>
          </button>

          <div className="flex items-center gap-3 mb-3">
            {data.topic.icon && (
              <div className="text-3xl">{data.topic.icon}</div>
            )}
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              {data.topic.name}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
              {data.topic.units_count} {data.topic.units_count === 1 ? 'unit' : 'units'}
            </span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>•</span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
              {data.topic.completed_units}/{data.topic.units_count} completed
            </span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>•</span>
            <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}>
              {Math.round(data.topic.completion_percentage)}% progress
            </span>
          </div>
        </div>

        {/* Units List */}
        <div className="space-y-3">
          {data.units.map((unit, index) => (
            <button
              key={unit.slug}
              onClick={() => handleUnitClick(unit)}
              className={`w-full p-5 rounded-xl border transition-all group text-left ${
                isDarkMode
                  ? 'bg-dark-surface border-dark-border hover:border-dark-accent-purple/50 hover:shadow-lg'
                  : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-lg'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Order Number */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold border-2 flex-shrink-0 ${
                  unit.status === 'completed'
                    ? isDarkMode
                      ? 'bg-dark-accent-yellow/20 border-dark-accent-yellow text-dark-accent-yellow'
                      : 'bg-amber-100 border-amber-500 text-amber-700'
                    : unit.status === 'in_progress'
                    ? isDarkMode
                      ? 'bg-dark-accent-blue/20 border-dark-accent-blue text-dark-accent-blue'
                      : 'bg-blue-100 border-blue-500 text-blue-700'
                    : isDarkMode
                      ? 'bg-dark-elevated border-dark-border text-dark-text-muted'
                      : 'bg-gray-100 border-gray-300 text-gray-600'
                }`}>
                  {index + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className={`text-lg font-semibold transition-colors ${
                      isDarkMode
                        ? 'text-dark-text-primary group-hover:text-dark-accent-blue'
                        : 'text-gray-900 group-hover:text-blue-600'
                    }`}>
                      {unit.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    {/* Type */}
                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}`}>
                      {unit.type === 'coding' ? (
                        <>
                          <Code className="w-4 h-4" />
                          <span>Coding</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          <span>Conceptual</span>
                        </>
                      )}
                    </div>

                    {/* Difficulty */}
                    {unit.difficulty && (
                      <>
                        <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}>•</span>
                        <span className={`capitalize ${getDifficultyColor(unit.difficulty)}`}>
                          {unit.difficulty}
                        </span>
                      </>
                    )}

                    {/* Score */}
                    {unit.score !== undefined && unit.score !== null && (
                      <>
                        <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}>•</span>
                        <span className={isDarkMode ? 'text-dark-text-muted' : 'text-gray-600'}>
                          Score: {unit.score}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                {getStatusBadge(unit.status)}
              </div>
            </button>
          ))}
        </div>

        {data.units.length === 0 && (
          <div className={`text-center py-12 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
            <p>No units available in this topic yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
