/** Font definition for text overlay features */
export interface FontDef {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** CSS font-family value */
  family: string;
  /** Font category for fallback */
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting';
}

/** Available fonts for text overlay (loaded from Google Fonts) */
export const FONTS: readonly FontDef[] = [
  { id: 'roboto', name: 'Roboto', family: 'Roboto', category: 'sans-serif' },
  { id: 'open-sans', name: 'Open Sans', family: 'Open Sans', category: 'sans-serif' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat', category: 'sans-serif' },
  { id: 'oswald', name: 'Oswald', family: 'Oswald', category: 'sans-serif' },
  { id: 'lobster', name: 'Lobster', family: 'Lobster', category: 'display' },
  { id: 'pacifico', name: 'Pacifico', family: 'Pacifico', category: 'handwriting' },
  { id: 'noto-sans-tc', name: 'Noto Sans TC', family: 'Noto Sans TC', category: 'sans-serif' },
  { id: 'noto-serif-tc', name: 'Noto Serif TC', family: 'Noto Serif TC', category: 'serif' },
] as const;

/** Google Fonts CSS URL that loads all available fonts with bold/italic variants */
export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,700;1,400;1,700&family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&family=Montserrat:ital,wght@0,400;0,700;1,400;1,700&family=Oswald:wght@400;700&family=Lobster&family=Pacifico&family=Noto+Sans+TC:wght@400;700&family=Noto+Serif+TC:wght@400;700&display=swap';

/**
 * Preload a specific font variant so Canvas API can render it.
 * Returns true if the font loaded successfully.
 */
export async function loadFont(family: string, bold = false, italic = false): Promise<boolean> {
  const weight = bold ? 'bold' : 'normal';
  const style = italic ? 'italic' : 'normal';
  const spec = `${style} ${weight} 48px "${family}"`;
  try {
    await document.fonts.load(spec);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether a specific font variant is ready to use on Canvas.
 */
export function isFontLoaded(family: string, bold = false, italic = false): boolean {
  const weight = bold ? 'bold' : 'normal';
  const style = italic ? 'italic' : 'normal';
  const spec = `${style} ${weight} 48px "${family}"`;
  return document.fonts.check(spec);
}
