import ArFilterPicker from './ArFilterPicker.jsx'
import FilterPicker from './FilterPicker.jsx'
import ThemePicker from './ThemePicker.jsx'
import { s } from '../strings.js'

export default function Pickers({ booth }) {
  const {
    arFilterId,
    setArFilterId,
    filterId,
    setFilterId,
    themeId,
    setThemeId,
    phase,
    styles,
  } = booth
  const { line, muted, label, accent, darkMode } = styles
  const disabled = phase === 'counting'

  return (
    <>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-5 lg:col-start-8 lg:row-start-2 lg:row-span-2 lg:h-full">
        <div className={`flex flex-col border-t pt-4 ${line} lg:flex-1`}>
          <p className={`${label} ${muted} mb-3`}>
            <span className={`${accent} mr-2`}>03</span>{s('section.face')}
          </p>
          <ArFilterPicker
            value={arFilterId}
            onChange={setArFilterId}
            disabled={disabled}
            darkMode={darkMode}
          />
        </div>

        <div className={`flex flex-col border-t pt-4 ${line} lg:flex-1`}>
          <p className={`${label} ${muted} mb-3`}>
            <span className={`${accent} mr-2`}>04</span>{s('section.finish')}
          </p>
          <FilterPicker
            value={filterId}
            onChange={setFilterId}
            disabled={disabled}
            darkMode={darkMode}
          />
        </div>
      </div>

      <div className={`border-t pt-4 lg:col-span-4 lg:col-start-1 lg:row-start-4 ${line}`}>
        <p className={`${label} ${muted} mb-3`}>
          <span className={`${accent} mr-2`}>05</span>{s('section.frame')}
        </p>
        <ThemePicker
          value={themeId}
          onChange={setThemeId}
          disabled={disabled}
          darkMode={darkMode}
        />
      </div>
    </>
  )
}
