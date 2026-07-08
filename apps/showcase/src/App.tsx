import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Splash from './pages/Splash'
import Showcase from './pages/Showcase'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Support from './pages/Support'

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Splash />} />
        <Route path="showcase" element={<Showcase />} />
        <Route path="privacy-policy" element={<PrivacyPolicy />} />
        <Route path="support" element={<Support />} />
      </Route>
    </Routes>
  </BrowserRouter>
)

export default App
