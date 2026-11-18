# x-feed

`x-feed` reads X through your signed-in browser and renders post cards with their attached photos or video posters. It is read-only: it does not post, like, follow, schedule, or message.

[![A live post card rendered from X](assets/real-post/01.png)](https://x.com/anomalyco/status/2122798464535089382)

_Example card captured from a live [@anomalyco post](https://x.com/anomalyco/status/2122798464535089382)._

The implementation lives under [`src/`](src/): `cli.ts`, `lib.ts`, and `lib.test.ts`. The repository root contains only project configuration, docs, skill instructions, and assets.

## Requirements

- [Bun](https://bun.sh/)
- The [`browse` CLI from Anomaly](https://github.com/anomalyco/browse), connected to a browser session that is signed in to X

## Rendering engine

`x-feed` installs [`@xeet/core`](https://github.com/rauchg/xeet) as a project dependency. It renders post cards through that local JavaScript/WASM library; it never shells out to, or requires, a globally installed `xeet` executable. The standalone build bundles the renderer with the CLI.

## Install

```sh
git clone https://github.com/oliynykmax/x-feed.git
cd x-feed
bun install
bun link
```

## Use

```sh
x-feed --count 10
x-feed --account bunjavascript --search faster --media -n 3
x-feed --account bunjavascript --media --match 'faster|\d+x' -n 3 --scan 60
x-feed https://x.com/bunjavascript/status/2110692261508079721
```

Each run writes PNG cards, the original media when available, `manifest.json`, and `message.md`. See `x-feed --help` for the complete interface.

## Build a standalone CLI

The standard local distribution is a self-contained executable built with Bun's compiler. It uses Bun Canary's ahead-of-time compiler with stripping, and embeds xeet's renderer and font packs plus the agent skill. It still uses the installed `browse` CLI to reach the signed-in browser.

```sh
bun run build
./dist/x-feed --help
```

## Built-in agent skill

The checked-in agent instructions are available at [`skills/x/SKILL.md`](skills/x/SKILL.md) and can be printed by the installed CLI:

```sh
x-feed --skill
```

## Development

```sh
bun test
bun check
```
