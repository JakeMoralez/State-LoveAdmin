import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tokens.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/motion-reset.css'
import './styles/polish.css'
import './styles/loading.css'
import './styles/sidebar.css'
import './styles/mobile.css'
import './styles/registry.css'
import './styles/judge-forum-list.css'
import './styles/assign.css'
import './styles/access-guide.css'
import './styles/activity.css'
import './styles/forum-formatting.css'
import './styles/congress.css'
import './styles/datepicker.css'
import './styles/cases.css'
import './styles/dev-settings.css'
import './styles/profile-cabinet.css'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './lib/errorReporter'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
