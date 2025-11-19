import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Removed default Vite styles that broke AdminLTE layout
import App from './App.tsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
