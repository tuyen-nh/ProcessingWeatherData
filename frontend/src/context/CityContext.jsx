import { createContext, useContext, useState } from 'react'
import { CITIES } from '../data/cities.js'

const CityContext = createContext(null)

export function CityProvider({ children }) {
  const [cityId, setCityId] = useState(CITIES[0].city_id)
  return (
    <CityContext.Provider value={{ cityId, setCityId }}>
      {children}
    </CityContext.Provider>
  )
}

export function useCity() {
  const ctx = useContext(CityContext)
  if (!ctx) throw new Error('useCity must be used inside CityProvider')
  return ctx
}
