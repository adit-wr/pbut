import { FILTERS } from '../lib/filters'
import { t } from '../lib/i18n'
import FilterRail from './FilterRail.jsx'

const percent = (value) => `${Math.round((value ?? 0) * 100)}%`

const describe = (filter) => {
  const beauty = filter.beauty || {}
  return `${filter.name} — smooth ${percent(beauty.smooth)}, whiten ${percent(beauty.whiten)}, blush ${percent(beauty.cheek)}, lips ${percent(beauty.lip)}`
}

export default function FilterPicker({ value, onChange, disabled, darkMode = true, lang = 'en' }) {
  return (
    <FilterRail
      items={FILTERS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      darkMode={darkMode}
      ariaLabel={t(lang, 'picker.filterAria')}
      label={t(lang, 'picker.filterLabel')}
      getTitle={describe}
    />
  )
}
