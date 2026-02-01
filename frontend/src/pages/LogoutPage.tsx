import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, CheckCircle } from 'lucide-react';

export default function LogoutPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Perform logout
    logout();

    // Countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/auth');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [logout, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white dark:bg-dark-bg transition-colors">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Logout Card */}
      <div className="relative z-10 text-center max-w-md w-full">
        {/* Success Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-blue-100 dark:bg-blue-500/20 rounded-full flex items-center justify-center">
              <LogOut className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Thank You!
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
          You have been successfully logged out.
        </p>
        <p className="text-gray-500 dark:text-gray-500 mb-8">
          We hope to see you again soon on your Kubernetes learning journey!
        </p>

        {/* Countdown */}
        <div className="mb-8">
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
            Redirecting to login page in
          </p>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-dark-surface border-2 border-gray-200 dark:border-dark-border">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{countdown}</span>
          </div>
        </div>

        {/* Manual redirect button */}
        <button
          onClick={() => navigate('/auth')}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 rounded-xl text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200"
        >
          Go to Login Now
        </button>

        {/* Footer */}
        <div className="mt-12 flex items-center justify-center gap-2 text-gray-400 dark:text-gray-600">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
            </svg>
          </div>
          <span className="text-sm font-medium">KubePlayground</span>
        </div>
      </div>
    </div>
  );
}
