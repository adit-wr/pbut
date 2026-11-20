export default function CameraIcon({ className = 'size-6', strokeWidth = 1.6 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M3 8h4l1.5-2h7L17 8h4v11H3z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}
