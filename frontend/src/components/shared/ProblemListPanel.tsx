import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, ChevronDown, CheckCircle, Circle } from 'lucide-react';
import { apiClient } from '../../services/api';
import type { CourseProgress } from '../../types/api';

interface ProblemListPanelProps {
  currentUnitSlug: string;
  onClose: () => void;
}

function findTopicForUnit(courses: CourseProgress[], unitSlug: string): string | null {
  for (const course of courses) {
    for (const topic of course.topics) {
      if (topic.units.some(u => u.slug === unitSlug)) {
        return topic.topic_slug ?? topic.topic;
      }
    }
  }
  return null;
}

export default function ProblemListPanel({ currentUnitSlug, onClose }: ProblemListPanelProps) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const activeUnitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchCourses = async () => {
      try {
        const data = await apiClient.getDashboard();
        if (!cancelled) {
          const fetched: CourseProgress[] = (data as any).courses || [];
          setCourses(fetched);

          const activeTopicKey = findTopicForUnit(fetched, currentUnitSlug);
          if (activeTopicKey) {
            setExpandedTopics(new Set([activeTopicKey]));
          } else if (fetched.length > 0 && fetched[0].topics.length > 0) {
            const first = fetched[0].topics[0];
            setExpandedTopics(new Set([first.topic_slug ?? first.topic]));
          }
        }
      } catch {
        if (!cancelled) setCourses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCourses();
    return () => { cancelled = true; };
  }, [currentUnitSlug]);

  useEffect(() => {
    if (!loading && activeUnitRef.current) {
      activeUnitRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [loading]);

  const toggleTopic = (key: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleUnitClick = (slug: string) => {
    navigate(`/unit/${slug}`);
    onClose();
  };

  const query = search.trim().toLowerCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed left-0 top-0 h-full z-50 flex">
        <div className="w-80 bg-dark-surface border-r border-dark-border flex flex-col h-full shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-dark-border shrink-0">
            <span className="text-sm font-semibold text-dark-text-primary">Problem List</span>
            <button
              onClick={onClose}
              className="p-1 rounded text-dark-text-muted hover:text-dark-text-primary hover:bg-dark-hover transition-colors"
              aria-label="Close panel"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-dark-border shrink-0">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter problems..."
              className="w-full px-3 py-1.5 text-sm bg-dark-elevated border border-dark-border rounded text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:border-dark-accent-blue transition-colors"
            />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-sm text-dark-text-muted">Loading...</div>
            ) : (
              courses.map(course => (
                <div key={course.course_slug}>
                  {/* Course header */}
                  <div className="px-4 py-2.5 border-b border-dark-border bg-dark-elevated">
                    <span className="text-xs font-bold uppercase tracking-wider text-dark-text-muted">
                      {course.course_name}
                    </span>
                  </div>

                  {/* Topics */}
                  {course.topics.map(topic => {
                    const topicKey = topic.topic_slug ?? topic.topic;
                    const isExpanded = expandedTopics.has(topicKey);

                    const visibleUnits = query
                      ? topic.units.filter(u => u.title.toLowerCase().includes(query))
                      : topic.units;

                    if (query && visibleUnits.length === 0) return null;

                    return (
                      <div key={topicKey}>
                        {/* Topic row */}
                        <button
                          onClick={() => toggleTopic(topicKey)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-dark-hover transition-colors group"
                        >
                          <span className="text-dark-text-muted shrink-0">
                            {isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </span>
                          {topic.topic_icon && (
                            <span className="text-sm leading-none shrink-0">{topic.topic_icon}</span>
                          )}
                          <span className="flex-1 text-sm font-semibold text-dark-text-primary truncate group-hover:text-dark-text-primary">
                            {topic.topic}
                          </span>
                          <span className="text-xs text-dark-text-muted shrink-0">
                            {topic.completed_units}/{topic.total_units}
                          </span>
                        </button>

                        {/* Units */}
                        {(isExpanded || query !== '') && visibleUnits.map((unit, idx) => {
                          const isActive = unit.slug === currentUnitSlug;
                          const isCompleted = unit.status === 'completed';
                          const globalIdx = query
                            ? topic.units.indexOf(unit)
                            : idx;

                          return (
                            <button
                              key={unit.slug}
                              ref={isActive ? activeUnitRef : undefined}
                              onClick={() => handleUnitClick(unit.slug)}
                              className={`w-full flex items-start gap-2.5 px-4 py-2 text-left transition-colors group ${
                                isActive
                                  ? 'bg-dark-accent-blue/10'
                                  : 'hover:bg-dark-hover'
                              }`}
                            >
                              {/* Status icon */}
                              <span className="shrink-0 mt-0.5">
                                {isCompleted ? (
                                  <CheckCircle size={14} className="text-dark-accent-green" />
                                ) : isActive ? (
                                  <div className="w-3.5 h-3.5 rounded-full border-2 border-dark-accent-blue bg-dark-accent-blue/20 mt-px" />
                                ) : (
                                  <Circle size={14} className="text-dark-text-muted" />
                                )}
                              </span>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium truncate leading-snug ${
                                  isActive
                                    ? 'text-dark-accent-blue'
                                    : 'text-dark-text-secondary group-hover:text-dark-text-primary'
                                }`}>
                                  {globalIdx + 1}. {unit.title}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {unit.type === 'coding' ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-accent-blue/10 text-dark-accent-blue font-medium leading-none">
                                      Code
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-accent-orange/10 text-dark-accent-orange font-medium leading-none">
                                      Concept
                                    </span>
                                  )}
                                  {unit.difficulty && (
                                    <span className={`text-[10px] capitalize leading-none ${
                                      unit.difficulty === 'beginner'
                                        ? 'text-dark-accent-green'
                                        : unit.difficulty === 'intermediate'
                                        ? 'text-dark-accent-yellow'
                                        : 'text-red-400'
                                    }`}>
                                      {unit.difficulty}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
