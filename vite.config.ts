import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Electronがfile://プロトコルでロードするため相対パスにする
  base: "./",
});
