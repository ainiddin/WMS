import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Alert,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import type { Invitation } from '@/api/types'
import { EmptyState } from '@/components/common'
import { formatDateTime, roleLabel } from '@/format'

export const INVITE_COLOR = { PENDING: 'warning', ACCEPTED: 'success', REVOKED: 'default', EXPIRED: 'error' } as const

/** The full address of an invitation link path (/join/<token>) on this website. */
export const fullLink = (path: string) => `${window.location.origin}${path}`

/** Clipboard access, kept apart so tests can replace it. */
export const clipboard = { copy: (text: string) => navigator.clipboard.writeText(text) }

/** The link right after it was made: shown only now (the server keeps only its hash). */
export function NewLink({ path, expiresAt }: { path: string; expiresAt: string }) {
  const [copied, setCopied] = useState(false)
  const url = fullLink(path)
  return (
    <Alert severity="success" icon={false} sx={{ '& .MuiAlert-message': { width: '100%' } }}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 600 }}>
          Link ready. Send it to the person (Telegram, WhatsApp…). It works once, until {formatDateTime(expiresAt)}.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            size="small"
            fullWidth
            value={url}
            label="Invitation link"
            slotProps={{ htmlInput: { readOnly: true, onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.target.select() } }}
          />
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={async () => {
              try {
                await clipboard.copy(url)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          This is the only time the link is shown. If it gets lost, revoke it and make a new one.
        </Typography>
      </Stack>
    </Alert>
  )
}

/** Links with their status and, once used, who joined with them. */
export function InvitationRows({
  invitations,
  busy,
  onRevoke,
  showInviter = false,
}: {
  invitations: Invitation[]
  busy: boolean
  onRevoke: (inv: Invitation) => void
  showInviter?: boolean
}) {
  if (!invitations.length) return <EmptyState title="No invitations yet" text="Make a link and send it to the person." />
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Made</TableCell>
            <TableCell>Role</TableCell>
            {showInviter && <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>By</TableCell>}
            <TableCell>Status</TableCell>
            <TableCell>Joined / valid until</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {invitations.map((inv) => (
            <TableRow key={inv.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(inv.created_at)}</TableCell>
              <TableCell>
                {roleLabel[inv.role]}
                {inv.team_name && (
                  <Typography variant="caption" color="text.secondary" component="div">
                    {inv.team_name}
                  </Typography>
                )}
              </TableCell>
              {showInviter && (
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{inv.invited_by_email}</TableCell>
              )}
              <TableCell>
                <Chip size="small" variant="outlined" color={INVITE_COLOR[inv.status]} label={inv.status} />
              </TableCell>
              <TableCell>
                {inv.status === 'ACCEPTED' ? (
                  <>
                    {inv.joined_name} · {inv.joined_employee_code}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {inv.joined_email}
                    </Typography>
                  </>
                ) : inv.status === 'PENDING' ? (
                  formatDateTime(inv.expires_at)
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell align="right">
                {inv.status === 'PENDING' && (
                  <Button size="small" color="error" disabled={busy} onClick={() => onRevoke(inv)}>
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
