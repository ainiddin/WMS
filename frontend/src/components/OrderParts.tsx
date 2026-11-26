import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  AlertTitle,
  Box,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { t } from "@/i18n";
import type { ReactNode } from "react";
import type { Order, WaitingLine } from "@/api/types";
import { formatDateTime, formatMoney } from "@/format";

/** Order lines with prices and the total. Staff (Manager panel) also see the stock, so shortages show up. */
export function OrderItemsTable({ order, showStock = false }: { order: Order; showStock?: boolean }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("Product")}</TableCell>
            <TableCell align="right">{t("Qty")}</TableCell>
            {showStock && <TableCell align="right">{t("In stock")}</TableCell>}
            <TableCell align="right">{t("Price")}</TableCell>
            <TableCell align="right">{t("Sum")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {order.items.map((item) => {
            const short =
              showStock && item.available_quantity !== null && item.available_quantity < item.quantity;
            return (
            <TableRow key={item.id}>
              <TableCell>
                <Typography variant="body2">{item.product_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.product_code}
                  {item.barcode ? ` · ${item.barcode}` : ""}
                </Typography>
              </TableCell>
              <TableCell align="right">{item.quantity}</TableCell>
              {showStock && (
                <TableCell align="right" sx={{ color: short ? "error.main" : undefined, whiteSpace: "nowrap" }}>
                  {short && (
                    <Tooltip title={t("Not enough stock")}>
                      <WarningAmberIcon fontSize="inherit" sx={{ mr: 0.5, verticalAlign: "middle" }} />
                    </Tooltip>
                  )}
                  {item.available_quantity}
                </TableCell>
              )}
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {formatMoney(item.unit_price)}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {formatMoney(item.line_total)}
              </TableCell>
            </TableRow>
            );
          })}
          <TableRow>
            <TableCell colSpan={showStock ? 4 : 3} sx={{ fontWeight: 600, borderBottom: 0 }}>
              {t("Total")}
            </TableCell>
            <TableCell
              align="right"
              sx={{ fontWeight: 600, whiteSpace: "nowrap", borderBottom: 0 }}
            >
              {formatMoney(order.total_amount)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export const formatEta = (min: number | null, max: number | null) =>
  min === null || max === null ? null : t("{0}–{1} days", min, max);

/** What an order (or a cart at checkout) waits for, and roughly how long. */
export function WaitingNotice({
  waiting,
  etaMin,
  etaMax,
  footer,
}: {
  waiting: WaitingLine[];
  etaMin: number | null;
  etaMax: number | null;
  footer?: ReactNode;
}) {
  const eta = formatEta(etaMin, etaMax);
  return (
    <Alert severity="warning">
      <AlertTitle>
        {t("Waiting for stock")}{eta ? " · " + t("expected in {0}", eta) : ""}
      </AlertTitle>
      {waiting.map((w) => (
        <Typography key={w.product_id} variant="body2">
          {t("{0}: {1} more needed", w.product_name, w.missing)}
        </Typography>
      ))}
      {footer && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {footer}
        </Typography>
      )}
    </Alert>
  );
}

/** PENDING -> APPROVED -> SHIPPED progress, or the reason why the order stopped. */
export function OrderProgress({ order }: { order: Order }) {
  if (order.status === "REJECTED" || order.status === "CANCELLED") {
    return (
      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
        <Typography variant="body2">
          {order.status === "REJECTED" ? t("Rejected") : t("Cancelled")}{" "}
          {formatDateTime(
            order.status === "REJECTED"
              ? order.approved_at
              : order.cancelled_at,
          )}
          {order.rejection_reason ? ` — ${order.rejection_reason}` : ""}
        </Typography>
      </Box>
    );
  }
  const steps = [
    { label: t("Placed"), at: order.created_at },
    { label: t("Confirmed"), at: order.approved_at },
    { label: t("Shipped"), at: order.shipped_at },
  ];
  const active =
    order.status === "SHIPPED" ? 3 : order.status === "APPROVED" ? 2 : 1;
  return (
    <Stepper activeStep={active} alternativeLabel>
      {steps.map((s, i) => (
        <Step key={s.label} completed={i < active}>
          <StepLabel
            icon={
              i < active ? (
                <CheckCircleIcon color="success" />
              ) : (
                <RadioButtonUncheckedIcon color="disabled" />
              )
            }
            optional={
              <Typography variant="caption" color="text.secondary">
                {s.at ? formatDateTime(s.at) : " "}
              </Typography>
            }
          >
            {s.label}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

const PAYMENT_LABEL = {
  get PAID() { return t("Paid from the KeyFive account") },
  get REFUNDED() { return t("Refunded to the KeyFive account") },
  get NONE() { return t("On delivery") },
};

/** `staff`: the Manager panel also shows who ordered, approved, picks and shipped it. */
export function OrderMeta({ order, staff = false }: { order: Order; staff?: boolean }) {
  const rows: [string, string | null | undefined][] = [
    [t("Customer"), staff ? `${order.customer.full_name} (${order.customer.code})` : null],
    [t("Delivery address"), order.delivery_address],
    [t("Payment"), PAYMENT_LABEL[order.payment_status ?? "NONE"]],
    [t("Comment"), order.comment],
    [t("Approved by"), staff && order.approved_at ? (order.approved_by?.full_name ?? t("System (automatic)")) : null],
    [t("Assigned to"), staff && order.status === "APPROVED" ? (order.assigned_to?.full_name ?? t("Nobody yet (no active Workers)")) : null],
    [t("Shipped by"), staff ? order.shipped_by?.full_name : null],
  ];
  return (
    <Stack spacing={0.5}>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <Typography key={k} variant="body2">
            <Box component="span" sx={{ color: "text.secondary" }}>
              {k}:
            </Box>{" "}
            {v}
          </Typography>
        ))}
    </Stack>
  );
}
