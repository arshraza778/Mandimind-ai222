/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#26215C",
        purple: {
          DEFAULT: "#534AB7",
          light: "#EEEDFE",
        },
        teal: {
          DEFAULT: "#0F6E56",
          light: "#E1F5EE",
        },
        coral: {
          DEFAULT: "#C8472A",
          light: "#FAECE7",
        },
        amber: {
          DEFAULT: "#A8650A",
          light: "#FAEEDA",
        },
        forest: {
          DEFAULT: "#3B6D11",
          light: "#EAF3DE",
        },
        canvas: "#F5F4FA",
        borderline: "#E3E1EC",
        inktext: "#1F1D2B",
        muted: "#6B6880",
      },
      borderRadius: {
        'card': '14px',
        'card-lg': '16px',
      }
    },
  },
  plugins: [],
}
