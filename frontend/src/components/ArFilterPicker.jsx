import { AR_FILTERS } from '../lib/arFilters'
import { s } from '../strings.js'
import FilterRail from './FilterRail.jsx'

export default function ArFilterPicker({ value, onChange, disabled, darkMode = true }) {
  return (
    <FilterRail
      items={AR_FILTERS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      darkMode={darkMode}
      ariaLabel={s('picker.arAria')}
      label={s('picker.arLabel')}
      getTitle={(item) => item.description}
    />
  )
}
