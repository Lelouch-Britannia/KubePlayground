import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { apiClient } from '../../services/api';
import type { CourseProgress } from '../../types/api';

export default function CourseNavigation() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const data = await apiClient.getDashboard();
      setCourses((data as any).courses || []);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCourse = (courseSlug: string) => {
    setExpandedCourse(expandedCourse === courseSlug ? null : courseSlug);
  };

  const toggleTopic = (topicKey: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicKey)) {
      newExpanded.delete(topicKey);
    } else {
      newExpanded.add(topicKey);
    }
    setExpandedTopics(newExpanded);
  };

  const handleUnitClick = (unitSlug: string) => {
    navigate(`/unit/${unitSlug}`);
  };

  if (loading || courses.length === 0) {
    return null;
  }

  return (
    <div className="relative group">
      <button
        className="px-4 py-2 text-sm font-medium rounded transition-colors text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-active flex items-center gap-1"
      >
        Chapters
        <ChevronDown className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      <div className="absolute top-full left-0 mt-1 w-80 max-h-[600px] overflow-y-auto bg-dark-surface border border-dark-border rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        {courses.map((course) => (
          <div key={course.course_slug} className="border-b border-dark-border last:border-b-0">
            {/* Course Header */}
            <button
              onClick={() => toggleCourse(course.course_slug)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-dark-hover transition-colors"
            >
              <span className="text-sm font-semibold text-dark-text-primary">
                {course.course_name}
              </span>
              <ChevronRight
                className={`w-4 h-4 text-dark-text-muted transition-transform ${
                  expandedCourse === course.course_slug ? 'rotate-90' : ''
                }`}
              />
            </button>

            {/* Topics */}
            {expandedCourse === course.course_slug && (
              <div className="bg-dark-elevated">
                {course.topics.map((topic, topicIndex) => {
                  const topicKey = `${course.course_slug}-${topic.topic_slug || topicIndex}`;
                  const isTopicExpanded = expandedTopics.has(topicKey);

                  return (
                    <div key={topicKey} className="border-t border-dark-border/50">
                      {/* Topic Header */}
                      <button
                        onClick={() => toggleTopic(topicKey)}
                        className="w-full px-6 py-2.5 flex items-center justify-between hover:bg-dark-hover/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {topic.topic_icon && <span className="text-base">{topic.topic_icon}</span>}
                          <span className="text-xs font-medium text-dark-text-secondary">
                            {topic.topic}
                          </span>
                          <span className="text-xs text-dark-text-muted">
                            ({topic.completed_units}/{topic.total_units})
                          </span>
                        </div>
                        <ChevronRight
                          className={`w-3 h-3 text-dark-text-muted transition-transform ${
                            isTopicExpanded ? 'rotate-90' : ''
                          }`}
                        />
                      </button>

                      {/* Units */}
                      {isTopicExpanded && (
                        <div className="bg-dark-bg/30">
                          {topic.units.map((unit, unitIndex) => (
                            <button
                              key={unit.slug}
                              onClick={() => handleUnitClick(unit.slug)}
                              className="w-full px-8 py-2 flex items-center gap-3 hover:bg-dark-hover/30 transition-colors text-left"
                            >
                              <span className="text-xs font-mono text-dark-text-muted min-w-[20px]">
                                {unitIndex + 1}.
                              </span>
                              <span className="text-xs text-dark-text-secondary hover:text-dark-accent-blue flex-1 truncate">
                                {unit.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
