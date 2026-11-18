import { parseArgs } from "node:util";

export const HELP = `Usage: x-feed [options] [URL ...]

Read X through your signed-in browser (Browse) and render xeet PNG cards with
their photos and video posters. No posting or scheduling.

Sources (pick one):
  (none)                  Your For You feed
  --account HANDLE        That profile's own posts (pinned posts and reposts skipped)
  --search QUERY          X search, Latest tab. With --account, adds from:HANDLE
  --tweet URL, URL ...    Exactly these posts, in order. Fails rather than substituting

Filters for feed, account and search:
  --media                 Only posts with attached photos, GIFs or videos
  --match REGEX           Case-insensitive match on post text and media alt text
  --scan N                Inspect at most N posts while looking (default 60, max 500)

Output:
  -n, --count N           Posts to render, 1 to 100 (default 10)
  -o, --output DIR        Output directory (default ~/.local/share/x-feed/runs/<timestamp>)
  --theme dark|light      Card theme (default dark)
  --skill                 Print the built-in agent skill instructions

Writes NN.png cards, media/NN-K.<ext> originals, manifest.json and message.md.
Discovery modes that find fewer than --count posts write what they found and
add a warning. They exit 3 when nothing matched.`;

const POST_PATH = /^\/([A-Za-z0-9_]+)\/status\/(\d+)\/?$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function parsePlan(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true, options: {
      help: { type: "boolean", short: "h" }, skill: { type: "boolean" }, count: { type: "string", short: "n" },
      account: { type: "string" }, tweet: { type: "string", multiple: true },
      search: { type: "string" }, match: { type: "string" }, media: { type: "boolean" },
      scan: { type: "string" }, output: { type: "string", short: "o" }, theme: { type: "string", default: "dark" },
    },
  });
  if (values.help) return { help: true };
  if (values.skill) return { skill: true };
  const urls = [...(values.tweet || []), ...positionals].map(normalizePostUrl);
  const account = values.account?.replace(/^@/, "");
  if (account !== undefined && !HANDLE.test(account)) throw Error("Invalid account handle: " + values.account);
  if (values.search !== undefined && !values.search.trim()) throw Error("--search needs a query");
  if (urls.length && (account || values.search || values.match || values.media || values.scan))
    throw Error("Exact post URLs cannot be combined with --account, --search, --match, --media or --scan");
  if (!["dark", "light"].includes(values.theme)) throw Error("--theme must be dark or light");
  const count = urls.length || Number(values.count ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("--count must be an integer from 1 to 100");
  const scan = Number(values.scan ?? 60);
  if (!Number.isInteger(scan) || scan < 1 || scan > 500) throw Error("--scan must be an integer from 1 to 500");
  let match;
  try { match = values.match ? new RegExp(values.match, "i") : undefined; }
  catch (e) { throw Error("--match is not a valid regular expression: " + e.message); }
  const mode = urls.length ? "urls" : values.search ? "search" : account ? "account" : "feed";
  const query = mode === "search" ? searchQuery(values.search, account, values.media) : undefined;
  return {
    mode, urls, account, query, match, count, scan, media: !!values.media,
    theme: values.theme, output: values.output,
    startUrl: mode === "urls" ? urls[0]
      : mode === "search" ? "https://x.com/search?f=live&src=typed_query&q=" + encodeURIComponent(query)
      : mode === "account" ? "https://x.com/" + account : "https://x.com/home",
  };
}

export function normalizePostUrl(input) {
  let u;
  try { u = new URL(input); } catch { throw Error("Expected an X post URL: " + input); }
  if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com"].includes(u.hostname) || !POST_PATH.test(u.pathname))
    throw Error("Expected an X post URL: " + input);
  return "https://x.com" + u.pathname.replace(/\/$/, "");
}

export const statusId = url => url.match(/\/status\/(\d+)/)?.[1];

function searchQuery(search, account, media) {
  const parts = [search.trim()];
  if (account && !/\bfrom:/i.test(search)) parts.unshift("from:" + account);
  if (media && !/\bfilter:(media|images|videos|native_video)\b/i.test(search)) parts.push("filter:media");
  return parts.join(" ");
}

export function matchesPlan(post, plan) {
  if (!post.text && !post.media.length) return false;
  if (plan.account && (post.pinned || post.author.handle?.toLowerCase() !== plan.account.toLowerCase())) return false;
  if (plan.media && !post.media.length) return false;
  if (plan.match && !plan.match.test([post.text, ...post.media.map(m => m.alt || "")].join("\n"))) return false;
  return true;
}

export function originalMediaUrl(url) {
  const u = new URL(url);
  if (u.hostname !== "pbs.twimg.com") return url;
  if (u.searchParams.has("name")) u.searchParams.set("name", "orig");
  else if (/\.(jpe?g|png|webp)$/i.test(u.pathname)) u.searchParams.set("name", "orig");
  return u.toString();
}

export const extensionFor = contentType =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[contentType?.split(";")[0].trim()] || "bin";

