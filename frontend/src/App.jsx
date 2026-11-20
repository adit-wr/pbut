import ErrorBoundary from './components/ErrorBoundary.jsx'
import BoothPage from './pages/BoothPage.jsx'

export default function App() {
  return (
    <ErrorBoundary>
      <BoothPage />
    </ErrorBoundary>
  )
}
