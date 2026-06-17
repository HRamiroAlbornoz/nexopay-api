import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
      JWT_SECRET: 'test-secret-key-para-vitest-de-al-menos-32-chars',
      JWT_EXPIRES_IN: '7d',
      GEMINI_API_KEY: 'test-gemini-key-no-es-real',
      GOOGLE_CLIENT_ID: 'test-google-client-id-no-es-real',
    },
  },
});
