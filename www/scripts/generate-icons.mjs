#!/usr/bin/env node

/**
 * PWA Icon Generator for Veritas Q
 *
 * Generates all required PWA icons from the source SVG.
 * Run with: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public', 'icons');
const SOURCE_SVG = join(ICONS_DIR, 'icon-source.svg');

// Icon sizes to generate
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Maskable icon needs extra padding (safe zone)
const MASKABLE_SIZE = 512;
const MASKABLE_PADDING = 0.1; // 10% padding for safe zone

async function generateIcons() {
  console.log('Generating PWA icons for Veritas Q...\n');

  await mkdir(ICONS_DIR, { recursive: true });

  // Generate standard icons
  for (const size of ICON_SIZES) {
    const outputPath = join(ICONS_DIR, `icon-${size}x${size}.png`);
    await sharp(SOURCE_SVG)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated: icon-${size}x${size}.png`);
  }

  // Generate maskable icon with safe zone padding
  const maskablePath = join(ICONS_DIR, `maskable-${MASKABLE_SIZE}x${MASKABLE_SIZE}.png`);
  const innerSize = Math.floor(MASKABLE_SIZE * (1 - MASKABLE_PADDING * 2));
  const padding = Math.floor(MASKABLE_SIZE * MASKABLE_PADDING);

  // Create the icon at reduced size
  const iconBuffer = await sharp(SOURCE_SVG)
    .resize(innerSize, innerSize)
    .png()
    .toBuffer();

  // Composite onto a black background with padding
  await sharp({
    create: {
      width: MASKABLE_SIZE,
      height: MASKABLE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
    .composite([{
      input: iconBuffer,
      top: padding,
      left: padding,
    }])
    .png()
    .toFile(maskablePath);
  console.log(`✓ Generated: maskable-${MASKABLE_SIZE}x${MASKABLE_SIZE}.png`);

  // Generate Apple touch icon (180x180)
  const appleTouchPath = join(ICONS_DIR, 'apple-touch-icon.png');
  await sharp(SOURCE_SVG)
    .resize(180, 180)
    .png()
    .toFile(appleTouchPath);
  console.log('✓ Generated: apple-touch-icon.png');

  // Generate favicon (32x32)
  const faviconPath = join(ROOT, 'public', 'favicon.ico');
  await sharp(SOURCE_SVG)
    .resize(32, 32)
    .png()
    .toFile(faviconPath.replace('.ico', '.png'));
  console.log('✓ Generated: favicon.png');

  console.log('\n✅ All icons generated successfully!');
  console.log(`\nIcons saved to: ${ICONS_DIR}`);
}

generateIcons().catch(console.error);
