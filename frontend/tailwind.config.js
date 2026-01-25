/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // VS Code Dark Modern Theme
        dark: {
          bg: '#1e1e1e',           // Editor background
          surface: '#252526',      // Sidebar/panels
          elevated: '#2d2d30',     // Elevated surfaces
          border: '#3c3c3c',       // Borders
          hover: '#2a2d2e',        // Hover states
          active: '#37373d',       // Active states
          text: {
            primary: '#d4d4d4',    // Primary text
            secondary: '#858585',  // Secondary text
            muted: '#6e7681',      // Muted text
          },
          accent: {
            blue: '#0078d4',       // VS Code blue
            green: '#4ec9b0',      // Teal/cyan
            purple: '#c586c0',     // Purple
            orange: '#ce9178',     // Orange strings
            yellow: '#dcdcaa',     // Function names
          }
        },
        // Modern Light Theme (inspired by GitHub Light)
        light: {
          bg: '#ffffff',           // Background
          surface: '#f6f8fa',      // Surface/panels
          elevated: '#ffffff',     // Elevated surfaces
          border: '#d0d7de',       // Borders
          hover: '#f3f4f6',        // Hover states
          active: '#e5e7eb',       // Active states
          text: {
            primary: '#1f2937',    // Primary text
            secondary: '#6b7280',  // Secondary text
            muted: '#9ca3af',      // Muted text
          },
          accent: {
            blue: '#0969da',       // GitHub blue
            green: '#1a7f37',      // Green
            purple: '#8250df',     // Purple
            orange: '#bc4c00',     // Orange
            yellow: '#9a6700',     // Yellow/gold
          }
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Cascadia Code',
          'Consolas',
          'Monaco',
          'Courier New',
          'monospace',
        ],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(0, 120, 212, 0.3)',
        'glow-green': '0 0 20px rgba(78, 201, 176, 0.3)',
      },
    },
  },
  plugins: [],
}
