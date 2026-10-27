import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CreatePO from './pages/CreatePO'
import Orders from './pages/Orders'
import Payments from './pages/Payments'
import InTransit from './pages/InTransit'
import Statements from './pages/Statements'
import { PortalProvider, ProfileMenu } from './components/header'

const screens = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/orders/new', label: 'Create PO' },
  { to: '/orders', label: 'My Orders' },
  { to: '/payments', label: 'PI & Payments' },
  { to: '/in-transit', label: 'In-Transit' },
  { to: '/statements', label: 'Statements' },
]

function ThemeBar() {
  return (
    <div className="theme-bar">
      <ProfileMenu variant="dark" showName />
      <span className="tb-sep" />
      {screens.map((s) => (
        <NavLink key={s.to} to={s.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
          {s.label}
        </NavLink>
      ))}
      <span className="spacer" />
      <span className="tb-title">
        UI THEME · <b>Sufalam Customer Portal</b>
      </span>
    </div>
  )
}

export default function App() {
  return (
    <PortalProvider>
      <ThemeBar />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/new" element={<CreatePO />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/in-transit" element={<InTransit />} />
        <Route path="/statements" element={<Statements />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </PortalProvider>
  )
}
