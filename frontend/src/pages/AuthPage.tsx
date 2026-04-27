import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Eye, EyeOff, Mail, Lock, User, Loader2, AlertCircle, CheckCircle, Sun, Moon } from 'lucide-react';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const isDarkMode = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        setSuccess('Login successful! Redirecting...');
        setTimeout(() => navigate('/'), 1000);
      } else {
        await register(email, username, password);
        setSuccess('Account created! Redirecting...');
        setTimeout(() => navigate('/'), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setSuccess(null);
  };

  // Password validation for register
  const passwordRequirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasDigit: /\d/.test(password),
  };

  const isPasswordValid =
    mode === 'login' ||
    Object.values(passwordRequirements).every(Boolean);

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${
      isDarkMode
        ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
    }`}>
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className={`absolute top-4 right-4 p-3 rounded-xl backdrop-blur transition-colors z-50 ${
          isDarkMode
            ? 'bg-white/10 hover:bg-white/20'
            : 'bg-gray-900/10 hover:bg-gray-900/20'
        }`}
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <Sun className="w-5 h-5 text-white" />
        ) : (
          <Moon className="w-5 h-5 text-gray-700" />
        )}
      </button>

      {/* Background Pattern */}
      <div className={`absolute inset-0 bg-[url('/grid-pattern.svg')] ${isDarkMode ? 'opacity-5' : 'opacity-[0.02]'}`}></div>

      {/* Gradient Orbs */}
      <div className={`absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-500/10'}`}></div>
      <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl ${isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-500/10'}`}></div>

      {/* Auth Card */}
      <div className={`relative w-full max-w-4xl backdrop-blur-xl rounded-3xl shadow-2xl border overflow-hidden ${
        isDarkMode
          ? 'bg-white/5 border-white/10'
          : 'bg-white/80 border-gray-200'
      }`}>
        <div className="flex flex-col md:flex-row min-h-[600px]">

          {/* Left Panel - Welcome */}
          <div className="md:w-5/12 bg-gradient-to-br from-blue-600 via-blue-700 to-emerald-600 p-8 md:p-12 flex flex-col justify-center relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute -top-20 -left-20 w-40 h-40 bg-white/10 rounded-full"></div>
            <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-white/10 rounded-full"></div>
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/5 rounded-full"></div>

            {/* Logo */}
            <div className="relative z-10 mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.5L18.5 7 12 9.5 5.5 7 12 4.5zM4 8.5l7 3.5v7l-7-3.5v-7zm9 10.5v-7l7-3.5v7l-7 3.5z"/>
                  </svg>
                </div>
                <span className="text-white text-2xl font-bold tracking-tight">KubePlayground</span>
              </div>
            </div>

            {/* Welcome Message */}
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {mode === 'login' ? 'Welcome Back!' : 'Join Us!'}
              </h2>
              <p className="text-blue-100 text-lg mb-8 leading-relaxed">
                {mode === 'login'
                  ? 'Master Kubernetes through hands-on exercises and interactive learning paths.'
                  : 'Start your journey to becoming a Kubernetes expert with interactive tutorials.'}
              </p>

              {/* Feature Pills */}
              <div className="flex flex-wrap gap-2">
                {/* quiz/grading feature commented out
                <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white text-sm">
                  🎯 Interactive Quizzes
                </span>
                */}
                <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white text-sm">
                  💻 Live Code Editor
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-white text-sm">
                  📊 Track Progress
                </span>
              </div>
            </div>

            {/* Switch Mode */}
            <div className="relative z-10 mt-auto pt-8">
              <p className="text-blue-100 mb-3">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </p>
              <button
                onClick={toggleMode}
                className="px-6 py-3 border-2 border-white/30 rounded-xl text-white font-semibold hover:bg-white/10 transition-all duration-200"
              >
                {mode === 'login' ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </div>

          {/* Right Panel - Form */}
          <div className={`md:w-7/12 p-8 md:p-12 flex flex-col justify-center ${
            isDarkMode ? 'bg-slate-900/80' : 'bg-white'
          }`}>
            <h3 className={`text-2xl md:text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </h3>
            <p className={`mb-8 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              {mode === 'login'
                ? 'Enter your credentials to access your account'
                : 'Fill in your details to get started'}
            </p>

            {/* Error Message */}
            {error && (
              <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                isDarkMode
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                  : 'bg-red-50 border border-red-200 text-red-600'
              }`}>
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                isDarkMode
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
              }`}>
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className={`w-full pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      isDarkMode
                        ? 'bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>

              {/* Username Field (Register only) */}
              {mode === 'register' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Username
                  </label>
                  <div className="relative">
                    <User className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="johndoe"
                      required
                      minLength={3}
                      maxLength={50}
                      className={`w-full pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        isDarkMode
                          ? 'bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Password Field */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Password
                </label>
                <div className="relative">
                  <Lock className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className={`w-full pl-12 pr-12 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      isDarkMode
                        ? 'bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                      isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements (Register only) */}
              {mode === 'register' && password && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className={`flex items-center gap-2 ${passwordRequirements.minLength ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-slate-500' : 'text-gray-400')}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordRequirements.minLength ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500') : (isDarkMode ? 'bg-slate-600' : 'bg-gray-300')}`}></div>
                    8+ characters
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRequirements.hasUppercase ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-slate-500' : 'text-gray-400')}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordRequirements.hasUppercase ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500') : (isDarkMode ? 'bg-slate-600' : 'bg-gray-300')}`}></div>
                    Uppercase letter
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRequirements.hasLowercase ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-slate-500' : 'text-gray-400')}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordRequirements.hasLowercase ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500') : (isDarkMode ? 'bg-slate-600' : 'bg-gray-300')}`}></div>
                    Lowercase letter
                  </div>
                  <div className={`flex items-center gap-2 ${passwordRequirements.hasDigit ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-slate-500' : 'text-gray-400')}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordRequirements.hasDigit ? (isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500') : (isDarkMode ? 'bg-slate-600' : 'bg-gray-300')}`}></div>
                    Number
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || (mode === 'register' && !isPasswordValid)}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-lg shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                  </>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
