import CloseIcon from '@mui/icons-material/Close'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useEffect, useRef, useState, type FormEvent } from 'react'

/**
 * Camera scanner (EAN-13 / Code 128...) in a dialog. The browser allows the camera only on localhost or HTTPS,
 * so on a phone run `npm run dev:https`. Manual input always works as a fallback.
 */
export function BarcodeScannerDialog({
  open,
  onClose,
  onDetected,
}: {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Kept in a ref so a new callback from the parent does not restart the camera.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!open) return
    let controls: IScannerControls | undefined
    let stopped = false
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not available here (it needs localhost or HTTPS). Type the barcode instead.')
      return
    }
    const reader = new BrowserMultiFormatReader()
    // Wait a tick so the <video> element of the dialog exists.
    const timer = setTimeout(() => {
      if (!videoRef.current) return
      reader
        .decodeFromConstraints({ video: { facingMode: 'environment' } }, videoRef.current, (result) => {
          if (result && !stopped) {
            stopped = true
            controls?.stop()
            navigator.vibrate?.(80)
            onDetectedRef.current(result.getText())
          }
        })
        .then((c) => {
          controls = c
          if (stopped) c.stop()
        })
        .catch((e: unknown) =>
          setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Cannot start the camera.'),
        )
    }, 100)
    return () => {
      stopped = true
      clearTimeout(timer)
      controls?.stop()
    }
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pr: 6 }}>
        Scan barcode
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="warning">{error}</Alert>
        ) : (
          <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: 'black', aspectRatio: '4 / 3' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
            <Box
              sx={{
                position: 'absolute',
                left: '10%',
                right: '10%',
                top: '45%',
                height: 2,
                bgcolor: 'error.main',
                boxShadow: '0 0 8px red',
              }}
            />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Text field for a barcode with a "scan" button; Enter or a successful scan calls onSubmit. */
export function BarcodeField({
  onSubmit,
  label = 'Barcode',
  autoFocus,
  disabled,
}: {
  onSubmit: (code: string) => void
  label?: string
  autoFocus?: boolean
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const [scanning, setScanning] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const code = value.trim()
    if (code) {
      onSubmit(code)
      setValue('')
    }
  }

  return (
    <>
      <Stack component="form" direction="row" spacing={1} onSubmit={submit}>
        <TextField
          fullWidth
          label={label}
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Scan or type and press Enter"
          slotProps={{
            htmlInput: { inputMode: 'numeric', autoComplete: 'off' },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Scan with camera">
                    <IconButton edge="end" onClick={() => setScanning(true)} disabled={disabled} aria-label="Scan with camera">
                      <QrCodeScannerIcon />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button type="submit" variant="outlined" disabled={disabled || !value.trim()}>
          Find
        </Button>
      </Stack>
      <BarcodeScannerDialog
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false)
          onSubmit(code)
        }}
      />
    </>
  )
}
