# x-feed

`x-feed` reads X through your signed-in browser and renders post cards with their attached photos or video posters. It is read-only: it does not post, like, follow, schedule, or message.

## Requirements

- [Bun](https://bun.sh/)
- The `browse` CLI connected to a browser session that is signed in to X

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
x-feed --account bunjavascript --media --match 'faster|\\d+x' -n 3 --scan 60
x-feed https://x.com/bunjavascript/status/2110692261508079721
```

Each run writes PNG cards, the original media when available, `manifest.json`, and `message.md`. See `x-feed --help` for the complete interface.

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
