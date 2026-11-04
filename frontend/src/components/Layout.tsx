import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined'
import MenuIcon from '@mui/icons-material/Menu'
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined'
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined'
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router'
import { adminApi, ordersApi } from '@/api/endpoints'
import type { Role } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { useCart } from '@/cart/CartContext'
import { roleLabel } from '@/format'

const DRAWER_WIDTH = 248

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  roles: Role[]
  badge?: 'pending' | 'toShip' | 'approvals'
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const A: Role = 'ADMIN'
const M: Role = 'MANAGER'
const W: Role = 'WORKER'

// One menu for all staff; each item lists the roles that see it (same as the table in plan section 5).
const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/admin/performance', label: 'Performance', icon: <TrendingUpOutlinedIcon />, roles: [A] },
      { to: '/dashboard', label: 'Dashboard', icon: <DashboardOutlinedIcon />, roles: [A, M] },
      { to: '/team', label: 'Team performance', icon: <GroupsOutlinedIcon />, roles: [M] },
      { to: '/performance', label: 'My performance', icon: <TrendingUpOutlinedIcon />, roles: [W] },
      { to: '/leaderboard', label: 'Leaderboard', icon: <EmojiEventsOutlinedIcon />, roles: [A, M, W] },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      { to: '/stock', label: 'Stock', icon: <WarehouseOutlinedIcon />, roles: [A, M, W] },
      { to: '/stock-in', label: 'Stock IN', icon: <MoveToInboxOutlinedIcon />, roles: [A, M, W] },
      { to: '/to-ship', label: 'Orders to ship', icon: <LocalShippingOutlinedIcon />, roles: [A, M, W], badge: 'toShip' },
      { to: '/history', label: 'Movement history', icon: <HistoryOutlinedIcon />, roles: [A, M, W] },
    ],
  },
  {
    title: 'Sales & catalog',
    items: [
      { to: '/orders', label: 'Orders', icon: <ReceiptLongOutlinedIcon />, roles: [A, M], badge: 'pending' },
      { to: '/products', label: 'Products', icon: <Inventory2OutlinedIcon />, roles: [A, M] },
      { to: '/categories', label: 'Categories', icon: <CategoryOutlinedIcon />, roles: [A, M] },
      { to: '/suppliers', label: 'Suppliers', icon: <StorefrontOutlinedIcon />, roles: [A, M] },
      { to: '/customers', label: 'Customers', icon: <PeopleAltOutlinedIcon />, roles: [A, M] },
      { to: '/restock', label: 'Restock list', icon: <ReportProblemOutlinedIcon />, roles: [A, M] },
      { to: '/reports', label: 'Reports', icon: <AssessmentOutlinedIcon />, roles: [A, M] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/approvals', label: 'Pending approvals', icon: <HowToRegOutlinedIcon />, roles: [A], badge: 'approvals' },
      { to: '/admin/users', label: 'Users', icon: <ManageAccountsOutlinedIcon />, roles: [A] },
    ],
  },
]

function useBadgeCounts(role: Role | undefined) {
  const staff = role === 'ADMIN' || role === 'MANAGER' || role === 'WORKER'
  const pending = useQuery({
    queryKey: ['orders', 'PENDING'],
    queryFn: () => ordersApi.list('PENDING'),
    enabled: role === 'ADMIN' || role === 'MANAGER',
    refetchInterval: 30_000,
  })
  const toShip = useQuery({
    queryKey: ['orders', 'APPROVED'],
    queryFn: () => ordersApi.list('APPROVED'),
    enabled: staff,
    refetchInterval: 30_000,
  })
  const approvals = useQuery({
    queryKey: ['admin', 'users', { status: 'PENDING' }],
    queryFn: () => adminApi.users({ status: 'PENDING' }),
    enabled: role === 'ADMIN',
    refetchInterval: 30_000,
  })
  return { pending: pending.data?.length, toShip: toShip.data?.length, approvals: approvals.data?.length }
}

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme()
  const current = mode === 'system' ? systemMode : mode
  if (!current) return null
  return (
    <Tooltip title={current === 'dark' ? 'Light mode' : 'Dark mode'}>
      <IconButton color="inherit" onClick={() => setMode(current === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
        {current === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  )
}

function Brand({ to }: { to: string }) {
  return (
    <Stack
      component={RouterLink}
      to={to}
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', color: 'inherit', textDecoration: 'none' }}
    >
      <Box component="img" src="/favicon.svg" alt="" sx={{ width: 28, height: 28 }} />
      <Typography variant="h6" noWrap sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
        KeyFive
      </Typography>
    </Stack>
  )
}

function UserMenu({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!user) return null
  return (
    <>
      <Tooltip title={user.email}>
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu">
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 15 }}>
            {user.full_name.charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user.full_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user.email} · {roleLabel[user.role]}
            {user.employee_code ? ` · ${user.employee_code}` : ''}
          </Typography>
        </Box>
        <Divider />
        {children}
        <MenuItem
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  )
}

