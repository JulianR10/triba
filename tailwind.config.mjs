/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        triba: {
          red: "#E91A39",
          pink: "#FFCCE4",
          cream: "#FFF8EE",
          green: "#BCE85E",
          blue: "#3BACFF",
          white: "#FFFFFF",
          black: "#000000",
          brown: "#35220A",
          darkblue: "#1800AD",
          "light-cream": "#FDEDD5",
          bone: "#f2f1eb",
        },
      },
      fontFamily: {
        sans: ["Montserrat", "Helvetica", "Arial", "sans-serif"],
        heading: ["Bootzy TM", "Helvetica", "Arial", "sans-serif"],
        serif: ['"Times New Roman"', "Times", "serif"],
      },
      borderRadius: {
        button: "10px",
      },
      fontSize: {
        hero: "50px",
        "hero-mobile": "40px",
        section: "50px",
        "section-mobile": "40px",
        body: "30px",
        "body-mobile": "20px",
      },
    },
  },
  plugins: [],
};
