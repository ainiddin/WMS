import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link as RouterLink, Outlet, useNavigate } from "react-router";
import { accountApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { useCart } from "@/cart/CartContext";
import { formatMoney } from "@/format";

// The website is the shop only. Warehouse staff (Admin / Manager / Worker) work in the KeyFive Staff Android app.

export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const current = mode === "system" ? systemMode : mode;
  if (!current) return null;
  return (
    <Tooltip title={current === "dark" ? "Light mode" : "Dark mode"}>
      <IconButton
        color="inherit"
        onClick={() => setMode(current === "dark" ? "light" : "dark")}
        aria-label="Toggle dark mode"
      >
        {current === "dark" ? (
          <LightModeOutlinedIcon />
        ) : (
          <DarkModeOutlinedIcon />
        )}
      </IconButton>
    </Tooltip>
  );
}

function Brand({ to }: { to: string }) {
  return (
    <Stack
      component={RouterLink}
      to={to}
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", color: "inherit", textDecoration: "none" }}
    >
      <Box
        component="img"
        src="/favicon.svg"
        alt=""
        sx={{ width: 28, height: 28 }}
      />
      <Typography
        variant="h6"
        noWrap
        sx={{ fontWeight: 700, letterSpacing: 0.2 }}
      >
        KeyFive
      </Typography>
    </Stack>
  );
}

function UserMenu({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!user) return null;
  return (
    <>
      <Tooltip title={user.email}>
        <IconButton
          color="inherit"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Account menu"
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: "secondary.main",
              fontSize: 15,
            }}
          >
            {user.full_name.charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        onClick={() => setAnchor(null)}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user.full_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        {children}
        <MenuItem
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

/** Layout for the shop (customers and visitors). */
export function ShopLayout() {
  const { user } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const isCustomer = user?.role === "CUSTOMER";
  const account = useQuery({
    queryKey: ["account"],
    queryFn: accountApi.get,
    enabled: isCustomer,
  });

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 1 }}>
          <Brand to="/" />
          <Box sx={{ flex: 1 }} />
          <Button
            color="inherit"
            component={RouterLink}
            to="/catalog"
            sx={{ display: { xs: "none", sm: "inline-flex" } }}
          >
            Catalog
          </Button>
          {isCustomer && (
            <Button
              color="inherit"
              component={RouterLink}
              to="/my-orders"
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              My orders
            </Button>
          )}
          {isCustomer && account.data && (
            <Tooltip title="My account">
              <Button
                color="inherit"
                component={RouterLink}
                to="/account"
                startIcon={<AccountBalanceWalletOutlinedIcon />}
                sx={{ whiteSpace: "nowrap" }}
              >
                {formatMoney(account.data.balance)}
              </Button>
            </Tooltip>
          )}
          <ThemeToggle />
          <Tooltip title="Cart">
            <IconButton
              color="inherit"
              component={RouterLink}
              to="/cart"
              aria-label="Cart"
            >
              <Badge badgeContent={count} color="secondary">
                <ShoppingCartOutlinedIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          {user ? (
            <UserMenu>
              {isCustomer && [
                <MenuItem key="orders" onClick={() => navigate("/my-orders")}>
                  <ListItemIcon>
                    <ReceiptLongOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  My orders
                </MenuItem>,
                <MenuItem key="account" onClick={() => navigate("/account")}>
                  <ListItemIcon>
                    <AccountBalanceWalletOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  My account
                </MenuItem>,
                <MenuItem key="profile" onClick={() => navigate("/profile")}>
                  <ListItemIcon>
                    <AccountCircleOutlinedIcon fontSize="small" />
                  </ListItemIcon>
                  Profile
                </MenuItem>,
              ]}
            </UserMenu>
          ) : (
            <Button
              color="inherit"
              variant="outlined"
              component={RouterLink}
              to="/login"
              sx={{ ml: 1 }}
            >
              Sign in
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container
        maxWidth="lg"
        sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 }, flex: 1 }}
      >
        <Outlet />
      </Container>
      <Box
        component="footer"
        sx={{
          py: 3,
          textAlign: "center",
          color: "text.secondary",
          fontSize: 13,
        }}
      >
        KeyFive household goods · Almaty · prices in KZT (₸)
      </Box>
    </Box>
  );
}
