import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const DEFAULT_TTS_MODEL = "aura-2-amalthea-en";
const DEFAULT_TTS_SPEED = 1.35;
const DEFAULT_TTS_TIMEOUT_MS = 45000;
const MAX_DEEPGRAM_TTS_CHARS = 2000;
const INDONESIAN_NUMBER_WORDS = [
  "nol",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh"
];

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function firstEnv(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return fallback;
}

function listEnv(...names) {
  const values = [];
  for (const name of names) {
    const raw = process.env[name] || "";
    values.push(...raw.split(/[\n,;]+/).map(cleanText).filter(Boolean));
  }
  return [...new Set(values)];
}

export function deepgramTtsConfig() {
  const apiKeys = cleanText(process.env.DEEPGRAM_TTS_API_KEYS)
    ? listEnv("DEEPGRAM_TTS_API_KEYS")
    : listEnv("DEEPGRAM_TTS_API_KEY", "DEEPGRAM_API_KEYS", "DEEPGRAM_API_KEY");
  return {
    enabled: boolEnv("THUMBNAIL_TTS_ENABLED", true),
    apiKey: apiKeys[0] || config.deepgram.apiKey || "",
    apiKeys,
    model: cleanText(process.env.DEEPGRAM_TTS_MODEL || DEFAULT_TTS_MODEL),
    speed: clampNumber(numberEnv("DEEPGRAM_TTS_SPEED", DEFAULT_TTS_SPEED), 0.7, 1.5),
    timeoutMs: Math.max(5000, numberEnv("DEEPGRAM_TTS_TIMEOUT_SECONDS", DEFAULT_TTS_TIMEOUT_MS / 1000) * 1000),
    encoding: cleanText(process.env.DEEPGRAM_TTS_ENCODING || ""),
    container: cleanText(process.env.DEEPGRAM_TTS_CONTAINER || ""),
    sampleRate: cleanText(process.env.DEEPGRAM_TTS_SAMPLE_RATE || ""),
    bitRate: cleanText(process.env.DEEPGRAM_TTS_BIT_RATE || ""),
    mipOptOut: boolEnv("DEEPGRAM_TTS_MIP_OPT_OUT", false),
    textPrefix: cleanText(firstEnv(["THUMBNAIL_TTS_TEXT_PREFIX"], "")),
    accentProfile: cleanText(process.env.DEEPGRAM_TTS_ACCENT_PROFILE || "id").toLowerCase(),
    maxChars: Math.min(MAX_DEEPGRAM_TTS_CHARS, Math.max(20, numberEnv("THUMBNAIL_TTS_MAX_CHARS", 220)))
  };
}

