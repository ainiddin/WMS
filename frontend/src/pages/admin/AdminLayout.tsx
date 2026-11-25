import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import PhoneAndroidOutlinedIcon from '@mui/icons-material/PhoneAndroidOutlined'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import {
  AppBar,
  Badge,
  Box,
  Chip,
  Container,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { PASSWORD_EXPIRED_EVENT, sessionEndsAt, tokens } from '@/api/client'
import { reportsApi } from '@/api/staff'
import { useAuth } from '@/auth/AuthContext'
import { ThemeToggle } from '@/components/Layout'
import { formatDateTime } from '@/format'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Users', icon: <PeopleOutlineIcon />, end: true },
  { to: '/admin/invitations', label: 'Invitations', icon: <ForwardToInboxOutlinedIcon /> },
  { to: '/admin/devices', label: 'Staff phones', icon: <PhoneAndroidOutlinedIcon /> },
  { to: '/admin/performance', label: 'Performance', icon: <EmojiEventsOutlinedIcon /> },
  { to: '/admin/audit', label: 'Audit log', icon: <ReceiptLongOutlinedIcon /> },
  { to: '/admin/password', label: 'Change password', icon: <KeyOutlinedIcon /> },
]

/** The Manager's work on the website. Shipping his team's orders and Stock IN too (barcodes typed or from a USB scanner). */
export const MANAGER_NAV: NavItem[] = [
  { to: '/manage', label: 'Dashboard', icon: <DashboardOutlinedIcon />, end: true },
  { to: '/manage/orders', label: 'Orders', icon: <ShoppingCartOutlinedIcon /> },
  { to: '/manage/ship', label: 'Orders to ship', icon: <LocalShippingOutlinedIcon /> },
  { to: '/manage/stock-in', label: 'Stock IN', icon: <MoveToInboxOutlinedIcon /> },
  { to: '/manage/restock', label: 'Restock list', icon: <ReportProblemOutlinedIcon /> },
  { to: '/manage/reports', label: 'Reports', icon: <AssessmentOutlinedIcon /> },
  { to: '/manage/products', label: 'Products', icon: <Inventory2OutlinedIcon /> },
  { to: '/manage/categories', label: 'Categories', icon: <CategoryOutlinedIcon /> },
  { to: '/manage/suppliers', label: 'Suppliers', icon: <StorefrontOutlinedIcon /> },
  { to: '/manage/customers', label: 'Customers', icon: <PeopleAltOutlinedIcon /> },
  { to: '/manage/team', label: 'My team', icon: <GroupsOutlinedIcon /> },
  { to: '/manage/invitations', label: 'Invitations', icon: <ForwardToInboxOutlinedIcon /> },
  { to: '/manage/performance', label: 'Team performance', icon: <EmojiEventsOutlinedIcon /> },
  { to: '/manage/password', label: 'Change password', icon: <KeyOutlinedIcon /> },
]

const DRAWER = 240

export function passwordExpired(expiresAt: string | null | undefined): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now())
}

export function AdminLayout() {
  return <StaffLayout title="KeyFive Admin" nav={ADMIN_NAV} passwordPath="/admin/password" />
}

export function ManagerLayout() {
  // Same query as the Restock page, so the number and the list stay in step; refreshed every minute.
  const restock = useQuery({ queryKey: ['reports', 'restock'], queryFn: reportsApi.restock, refetchInterval: 60_000 })
  return (
    <StaffLayout
      title="KeyFive Manager"
      nav={MANAGER_NAV}
      passwordPath="/manage/password"
      badges={{ '/manage/restock': restock.data?.length ?? 0 }}
    />
  )
}

/** Website frame for staff. Only the right role gets here (ProtectedRoute); the server checks every call anyway. */
export function StaffLayout({
  title,
  nav: items,
  passwordPath,
  badges = {},
}: {
  title: string
  nav: NavItem[]
  passwordPath: string
  /** Counters next to menu items, by path; 0 shows nothing. */
  badges?: Record<string, number>
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const endsAt = sessionEndsAt(tokens.access)

  useEffect(() => {
    const onExpired = () => navigate(passwordPath, { replace: true })
    window.addEventListener(PASSWORD_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(PASSWORD_EXPIRED_EVENT, onExpired)
  }, [navigate, passwordPath])

  if (passwordExpired(user?.password_expires_at) && location.pathname !== passwordPath) {
    return <Navigate to={passwordPath} replace />
  }

  const signOut = () => {
    logout()
    navigate('/staff/login', { replace: true })
  }

  const nav = (
    <List sx={{ pt: 1 }}>
      {items.map((item) => (
        <ListItemButton
          key={item.to}
          component={NavLink}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          sx={{ mx: 1, borderRadius: 1, '&.active': { bgcolor: 'action.selected', fontWeight: 600 } }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
          {!!badges[item.to] && <Badge badgeContent={badges[item.to]} color="error" max={99} sx={{ mr: 1.5 }} />}
        </ListItemButton>
      ))}
    </List>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" color="default" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={() => setOpen(true)} sx={{ display: { md: 'none' } }} aria-label="Menu">
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: '1.1rem' }}>
            {title}
          </Typography>
          {endsAt && (
            <Tooltip title="Website sessions end after 4 hours; then sign in again.">
              <Chip size="small" variant="outlined" label={`Session until ${formatDateTime(endsAt.toISOString())}`} sx={{ display: { xs: 'none', sm: 'flex' } }} />
            </Tooltip>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
            {user?.full_name}
          </Typography>
          <ThemeToggle />
          <Tooltip title="Sign out">
            <IconButton onClick={signOut} aria-label="Sign out">
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Drawer variant="temporary" open={open} onClose={() => setOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER } }}>
        <Toolbar />
        {nav}
      </Drawer>
      <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width: DRAWER, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
        <Toolbar />
        {nav}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}
