import { useEffect, useState } from 'react'

// Generic async fetch hook. fn is re-run whenever any dep changes.
// Optional { pollMs }: re-run fn every pollMs ms WITHOUT toggling loading,
// so periodic refreshes update values in place (no spinner flash).
export function useFetch(fn, deps = [], { pollMs } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true

    // silent=true skips the loading flip — used for interval refreshes.
    const run = (silent = false) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      Promise.resolve(fn())
        .then((d) => alive && setData(d))
        .catch((e) => alive && setError(e))
        .finally(() => alive && !silent && setLoading(false))
    }

    run()

    let id
    if (pollMs > 0) id = setInterval(() => run(true), pollMs)

    return () => {
      alive = false
      if (id) clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, pollMs])

  return { data, loading, error }
}
