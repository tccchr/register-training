import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-thai/thai-400.css'
import '@fontsource/noto-sans-thai/thai-500.css'
import '@fontsource/noto-sans-thai/thai-600.css'
import '@fontsource/noto-sans-thai/thai-700.css'
import '@fontsource/noto-sans-thai/latin-400.css'
import '@fontsource/noto-sans-thai/latin-500.css'
import '@fontsource/noto-sans-thai/latin-600.css'
import '@fontsource/noto-sans-thai/latin-700.css'
import '@fontsource/mitr/thai-500.css'
import '@fontsource/mitr/thai-600.css'
import '@fontsource/mitr/thai-700.css'
import '@fontsource/mitr/latin-500.css'
import '@fontsource/mitr/latin-600.css'
import '@fontsource/mitr/latin-700.css'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
