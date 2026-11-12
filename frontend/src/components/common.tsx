import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  type ChipProps,
} from "@mui/material";
import type { ReactNode } from "react";
import { errorMessage } from "@/api/client";
import type { OrderStatus } from "@/api/types";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{
        mb: 3,
        justifyContent: "space-between",
        alignItems: { xs: "stretch", sm: "center" },
      }}
    >
      <Box>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: "wrap", gap: 1, "& > *": { m: "0 !important" } }}
        >
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

const ORDER_COLORS: Record<OrderStatus, ChipProps["color"]> = {
  PENDING: "warning",
  APPROVED: "info",
  SHIPPED: "success",
  REJECTED: "error",
  CANCELLED: "default",
};

/** PENDING now only means "waiting for stock": nobody approves orders by hand. */
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "WAITING FOR STOCK",
  APPROVED: "APPROVED",
  SHIPPED: "SHIPPED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return (
    <Chip
      size="small"
      label={ORDER_STATUS_LABEL[status]}
      color={ORDER_COLORS[status]}
      variant="outlined"
    />
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      spacing={1}
      sx={{
        py: 6,
        alignItems: "center",
        textAlign: "center",
        color: "text.secondary",
      }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 48, opacity: 0.6 }} />
      <Typography variant="subtitle1" color="text.primary">
        {title}
      </Typography>
      {text && <Typography variant="body2">{text}</Typography>}
      {action}
    </Stack>
  );
}

/** Shows a spinner while loading and an error box on failure; renders children only when data is ready. */
export function QueryState({
  isLoading,
  error,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
}) {
  if (isLoading)
    return (
      <Box sx={{ py: 6, display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  if (error) return <Alert severity="error">{errorMessage(error)}</Alert>;
  return <>{children}</>;
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Confirm",
  color = "primary",
  loading,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  color?: "primary" | "error" | "success" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {text && <DialogContentText>{text}</DialogContentText>}
        {children}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color={color}
          onClick={onConfirm}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
