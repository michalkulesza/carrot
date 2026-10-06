import { Outlet } from 'react-router-dom'
import Footer from './Footer'

const Layout = () => (
  <div className="flex min-h-screen w-full flex-col bg-canvas bg-dot-grid font-nunito text-ink">
    <div className="flex flex-1 flex-col">
      <Outlet />
    </div>
    <Footer />
  </div>
)

export default Layout
