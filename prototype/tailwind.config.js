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
      /* 圆角只有一套：这里直接读 index.css 的 --radius-*。
         原来两边各有一套（Tailwind 默认的 4/6/8 和 CSS 里的 4/6/8），
         值刚好一样所以看不出来——改一套另一套不动，是最容易踩的坑。
         现在类名和变量是同一个数，语义见 index.css 里那段说明：
           rounded     4px  行内小东西（小标签、行内代码、勾选框）
           rounded-md  8px  可点的控件（按钮、输入框、树里的行、菜单项）
           rounded-lg 12px  浮起来 / 围起来的整块面（弹窗、菜单、代码块、图片） */
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: '9999px',
      },
      spacing: {
        sidebar: '220px',
        outline: '200px',
      },
    },
  },
  plugins: [],
}
