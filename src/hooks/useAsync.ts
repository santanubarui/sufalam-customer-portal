import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { errorMessage } from '../api/client'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

/** Runs `fn` on mount and whenever `deps` change; aborts stale requests. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    fnRef
      .current(ctrl.signal)
      .then((d) => !ctrl.signal.aborted && setData(d))
      .catch((e) => {
        if (!ctrl.signal.aborted && (e as Error)?.name !== 'AbortError') setError(errorMessage(e))
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}
