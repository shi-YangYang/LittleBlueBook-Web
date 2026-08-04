import { readFileSync } from 'node:fs';

// Permanent, privacy-free media fixtures for SPEC-013 browser and API checks.
export const tinyH264Mp4 = readFileSync(
  new URL('./tiny-h264-video.mp4', import.meta.url),
);

export const tinyBlueCover = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVR4nGOQq7hDEmIY1VAxGkpy2JIGADduFZAJ81G0AAAAAElFTkSuQmCC',
  'base64',
);
