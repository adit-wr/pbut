import StripCanvas from './StripCanvas.jsx'
import { s } from '../strings.js'

export default function StripPanel({ booth }) {
  const {
    photos,
    theme,
    filter,
    arFilterId,
    canvasRef,
    handleStripDrawn,
    styles,
  } = booth
  const { line, muted, label, accent, darkMode } = styles

  return (
    <section className="min-w-0 lg:col-span-5 lg:col-start-5 lg:row-start-4">
      <p className={`${label} ${muted} mb-4 border-t pt-4 ${line}`}>
        <span className={`${accent} mr-2`}>06</span>{s('section.strip')}
      </p>
      <div className="w-full lg:max-w-[340px]">
        <StripCanvas
          photos={photos}
          theme={theme}
          filter={filter}
          arFilterId={arFilterId}
          quality={1}
          canvasRef={canvasRef}
          onDrawn={handleStripDrawn}
          darkMode={darkMode}
        />
      </div>
    </section>
  )
}
