/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// The app is served from https://jamescosma.github.io/hunting-map/ so every
// asset URL must be prefixed with the repository name.
export default defineConfig({
  base: '/hunting-map/',
  build: {
    target: ['es2022', 'safari15'],
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
