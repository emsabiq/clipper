import { readJson, writeJson } from "./storage.js";
import { todayDate } from "./job-id.js";
import { isAutomationSeriesVideo, queueSeriesTarget, storedQueueSeriesSuccessCount } from "./queue-policy.js";

function videoKeys(entry = {}) {
  return [
    entry.source_youtube_video_id,
    entry.youtube_video_id,
    entry.source_url,
    entry.url,
    entry.final_video_hash,
    entry.instagram_media_id
  ].filter(Boolean);
}

function entryMatchesVideo(entry = {}, video = {}) {
  const targetKeys = new Set(videoKeys(video));
  if (!targetKeys.size) return false;
  return videoKeys(entry).some((key) => targetKeys.has(key))
    || Boolean(video.id && entry.video_id === video.id);
}

export async function hasProcessedVideo(video, options = {}) {
  if (options.allowQueueSeriesRepeat === true) return false;

  const history = await readJson("history", []);
  const targetKeys = new Set(videoKeys(video));
  if (!targetKeys.size) return false;
  return history.some((entry) => {
    if (!["published", "ready_to_publish", "clipper_done"].includes(entry.status)) return false;
    return entryMatchesVideo(entry, video);
  });
}

export async function hasPublishedToday(date = todayDate()) {
  const history = await readJson("history", []);
  return history.some((entry) => entry.status === "published" && entry.publish_date === date);
}

export async function publishedCountToday(date = todayDate()) {
  const history = await readJson("history", []);
  return history.filter((entry) => entry.status === "published" && entry.publish_date === date).length;
}

export async function youtubePublishedCountToday(date = todayDate()) {
  const history = await readJson("history", []);
  const ids = new Set();
  for (const entry of history) {
    if (entry.status !== "published") continue;
    if (entryDate(entry) !== date) continue;
    if (!entry.youtube_url && !entry.youtube_video_id) continue;
    ids.add(entry.youtube_url || entry.youtube_video_id);
  }
  return ids.size;
}

export async function queueSeriesPublishedCount(video) {
  if (!isAutomationSeriesVideo(video)) return 0;
  const history = await readJson("history", []);
  return history.filter((entry) => {
    if (entry.status !== "published") return false;
    if (entry.queue_series !== true) return false;
    return entryMatchesVideo(entry, video);
  }).length;
}

export async function queueSeriesSuccessCount(video) {
  const stored = storedQueueSeriesSuccessCount(video);
  const fromHistory = await queueSeriesPublishedCount(video);
  return Math.min(queueSeriesTarget(video), Math.max(stored, fromHistory));
}

export async function appendHistory(entry) {
  const history = await readJson("history", []);
  history.push({
    ...entry,
    recorded_at: new Date().toISOString()
  });
  await writeJson("history", history.slice(-500));
}

function entryDate(entry = {}) {
  return cleanDate(entry.publish_date) || dateKey(entry.published_at || entry.recorded_at || entry.created_at);
}

function cleanDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateKey(value) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return todayDateFromDate(parsed);
}

function todayDateFromDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
