import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1d3557' },
    secondary: { main: '#2a9d8f' },
    background: { default: '#f4f6f8', paper: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, backgroundColor: '#f8f9fb' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
});
