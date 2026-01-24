interface UserBannerProps {
  userName?: string;
  streak?: number;
}

export default function UserBanner({ userName = 'User', streak = 0 }: UserBannerProps) {
  return (
    <div className="bg-gradient-to-r from-[#44475a] to-[#6272a4] border border-[#bd93f9] rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* User Avatar */}
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              Ah Mayank! You're back! Ready to write some code?
            </h1>
            <p className="text-slate-400">
              Continue your Kubernetes learning journey
            </p>
          </div>
        </div>

        {/* Streak Display */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
              <div>
                <p className="text-sm text-slate-400">Current streak</p>
                <p className="text-3xl font-bold text-white">{streak}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
