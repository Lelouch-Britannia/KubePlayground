import { useEffect, useState } from 'react';
import UserBanner from '../components/Dashboard/UserBanner';
import TopicCard from '../components/Dashboard/TopicCard';
import { BookOpen, CheckCircle2, Clock, Target } from 'lucide-react';
import { apiClient } from '../services/api';
import type { DashboardData } from '../types/api';

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getDashboard();
      setDashboardData(data as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    // Navigate to first unit in topic
    const topicData = dashboardData?.topics.find(t => t.topic === topic);
    if (topicData && topicData.units.length > 0) {
      window.location.href = `/unit/${topicData.units[0].slug}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#282a36] flex items-center justify-center">
        <div className="text-[#f8f8f2] text-2xl">Loading your dashboard...</div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="min-h-screen bg-[#282a36] flex items-center justify-center">
        <div className="text-[#ff5555] text-2xl">Error: {error || 'No data available'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#282a36] text-[#f8f8f2]">
      {/* Container */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* User Banner */}
        <UserBanner 
          userName="Mayank"
          streak={dashboardData.current_streak}
        />
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#44475a] border border-[#6272a4] rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#50fa7b]/20 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-[#50fa7b]" />
              </div>
              <div>
                <p className="text-base text-[#6272a4]">Total Units</p>
                <p className="text-3xl font-bold text-[#50fa7b]">{dashboardData.total_units}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#44475a] border border-[#6272a4] rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#f1fa8c]/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-[#f1fa8c]" />
              </div>
              <div>
                <p className="text-base text-[#6272a4]">Completed</p>
                <p className="text-3xl font-bold text-[#f1fa8c]">{dashboardData.completed_count}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#44475a] border border-[#6272a4] rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#8be9fd]/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#8be9fd]" />
              </div>
              <div>
                <p className="text-base text-[#6272a4]">In Progress</p>
                <p className="text-3xl font-bold text-[#8be9fd]">{dashboardData.in_progress_count}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-[#44475a] border border-[#6272a4] rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#6272a4]/20 flex items-center justify-center">
                <Target className="w-6 h-6 text-[#6272a4]" />
              </div>
              <div>
                <p className="text-base text-[#6272a4]">Not Started</p>
                <p className="text-3xl font-bold text-[#6272a4]">
                  {dashboardData.total_units - dashboardData.completed_count - dashboardData.in_progress_count}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Topics Section */}
        <div>
          <h2 className="text-3xl font-bold mb-6 text-[#ff79c6]">Learning Paths</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dashboardData.topics.map((topic) => (
              <TopicCard
                key={topic.topic}
                topic={topic.topic}
                totalUnits={topic.total_units}
                completedUnits={topic.completed_units}
                inProgressUnits={topic.in_progress_units}
                completionPercentage={topic.completion_percentage}
                onClick={() => handleTopicClick(topic.topic)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
