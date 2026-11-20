import { FILTERS } from '../lib/filters'
import { s } from '../strings.js'
import FilterRail from './FilterRail.jsx'

const percent = (value) => `${Math.round((value ?? 0) * 100)}%`

const describe = (filter) => {
  const beauty = filter.beauty || {}
  return `${filter.name} — smooth ${percent(beauty.smooth)}, whiten ${percent(beauty.whiten)}, blush ${percent(beauty.cheek)}, lips ${percent(beauty.lip)}`
}

export default function FilterPicker({ value, onChange, disabled, darkMode = true }) {
  return (
    <FilterRail
      items={FILTERS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      darkMode={darkMode}
      ariaLabel={s('picker.filterAria')}
      label={s('picker.filterLabel')}
      getTitle={describe}
    />
  )
}
