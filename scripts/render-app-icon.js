#!/usr/bin/env node
/*
 * Renders an app's marketing icon (the 1024×1024 PNG the site shows) from the Icon Composer
 * document the app actually ships.
 *
 * The site icon had been made by hand each time the design changed, which meant it could drift
 * from the app's own icon without anyone noticing — and did. This reads `icon.json` and its SVG
 * layers, so the picture on the web page is derived from the same source Xcode compiles.
 *
 * What it does NOT reproduce is Icon Composer's glass rendering: the specular sheen, the
 * translucency and the platform-specific masks are Apple's, applied at build time. This is the
 * flat composition — which is what a small tile on a web page wants anyway, and what the previous
 * hand-made file was.
 *
 *   node scripts/render-app-icon.js \
 *     --icon "../../mine/Personal/Apps/Scripture Alone/ScriptureAlone/Resources/AppIcon.icon" \
 *     --out apps/scripture-alone/assets/images/icon.png
 *
 * Options: --size (default 1024), --radius (default 22.5% of size), --appearance light|dark.
 */

const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "node_modules", "sharp"));

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** `srgb:0.04314,0.07059,0.19216,1.00000` and `extended-gray:1.0,1.0` → a CSS colour. */
function colour(value) {
  const [space, numbers] = String(value).split(":");
  const parts = numbers.split(",").map(Number);
  const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  if (space === "extended-gray") {
    const g = to255(parts[0]);
    return `rgba(${g},${g},${g},${parts[1] ?? 1})`;
  }
  return `rgba(${to255(parts[0])},${to255(parts[1])},${to255(parts[2])},${parts[3] ?? 1})`;
}

/** The fill for an appearance, falling back to the unqualified one the way the format does. */
function fillFor(specializations, appearance) {
  if (!Array.isArray(specializations) || !specializations.length) return null;
  return (
    specializations.find((s) => s.appearance === appearance) ||
    specializations.find((s) => !s.appearance) ||
    specializations[0]
  ).value;
}

/** A solid colour, or a <defs> gradient plus the url() that references it. */
function paint(value, id) {
  if (!value) return { fill: "none", defs: "" };
  if (value.solid) return { fill: colour(value.solid), defs: "" };
  if (value["linear-gradient"]) {
    const stops = value["linear-gradient"];
    const marks = stops
      .map((stop, index) => {
        const offset = stops.length === 1 ? 0 : index / (stops.length - 1);
        return `<stop offset="${offset}" stop-color="${colour(stop)}"/>`;
      })
      .join("");
    // Top to bottom: how these documents are authored, and how the shipped icon reads.
    return {
      fill: `url(#${id})`,
      defs: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${marks}</linearGradient>`,
    };
  }
  return { fill: "none", defs: "" };
}

/** The `<path …/>` elements of a layer's SVG, with its own fill stripped so ours applies. */
function shapes(file) {
  const svg = fs.readFileSync(file, "utf8");
  return (svg.match(/<path\b[^>]*\/>/g) || [])
    .map((tag) => tag.replace(/\sfill="[^"]*"/g, ""))
    .join("\n    ");
}

function main() {
  const iconPath = argument("icon");
  const out = argument("out");
  if (!iconPath || !out) {
    console.error("usage: render-app-icon.js --icon <AppIcon.icon> --out <file.png> [--size N]");
    process.exit(2);
  }
  const size = Number(argument("size", 1024));
  const radius = Number(argument("radius", Math.round(size * 0.225)));
  const appearance = argument("appearance", "light");

  const document = JSON.parse(fs.readFileSync(path.join(iconPath, "icon.json"), "utf8"));
  const assets = path.join(iconPath, "Assets");

  const defs = [];
  const body = [];
  let counter = 0;

  const background = paint(fillFor(document["fill-specializations"], appearance), "bg");
  defs.push(background.defs);

  // Back to front. The first group in the document is the frontmost, and so is the first layer
  // within a group — the same order Icon Composer shows in its layer list.
  for (const group of [...(document.groups || [])].reverse()) {
    for (const layer of [...(group.layers || [])].reverse()) {
      const file = path.join(assets, layer["image-name"]);
      if (!fs.existsSync(file)) {
        console.error(`missing layer asset: ${file}`);
        process.exit(1);
      }
      const fill = paint(fillFor(layer["fill-specializations"], appearance), `f${counter++}`);
      defs.push(fill.defs);
      body.push(`<g fill="${fill.fill}">\n    ${shapes(file)}\n  </g>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>${defs.filter(Boolean).join("")}
    <clipPath id="squircle"><rect width="1024" height="1024" rx="${(radius / size) * 1024}"/></clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <rect width="1024" height="1024" fill="${background.fill}"/>
    ${body.join("\n    ")}
  </g>
</svg>`;

  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out)
    .then(() => console.log(`${out} — ${size}×${size} from ${path.basename(iconPath)}`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

main();
