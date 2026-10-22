// Generates PWA icons, the favicon and iOS launch images from one SVG design.
// Usage: npm run icons
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");

const BRAND_FROM = "#6366F1";
const BRAND_TO = "#7C3AED";

/** The two-arrow glyph, drawn for a 512×512 canvas and centred. */
const glyph = `
  <g fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 200h200M300 150l50 50-50 50"/>
    <path d="M362 312H162M212 262l-50 50 50 50"/>
  </g>`;

const gradient = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_FROM}"/>
      <stop offset="1" stop-color="${BRAND_TO}"/>
    </linearGradient>
  </defs>`;

// Rounded tile with transparent corners, for browsers and Android "any" icons.
const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
  <rect width="512" height="512" rx="128" fill="url(#bg)"/>${glyph}</svg>`;

// Full-bleed square: Android masks it, iOS rounds it. The glyph sits inside the safe zone.
const squareSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
  <rect width="512" height="512" fill="url(#bg)"/>${glyph}</svg>`;

function splashSvg(width, height) {
  const tile = Math.round(Math.min(width, height) * 0.28);
  const x = Math.round((width - tile) / 2);
  const y = Math.round((height - tile) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${BRAND_FROM}"/>
        <stop offset="1" stop-color="${BRAND_TO}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <svg x="${x}" y="${y}" width="${tile}" height="${tile}" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="128" fill="#fff" fill-opacity="0.14"/>${glyph}
    </svg>
  </svg>`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** Minimal ICO container holding PNG images (supported by all current browsers). */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

const SPLASH_SCREENS = [
  [375, 667, 2],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [430, 932, 3],
];

async function main() {
  await mkdir(iconsDir, { recursive: true });

  const outputs = {
    "icon-192.png": await png(roundedSvg, 192),
    "icon-512.png": await png(roundedSvg, 512),
    "icon-maskable-512.png": await png(squareSvg, 512),
    "apple-touch-icon.png": await png(squareSvg, 180),
  };

  for (const [width, height, ratio] of SPLASH_SCREENS) {
    const w = width * ratio;
    const h = height * ratio;
    outputs[`splash-${w}x${h}.png`] = await sharp(Buffer.from(splashSvg(w, h)))
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
  }

  for (const [name, data] of Object.entries(outputs)) {
    await writeFile(join(iconsDir, name), data);
  }

  const favicon = toIco([
    { size: 16, data: await png(roundedSvg, 16) },
    { size: 32, data: await png(roundedSvg, 32) },
    { size: 48, data: await png(roundedSvg, 48) },
  ]);
  await writeFile(join(root, "src", "app", "favicon.ico"), favicon);
  await writeFile(join(iconsDir, "icon.svg"), roundedSvg.trim());

  console.log(`Generated ${Object.keys(outputs).length + 2} files.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