export function toXeetPost(post, avatar, mediaData) {
  return {
    text: post.text,
    author: { name: post.author.name, handle: post.author.handle, ...(avatar && { avatar }) },
    ...(post.media.length && {
      media: post.media.map((m, i) => ({
        kind: m.kind, width: m.width, height: m.height,
        ...(mediaData[i] && { data: mediaData[i] }), ...(m.alt && { alt: m.alt }),
      })),
    }),
    createdAt: post.createdAt, now: post.now,
  };
}

// Runs in the X page through `browse eval`. Must stay self-contained.
export async function captureArticles({ seen = [], only, settleMs = 700, pageWaitMs = 15000, moreWaitMs = 4000 }) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const blocked = () => /^\/(login|i\/flow|account\/access)/.test(location.pathname);
  for (const t0 = Date.now(); !blocked() && !document.querySelector("article, [data-testid=emptyState]") && Date.now() - t0 < pageWaitMs;)
    await sleep(200);
  if (blocked()) return { blocked: location.href, items: [] };
  const quoteOf = (a: Element) => Array.from(a.querySelectorAll<HTMLElement>("div[role=link]")).find(d => d.querySelector("[data-testid=User-Name]"));
  const mediaNodes = (a: Element) => {
    const quote = quoteOf(a);
    return Array.from(a.querySelectorAll<HTMLElement>("[data-testid=tweetPhoto], [data-testid=videoPlayer]"))
      .filter(n => !n.parentElement?.closest("[data-testid=tweetPhoto], [data-testid=videoPlayer]") && !quote?.contains(n));
  };
  const ownTime = (a: Element) => Array.from(a.querySelectorAll<HTMLTimeElement>("time")).find(t => !quoteOf(a)?.contains(t));
  const articleId = (a: HTMLElement) => {
    const href = ownTime(a)?.closest<HTMLAnchorElement>("a")?.href
      || (a === document.querySelector("article") && /\/status\/\d+/.test(location.pathname) ? location.href : undefined);
    const m = href?.match(/^(.*\/status\/(\d+))/);
    return m ? { url: m[1], id: m[2] } : {};
  };
  const plainText = (node: Node): string => Array.from(node.childNodes).map(c => {
    if (c.nodeType === Node.TEXT_NODE) return (c as Text).data;
    if (!(c instanceof Element)) return "";
    if (c.tagName === "A") return c.textContent;
    if (c.tagName === "IMG") return (c as HTMLImageElement).alt;
    return c.tagName === "BR" ? "\n" : plainText(c);
  }).join("");
  const loaded = (a: HTMLElement) => mediaNodes(a).length > 0 && mediaNodes(a).every(n => {
    const v = n.querySelector<HTMLVideoElement>("video"), i = n.querySelector<HTMLImageElement>("img");
    return v ? !!v.poster : !!(i && i.complete && i.naturalWidth);
  });
  const items = [], skip = new Set(seen);
  const unseen = () => Array.from(document.querySelectorAll("article")).some(a => {
    const { id } = articleId(a);
    return id && !skip.has(id) && (!only || id === only);
  });
  for (const t0 = Date.now(); !only && !unseen() && Date.now() - t0 < moreWaitMs;) {
    window.scrollBy(0, innerHeight);
    await sleep(300);
  }
  for (const a of Array.from(document.querySelectorAll("article"))) {
    if (!a.isConnected) continue;
    const { id, url } = articleId(a);
    if (!id || skip.has(id) || (only && id !== only)) continue;
    skip.add(id);
    a.scrollIntoView({ block: "center" });
    const t0 = Date.now();
    while (!loaded(a) && Date.now() - t0 < settleMs) await sleep(50);
    const user = a.querySelector<HTMLElement>("[data-testid=User-Name]")?.innerText.split("\n") || [];
    const quote = quoteOf(a);
    const textNode = Array.from(a.querySelectorAll<HTMLElement>("[data-testid=tweetText]")).find(n => !quote?.contains(n));
    const media = mediaNodes(a).map(n => {
      const video = n.querySelector<HTMLVideoElement>("video"), img = n.querySelector<HTMLImageElement>("img"), box = n.getBoundingClientRect();
      if (video) return {
        kind: /tweet_video_thumb/.test(video.poster) ? "gif" : "video", url: video.poster,
        width: video.videoWidth || Math.round(box.width), height: video.videoHeight || Math.round(box.height),
        alt: video.getAttribute("aria-label") || "",
      };
      return {
        kind: "image", url: img?.src, width: img?.naturalWidth || Math.round(box.width),
        height: img?.naturalHeight || Math.round(box.height), alt: img?.alt === "Image" ? "" : img?.alt || "",
      };
    }).filter(m => m.url && m.width && m.height);
    const time = ownTime(a);
    items.push({
      id, url,
      text: textNode ? plainText(textNode) : "",
      truncated: !!a.querySelector("[data-testid=tweet-text-show-more-link]"),
      pinned: /Pinned/.test(a.querySelector<HTMLElement>("[data-testid=socialContext]")?.innerText || ""),
      author: { name: user[0], handle: user.find(t => t.startsWith("@"))?.slice(1) },
      avatarUrl: a.querySelector<HTMLImageElement>("img[src*='pbs.twimg.com/profile_images/']")?.src,
      createdAt: time?.dateTime, now: new Date().toISOString(),
      media, quoted: !!quote,
    });
  }
  return { items, end: !document.querySelector("article") };
}
