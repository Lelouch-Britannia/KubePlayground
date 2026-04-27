import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, CheckCircle, Circle } from 'lucide-react';
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
  const topicRef = useRef<HTMLDivElement>(null);
  const unitRef = useRef<HTMLDivElement>(null);

  const currentCourse = courses[0];
  const currentTopicData = currentCourse?.topics.find(t => t.topic === currentTopic);
  const currentUnit = currentTopicData?.units.find(u => u.slug === currentUnitSlug);
  const currentUnitIndex = currentTopicData?.units.findIndex(u => u.slug === currentUnitSlug) ?? -1;

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) {
        setShowTopicDropdown(false);
      }
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) {
        setShowUnitDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCourses = async () => {
    try {
      const data = await apiClient.getDashboard();
      setCourses((data as any).courses || []);
    } catch {
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
    return <div className="flex items-center gap-3 text-sm text-dark-text-muted">Loading...</div>;
  }

  return (
    <div className="flex items-center gap-3">
      {/* Topic Dropdown */}
      <div className="relative" ref={topicRef}>
        <button
          onClick={() => { setShowTopicDropdown(!showTopicDropdown); setShowUnitDropdown(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded transition-colors ${
            showTopicDropdown
              ? 'border-dark-accent-purple text-dark-accent-purple bg-dark-accent-purple/10'
              : 'border-dark-border text-dark-text-primary bg-dark-elevated hover:border-dark-text-muted hover:bg-dark-hover'
          }`}
        >
          {currentTopicData.topic_icon && <span className="text-base leading-none">{currentTopicData.topic_icon}</span>}
          <span>{currentTopicData.topic}</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${showTopicDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showTopicDropdown && (
          <div className="absolute top-full left-0 mt-1.5 w-72 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-dark-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-dark-text-muted">Topics</span>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {currentCourse.topics.map((topic) => {
                const isActive = topic.topic === currentTopic;
                const pct = Math.round((topic.completed_units / Math.max(topic.total_units, 1)) * 100);
                return (
                  <button
                    key={topic.topic_slug || topic.topic}
                    onClick={() => handleTopicSelect(topic.topic_slug || topic.topic)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors text-left ${
                      isActive ? 'bg-dark-accent-purple/10 text-dark-accent-purple' : 'text-dark-text-secondary hover:bg-dark-hover'
                    }`}
                  >
                    {topic.topic_icon && <span className="text-base leading-none">{topic.topic_icon}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{topic.topic}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-dark-border rounded-full overflow-hidden">
                          <div className="h-full bg-dark-accent-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-dark-text-muted shrink-0">{topic.completed_units}/{topic.total_units}</span>
                      </div>
                    </div>
                    {isActive && <div className="w-2 h-2 rounded-full bg-dark-accent-purple shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Unit Dropdown */}
      <div className="relative" ref={unitRef}>
        <button
          onClick={() => { setShowUnitDropdown(!showUnitDropdown); setShowTopicDropdown(false); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded transition-colors ${
            showUnitDropdown
              ? 'border-dark-accent-blue text-dark-accent-blue bg-dark-accent-blue/10'
              : 'border-dark-border text-dark-text-primary bg-dark-elevated hover:border-dark-text-muted hover:bg-dark-hover'
          }`}
        >
          <span className="truncate max-w-[240px]">{currentUnit?.title || 'Unknown'}</span>
          <span className="text-xs text-dark-text-muted">{currentUnitIndex + 1}/{currentTopicData.units.length}</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${showUnitDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showUnitDropdown && (
          <div className="absolute top-full right-0 mt-1.5 w-80 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-dark-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-dark-text-muted">Lessons</span>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {currentTopicData.units.map((u, index) => {
                const isActive = u.slug === currentUnitSlug;
                return (
                  <button
                    key={u.slug}
                    onClick={() => handleUnitSelect(u.slug)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors text-left group ${
                      isActive ? 'bg-dark-accent-blue/10' : 'hover:bg-dark-hover'
                    }`}
                  >
                    <div className="shrink-0">
                      {u.status === 'completed' ? (
                        <CheckCircle size={16} className="text-dark-accent-green" />
                      ) : isActive ? (
                        <div className="w-4 h-4 rounded-full border-2 border-dark-accent-blue bg-dark-accent-blue/20" />
                      ) : (
                        <Circle size={16} className="text-dark-text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${
                        isActive ? 'text-dark-accent-blue' : 'text-dark-text-secondary group-hover:text-dark-text-primary'
                      }`}>
                        {index + 1}. {u.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {u.type === 'coding' ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-dark-accent-blue/10 text-dark-accent-blue font-medium">Code</span>
                        ) : (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-dark-accent-orange/10 text-dark-accent-orange font-medium">Conceptual</span>
                        )}
                        {u.difficulty && (
                          <span className={`text-[11px] capitalize ${
                            u.difficulty === 'beginner' ? 'text-dark-accent-green' :
                            u.difficulty === 'intermediate' ? 'text-dark-accent-yellow' :
                            'text-red-400'
                          }`}>
                            {u.difficulty}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
