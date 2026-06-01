import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import NavHeader from '../components/shared/NavHeader';
import MarkdownRenderer from '../components/shared/MarkdownRenderer';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../services/api';
import type { CourseDetail } from '../types/api';
import { ArrowLeft, Clock, BookOpen, CheckCircle, User, Loader2 } from 'lucide-react';

export default function CourseLandingPage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (!courseSlug) return;
    const load = async () => {
      try {
        const [detail, myCourses] = await Promise.all([
          apiClient.getCourseDetail(courseSlug),
          apiClient.getMyCourses().catch(() => []),
        ]);
        setCourse(detail as CourseDetail);
        setEnrolled((myCourses as any[]).some((c: any) => c.course_slug === courseSlug));
      } catch (err) {
        console.error('Failed to load course:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseSlug]);

  const handleEnroll = async () => {
    if (!courseSlug || enrolled) return;
    try {
      setEnrolling(true);
      await apiClient.enrollCourse(courseSlug);
      setEnrolled(true);
    } catch (err) {
      console.error('Enroll failed:', err);
    } finally {
      setEnrolling(false);
    }
  };

  const levelLabel: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
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

  if (!course) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-50'}`}>
        <NavHeader />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <p className="text-dark-text-secondary">Course not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-dark-bg text-dark-text-primary' : 'bg-gray-50 text-gray-900'}`}>
      <NavHeader />
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Back */}
        <button
          onClick={() => navigate('/courses')}
          className="flex items-center gap-1.5 text-sm text-dark-text-muted hover:text-dark-text-primary mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Courses
        </button>

        {/* Hero */}
        <div className={`rounded-2xl border p-8 mb-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold mb-2">{course.name}</h1>
              {course.tagline && (
                <p className={`text-lg mb-4 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>{course.tagline}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {course.level && (
                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${
                    course.level === 'beginner' ? 'border-dark-accent-green/40 text-dark-accent-green bg-dark-accent-green/10' :
                    course.level === 'intermediate' ? 'border-yellow-500/40 text-yellow-500 bg-yellow-500/10' :
                    'border-red-500/40 text-red-400 bg-red-500/10'
                  }`}>
                    {levelLabel[course.level] ?? course.level}
                  </span>
                )}
                {course.estimated_hours && (
                  <span className="flex items-center gap-1 text-dark-text-muted">
                    <Clock size={14} /> ~{course.estimated_hours} hours
                  </span>
                )}
                <span className="flex items-center gap-1 text-dark-text-muted">
                  <BookOpen size={14} /> {course.topics_count} topics · {course.total_units} units
                </span>
              </div>
            </div>
            <button
              onClick={handleEnroll}
              disabled={enrolled || enrolling}
              className={`shrink-0 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                enrolled
                  ? 'bg-dark-accent-green/20 text-dark-accent-green border border-dark-accent-green/40 cursor-default'
                  : 'bg-dark-accent-purple text-white hover:bg-dark-accent-purple/80'
              }`}
            >
              {enrolling ? 'Enrolling…' : enrolled ? '✓ Enrolled' : 'Enroll Now'}
            </button>
          </div>
        </div>

        <div className="grid gap-6">
          {/* What you'll learn */}
          {course.what_you_learn.length > 0 && (
            <section className={`rounded-xl border p-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
              <h2 className="text-xl font-bold mb-4">What you'll learn</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {course.what_you_learn.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle size={16} className="text-dark-accent-green shrink-0 mt-0.5" />
                    <span className={`text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-700'}`}>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Description */}
          {course.description && (
            <section className={`rounded-xl border p-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
              <h2 className="text-xl font-bold mb-4">Description</h2>
              <div className={`text-sm leading-relaxed ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-700'}`}>
                <MarkdownRenderer content={course.description} />
              </div>
            </section>
          )}

          {/* Prerequisites */}
          {course.prerequisites.length > 0 && (
            <section className={`rounded-xl border p-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
              <h2 className="text-xl font-bold mb-4">Prerequisites</h2>
              <ul className="space-y-2">
                {course.prerequisites.map((item, i) => (
                  <li key={i} className={`flex items-start gap-2 text-sm ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-700'}`}>
                    <span className="text-dark-text-muted mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Course Content */}
          {course.modules.length > 0 && (
            <section className={`rounded-xl border p-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
              <h2 className="text-xl font-bold mb-4">Course Content</h2>
              <div className="space-y-4">
                {course.modules.map((mod, i) => (
                  <div key={i}>
                    <h3 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-dark-text-primary' : 'text-gray-900'}`}>
                      {mod.week ? `Week ${mod.week}: ` : ''}{mod.title}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {mod.topics.map((t, j) => (
                        <span key={j} className={`text-xs px-2.5 py-1 rounded border ${
                          isDarkMode ? 'bg-dark-bg border-dark-border text-dark-text-muted' : 'bg-gray-50 border-gray-200 text-gray-600'
                        }`}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Author */}
          {course.author_name && (
            <section className={`rounded-xl border p-6 ${isDarkMode ? 'bg-dark-surface border-dark-border' : 'bg-white border-gray-200'}`}>
              <h2 className="text-xl font-bold mb-4">About the Author</h2>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-dark-bg' : 'bg-gray-100'}`}>
                  <User size={20} className="text-dark-text-muted" />
                </div>
                <div>
                  <p className="font-semibold">{course.author_name}</p>
                  {course.author_bio && (
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-dark-text-secondary' : 'text-gray-600'}`}>{course.author_bio}</p>
                  )}
                </div>
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
