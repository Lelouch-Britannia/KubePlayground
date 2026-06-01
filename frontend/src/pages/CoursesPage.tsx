import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavHeader from '../components/shared/NavHeader';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import type { CourseInfo, CourseChaptersResponse, TopicUnitsResponse } from '../types/api';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';

export default function CoursesPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme === 'dark';
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [enrolledSlugs, setEnrolledSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, myCourses] = await Promise.all([
        apiClient.getCourses(),
        apiClient.getMyCourses().catch(() => []),
      ]);
      // API returns array directly, not wrapped in object
      const coursesArray = Array.isArray(data) ? data : [];
      setCourses(coursesArray);
      setEnrolledSlugs(new Set(myCourses.map(c => c.course_slug)));
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setError('Failed to load courses. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleCourseClick = async (courseSlug: string) => {
    if (!enrolledSlugs.has(courseSlug)) return;
    try {
      // Fetch course chapters to get the first topic
      const chaptersData = await apiClient.getCourseChapters(courseSlug) as CourseChaptersResponse;

      if (chaptersData.chapters && chaptersData.chapters.length > 0) {
        // Get the first topic (ordered by order_position)
        const firstTopic = chaptersData.chapters[0];

        // Fetch units for the first topic
        const topicUnitsData = await apiClient.getTopicUnits(firstTopic.id) as TopicUnitsResponse;

        if (topicUnitsData.units && topicUnitsData.units.length > 0) {
          // Navigate to the first unit
          const firstUnit = topicUnitsData.units[0];
          navigate(`/unit/${firstUnit.slug}`);
        } else {
          // No units found, navigate to topic page
          navigate(`/courses/${courseSlug}/topics/${firstTopic.id}`);
        }
      } else {
        // No topics found, navigate to course chapters page
        navigate(`/courses/${courseSlug}`);
      }
    } catch (err) {
      console.error('Failed to navigate to course:', err);
      // Fallback to course chapters page
      navigate(`/courses/${courseSlug}`);
    }
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

  return (
    <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
      <NavHeader />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
            Courses
          </h1>
          <p className={`text-lg ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
            Choose a course to start your learning journey
          </p>
        </div>

        {error ? (
          <div className={`rounded-lg p-6 border ${
            isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <p>{error}</p>
          </div>
        ) : courses.length === 0 ? (
          <div className={`rounded-lg p-12 text-center border ${
            isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'
          }`}>
            <BookOpen className={`mx-auto h-16 w-16 mb-4 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-400'}`} />
            <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
              No Courses Available
            </h2>
            <p className={`max-w-md mx-auto ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
              We're working on bringing you structured learning paths. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {courses.map((course) => {
              const isEnrolled = enrolledSlugs.has(course.slug);
              return (
                <div
                  key={course.id}
                  onClick={() => handleCourseClick(course.slug)}
                  className={`text-left p-6 rounded-xl border transition-all group ${
                    isEnrolled
                      ? `cursor-pointer ${isDarkMode
                          ? 'bg-dark-surface border-dark-border hover:border-dark-accent-purple/50 hover:shadow-lg hover:shadow-dark-accent-purple/5'
                          : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-lg'}`
                      : `cursor-default ${isDarkMode
                          ? 'bg-dark-surface border-dark-border'
                          : 'bg-white border-gray-200'}`
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className={`text-xl font-bold mb-2 transition-colors ${
                        isEnrolled
                          ? isDarkMode
                            ? 'text-dark-text-primary group-hover:text-dark-accent-blue'
                            : 'text-gray-900 group-hover:text-blue-600'
                          : isDarkMode
                          ? 'text-dark-text-primary'
                          : 'text-gray-900'
                      }`}>
                        {course.name}
                      </h3>
                      {course.description && (
                        <p className={`text-sm mb-4 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>
                          {course.description}
                        </p>
                      )}
                    </div>
                    {isEnrolled && (
                      <ChevronRight className={`w-6 h-6 flex-shrink-0 ml-4 transition-colors ${
                        isDarkMode
                          ? 'text-dark-text-muted group-hover:text-dark-accent-blue'
                          : 'text-gray-400 group-hover:text-blue-600'
                      }`} />
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm mb-3">
                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}`}>
                      <BookOpen className="w-4 h-4" />
                      <span>{course.topics_count} {course.topics_count === 1 ? 'topic' : 'topics'}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${isDarkMode ? 'text-dark-text-muted' : 'text-gray-500'}`}>
                      <span>•</span>
                      <span>{course.total_units} {course.total_units === 1 ? 'unit' : 'units'}</span>
                    </div>
                  </div>

                  <div>
                    {isEnrolled ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-dark-accent-green/20 text-dark-accent-green border border-dark-accent-green/30">
                        ✓ Enrolled
                      </span>
                    ) : (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await apiClient.enrollCourse(course.slug);
                          setEnrolledSlugs(prev => new Set([...prev, course.slug]));
                        }}
                        className="text-xs px-3 py-1 bg-dark-accent-purple text-white rounded hover:bg-dark-accent-purple/80 transition-colors"
                      >
                        Enroll
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
