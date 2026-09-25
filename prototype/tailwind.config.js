/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 中文正文优先用系统 UI 字体链
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB',
          'Source Han Sans SC', 'Noto Sans CJK SC', 'sans-serif',
        ],
        mono: ['Cascadia Code', 'Consolas', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
