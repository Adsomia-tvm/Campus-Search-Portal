/**
 * Vitest global test setup.
 *
 * Sets environment variables needed by the app before any test imports run.
 * Tests use the real Express app but mock Prisma to avoid needing a real DB
 * in CI. For full integration tests with a real DB, set DATABASE_URL in .env.test.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-campus-search-2026';
process.env.STUDENT_JWT_SECRET = 'test-student-jwt-secret-2026';
