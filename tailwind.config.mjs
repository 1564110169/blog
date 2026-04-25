import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        sakura: {
          50: '#fff7fb',
          100: '#ffe9f3',
          200: '#ffc9df',
          300: '#ff9ec4',
          400: '#fb6fa5',
          500: '#ed4d8c'
        },
        yume: {
          50: '#f8f5ff',
          100: '#eee8ff',
          200: '#dacfff',
          300: '#bea9ff',
          400: '#9e7bff',
          500: '#7c52e6'
        },
        ink: {
          900: '#181725',
          950: '#0d0c14'
        }
      },
      boxShadow: {
        soft: '0 18px 60px rgba(122, 92, 188, 0.16)',
        glow: '0 0 48px rgba(255, 158, 196, 0.36)'
      },
      borderRadius: {
        card: '0.5rem'
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif'
        ],
        display: [
          'Nunito',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif'
        ]
      },
      backgroundImage: {
        'mesh-light':
          'linear-gradient(135deg, rgba(255, 247, 251, 0.96) 0%, rgba(248, 245, 255, 0.94) 48%, rgba(246, 251, 255, 0.98) 100%), linear-gradient(115deg, transparent 0%, transparent 58%, rgba(255, 201, 223, 0.22) 58%, rgba(255, 201, 223, 0.22) 72%, transparent 72%)',
        'mesh-dark':
          'linear-gradient(135deg, #181725 0%, #111827 52%, #0d0c14 100%), linear-gradient(115deg, transparent 0%, transparent 55%, rgba(237, 77, 140, 0.12) 55%, rgba(124, 82, 230, 0.16) 74%, transparent 74%)'
      }
    }
  },
  plugins: [typography]
};
