/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {},
    screens: {
      'cw-1': { max: '371px', min: '327px' },
      'cw-2': { max: '359px', min: '300px' },
      'cw-3': { max: '327px', min: '300px' },
      'cw-4': { max: '370px', min: '300px' },
      'cw-5': { max: '700px', min: '500px'}
    },
  },
  plugins: [require('@tailwindcss/aspect-ratio')
,require('@tailwindcss/forms')
,require('@tailwindcss/line-clamp')
,require('@tailwindcss/typography')
],
};
