---
name: x
description: Read X through the user's signed-in browser and render post cards, with attached photos and charts, using the bundled x-feed CLI and xeet. Use for X feed digests, an account's posts, X searches (for example "tweets with benchmark charts from the Bun account"), or rendered images of specific tweets.
---

# X feed

Use the bundled `x-feed` CLI. It reads X in the user's signed-in browser through Browse and renders xeet PNG cards locally. Cards include the post's photos. Videos and GIFs show their poster frame.

```sh
x-feed --count 10                                   # For You feed
x-feed --account rauchg --count 10                  # a profile's own posts
x-feed --account bunjavascript --search faster --media -n 3
x-feed --account bunjavascript --media --match 'faster|\d+x' -n 3 --scan 60
x-feed https://x.com/bunjavascript/status/2110692261508079721
x-feed --help
```

## Sources

Pick one source per run.

- No source reads the For You feed. Order is personalized, not chronological.
- `--account HANDLE` reads that profile in displayed order. It skips pinned posts and other authors' reposts.
- `--search QUERY` runs X search on the Latest tab. Any X search operator works. With `--account` it prepends `from:HANDLE` unless the query already has `from:`. With `--media` it appends `filter:media` unless the query already has a media filter.
- Exact post URLs (`--tweet URL` or positional URLs) render only those status IDs, in argument order, from any accounts. The URL count overrides `--count`. The CLI fails rather than substituting another post when it cannot read one. Exact URLs cannot be combined with `--account`, `--search`, `--match`, `--media` or `--scan`.

## Finding matching posts

For posts with charts or improvement plots, prefer `--search` with words the posts use (`faster`, `benchmark`, `x faster`) plus `--media`. Search is fastest because X does the filtering.

`--media` keeps only posts with an attached photo, GIF or video. Link-card images and quoted posts' media do not count. `--match REGEX` is case-insensitive and tests the post text and the media alt text, so it can find charts whose numbers appear only in the alt text. Both filters apply to feed, account and search sources.

`--scan N` bounds how many posts are inspected while looking (default 60, max 500). The CLI also stops when the timeline stops loading. A run that finds fewer than `--count` posts still writes what it found, adds a top-level warning, and exits 0. It exits 3 when nothing matched. The media filter only sees that an attachment exists, so it cannot tell a chart from a photo. Inspect the PNGs before claiming a post contains a chart.

## Output

Output defaults to a timestamped directory under `~/.local/share/x-feed/runs` (or `XDG_DATA_HOME`). `-o DIR` overrides it. The final stdout line is JSON with `out`, `found`, `requested`, `warnings`, `manifest` and `message`.

- `NN.png` are the cards, 1200px wide.
- `media/NN-K.<ext>` are the original attachments at X's `name=orig` resolution (often 2400 to 3200px), or the displayed variant with a warning when the original is unavailable.
- `manifest.json` holds the run's mode, query, filters, requested and found counts, top-level warnings, and one entry per post. Each entry has the post `url`, `id`, card `file`, `author` with `avatarUrl`, `createdAt`, `text`, `media` (`kind`, saved `file`, DOM `sourceUrl`, `fetchedUrl`, `width`, `height`, `alt`, `bytes`) and per-post `warnings`. It contains no embedded image bytes.
- `message.md` links each post to its card.

Inspect a generated PNG before reporting success. Display requested images in the current chat using Markdown image syntax with their absolute paths, paired with source links from the manifest. Writing `message.md` alone does not send images to the chat.

## Limits

Cards omit quoted posts (noted in the post's warnings), polls, link-card previews and engagement counts. Video and GIF cards show the poster frame. Long posts collapsed in a timeline are re-read from their own page so the card has the full text. Explain these limits when relevant.

Requires Bun, Browse on PATH, the paired browser running and signed in to X, and English "For you" navigation for feed mode. Run `browse status` for connection failures. The CLI stops with an error when X shows a login or challenge page. Report it to the user rather than retrying repeatedly.

Runs are on demand. Do not create recurring tasks unless asked. Reading X does not authorize posting, liking, following or messaging.
