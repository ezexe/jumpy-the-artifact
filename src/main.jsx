import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import JumpyFrog from './jumpy.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <JumpyFrog />
  </StrictMode>,
)
