import { Box, Card, CardContent, Chip, Grid, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/endpoints'
import type { PaymentStatus } from '@/api/types'
import { EmptyState, PageHeader, QueryState } from '@/components/common'
import { formatDateTime, formatMoney } from '@/format'
import { t } from '@/i18n'
import { StatCard } from './parts'

const STATUS: Record<PaymentStatus, { label: string; color: 'success' | 'default' | 'warning' | 'info' }> = {
  SUCCEEDED: { label: 'Paid', color: 'success' }, // labels are English keys, shown through t()
  PENDING: { label: 'Open', color: 'info' },
  FAILED: { label: 'Cancelled', color: 'warning' },
  EXPIRED: { label: 'Expired', color: 'default' },
}

/** Money customers put in by card. Read only: there is no withdrawal for anybody. */
export function PaymentsPage() {
  const data = useQuery({ queryKey: ['admin', 'payments'], queryFn: adminApi.payments })

  return (
    <>
      <PageHeader
        title={t('Payments')}
        subtitle={data.data ? t('Top-ups by card through {0}. Read only: nobody can withdraw.', data.data.gateway) : undefined}
      />
      <QueryState isLoading={data.isLoading} error={data.error}>
        {data.data && (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <StatCard label={t('Received in total')} value={formatMoney(data.data.total)} tone="success" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <StatCard label={t('Received today')} value={formatMoney(data.data.today)} />
              </Grid>
            </Grid>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t('Latest payments')}
                </Typography>
                {data.data.payments.length ? (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('Started')}</TableCell>
                          <TableCell>{t('Payment')}</TableCell>
                          <TableCell>{t('Customer')}</TableCell>
                          <TableCell align="right">{t('Amount')}</TableCell>
                          <TableCell>{t('Status')}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Card')}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Note')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.data.payments.map((p) => (
                          <TableRow key={p.code}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.created_at)}</TableCell>
                            <TableCell>{p.code}</TableCell>
                            <TableCell>
                              {p.customer_name}
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {p.account_code}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                              {formatMoney(p.amount)}
                            </TableCell>
                            <TableCell>
                              <Chip size="small" label={t(STATUS[p.status].label)} color={STATUS[p.status].color} />
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, whiteSpace: 'nowrap' }}>
                              {p.card_last4 ? `${p.card_brand} •• ${p.card_last4}` : '—'}
                            </TableCell>
                            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{p.failure_reason ?? ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                ) : (
                  <EmptyState title={t('No payments yet')} text={t("Customers' card top-ups appear here.")} />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </QueryState>
    </>
  )
}
