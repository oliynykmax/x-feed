import { readFile } from "node:fs/promises";
import { bind } from "@xeet/core/abi";
import { createFontPacks, sha256Hex } from "../node_modules/@xeet/core/src/fonts.js";
import wasm from "../node_modules/@xeet/core/wasm/xeet_wasm.js";
import type { Xeet } from "@xeet/core/node";

type EmbeddedFile = File;

function embedded(path: string): EmbeddedFile | undefined {
  return Bun.embeddedFiles.find(file => (file as EmbeddedFile).name === path) as EmbeddedFile | undefined;
}

async function wasmAsset(path: string): Promise<Uint8Array> {
  const file = Bun.isStandaloneExecutable ? embedded(path) : undefined;
  if (file) return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(await readFile(new URL(`../node_modules/@xeet/core/${path}`, import.meta.url)));
}

let renderer: Promise<Xeet> | undefined;

/**
 * Load the upstream rauchg/xeet WASM renderer and its font packs.
 *
 * The direct imports keep Bun's compiler from treating xeet's dynamic Node
 * loader as an external system dependency. `package.json` embeds the WASM
 * tree, so this also works from the standalone x-feed executable.
 */
export function loadXFeedXeet(): Promise<Xeet> {
  renderer ??= (async () => {
    const manifest = JSON.parse(new TextDecoder().decode(await wasmAsset("wasm/fonts/packs.json")));
    const fonts = createFontPacks({
      manifest,
      read: (name: string) => wasmAsset(`wasm/fonts/${name}.bin`),
      hash: sha256Hex,
      register: (file: string, bytes: Uint8Array) => wasm.register_font(file, bytes),
      missingPacks: (request: string) => wasm.missing_packs(request),
    });
    await fonts.loadAll();
    return bind(wasm) as Xeet;
  })();
  return renderer;
}
