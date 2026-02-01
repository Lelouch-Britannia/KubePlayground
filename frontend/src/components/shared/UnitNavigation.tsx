import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { apiClient } from '../../services/api';
import type { CourseProgress } from '../../types/api';

interface UnitNavigationProps {
  currentUnitSlug: string;
  currentTopic: string;
}

export default function UnitNavigation({ currentUnitSlug, currentTopic }: UnitNavigationProps) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);

  // Get current topic and unit details
  const currentCourse = courses[0]; // Assuming single course for now
  const currentTopicData = currentCourse?.topics.find(t => t.topic === currentTopic);
  const currentUnit = currentTopicData?.units.find(u => u.slug === currentUnitSlug);
  const currentUnitIndex = currentTopicData?.units.findIndex(u => u.slug === currentUnitSlug) ?? -1;

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

  const handleTopicSelect = (topicSlug: string) => {
    const topic = currentCourse?.topics.find(t => t.topic_slug === topicSlug);
    if (topic && topic.units.length > 0) {
      navigate(`/unit/${topic.units[0].slug}`);
    }
    setShowTopicDropdown(false);
  };

  const handleUnitSelect = (unitSlug: string) => {
    navigate(`/unit/${unitSlug}`);
    setShowUnitDropdown(false);
  };

  if (loading || !currentCourse || !currentTopicData) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-dark-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Topic Dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setShowTopicDropdown(!showTopicDropdown);
            setShowUnitDropdown(false);
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-dark-surface rounded-lg hover:bg-dark-hover transition-colors"
        >
          <span>CH{currentTopicData.topic_order || 1}: {currentTopicData.topic.replace(' 101', '')}</span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {showTopicDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowTopicDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-1 w-64 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
              {currentCourse.topics.map((topic) => (
                <button
                  key={topic.topic_slug || topic.topic}
                  onClick={() => handleTopicSelect(topic.topic_slug || topic.topic)}
                  className={`w-full px-4 py-2.5 flex items-center gap-2 hover:bg-dark-hover transition-colors text-left ${
                    topic.topic === currentTopic
                      ? 'bg-dark-accent-purple/10 text-dark-accent-purple'
                      : 'text-dark-text-secondary'
                  }`}
                >
                  {topic.topic_icon && <span className="text-base">{topic.topic_icon}</span>}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{topic.topic}</div>
                    <div className="text-xs text-dark-text-muted">
                      {topic.completed_units}/{topic.total_units} completed
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Unit Dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setShowUnitDropdown(!showUnitDropdown);
            setShowTopicDropdown(false);
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-dark-surface rounded-lg hover:bg-dark-hover transition-colors"
        >
          <span>L{currentUnitIndex + 1}: {currentUnit?.title || 'Unknown Unit'}</span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {showUnitDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowUnitDropdown(false)}
            />
            <div className="absolute top-full left-0 mt-1 w-80 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
              {currentTopicData.units.map((unit, index) => (
                <button
                  key={unit.slug}
                  onClick={() => handleUnitSelect(unit.slug)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-dark-hover transition-colors text-left ${
                    unit.slug === currentUnitSlug
                      ? 'bg-dark-accent-purple/10 text-dark-accent-purple'
                      : 'text-dark-text-secondary'
                  }`}
                >
                  <span className="font-mono text-xs text-dark-text-muted min-w-[24px]">
                    {index + 1}.
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{unit.title}</div>
                    {unit.difficulty && (
                      <div className="text-xs text-dark-text-muted capitalize">
                        {unit.difficulty}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
