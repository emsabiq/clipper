export const DEFAULT_QUEUE_SERIES_TARGET_COUNT = 3;
export const DEFAULT_AUTOMATION_QUEUE_LINK_LIMIT = 5;
export const DEFAULT_SCHEDULED_CLIPS_PER_RUN = 1;

function numberEnv(name, fallback, min = 0, max = 1000) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function queueSeriesTarget(video = {}) {
  const configured = Number(video.series_target_count);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return numberEnv("QUEUE_SERIES_TARGET_COUNT", DEFAULT_QUEUE_SERIES_TARGET_COUNT, 1, 20);
}

export function automationQueueLinkLimit() {
  return numberEnv("AUTOMATION_QUEUE_LINK_LIMIT", DEFAULT_AUTOMATION_QUEUE_LINK_LIMIT, 1, 50);
}

export function scheduledClipsPerRun() {
  return numberEnv("SCHEDULED_CLIPS_PER_RUN", DEFAULT_SCHEDULED_CLIPS_PER_RUN, 1, 10);
}

export function isAutomationSeriesVideo(video = {}) {
  return video.manual_run !== true && video.automation_series !== false;
}

export function storedQueueSeriesSuccessCount(video = {}) {
  const value = Number(video.series_success_count || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function queueSeriesRemaining(video = {}, successCount = storedQueueSeriesSuccessCount(video)) {
  return Math.max(0, queueSeriesTarget(video) - successCount);
}

export function isQueueSeriesComplete(video = {}, successCount = storedQueueSeriesSuccessCount(video)) {
  return queueSeriesRemaining(video, successCount) <= 0;
}
