/**
 * Global Environment Loader
 * Safely loads .env variables across local dev, testing, and production runtimes.
 * If .env does not exist (e.g. injected in container/CI), fails silently.
 */
try {
  (process as any).loadEnvFile?.();
} catch {
  // Ignored if .env file is absent or env vars are already injected
}

