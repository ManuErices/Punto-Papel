import Topbar from './Topbar'
import Sidebar from './Sidebar'
import HelpPanel from '../HelpPanel'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="flex flex-col h-screen bg-[#f4f4f8] dark:bg-[#09090f] transition-colors duration-200">
      <Topbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6 bg-[#f4f4f8] dark:bg-[#09090f]">
          <Outlet />
        </main>
      </div>
      <HelpPanel />
    </div>
  )
}
