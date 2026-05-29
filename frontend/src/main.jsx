import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import App from './App.jsx'
import { CityProvider } from './context/CityContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem
      themes={['light', 'dark']}
      disableTransitionOnChange={false}
    >
      <BrowserRouter>
        <CityProvider>
          <App />
        </CityProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
