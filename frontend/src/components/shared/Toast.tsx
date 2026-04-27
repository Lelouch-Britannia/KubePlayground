import { useEffect } from 'react';
import { XCircle, Trophy, CheckCircle } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
  score?: number;
  total?: number;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  type,
  message,
  score,
  total,
  onClose,
  duration = 5000,
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const isPassing = score && total ? (score / total) * 100 >= 70 : type === 'success';
  const isInfo = type === 'info';
  const percentage = score && total ? Math.round((score / total) * 100) : null;

  return (
    <div className="fixed top-8 right-8 z-50 animate-slide-in-right">
      <div
        className={`rounded-lg shadow-2xl border-2 p-6 min-w-[400px] ${
          isInfo
            ? 'bg-gradient-to-br from-[#44475a] to-[#6272a4]/20 border-[#6272a4]'
            : isPassing
            ? 'bg-gradient-to-br from-[#44475a] to-[#50fa7b]/20 border-[#50fa7b]'
            : 'bg-gradient-to-br from-[#44475a] to-[#ff5555]/20 border-[#ff5555]'
        } backdrop-blur-sm`}
      >
        <div className="flex items-start gap-4">
          {/* Icon with animation */}
          <div
            className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center ${
              isInfo
                ? 'bg-[#6272a4]/30'
                : isPassing
                ? 'bg-[#50fa7b]/30 animate-bounce-once'
                : 'bg-[#ff5555]/30 animate-shake'
            }`}
          >
            {isInfo ? (
              <CheckCircle className="w-10 h-10 text-[#6272a4]" strokeWidth={2.5} />
            ) : isPassing ? (
              <Trophy className="w-10 h-10 text-[#50fa7b]" strokeWidth={2.5} />
            ) : (
              <XCircle className="w-10 h-10 text-[#ff5555]" strokeWidth={2.5} />
            )}
          </div>

          {/* Content */}
          <div className="flex-1">
            {!isInfo && (
              <h3
                className={`text-2xl font-bold mb-2 ${
                  isPassing ? 'text-[#50fa7b]' : 'text-[#ff5555]'
                }`}
              >
                {isPassing ? '🎉 Great Job!' : '😞 Keep Trying!'}
              </h3>
            )}
            <p className={`text-[#f8f8f2] mb-3 leading-relaxed ${isInfo ? 'text-base' : 'text-lg'}`}>{message}</p>

            {/* Score Display */}
            {percentage !== null && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[#6272a4] text-base">Your Score</span>
                  <span
                    className={`text-3xl font-bold font-mono ${
                      isPassing ? 'text-[#50fa7b]' : 'text-[#ff5555]'
                    }`}
                  >
                    {percentage}%
                  </span>
                </div>
                <div className="w-full bg-[#282a36] rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ease-out ${
                      isPassing ? 'bg-[#50fa7b]' : 'bg-[#ff5555]'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-sm text-[#6272a4]">
                  <span>
                    {score} / {total} correct
                  </span>
                  <span>{isPassing ? '✓ Passed' : '✗ Need 70% to pass'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-[#6272a4] hover:text-[#f8f8f2] transition-colors flex-shrink-0"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Custom animations */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes bounce-once {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.2);
          }
        }

        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-10px);
          }
          75% {
            transform: translateX(10px);
          }
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.5s ease-out;
        }

        .animate-bounce-once {
          animation: bounce-once 0.6s ease-out;
        }

        .animate-shake {
          animation: shake 0.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default Toast;
