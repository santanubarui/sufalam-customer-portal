import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { SalesItem } from '../api/portal'

/** How many matches are rendered at once; typing narrows the list further. */
const MAX_SHOWN = 50

/** Item dropdown with a search box — matches on item name or code. */
export function ItemPicker({ items, value, onChange }: { items: SalesItem[]; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<CSSProperties>({})
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = items.find((i) => i.code === value)

  const matches = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return items
    return items.filter((i) => {
      const hay = `${i.name} ${i.code}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [items, q])
  const shown = matches.slice(0, MAX_SHOWN)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // The table/card around the picker clip overflow, so the popup is fixed-positioned under the button.
  const toggle = () => {
    if (open) return setOpen(false)
    const r = box.current!.getBoundingClientRect()
    const width = Math.max(r.width, 320)
    const below = window.innerHeight - r.bottom
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      ...(below < 320 && r.top > below ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
    setOpen(true)
  }

  // Close on page scroll / resize, since the popup would otherwise drift away from its button.
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (box.current && box.current.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQ('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active]) pick(shown[active].code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="ss" ref={box}>
      <button type="button" className="input-sm ss-btn" onClick={toggle} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current?.name ?? 'Select item'}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ss-pop" style={pos}>
          <input
            className="input-sm"
            autoFocus
            placeholder={`Search ${items.length} items by name or code…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <ul className="ss-list" role="listbox" ref={list}>
            {shown.map((i, idx) => (
              <li
                key={i.code}
                role="option"
                aria-selected={i.code === value}
                className={`${idx === active ? 'active' : ''} ${i.code === value ? 'sel' : ''}`}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(i.code)
                }}
              >
                <span>{i.name}</span>
                <small>{i.code}</small>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <div className="ss-empty">No item matches “{q}”.</div>}
          {matches.length > MAX_SHOWN && (
            <div className="ss-more">
              Showing {MAX_SHOWN} of {matches.length} — type more to narrow down.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
