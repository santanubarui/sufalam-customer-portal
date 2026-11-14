import { useEffect, useRef, useState } from 'react'
import { dmy } from '../api/portal'

/** "18-11-2025" -> "2025-11-18"; '' when it isn't a real calendar date. */
const toIso = (text: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text)
  if (!m) return ''
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(`${iso}T00:00:00`)
  return d.getFullYear() === +m[3] && d.getMonth() + 1 === +m[2] && d.getDate() === +m[1] ? iso : ''
}

/** Typing "18112025" gives "18-11-2025". */
const mask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('-')
}

interface Props {
  /** ISO yyyy-mm-dd, or '' */
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  className?: string
  'aria-label'?: string
}

/**
 * Date field that always shows and accepts dd-mm-yyyy, whatever the browser's language.
 * The value in and out stays ISO (yyyy-mm-dd); the 📅 button opens the browser's calendar.
 */
export function DateInput({ value, onChange, min, max, className, 'aria-label': ariaLabel }: Props) {
  const [text, setText] = useState(dmy(value))
  const picker = useRef<HTMLInputElement>(null)

  // follow changes made from outside (calendar pick, draft restore, reset)
  useEffect(() => {
    if (toIso(text) !== value) setText(dmy(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const type = (raw: string) => {
    const t = mask(raw)
    setText(t)
    if (!t) onChange('')
    else {
      const iso = toIso(t)
      if (iso) onChange(iso)
    }
  }

  const openCalendar = () => {
    const el = picker.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <span className="date-input">
      <input
        className={className}
        type="text"
        inputMode="numeric"
        placeholder="dd-mm-yyyy"
        maxLength={10}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setText(dmy(value))}
      />
      <button type="button" className="date-input-btn" title="Pick a date" aria-label="Pick a date" onClick={openCalendar}>
        📅
      </button>
      <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" className="date-input-native" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </span>
  )
}
