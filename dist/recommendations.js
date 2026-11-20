import { moods } from "./moods.js?v=2";
import { catalog, poems } from "./recommendation-data.js?v=2";
import { compounds } from "./compound.js";

const themes = {
  happy: { artists: [["Earth, Wind & Fire", "فانک"], ["Daft Punk", "دنس"], ["Googoosh", "پاپ فارسی"], ["Florence + the Machine", "ایندی راک"], ["Hiatus Kaiyote", "نئو سول"], ["Stromae", "پاپ فرانسوی"]], poems: ["joy", "moment"] },
  sad: { artists: [["Ludovico Einaudi", "پیانوی آرام"], ["Max Richter", "موسیقی تأملی"], ["Homayoun Shajarian", "آواز ایرانی"], ["Portishead", "تریپ‌هاپ"], ["Ólafur Arnalds", "نئوکلاسیک"], ["SE SO NEON", "ایندی کره‌ای"]], poems: ["hope", "pause"] },
  angry: { artists: [["The Prodigy", "الکترونیک پرانرژی"], ["Tycho", "ریتم ملایم"], ["Kavinsky", "سینث‌ویو"], ["Massive Attack", "تریپ‌هاپ"], ["Kiosk", "راک فارسی"], ["Stromae", "پاپ الکترونیک"]], poems: ["pause", "moment"] },
  neutral: { artists: [["Tycho", "الکترونیک ملایم"], ["Marconi Union", "امبینت"], ["Khruangbin", "فانک روان‌گردان"], ["Nujabes", "هیپ‌هاپ جَز"], ["Yosi Horikawa", "الکترونیک تجربی"], ["Kayhan Kalhor", "موسیقی ایرانی"]], poems: ["moment", "wonder"] },
  surprised: { artists: [["The xx", "ایندی"], ["Daft Punk", "دنس"], ["M83", "سینث‌پاپ"], ["Niyaz", "الکترونیک شرقی"], ["Ibeyi", "سول تجربی"], ["Florence + the Machine", "ایندی راک"]], poems: ["wonder", "joy"] },
  fearful: { artists: [["Ludovico Einaudi", "پیانو"], ["Marconi Union", "امبینت"], ["Ryuichi Sakamoto", "موسیقی بی‌کلام"], ["Kayhan Kalhor", "کمانچه"], ["Ólafur Arnalds", "امبینت نئوکلاسیک"], ["Ibeyi", "سول تجربی"]], poems: ["hope", "pause"] },
  disgusted: { artists: [["Gorillaz", "آلترناتیو"], ["The xx", "ایندی"], ["Kiosk", "راک فارسی"], ["Portishead", "تریپ‌هاپ"], ["SE SO NEON", "ایندی کره‌ای"], ["Khruangbin", "فانک روان‌گردان"]], poems: ["wonder", "moment"] },
  contempt: { artists: [["Gorillaz", "آلترناتیو"], ["Tycho", "الکترونیک ملایم"], ["Kavinsky", "سینث‌ویو"], ["Nujabes", "هیپ‌هاپ جَز"], ["Hiatus Kaiyote", "نئو سول"], ["Massive Attack", "تریپ‌هاپ"]], poems: ["wonder", "moment"] },
  tired: { artists: [["Marconi Union", "امبینت"], ["Ludovico Einaudi", "پیانوی آرام"], ["Ryuichi Sakamoto", "موسیقی بی‌کلام"], ["Yosi Horikawa", "الکترونیک خلوت"], ["Kayhan Kalhor", "کمانچه"], ["Ólafur Arnalds", "نئوکلاسیک"]], poems: ["pause", "hope"] },
};

const lastTracks = new Map();
const lastComments = new Map();
const liveTracks = new Map();
const liveVerses = new Map();
let pending;

async function readJSON(url) {
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error("Catalog unavailable");
  return response.json();
}

