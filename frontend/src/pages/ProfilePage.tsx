import { useEffect, useState } from 'react';
import { User, Mail, Calendar, Flame, Award, Target, Clock } from 'lucide-react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import NavHeader from '../components/shared/NavHeader';

interface HeatmapDay {
  date: string;
  points: number;
  level: number;
}

interface UserStats {
  total_points: number;
  // quizzes_completed: number;  // quiz/grading feature commented out
  exercises_completed: number;
  // avg_quiz_score: number | null;  // quiz/grading feature commented out
  total_time_spent_hours: number;
  days_active: number;
}

interface UserStreak {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  streak_start_date: string | null;
}

interface ProfileSummary {
  user: {
    id: number;
    email: string;
    username: string;
    is_active: boolean;
    created_at: string;
    last_login: string | null;
  };
  stats: UserStats;
  streak: UserStreak;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  useEffect(() => {
    fetchProfileData();
  }, [selectedYear]);

  useEffect(() => {
    // Calculate available years from user join date to current year
    if (user?.created_at) {
      const joinYear = new Date(user.created_at).getFullYear();
      const currentYear = new Date().getFullYear();
      const years = [];
      for (let year = currentYear; year >= joinYear; year--) {
        years.push(year);
      }
      setAvailableYears(years);
    }
  }, [user]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);

      // Fetch each endpoint separately to handle partial failures
      let heatmap: HeatmapDay[] = [];
      let summary: ProfileSummary | null = null;
      let activity: any[] = [];

      try {
        // Fetch data for the selected year only (Jan 1 - Dec 31)
        const startDate = `${selectedYear}-01-01`;
        const endDate = `${selectedYear}-12-31`;
        const activityData = await apiClient.getMyActivity(startDate, endDate) as any[];

        // Transform activity data into heatmap format
        heatmap = generateYearHeatmap(selectedYear, activityData);
        console.log('Heatmap data received:', heatmap);
      } catch (err) {
        console.error('Failed to fetch heatmap:', err);
      }

      try {
        summary = await apiClient.getProfileSummary() as ProfileSummary;
        console.log('Profile summary received:', summary);
      } catch (err) {
        console.error('Failed to fetch profile summary:', err);
      }

      try {
        activity = await apiClient.getRecentActivity(20) as any[];
        console.log('Recent activity received:', activity);
      } catch (err) {
        console.error('Failed to fetch activity:', err);
      }

