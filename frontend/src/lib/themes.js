/**
 * Photo strip themes — cute colours + cute motifs.
 *
 * Each theme drives:
 *  - frame:        canvas background / border colour
 *  - accent:       border drawn around every photo
 *  - onFrame:      footer text colour (must contrast with `frame`)
 *  - photoFallback: placeholder colour behind a photo
 *  - pattern:      motif tiled over the frame (see stripCanvas.js)
 *  - patternColor / patternAlpha: motif colour + transparency
 */
export const THEMES = [
  {
    id: 'strawberry',
    name: 'Strawberry Milk',
    emoji: '🍓',
    frame: '#ffe3ef',
    accent: '#ff5f9e',
    onFrame: '#9d174d',
    photoFallback: '#fff1f6',
    pattern: 'hearts',
    patternColor: '#ff9ec4',
    patternAlpha: 0.65,
    swatch: ['#ffe3ef', '#ff5f9e'],
  },
  {
    id: 'sakura',
    name: 'Sakura Bloom',
    emoji: '🌸',
    frame: '#fff0f3',
    accent: '#fb7185',
    onFrame: '#881337',
    photoFallback: '#fff5f7',
    pattern: 'flowers',
    patternColor: '#fda4af',
    patternAlpha: 0.7,
    swatch: ['#fff0f3', '#fb7185'],
  },
  {
    id: 'lavender',
    name: 'Lavender Dream',
    emoji: '💜',
    frame: '#f3e8ff',
    accent: '#a855f7',
    onFrame: '#6b21a8',
    photoFallback: '#faf5ff',
    pattern: 'stars',
    patternColor: '#d8b4fe',
    patternAlpha: 0.75,
    swatch: ['#f3e8ff', '#a855f7'],
  },
  {
    id: 'mint',
    name: 'Mint Candy',
    emoji: '🍬',
    frame: '#dcfce7',
    accent: '#2dd4a7',
    onFrame: '#065f46',
    photoFallback: '#f0fdf4',
    pattern: 'dots',
    patternColor: '#7ff0c0',
    patternAlpha: 0.9,
    swatch: ['#dcfce7', '#2dd4a7'],
  },
  {
    id: 'peach',
    name: 'Peach Gummy',
    emoji: '🍑',
    frame: '#ffedd5',
    accent: '#fb923c',
    onFrame: '#9a3412',
    photoFallback: '#fff7ed',
    pattern: 'bubbles',
    patternColor: '#fdba74',
    patternAlpha: 0.85,
    swatch: ['#ffedd5', '#fb923c'],
  },
  {
    id: 'blueberry',
    name: 'Blueberry Soda',
    emoji: '🫐',
    frame: '#e0e7ff',
    accent: '#7c8cf8',
    onFrame: '#3730a3',
    photoFallback: '#eef2ff',
    pattern: 'sparkles',
    patternColor: '#a5b4fc',
    patternAlpha: 0.85,
    swatch: ['#e0e7ff', '#7c8cf8'],
  },
]

export const DEFAULT_THEME = THEMES[0]
