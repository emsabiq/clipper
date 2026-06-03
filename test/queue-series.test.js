import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.js";
import { ensureProjectDirs, writeJson } from "../src/storage.js";
import { selectNextVideo } from "../src/selector.js";

async function withTempData(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clipper-queue-series-"));
  const previous = {
    dataDir: config.dataDir,
    generatedDir: config.generatedDir,
    generatedVideoDir: config.generatedVideoDir,
    thumbnailDir: config.thumbnailDir,
    metadataDir: config.metadataDir,
    logDir: config.logDir
  };

  config.dataDir = path.join(root, "data");
  config.generatedDir = path.join(root, "generated");
  config.generatedVideoDir = path.join(config.generatedDir, "videos");
  config.thumbnailDir = path.join(config.generatedDir, "thumbnails");
  config.metadataDir = path.join(config.generatedDir, "metadata");
  config.logDir = path.join(config.generatedDir, "logs");

  try {
    await ensureProjectDirs();
    await writeJson("themes", [{ name: "podcast artis", status: "active" }]);
    await writeJson("prompts", [{ id: "prompt_1", theme: "podcast artis" }]);
    return await callback();
  } finally {
    Object.assign(config, previous);
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("scheduled series keeps the first link until it reaches three successes", async () => {
  await withTempData(async () => {
    await writeJson("videos", [
      {
        id: "video_1",
        url: "https://www.youtube.com/watch?v=11111111111",
        theme: "podcast artis",
        priority: 1,
        status: "failed",
        automation_series: true,
        series_target_count: 3,
        created_at: "2026-06-01T00:00:00.000Z"
      },
      {
        id: "video_2",
        url: "https://www.youtube.com/watch?v=22222222222",
        theme: "podcast artis",
        priority: 2,
        status: "queued",
        automation_series: true,
        series_target_count: 3,
        created_at: "2026-06-01T01:00:00.000Z"
      }
    ]);
    await writeJson("history", [
      {
        status: "published",
        queue_series: true,
        video_id: "video_1",
        source_url: "https://www.youtube.com/watch?v=11111111111"
      },
      {
        status: "published",
        queue_series: true,
        video_id: "video_1",
        source_url: "https://www.youtube.com/watch?v=11111111111"
      }
    ]);

    const selection = await selectNextVideo({ seriesMode: true, theme: "auto" });
    assert.equal(selection.video.id, "video_1");
    assert.equal(selection.video.series_success_count, 2);
  });
});

test("manual ad-hoc selection does not take automation series links", async () => {
  await withTempData(async () => {
    await writeJson("videos", [
      {
        id: "series_video",
        url: "https://www.youtube.com/watch?v=33333333333",
        theme: "podcast artis",
        priority: 1,
        status: "queued",
        automation_series: true,
        created_at: "2026-06-01T00:00:00.000Z"
      },
      {
        id: "manual_video",
        url: "https://www.youtube.com/watch?v=44444444444",
        theme: "podcast artis",
        priority: 10,
        status: "queued",
        automation_series: false,
        manual_run: true,
        created_at: "2026-06-01T01:00:00.000Z"
      }
    ]);
    await writeJson("history", []);

    const selection = await selectNextVideo({
      excludeAutomationSeries: true,
      preferredVideoIds: ["manual_video"],
      theme: "auto"
    });
    assert.equal(selection.video.id, "manual_video");
  });
});
