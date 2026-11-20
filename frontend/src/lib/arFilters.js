/**
 * AR Face Tracking filters/stickers.
 *
 * Every id below maps 1:1 to a renderer in renderArOverlay.js (RENDERERS_3D),
 * plus the `none` off-state. The list is ordered for the picker:
 *   1. off-state (None)
 *   2. the 7 newest animation effects
 *   3. props/accessories
 *   4. animal face props (last)
 * renderArOverlay.js itself is used as-is and is never edited here.
 */
export const AR_FILTERS = [
  // --- off-state (first) ---
  {
    id: 'none',
    name: 'None',
    emoji: '🚫',
    description: 'No face stickers',
  },

  // --- 7 new animations ---

  {
    id: 'love',
    name: 'Love',
    emoji: '💕',
    description: 'Floating pink hearts, cheek blush & a soft rose glow',
  },
  {
    id: 'birds',
    name: 'Birds',
    emoji: '🐤',
    description: 'Three chirping birds circling above your head',
  },
  {
    id: 'storm_cloud',
    name: 'Storm Cloud',
    emoji: '⛈️',
    description: 'A little rain cloud with falling drops & lightning flashes',
  },
  {
    id: 'snowfall',
    name: 'Snowfall',
    emoji: '❄️',
    description: 'Snow cap, drifting flakes & six-arm crystal snowflakes',
  },
  {
    id: 'music_notes',
    name: 'Music',
    emoji: '🎵',
    description: 'Colorful 3D music notes drifting upward around you',
  },
  {
    id: 'butterflies',
    name: 'Butterflies',
    emoji: '🦋',
    description: 'Flapping butterflies fluttering around the head',
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    emoji: '🫧',
    description: 'Iridescent soap bubbles rising around the head',
  },

  // --- props & accessories ---
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    description: 'Golden royal crown with ruby & sapphire jewels',
  },
  {
    id: 'flower_crown',
    name: 'Flowers',
    emoji: '🌸',
    description: 'Pastel blossom floral wreath & fresh leaves',
  },
  {
    id: 'angel',
    name: 'Angel',
    emoji: '😇',
    description: 'Glowing golden halo & halo sparkle dust',
  },
  {
    id: 'devil',
    name: 'Devil',
    emoji: '😈',
    description: 'Glossy red demon horns with highlight sheen',
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    emoji: '🍓',
    description: 'Red berry beret cap, leaf stem & seed freckles',
  },
  {
    id: 'mushroom',
    name: 'Toadstool',
    emoji: '🍄',
    description: 'Red polka-dot mushroom cap & peach blush',
  },
  {
    id: 'ribbon',
    name: 'Ribbon',
    emoji: '🎀',
    description: 'Big aesthetic pink satin bow on hair',
  },
  {
    id: 'heart_blush',
    name: 'Heart Blush',
    emoji: '💖',
    description: 'Glowing heart cheek blush & floating hearts',
  },
  {
    id: 'star_glam',
    name: 'Star Glam',
    emoji: '✨',
    description: 'Glittering golden cheek stars & forehead sparkle',
  },
  {
    id: 'shades',
    name: 'Cyber Shades',
    emoji: '🕶️',
    description: 'Futuristic neon gradient sunglasses over eyes',
  },
  {
    id: 'retro_glasses',
    name: 'Gentleman',
    emoji: '👓',
    description: 'Round wireframe spectacles & curled mustache',
  },
  {
    id: 'cowboy',
    name: 'Cowboy',
    emoji: '🤠',
    description: 'Brown leather cowboy hat with golden star badge',
  },
  {
    id: 'party',
    name: 'Party Cone',
    emoji: '🥳',
    description: 'Striped festive party cone hat & confetti sparkles',
  },

  // --- animals (last) ---
  {
    id: 'puppy',
    name: 'Puppy',
    emoji: '🐶',
    description: 'Floppy puppy ears, black shiny nose & cute tongue',
  },
  {
    id: 'kitty',
    name: 'Kitty',
    emoji: '🐱',
    description: 'Pointed cat ears, pink nose & cute whiskers',
  },
  {
    id: 'bunny',
    name: 'Bunny',
    emoji: '🐰',
    description: 'Tall rabbit ears, pink nose & sweet blush',
  },
  {
    id: 'bear',
    name: 'Teddy Bear',
    emoji: '🐻',
    description: 'Fuzzy round bear ears & honey snout',
  },
  {
    id: 'froggy',
    name: 'Froggy',
    emoji: '🐸',
    description: 'Big green frog eyes & rosy cheeks',
  },
  {
    id: 'panda',
    name: 'Panda',
    emoji: '🐼',
    description: 'Black fluffy panda ears & sweet panda eye spots',
  },
  {
    id: 'reindeer',
    name: 'Reindeer',
    emoji: '🦌',
    description: 'Deer antlers, bright Rudolph nose & freckles',
  },
]

// No sticker by default (None is the first entry).
export const DEFAULT_AR_FILTER = AR_FILTERS[0]

/**
 * renderArOverlay.js derives its head-top anchor from landmark 10 (forehead).
 * MediaPipe marks that point at the hairline, so hats/crowns/halos can end up
 * sitting on the forehead. Lift only that landmark a little so head props sit
 * above the skull; every other landmark is left untouched so glasses, blush
 * and lip effects stay aligned with the face.
 */
export function liftForeheadLandmarks(faces, amount = 0.055) {
  return faces.map((face) =>
    face.map((pt, i) => (i === 10 ? { ...pt, y: pt.y - amount } : pt)),
  )
}
