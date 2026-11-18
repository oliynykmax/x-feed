import { test, expect } from "bun:test";
import { parsePlan, matchesPlan, originalMediaUrl, extensionFor, toXeetPost, normalizePostUrl } from "./lib";
import { loadXFeedXeet } from "./xeet";

const post = (over = {}) => ({
  id: "1", url: "https://x.com/bunjavascript/status/1", text: "bun lint is 26x faster", pinned: false,
  author: { name: "Bun", handle: "bunjavascript" }, media: [], ...over,
});
const chart = { kind: "image", url: "https://pbs.twimg.com/media/HUqvbS7bwAAxUQk?format=jpg&name=medium", width: 1200, height: 1200, alt: "Table of lint times" };

test("no arguments reads the For You feed, ten posts", () => {
  const plan = parsePlan([]);
  expect(plan).toMatchObject({ mode: "feed", count: 10, startUrl: "https://x.com/home" });
});

test("--skill is handled without opening X", () => {
  expect(parsePlan(["--skill"])).toEqual({ skill: true });
});

test("account search builds a from: query with a media filter on the Latest tab", () => {
  const plan = parsePlan(["--account", "@bunjavascript", "--search", "faster", "--media", "-n", "3"]);
  expect(plan.mode).toBe("search");
  expect(plan.query).toBe("from:bunjavascript faster filter:media");
  expect(plan.startUrl).toBe("https://x.com/search?f=live&src=typed_query&q=from%3Abunjavascript%20faster%20filter%3Amedia");
});

test("a query that already names from: or a media filter is left alone", () => {
  expect(parsePlan(["--account", "bun", "--search", "from:other filter:images x", "--media"]).query).toBe("from:other filter:images x");
});

test("exact URLs keep order, normalize hosts and override --count", () => {
  const plan = parsePlan(["--tweet", "https://twitter.com/a/status/2/", "https://x.com/b/status/1?s=20", "-n", "9"]);
  expect(plan).toMatchObject({ mode: "urls", count: 2, urls: ["https://x.com/a/status/2", "https://x.com/b/status/1"] });
});

test("exact URLs refuse discovery filters instead of substituting posts", () => {
  for (const flag of [["--media"], ["--search", "x"], ["--account", "bun"], ["--match", "x"], ["--scan", "5"]])
    expect(() => parsePlan(["https://x.com/a/status/1", ...flag])).toThrow(/cannot be combined/);
});

test("invalid input is rejected", () => {
  expect(() => normalizePostUrl("https://x.com/a")).toThrow(/X post URL/);
  expect(() => normalizePostUrl("https://evil.com/a/status/1")).toThrow(/X post URL/);
  expect(() => parsePlan(["--match", "("])).toThrow(/regular expression/);
  expect(() => parsePlan(["--scan", "0"])).toThrow(/--scan/);
  expect(() => parsePlan(["-n", "101"])).toThrow(/--count/);
  expect(() => parsePlan(["--account", "has space"])).toThrow(/handle/);
});

test("--media keeps only posts with attachments", () => {
  const plan = parsePlan(["--account", "bunjavascript", "--media"]);
  expect(matchesPlan(post(), plan)).toBe(false);
  expect(matchesPlan(post({ media: [chart] }), plan)).toBe(true);
});

test("--match searches text and media alt text, case-insensitively", () => {
  const plan = parsePlan(["--account", "bunjavascript", "--match", "lint times"]);
  expect(matchesPlan(post({ text: "new release" }), plan)).toBe(false);
  expect(matchesPlan(post({ text: "new release", media: [chart] }), plan)).toBe(true);
  expect(matchesPlan(post({ text: "LINT TIMES" }), plan)).toBe(true);
});

test("account mode skips pinned posts, reposts and empty posts", () => {
  const plan = parsePlan(["--account", "BunJavaScript"]);
  expect(matchesPlan(post(), plan)).toBe(true);
  expect(matchesPlan(post({ pinned: true }), plan)).toBe(false);
  expect(matchesPlan(post({ author: { handle: "someoneelse" } }), plan)).toBe(false);
  expect(matchesPlan(post({ text: "" }), plan)).toBe(false);
  expect(matchesPlan(post({ text: "", media: [chart] }), plan)).toBe(true);
});

test("media URLs are upgraded to the original resolution", () => {
  expect(originalMediaUrl(chart.url)).toBe("https://pbs.twimg.com/media/HUqvbS7bwAAxUQk?format=jpg&name=orig");
  expect(originalMediaUrl("https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg")).toBe("https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg?name=orig");
  expect(originalMediaUrl("https://video.twimg.com/a.mp4")).toBe("https://video.twimg.com/a.mp4");
  expect(extensionFor("image/jpeg")).toBe("jpg");
  expect(extensionFor("image/png; charset=binary")).toBe("png");
});

test("a captured post with a chart renders a card taller than its text-only version", async () => {
  const xeet = await loadXFeedXeet();
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const withMedia = toXeetPost(post({ media: [chart] }), undefined, [pixel]);
  expect(withMedia.media).toEqual([{ kind: "image", width: 1200, height: 1200, data: pixel, alt: "Table of lint times" }]);
  expect(toXeetPost(post(), undefined, []).media).toBeUndefined();
  const tall = xeet.render(withMedia, { width: 600 }).report;
  const short = xeet.render(toXeetPost(post(), undefined, []), { width: 600 }).report;
  expect(tall.attachment?.shown).toBe("media");
  expect(tall.size.height).toBeGreaterThan(short.size.height + 300);
});
