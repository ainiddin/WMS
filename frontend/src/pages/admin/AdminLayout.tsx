import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import ForwardToInboxOutlinedIcon from '@mui/icons-material/ForwardToInboxOutlined'
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import PhoneAndroidOutlinedIcon from '@mui/icons-material/PhoneAndroidOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import {
  AppBar,
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
import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { PASSWORD_EXPIRED_EVENT, sessionEndsAt, tokens } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { ThemeToggle } from '@/components/Layout'
import { formatDateTime } from '@/format'

const NAV = [
  { to: '/admin', label: 'Users', icon: <PeopleOutlineIcon />, end: true },
  { to: '/admin/invitations', label: 'Invitations', icon: <ForwardToInboxOutlinedIcon /> },
  { to: '/admin/devices', label: 'Staff phones', icon: <PhoneAndroidOutlinedIcon /> },
  { to: '/admin/performance', label: 'Performance', icon: <EmojiEventsOutlinedIcon /> },
  { to: '/admin/audit', label: 'Audit log', icon: <ReceiptLongOutlinedIcon /> },
  { to: '/admin/password', label: 'Change password', icon: <KeyOutlinedIcon /> },
]

const DRAWER = 240

export function passwordExpired(expiresAt: string | null | undefined): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now())
}

/** Admin panel frame. Only Admins get here (AdminRoute); the server checks every call anyway. */
export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const endsAt = sessionEndsAt(tokens.access)

  useEffect(() => {
    const onExpired = () => navigate('/admin/password', { replace: true })
    window.addEventListener(PASSWORD_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(PASSWORD_EXPIRED_EVENT, onExpired)
  }, [navigate])

  if (passwordExpired(user?.password_expires_at) && location.pathname !== '/admin/password') {
    return <Navigate to="/admin/password" replace />
  }

  const signOut = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  const nav = (
    <List sx={{ pt: 1 }}>
      {NAV.map((item) => (
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
            KeyFive Admin
          </Typography>
          {endsAt && (
            <Tooltip title="Website Admin sessions end after 4 hours; then sign in again with the email code.">
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