async function fetchArtist(artist) {
  const params = new URLSearchParams({ term: artist, country: "US", entity: "song", attribute: "artistTerm", limit: "20" });
  const data = await readJSON("https://itunes.apple.com/search?" + params);
  const tracks = data.results.flatMap((item) => {
    if (item.artistName?.toLowerCase() !== artist.toLowerCase() || item.trackExplicitness === "explicit") return [];
    if (typeof item.trackName !== "string" || typeof item.trackViewUrl !== "string") return [];
    const url = new URL(item.trackViewUrl);
    if (url.origin !== "https://music.apple.com" || !/^\d+$/.test(url.searchParams.get("i") ?? "")) return [];
    url.search = new URLSearchParams({ i: url.searchParams.get("i") }).toString();
    return [{ title: item.trackName, artist, url: url.href }];
  });
  if (tracks.length) liveTracks.set(artist, tracks);
  return tracks.length > 0;
}

async function fetchPoem([id, poem]) {
  const data = await readJSON("https://cdn.jsdelivr.net/gh/ganjoor/ganjoor-data@main/poets/" + poem.path + ".json");
  if (data.FullUrl !== "/" + poem.path || !Array.isArray(data.Verses)) return false;
  liveVerses.set(id, data.Verses);
  return true;
}

export function loadRecommendations() {
  // Use the same set of public requests for every mood, without including a result or frame.
  pending ??= Promise.allSettled([
    ...Object.keys(catalog).map((name) => ({ name, order: Math.random() }))
      .sort((a, b) => a.order - b.order).slice(0, 12).map(({ name }) => fetchArtist(name)),
    ...Object.entries(poems).map(fetchPoem),
  ]).then(() => ({
    music: liveTracks.size > 0,
    poems: liveVerses.size > 0,
  }));
  return pending;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

const trackKey = ({ artist, title }) => (artist + "/" + title).toLowerCase();

function trackPool(mood) {
  const pool = [
    ...moods[mood].tracks.map((track) => ({ ...track, performer: track.artist })),
    ...themes[mood].artists.flatMap(([artist, style]) =>
      [...catalog[artist], ...(liveTracks.get(artist) ?? [])].map((track) => ({ ...track, performer: artist, style }))),
  ];
  return [...new Map(pool.map((track) => [trackKey(track), track])).values()];
}

function chooseTrack(pool, previous, chosen) {
  const available = pool.filter((track) => !chosen.some((item) =>
    item.url === track.url || item.performer === track.performer || item.artist === track.artist));
  const fresh = available.filter((track) => !previous.some((item) => trackKey(item) === trackKey(track)));
  const differentArtists = fresh.filter((track) => !previous.some((item) =>
    item.performer === track.performer || item.artist === track.artist));
  const candidates = differentArtists.length ? differentArtists : fresh.length ? fresh : available;
  if (!candidates.length) return undefined;

  // Draw an artist first, so a larger catalog doesn't crowd out everyone else.
  const performer = randomItem([...new Set(candidates.map((track) => track.performer))]);
  return randomItem(candidates.filter((track) => track.performer === performer));
}

export function nextTracks(mood) {
  const compound = compounds[mood];
  const parts = compound?.parts ?? [mood, mood];
  const previous = lastTracks.get(mood) ?? [];
  const selected = [];
  for (const part of parts) {
    const track = chooseTrack(trackPool(part), previous, selected);
    if (track) selected.push({ ...track, part: compound ? part : undefined });
  }
  lastTracks.set(mood, selected);
  return selected;
}

export function nextComment(mood, preferSource = false) {
  const sourced = themes[mood].poems.flatMap((id) => {
    const poem = poems[id];
    return poem.lines.map(({ index, text }) => {
      const updated = liveVerses.get(id)?.[index]?.Text;
      const line = typeof updated === "string" && updated.trim().length > 0 && updated.length < 150 ? updated : text;
      return { text: line, original: text, author: poem.author, source: "https://ganjoor.net/" + poem.path };
    });
  });
  const original = moods[mood].comments.map((text) => ({ text }));
  const previous = lastComments.get(mood);
  const pool = preferSource && sourced.length ? sourced : original;
  const options = pool.filter(({ text }) => text !== previous);
  const comment = randomItem(options.length ? options : pool);
  lastComments.set(mood, comment.text);
  return comment;
}