      setHeatmapData(heatmap || []);
      setProfileSummary(summary);
      if (activity && Array.isArray(activity)) {
        setRecentActivity(activity.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to fetch profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate heatmap data for all days in a year
  const generateYearHeatmap = (year: number, activityData: any[]): HeatmapDay[] => {
    const heatmap: HeatmapDay[] = [];
    const activityMap = new Map<string, number>();

    // Build a map of date -> submission count from activity data
    // scoring feature commented out — was: activity.total_points || activity.points
    if (activityData && Array.isArray(activityData)) {
      activityData.forEach(activity => {
        const date = activity.activity_date || activity.date;
        if (date) {
          activityMap.set(date, activity.exercises_completed || 0);
        }
      });
    }

    // Generate all days for the selected year
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const points = activityMap.get(dateStr) || 0;

      // Calculate level based on submission count (0-4 scale)
      let level = 0;
      if (points > 0) level = 1;
      if (points >= 3) level = 2;
      if (points >= 5) level = 3;
      if (points >= 10) level = 4;

      heatmap.push({
        date: dateStr,
        points,
        level
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return heatmap;
  };

  const getLevelColor = (level: number): string => {
    const colors = {
      0: '#2d2d30',  // Empty - dark surface
      1: '#1a4d2e',  // Level 1 - dark green
      2: '#26633d',  // Level 2 - medium green
      3: '#3a8552',  // Level 3 - bright green
      4: '#4ec9b0',  // Level 4 - brightest green (VS Code teal)
    };
    return colors[level as keyof typeof colors] || colors[0];
  };

  const renderHeatmap = () => {
    // Group by weeks (7 days each) - GitHub style
    const weeks: HeatmapDay[][] = [];
    let currentWeek: HeatmapDay[] = [];

    if (heatmapData.length === 0) {
      // Generate empty grid for the year
      const startDate = new Date(selectedYear, 0, 1);
      const endDate = new Date(selectedYear, 11, 31);
      const currentDate = new Date(startDate);

      // Add empty cells for alignment at the start
      const firstDayOfWeek = startDate.getDay();
      for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push({ date: '', points: 0, level: 0 });
      }

      while (currentDate <= endDate) {
        currentWeek.push({
          date: currentDate.toISOString().split('T')[0],
          points: 0,
          level: 0
        });
        if (currentWeek.length === 7) {
          weeks.push([...currentWeek]);
          currentWeek = [];
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push({ date: '', points: 0, level: 0 });
        }
        weeks.push(currentWeek);
      }
    } else {
      // Get first day's day of week to align properly (0 = Sunday)
      const firstDate = new Date(heatmapData[0].date);
      const firstDayOfWeek = firstDate.getDay();

      // Add empty cells for alignment at the start
      for (let i = 0; i < firstDayOfWeek; i++) {
        currentWeek.push({ date: '', points: 0, level: 0 });
      }

      heatmapData.forEach((day) => {
        currentWeek.push(day);
        if (currentWeek.length === 7) {
          weeks.push([...currentWeek]);
          currentWeek = [];
        }
      });

      // Add remaining days
      if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push({ date: '', points: 0, level: 0 });
        }
        weeks.push(currentWeek);
      }
    }

    // Calculate month positions for labels
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return (
      <div className="pb-4">
        {/* Year selector */}
        <div className="flex justify-end mb-4">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-1 rounded-md border border-dark-border bg-dark-surface text-dark-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-dark-accent-blue"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div className="bg-dark-bg rounded-lg p-4 overflow-x-auto">
          {/* Month labels */}
          <div className="flex text-xs text-dark-text-muted mb-2" style={{ paddingLeft: '32px' }}>
            {months.map((month, idx) => (
              <div
                key={idx}
                style={{ width: `${(weeks.length / 12) * 13}px` }}
                className="flex-shrink-0"
              >
                {month}
              </div>
            ))}
          </div>

          {/* Day labels and heatmap grid */}
          <div className="flex">
            {/* Day labels */}
            <div className="flex flex-col text-xs text-dark-text-muted pr-2" style={{ width: '28px' }}>
              <div style={{ height: '13px' }}></div>
              <div style={{ height: '13px', fontSize: '9px' }}>Mon</div>
              <div style={{ height: '13px' }}></div>
              <div style={{ height: '13px', fontSize: '9px' }}>Wed</div>
              <div style={{ height: '13px' }}></div>
              <div style={{ height: '13px', fontSize: '9px' }}>Fri</div>
              <div style={{ height: '13px' }}></div>
            </div>

            {/* Heatmap grid */}
            <div className="flex" style={{ gap: '3px' }}>
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col" style={{ gap: '3px' }}>
                  {week.map((day, dayIdx) => (
                    <div
                      key={`${weekIdx}-${dayIdx}`}
                      style={{
                        width: '10px',
                        height: '10px',
                        backgroundColor: day.date ? getLevelColor(day.level) : 'transparent',
                        borderRadius: '2px'
                      }}
                      className={day.date ? 'hover:ring-1 hover:ring-dark-border cursor-pointer' : ''}
                      title={day.date ? `${day.date}: ${day.points} submissions` : ''}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1 mt-4 text-xs text-dark-text-muted justify-end">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: getLevelColor(level),
                  borderRadius: '2px'
                }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dark-accent-blue"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <NavHeader />

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Card */}
            <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-6">
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-dark-accent-purple/20 flex items-center justify-center mb-4">
                  <User size={48} className="text-dark-accent-purple" />
                </div>
                <h2 className="text-2xl font-bold text-dark-text-primary mb-1">
                  {user?.username || 'User'}
                </h2>
                <p className="text-dark-text-secondary text-sm mb-4 flex items-center gap-2">
                  <Mail size={14} />
                  {user?.email}
                </p>
                <div className="flex items-center gap-2 text-sm text-dark-text-secondary">
                  <Calendar size={14} />
                  <span>Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Streak Card */}
            {profileSummary?.streak && (
              <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Flame size={24} className="text-dark-accent-orange" />
                  <h3 className="text-lg font-semibold text-dark-text-primary">Streak</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-bold text-dark-accent-orange">{profileSummary.streak.current_streak}</p>
                    <p className="text-sm text-dark-text-secondary">Current</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-dark-accent-green">{profileSummary.streak.longest_streak}</p>
                    <p className="text-sm text-dark-text-secondary">Longest</p>
                  </div>
                </div>
                {profileSummary.streak.last_activity_date && (
                  <p className="text-xs text-dark-text-muted mt-4">
                    Last active: {new Date(profileSummary.streak.last_activity_date).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Stats & Heatmap */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Grid */}
            {profileSummary?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Total Points card — scoring feature commented out
                <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Award size={20} className="text-dark-accent-yellow" />
                    <p className="text-sm text-dark-text-secondary">Total Points</p>
                  </div>
                  <p className="text-2xl font-bold text-dark-text-primary">{profileSummary.stats.total_points}</p>
                </div>
                */}

                {/* Quizzes Passed card — commented out (quiz/grading feature disabled)
                <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Target size={20} className="text-dark-accent-blue" />
                    <p className="text-sm text-dark-text-secondary">Quizzes Passed</p>
                  </div>
                  <p className="text-2xl font-bold text-dark-text-primary">{profileSummary.stats.quizzes_completed}</p>
                </div>
                */}

                <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Target size={20} className="text-dark-accent-green" />
                    <p className="text-sm text-dark-text-secondary">Exercises Done</p>
                  </div>
                  <p className="text-2xl font-bold text-dark-text-primary">{profileSummary.stats.exercises_completed}</p>
                </div>

                <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock size={20} className="text-dark-accent-purple" />
                    <p className="text-sm text-dark-text-secondary">Time Spent</p>
                  </div>
                  <p className="text-2xl font-bold text-dark-text-primary">
                    {profileSummary.stats.total_time_spent_hours.toFixed(1)}h
                  </p>
                </div>

                <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar size={20} className="text-dark-accent-blue" />
                    <p className="text-sm text-dark-text-secondary">Days Active</p>
                  </div>
                  <p className="text-2xl font-bold text-dark-text-primary">{profileSummary.stats.days_active}</p>
                </div>

                {/* Avg Quiz Score card — commented out (quiz/grading feature disabled)
                {profileSummary.stats.avg_quiz_score !== null && (
                  <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Award size={20} className="text-dark-accent-purple" />
                      <p className="text-sm text-dark-text-secondary">Avg Quiz Score</p>
                    </div>
                    <p className="text-2xl font-bold text-dark-text-primary">{profileSummary.stats.avg_quiz_score.toFixed(0)}%</p>
                  </div>
                )}
                */}
              </div>
            )}

            {/* Activity Heatmap */}
            <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-6">
              <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Activity Heatmap</h3>
              <p className="text-sm text-dark-text-secondary mb-4">
                Your learning activity over the past year
              </p>
              {renderHeatmap()}
            </div>

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="bg-dark-surface rounded-lg shadow-sm border border-dark-border p-6">
                <h3 className="text-lg font-semibold text-dark-text-primary mb-4">Recent Activity</h3>
                <div className="h-64 overflow-y-auto vscode-scrollbar space-y-3 pr-1">
                  {recentActivity.map((activity: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 pb-3 border-b border-dark-border last:border-0">
                      <div className="flex-shrink-0 mt-1">
                        {/* quiz_submission icon — commented out (quiz/grading feature disabled)
                        {activity.activity_type === 'quiz_submission' && (
                          <Target size={16} className="text-dark-accent-blue" />
                        )}
                        */}
                        {activity.activity_type === 'exercise_completed' && (
                          <Award size={16} className="text-dark-accent-green" />
                        )}
                        {activity.activity_type === 'exercise_attempted' && (
                          <Clock size={16} className="text-red-400" />
                        )}
                        {activity.activity_type === 'exercise_started' && (
                          <Clock size={16} className="text-dark-text-muted" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-dark-text-primary font-medium">
                          {/* quiz_submission label — commented out (quiz/grading feature disabled)
                          {activity.activity_type === 'quiz_submission' && 'Completed quiz'}
                          */}
                          {activity.activity_type === 'exercise_completed' && 'Submitted — passed'}
                          {activity.activity_type === 'exercise_attempted' && 'Submitted — failed'}
                          {activity.activity_type === 'exercise_started' && 'Started exercise'}
                        </p>
                        {activity.unit_slug && (
                          <p className="text-xs text-dark-text-secondary truncate">{activity.unit_slug}</p>
                        )}
                        {/* scoring feature commented out
                        {activity.points_earned > 0 && (
                          <p className="text-xs text-dark-accent-green mt-1">
                            +{activity.points_earned} points
                          </p>
                        )} */}
                      </div>
                      <div className="text-xs text-dark-text-muted whitespace-nowrap">
                        {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
