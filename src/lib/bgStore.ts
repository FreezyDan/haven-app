/**
 * User-chosen page background (colour or uploaded image).
 * Stored on-device only; applied to the app shell background —
 * component interiors are never touched.
 */

export interface BgChoice {
  type: 'color' | 'image';
  value: string; // hex colour, or data URL for images
}

const BG_KEY = 'haven.background';
export const BG_CHANGED_EVENT = 'haven-bg-changed';

export function loadBg(): BgChoice | null {
  try {
    const raw = localStorage.getItem(BG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BgChoice;
    if ((parsed.type === 'color' || parsed.type === 'image') && typeof parsed.value === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBg(choice: BgChoice | null) {
  try {
    if (choice) localStorage.setItem(BG_KEY, JSON.stringify(choice));
    else localStorage.removeItem(BG_KEY);
  } catch {
    /* image too large to persist — background stays for this session */
  }
  window.dispatchEvent(new Event(BG_CHANGED_EVENT));
}

/** Gentle preset colours that keep the white cards readable. */
export const BG_PRESETS: { label: string; value: string }[] = [
  { label: 'Mist', value: '#EEEEFC' },
  { label: 'Sage', value: '#E4F0E6' },
  { label: 'Sky', value: '#E1EEF7' },
  { label: 'Sand', value: '#F6EFE3' },
  { label: 'Blush', value: '#F9ECEC' },
  { label: 'Dusk', value: '#E3E1F4' },
];
