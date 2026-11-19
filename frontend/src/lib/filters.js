/**
 * Photo filters that can be freely mixed with any frame theme.
 *
 * Each filter defines:
 *  - id:         unique identifier
 *  - name:       display name
 *  - emoji:      icon badge
 *  - cssFilter:  standard CSS filter string (used for both <Webcam style> and Canvas 2D `ctx.filter`)
 */
export const FILTERS = [
  {
    id: 'normal',
    name: 'Normal',
    emoji: '✨',
    cssFilter: 'none',
  },
  {
    id: 'vintage',
    name: 'Vintage',
    emoji: '🎞️',
    cssFilter: 'sepia(35%) contrast(115%) brightness(95%) saturate(125%)',
  },
  {
    id: 'bw',
    name: 'B & W',
    emoji: '🏁',
    cssFilter: 'grayscale(100%) contrast(125%) brightness(102%)',
  },
  {
    id: 'warm',
    name: 'Warm Sun',
    emoji: '☀️',
    cssFilter: 'sepia(25%) saturate(140%) brightness(105%) contrast(105%)',
  },
  {
    id: 'cool',
    name: 'Cool Breeze',
    emoji: '🧊',
    cssFilter: 'hue-rotate(190deg) saturate(110%) brightness(102%) contrast(105%)',
  },
  {
    id: 'soft',
    name: 'Soft Glam',
    emoji: '🌸',
    cssFilter: 'brightness(112%) contrast(92%) saturate(115%)',
  },
  {
    id: 'fade',
    name: '90s Fade',
    emoji: '📼',
    cssFilter: 'contrast(88%) brightness(108%) sepia(20%) saturate(85%)',
  },
  {
    id: 'cyber',
    name: 'Cyberpunk',
    emoji: '⚡',
    cssFilter: 'contrast(130%) saturate(150%) hue-rotate(310deg)',
  },
  {
    id: 'pastel',
    name: 'Pastel Dream',
    emoji: '🧁',
    cssFilter: 'brightness(108%) contrast(90%) saturate(130%) hue-rotate(345deg)',
  },
  {
    id: 'noir',
    name: 'Film Noir',
    emoji: '🎬',
    cssFilter: 'grayscale(100%) contrast(165%) brightness(88%)',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    emoji: '🌅',
    cssFilter: 'sepia(45%) saturate(160%) brightness(106%) contrast(108%) hue-rotate(-12deg)',
  },
  {
    id: 'matcha',
    name: 'Matcha',
    emoji: '🍵',
    cssFilter: 'sepia(22%) hue-rotate(65deg) saturate(115%) contrast(105%) brightness(103%)',
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    emoji: '🌇',
    cssFilter: 'sepia(32%) saturate(175%) contrast(115%) brightness(103%) hue-rotate(330deg)',
  },
  {
    id: 'teal',
    name: 'Moody Teal',
    emoji: '🌊',
    cssFilter: 'contrast(120%) saturate(115%) hue-rotate(150deg) brightness(96%)',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    emoji: '🪻',
    cssFilter: 'hue-rotate(250deg) saturate(120%) brightness(106%) contrast(98%)',
  },
  {
    id: 'rose',
    name: 'Rosé Tint',
    emoji: '🍷',
    cssFilter: 'sepia(25%) saturate(145%) hue-rotate(315deg) brightness(104%)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    emoji: '🌲',
    cssFilter: 'hue-rotate(85deg) contrast(115%) saturate(125%) brightness(95%)',
  },
  {
    id: 'coffee',
    name: 'Warm Coffee',
    emoji: '☕',
    cssFilter: 'sepia(55%) contrast(115%) brightness(92%) saturate(90%)',
  },
  {
    id: 'vivid',
    name: 'Vivid Pop',
    emoji: '🎨',
    cssFilter: 'contrast(125%) saturate(180%) brightness(103%)',
  },
  {
    id: 'crisp',
    name: 'Cinema Crisp',
    emoji: '🍿',
    cssFilter: 'contrast(120%) saturate(110%) brightness(104%)',
  },
]

export const DEFAULT_FILTER = FILTERS[0]
