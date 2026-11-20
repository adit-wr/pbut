import { AR_FILTERS } from '../lib/arFilters'
import { t } from '../lib/i18n'
import FilterRail from './FilterRail.jsx'

export default function ArFilterPicker({ value, onChange, disabled, darkMode = true, lang = 'en' }) {
  return (
    <FilterRail
      items={AR_FILTERS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      darkMode={darkMode}
      ariaLabel={t(lang, 'picker.arAria')}
      label={t(lang, 'picker.arLabel')}
      getTitle={(item) => item.description}
    />
  )
}
