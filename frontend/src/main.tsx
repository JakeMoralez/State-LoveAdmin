import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/motion-reset.css'
import './styles/polish.css'
import './styles/mobile.css'
import './styles/registry.css'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './lib/errorReporter'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
