/** ZEBL palette: sky blue and white. Token names are kept from the first theme so existing components inherit the new look. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#176273', muted: '#718096', canvas: '#EAF9FB', line: 'rgba(32,166,181,.18)',
        sky: { DEFAULT: '#20A6B5', cyan: '#48C4D0', light: '#BCEEF1', aqua: '#EAF9FB' },
        aubergine: '#176273', plum: '#20A6B5',
        wine: { DEFAULT: '#20A6B5', dark: '#157F8D', soft: '#DDF4F6' },
        rose: '#48C4D0', amber: { DEFAULT: '#E6A23C', soft: '#FDF3E1', text: '#946000' },
        ok: { DEFAULT: '#0F8A73', soft: '#E1F5F0' }, bad: { DEFAULT: '#C24B4B', soft: '#FCE9E9' },
      },
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'Consolas', 'monospace'] },
      boxShadow: { card: '0 14px 32px -18px rgba(23,98,115,.28), inset 0 1px 0 rgba(255,255,255,.9)', float: '0 40px 80px -30px rgba(23,98,115,.45), 0 10px 26px -12px rgba(23,98,115,.18)' },
    },
  },
}
