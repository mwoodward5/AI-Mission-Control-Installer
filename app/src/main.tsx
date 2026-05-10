import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ComputerPlexityApp from './ComputerPlexityApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComputerPlexityApp />
  </StrictMode>,
)