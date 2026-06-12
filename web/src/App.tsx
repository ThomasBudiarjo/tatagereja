import { Route, Router } from '@solidjs/router'
import HomePage from './pages/HomePage'

function App() {
  return (
    <Router>
      <Route path="/" component={HomePage} />
      <Route path="*" component={HomePage} />
    </Router>
  )
}

export default App