/** Layout for Admin / Manager / Worker: app bar + side menu (temporary drawer on phones). */
export function StaffLayout() {
  const { user } = useAuth()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const counts = useBadgeCounts(user?.role)

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => user && i.roles.includes(user.role)) })).filter(
    (g) => g.items.length,
  )

  const drawer = (
    <Box sx={{ overflowY: 'auto', pb: 2 }}>
      {groups.map((group) => (
        <List
          key={group.title}
          dense
          subheader={
            <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>
              {group.title}
            </ListSubheader>
          }
        >
          {group.items.map((item) => {
            const selected = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
            const count = item.badge ? counts[item.badge] : undefined
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={selected}
                onClick={() => setOpen(false)}
                sx={{ mx: 1, borderRadius: 2 }}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
                {count ? <Badge badgeContent={count} color={item.badge === 'toShip' ? 'info' : 'warning'} sx={{ mr: 1 }} /> : null}
              </ListItemButton>
            )
          })}
        </List>
      ))}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          {!desktop && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          )}
          <Brand to="/" />
          <Typography variant="body2" sx={{ ml: 1.5, opacity: 0.8, display: { xs: 'none', sm: 'block' } }}>
            Warehouse · {user ? roleLabel[user.role] : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <ThemeToggle />
          <UserMenu />
        </Toolbar>
      </AppBar>
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        {drawer}
      </Drawer>
      <Box component="main" sx={{ flex: 1, minWidth: 0, bgcolor: 'background.default' }}>
        <Toolbar />
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}

/** Layout for the shop (customers and visitors). */
export function ShopLayout() {
  const { user } = useAuth()
  const { count } = useCart()
  const navigate = useNavigate()
  const isCustomer = user?.role === 'CUSTOMER'

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <Brand to="/" />
          <Box sx={{ flex: 1 }} />
          <Button color="inherit" component={RouterLink} to="/catalog" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            Catalog
          </Button>
          {isCustomer && (
            <Button color="inherit" component={RouterLink} to="/my-orders" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              My orders
            </Button>
          )}
          <ThemeToggle />
          <Tooltip title="Cart">
            <IconButton color="inherit" component={RouterLink} to="/cart" aria-label="Cart">
              <Badge badgeContent={count} color="secondary">
                <ShoppingCartOutlinedIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          {user ? (
            <UserMenu>
              {isCustomer && [
                <MenuItem key="orders" onClick={() => navigate('/my-orders')}>
                  <ListItemIcon>
                    <ReceiptLongOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  My orders
                </MenuItem>,
                <MenuItem key="profile" onClick={() => navigate('/profile')}>
                  <ListItemIcon>
                    <AccountCircleOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Profile
                </MenuItem>,
              ]}
              {!isCustomer && (
                <MenuItem onClick={() => navigate('/app')}>
                  <ListItemIcon>
                    <BarChartOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Warehouse app
                </MenuItem>
              )}
            </UserMenu>
          ) : (
            <Button color="inherit" variant="outlined" component={RouterLink} to="/login" sx={{ ml: 1 }}>
              Sign in
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 }, flex: 1 }}>
        <Outlet />
      </Container>
      <Box component="footer" sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 13 }}>
        KeyFive household goods · Almaty · prices in KZT (₸)
      </Box>
    </Box>
  )
}
