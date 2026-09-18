import { alpha, createTheme } from '@mui/material/styles';

// VendorOS design tokens: deep navy sidebar/brand, bright blue accent, soft
// pill status badges and light, low-shadow cards. Keep new UI within these
// tokens rather than one-off colors — see docs/design-system.md.
export const colors = {
  navy: '#0f1c34',
  navySurface: '#152238',
  brand: '#2f6feb',
  brandDark: '#1d4fc0',
  background: '#f4f6fb',
  border: '#e6e9f2',
  textPrimary: '#101a2b',
  textSecondary: '#6b7488',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: colors.brand, dark: colors.brandDark, contrastText: '#ffffff' },
    secondary: { main: '#0ea5a0' },
    success: { main: '#1a9f5c' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    info: { main: '#2f6feb' },
    background: { default: colors.background, paper: '#ffffff' },
    text: { primary: colors.textPrimary, secondary: colors.textSecondary },
    divider: colors.border,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: ['Inter', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: 'none',
        },
        outlined: {
          borderColor: colors.border,
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          borderRadius: 14,
          borderColor: colors.border,
          boxShadow: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, textTransform: 'none' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 999 },
      },
      variants: [
        {
          props: { variant: 'filled', color: 'default' },
          style: { backgroundColor: alpha('#6b7488', 0.12), color: '#4b5568' },
        },
        {
          props: { variant: 'filled', color: 'success' },
          style: { backgroundColor: alpha('#1a9f5c', 0.12), color: '#177a48' },
        },
        {
          props: { variant: 'filled', color: 'warning' },
          style: { backgroundColor: alpha('#d97706', 0.14), color: '#a35a05' },
        },
        {
          props: { variant: 'filled', color: 'error' },
          style: { backgroundColor: alpha('#dc2626', 0.12), color: '#b91c1c' },
        },
        {
          props: { variant: 'filled', color: 'info' },
          style: { backgroundColor: alpha('#2f6feb', 0.12), color: '#1d4fc0' },
        },
      ],
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          backgroundColor: '#f8f9fc',
          color: colors.textSecondary,
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { boxShadow: 'none' },
      },
    },
  },
});
