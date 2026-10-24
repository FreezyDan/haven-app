/**
 * Avatar colors for members without a profile picture.
 * The color is deterministic per seed (user id, alias, username) so a
 * person keeps the same color across screens and sessions.
 */

/** Calm, muted palette — fits the warm-neutral theme. */
export const AVATAR_PALETTE = [
  '#8B7BC7', // soft violet
  '#5BA88A', // sage green
  '#E0A983', // warm sand
  '#7FA8C9', // dusty blue
  '#C98BA0', // muted rose
  '#6E6CF0', // haven purple
  '#7A9E7E', // moss
  '#D9A441', // amber
] as const;

/** Stable hash → palette color. */
export function avatarColorFor(seed: string | number | null | undefined): string {
  const s = String(seed ?? 'haven');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
