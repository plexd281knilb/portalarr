import { performSync } from "@/app/data";

// Prevent multiple instances in development
let isCronRunning = false;

export function initCron() {
  if (isCronRunning) return;
  isCronRunning = true;

  console.log("Initializing Job Scheduler...");

  // --- JOB 1: TAUTULLI SYNC ---
  const runSyncJob = async () => {
    console.log("Cron: Starting Tautulli Sync...");
    try {
      await performSync();
      console.log("Cron: Sync Complete.");
    } catch (e) {
      console.error("Cron: Sync Failed", e);
    }
  };

  // Run immediately on server start
  runSyncJob();

  // Schedule for every 60 minutes
  setInterval(runSyncJob, 1000 * 60 * 60);
}