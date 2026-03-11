export async function register() {
  // Only run cron jobs in the NodeJS runtime (not Edge/Browser)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initCron } = await import('@/lib/cron');
    initCron();
  }
}