export function buildThumbnailSpeechText(value, options = {}) {
  const settings = deepgramTtsConfig();
  const maxChars = Number(options.maxChars || settings.maxChars || 220);
  let text = cleanText(value)
    .replace(/[`*_#"'“”‘’]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[|/\\]+/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

  if (!text) text = "Bagian ini bikin penasaran.";

  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const upperLetters = letters.replace(/[^A-ZÀ-Þ]/g, "");
  if (letters.length >= 6 && upperLetters.length / letters.length > 0.82) {
    text = text.toLocaleLowerCase("id-ID");
    text = text.charAt(0).toLocaleUpperCase("id-ID") + text.slice(1);
  }

  text = truncateSpeechText(text, maxChars);
  if ((options.accentProfile || settings.accentProfile) === "id") {
    text = applyIndonesianAccentHints(text);
  }
  text = text.replace(/\?{2,}/g, "?").replace(/!{2,}/g, "!");
  if (!/[.!?]$/.test(text)) text += ".";

  const prefix = cleanText(options.prefix ?? settings.textPrefix);
  return prefix ? `${prefix} ${text}` : text;
}

function applyIndonesianAccentHints(value) {
  let text = cleanText(value)
    .replace(/&/g, " dan ")
    .replace(/\bdr\b/gi, "dari")
    .replace(/\byg\b/gi, "yang")
    .replace(/\bdgn\b/gi, "dengan")
    .replace(/\bbgt\b/gi, "banget")
    .replace(/\bgue coba\b/gi, "coba")
    .replace(/\bgua coba\b/gi, "coba")
    .replace(/\bgk\b/gi, "nggak")
    .replace(/\bga\b/gi, "nggak")
    .replace(/\bgak\b/gi, "nggak")
    .replace(/\bngga\b/gi, "nggak")
    .replace(/\bnggak\b/gi, "enggak")
    .replace(/\bgue\b/gi, "aku")
    .replace(/\bgua\b/gi, "aku")
    .replace(/\blo\b/gi, "kamu")
    .replace(/\bloe\b/gi, "kamu");

  text = text.replace(/\b([0-9]|10)\b/g, (match) => INDONESIAN_NUMBER_WORDS[Number(match)] || match);
  return addSpeechPacing(cleanText(text));
}

function truncateSpeechText(value, maxChars) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  return sliced.replace(/\s+\S*$/, "").trim() || sliced.trim();
}

function addSpeechPacing(value) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  if (words.length < 7 || /[,;:]/.test(value)) return value;
  const splitAt = Math.min(6, Math.max(3, Math.ceil(words.length / 2)));
  return `${words.slice(0, splitAt).join(" ")}, ${words.slice(splitAt).join(" ")}`;
}

export async function synthesizeDeepgramSpeech(options = {}) {
  const settings = deepgramTtsConfig();
  const text = cleanText(options.text);
  const apiKey = cleanText(options.apiKey || settings.apiKey);
  if (!apiKey) throw new Error("DEEPGRAM_TTS_API_KEY / DEEPGRAM_API_KEYS belum diisi.");
  if (!text) throw new Error("Teks TTS kosong.");

  const url = new URL("https://api.deepgram.com/v1/speak");
  url.searchParams.set("model", cleanText(options.model || settings.model || DEFAULT_TTS_MODEL));
  url.searchParams.set("speed", String(clampNumber(Number(options.speed || settings.speed), 0.7, 1.5)));
  if (settings.encoding) url.searchParams.set("encoding", settings.encoding);
  if (settings.container) url.searchParams.set("container", settings.container);
  if (settings.sampleRate) url.searchParams.set("sample_rate", settings.sampleRate);
  if (settings.bitRate) url.searchParams.set("bit_rate", settings.bitRate);
  if (settings.mipOptOut) url.searchParams.set("mip_opt_out", "true");
  if (options.tag || process.env.DEEPGRAM_TTS_TAG) {
    url.searchParams.set("tag", cleanText(options.tag || process.env.DEEPGRAM_TTS_TAG));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || settings.timeoutMs));
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg, audio/*, application/json"
      },
      body: JSON.stringify({ text: text.slice(0, MAX_DEEPGRAM_TTS_CHARS) }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Deepgram TTS gagal (${response.status}): ${detail.slice(0, 400)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) throw new Error("Deepgram TTS mengembalikan audio kosong.");

    return {
      buffer,
      mimeType: response.headers.get("content-type") || "audio/mpeg",
      model: response.headers.get("dg-model-name") || url.searchParams.get("model"),
      speed: response.headers.get("dg-speed-used") || url.searchParams.get("speed"),
      requestId: response.headers.get("dg-request-id") || "",
      charCount: Number(response.headers.get("dg-char-count") || text.length)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Deepgram TTS timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateThumbnailSpeech({ job, text }) {
  const settings = deepgramTtsConfig();
  if (!settings.enabled) return null;

  const speechText = buildThumbnailSpeechText(text);
  const speech = await synthesizeDeepgramSpeech({
    text: speechText,
    model: settings.model,
    speed: settings.speed,
    tag: "thumbnail-intro"
  });

  const audioDir = path.join(config.generatedDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const filename = `${job.job_id}-thumbnail-tts.mp3`;
  const outputPath = path.join(audioDir, filename);
  await fs.writeFile(outputPath, speech.buffer);

  return {
    path: outputPath,
    filename,
    text: speechText,
    model: speech.model,
    speed: speech.speed,
    requestId: speech.requestId,
    charCount: speech.charCount,
    mimeType: speech.mimeType
  };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
