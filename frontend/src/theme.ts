import { createTheme } from '@mui/material/styles'

// Light + dark color schemes; the toggle in the top bar switches between them (default: system setting).
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#1f4e79' },
        secondary: { main: '#e07a1f' },
        background: { default: '#f4f6f9', paper: '#ffffff' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#7fb2e5' },
        secondary: { main: '#f0a35e' },
        background: { default: '#0f1620', paper: '#17212d' },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 600, whiteSpace: 'nowrap' } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } },
  },
})

/** Fixed series colors for charts, readable in both schemes. */
export const chartColors = {
  shipped: '#2e7d32',
  approved: '#1f77b4',
  stockIn: '#e07a1f',
  in: '#1f77b4',
  out: '#d9534f',
  revenue: '#6f42c1',
  units: '#17a2b8',
  palette: ['#1f77b4', '#e07a1f', '#2e7d32', '#d9534f', '#6f42c1', '#17a2b8', '#8c564b', '#bcbd22'],
}
