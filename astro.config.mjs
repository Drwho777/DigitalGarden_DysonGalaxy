// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

import tailwindcss from '@tailwindcss/vite';

/**
 * @param {string} id
 * @param {string} packageName
 */
function isPackageModule(id, packageName) {
  return (
    id.includes(`/node_modules/${packageName}/`) ||
    id.includes(`\\node_modules\\${packageName}\\`)
  );
}

/**
 * @param {string} id
 */
function manualChunks(id) {
  if (isPackageModule(id, 'three')) {
    return 'vendor-three';
  }

  if (isPackageModule(id, 'gsap')) {
    return 'vendor-gsap';
  }

  return undefined;
}

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    plugins: [tailwindcss()],
  },
});
