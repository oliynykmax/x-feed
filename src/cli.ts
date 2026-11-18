#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { HELP, parsePlan, matchesPlan, statusId, originalMediaUrl, extensionFor, toXeetPost, captureArticles } from "./lib";
import { loadXFeedXeet } from "./xeet";

function browse(...args) {
  const p = Bun.spawnSync(["browse", ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode) throw Error(p.stderr.toString() || p.stdout.toString());
  return JSON.parse(p.stdout.toString());
}

let plan;
try { plan = parsePlan(process.argv.slice(2)); }
catch (e) { console.error(e.message); process.exit(2); }
if (plan.help) { console.log(HELP); process.exit(0); }
if (plan.skill) {
  const embedded = Bun.embeddedFiles.find(file => (file as File).name.endsWith("skills/x/SKILL.md"));
  console.log(embedded ? await embedded.text() : await readFile(new URL("../skills/x/SKILL.md", import.meta.url), "utf8"));
  process.exit(0);
}

const out = resolve(plan.output || resolve(process.env.XDG_DATA_HOME || resolve(homedir(), ".local/share"), "x-feed/runs",
  new Date().toISOString().replaceAll(":", "-") + "-" + crypto.randomUUID().slice(0, 8)));
await mkdir(resolve(out, "media"), { recursive: true });

const { tab } = browse("navigate", plan.startUrl);
const capture = args => {
  const result = browse("eval", "--tab", String(tab), "--expression", `(${captureArticles})(${JSON.stringify(args)})`);
  if (result.blocked) throw Error("X needs a login or challenge in the browser (" + result.blocked + "). Complete it there, then rerun.");
  return result;
};
const captureExact = url => {
  browse("navigate", url, "--tab", String(tab));
  const id = statusId(url);
  const post = capture({ only: id, settleMs: 3000 }).items[0];
  if (!post) throw Error("Could not read requested post " + url);
  return { ...post, url };
};

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error("HTTP " + response.status + " for " + url);
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
}

const warnings = [];
try {
  await run();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  browse("tabs", "close", "--tab", String(tab));
}

async function run() {
  if (plan.mode === "feed") {
    browse("wait_for", "--tab", String(tab), "--selector", '[role="tab"][aria-selected="true"]');
    const tabs = browse("eval", "--tab", String(tab), "--expression",
      'Array.from(document.querySelectorAll("[role=tab]")).map(e=>({text:e.innerText,selected:e.getAttribute("aria-selected")}))');
    const forYou = tabs.find(t => /For you/i.test(t.text));
    if (!forYou) throw Error("For You tab not found. Check X login or interface language.");
    if (forYou.selected !== "true")
      browse("execute", "--tab", String(tab), "--code", 'await page.getByRole("tab", {name:"For you",exact:true}).click()');
  }

  const posts = [];
  if (plan.mode === "urls") {
    for (const url of plan.urls) posts.push(captureExact(url));
  } else {
    const seen = new Set();
    let stalls = 0;
    while (posts.length < plan.count && seen.size < plan.scan && stalls < 4) {
      const { items, end } = capture({ seen: [...seen] });
      stalls = items.length ? 0 : stalls + 1;
      for (const item of items) {
        if (seen.size >= plan.scan || posts.length >= plan.count) break;
        seen.add(item.id);
        if (matchesPlan(item, plan)) posts.push(item);
      }
      if (end) break;
    }
    if (posts.length < plan.count)
      warnings.push(`Found ${posts.length} of ${plan.count} requested posts after inspecting ${seen.size} (scan limit ${plan.scan}${stalls >= 4 ? ", timeline stopped loading" : ""}).`);
    for (const [i, post] of posts.entries())
      if (post.truncated || !post.avatarUrl) posts[i] = { ...captureExact(post.url), pinned: post.pinned };
  }

  const xeet = await loadXFeedXeet();
  const entries = [];
  for (const [i, post] of posts.entries()) {
    const n = String(i + 1).padStart(2, "0");
    const postWarnings = [];
    if (post.truncated) postWarnings.push("Text still collapsed after opening the post; card text is truncated.");
    if (post.quoted) postWarnings.push("Quoted post omitted from the card.");
    let avatar;
    if (post.avatarUrl) {
      try { avatar = (await download(post.avatarUrl)).bytes.toString("base64"); }
      catch (e) { postWarnings.push("Avatar download failed: " + e.message); }
    }
    const media = [], mediaData = [];
    for (const [k, m] of post.media.entries()) {
      const originalUrl = originalMediaUrl(m.url);
      let got, fetchedUrl = originalUrl;
      try { got = await download(originalUrl); }
      catch (e) {
        postWarnings.push(`Original of media ${k + 1} unavailable (${e.message}); used displayed variant.`);
        fetchedUrl = m.url;
        try { got = await download(m.url); } catch (e2) { postWarnings.push(`Media ${k + 1} download failed: ${e2.message}; card shows a placeholder.`); }
      }
      let file;
      if (got) {
        file = resolve(out, "media", `${n}-${k + 1}.${extensionFor(got.contentType)}`);
        await writeFile(file, got.bytes);
      }
      if (m.kind !== "image") postWarnings.push(`Media ${k + 1} is a ${m.kind}; the card shows its poster frame.`);
      mediaData.push(got?.bytes.toString("base64"));
      media.push({ kind: m.kind, file, sourceUrl: m.url, fetchedUrl, width: m.width, height: m.height, alt: m.alt, bytes: got?.bytes.length });
    }
    const file = resolve(out, n + ".png");
    const { png, report } = xeet.render(toXeetPost(post, avatar, mediaData), { width: 600, dpr: 2, theme: plan.theme, expanded: true });
    await writeFile(file, png);
    entries.push({
      url: post.url, id: post.id, file, source: "browser DOM via Browse",
      author: { ...post.author, avatarUrl: post.avatarUrl }, createdAt: post.createdAt, text: post.text,
      media, warnings: [...postWarnings, ...report.warnings],
    });
  }

  const manifest = {
    mode: plan.mode, query: plan.query, account: plan.account, match: plan.match?.source, mediaRequired: plan.media,
    requested: plan.count, found: entries.length, scanLimit: plan.mode === "urls" ? undefined : plan.scan,
    createdAt: new Date().toISOString(), warnings, posts: entries,
  };
  await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(resolve(out, "message.md"), entries.map((p, i) => `[${i + 1}. Post](${p.url})\n\n![Post ${i + 1}](${p.file})`).join("\n\n"));
  console.log(JSON.stringify({ out, found: entries.length, requested: plan.count, warnings, manifest: resolve(out, "manifest.json"), message: resolve(out, "message.md") }));
  if (!entries.length) process.exitCode = 3;
}
