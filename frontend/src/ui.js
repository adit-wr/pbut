export function getStyles(darkMode) {
  const label = 'text-[10px] font-bold uppercase leading-none tracking-[0.22em]'
  const muted = 'text-neutral-500'
  const accent = darkMode ? 'text-pink-300' : 'text-pink-600'
  const accentFill = 'bg-pink-300 text-neutral-950 hover:bg-pink-200'
  return {
    darkMode,
    line: darkMode ? 'border-neutral-800' : 'border-neutral-200',
    muted,
    label,
    accent,
    accentFill,
    control: `flex h-9 items-center justify-center px-2 sm:px-4 ${label} transition disabled:cursor-not-allowed disabled:opacity-40`,
    controlOn: accentFill,
    controlOff: `${muted} ${darkMode ? 'hover:text-neutral-50' : 'hover:text-neutral-950'}`,
  }
}
