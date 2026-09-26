/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont',
          '"SF Pro Display"', '"SF Pro Text"', 'PingFang SC',
          'Segoe UI',
          'Noto Sans SC', 'Microsoft YaHei',
        ],
        mono: [
          '"SF Mono"', 'Cascadia Code', 'Menlo',
          'Consolas',
        ],
      },
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          light: 'var(--accent-light)',
        },
        surface: {
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          tertiary: 'var(--surface-tertiary)',
          hover: 'var(--surface-hover)',
        },
        content: {
          primary: 'var(--content-primary)',
          secondary: 'var(--content-secondary)',
          muted: 'var(--content-muted)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
          hover: 'var(--border-hover)',
          strong: 'var(--border-strong)',
        },
      },
      spacing: {
        sidebar: '220px',
        outline: '200px',
      },
    },
  },
  plugins: [],
}
