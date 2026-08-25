import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * There was no Vite config here at all until now.
 *
 * Two consequences, both fixed by this file existing:
 *
 * - **`@vitejs/plugin-react` was installed but never applied.** Vite compiles
 *   JSX without it, so the app built fine and nothing looked broken — what was
 *   missing was React Fast Refresh, which is why editing a component reloaded
 *   the whole page and dropped whatever state you were mid-way through.
 * - **Vite looked for `.env` beside package.json**, so config lived in
 *   `frontend/trevora-web/.env` while the backend read its own copy elsewhere.
 *   `envDir` now points both at the same file.
 */
export default defineConfig({
  plugins: [react()],
  // One .env at the repository root, shared with the backend. Only VITE_*
  // variables are exposed to browser code; everything else in that file stays
  // server-side, which is what makes it safe to keep the database password and
  // the OpenAI key in the same file the frontend reads.
  envDir: '../..',
  server: {
    port: 5173,
  },
});
