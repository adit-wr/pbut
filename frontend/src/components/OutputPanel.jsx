import { s } from '../strings.js'

export default function OutputPanel({ booth }) {
  const {
    save,
    darkMode,
    styles,
    handleRetryUpload,
    handleDownload,
    handleRetake,
    processed,
    reviewing,
  } = booth
  const { line, muted, label, accent, accentFill } = styles

  const statusClass =
    save.status === 'success'
      ? darkMode
        ? 'border-pink-300 text-pink-200'
        : 'border-pink-600 text-pink-700'
      : save.status === 'error'
        ? darkMode
          ? 'border-red-500 text-red-400'
          : 'border-red-600 text-red-700'
        : `border-neutral-400 ${muted}`

  return (
    <section className="min-w-0 lg:col-span-3 lg:col-start-10 lg:row-start-4">
      <p className={`${label} ${muted} mb-4 border-t pt-4 ${line}`}>
        <span className={`${accent} mr-2`}>07</span>{s('section.output')}
      </p>

      {save.status !== 'idle' && (
        <div className={`mb-4 flex flex-col gap-2 border-l-2 pl-3 text-[13px] ${statusClass}`}>
          <span>
            {save.status === 'sending' && (
              <span className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
            )}
            {save.message}
          </span>
          {save.status === 'error' && (
            <button
              type="button"
              onClick={handleRetryUpload}
              className="shrink-0 self-start font-semibold uppercase tracking-[0.14em] underline underline-offset-4 md:cursor-pointer"
            >
              {s('output.retry')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!processed}
          title={
            processed
              ? s('output.downloadTitle')
              : s('output.downloadLockedTitle')
          }
          className={`h-14 text-[11px] font-semibold uppercase leading-none tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-25 md:cursor-pointer ${accentFill}`}
        >
          {s('output.download')}
        </button>
        <button
          type="button"
          onClick={handleRetake}
          disabled={!reviewing}
          className={`h-14 border text-[11px] font-semibold uppercase leading-none tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-25 md:cursor-pointer ${line} ${muted} hover:text-neutral-950 dark:hover:text-neutral-50`}
        >
          {s('output.newStrip')}
        </button>
      </div>

      {reviewing && !processed && (
        <p className={`mt-3 text-[11px] leading-relaxed ${muted}`}>
          {save.status === 'error' ? s('output.locked') : s('output.hint')}
        </p>
      )}
    </section>
  )
}
