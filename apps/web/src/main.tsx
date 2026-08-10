import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

// الحاجز عند الجذر لا داخل المسارات: خطأ في AuthProvider أو في الهيكل نفسه
// يقع **قبل** أن يُركَّب أي مسار، فحاجزٌ أعمق منه لا يراه ويعود البياض.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
