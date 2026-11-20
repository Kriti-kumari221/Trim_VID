import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "https://trim-vid.onrender.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});

