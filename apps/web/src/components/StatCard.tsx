import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import { alpha, useTheme } from '@mui/material/styles';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: SvgIconComponent;
  hint?: string;
}

export function StatCard({ label, value, icon: Icon, hint }: StatCardProps) {
  const theme = useTheme();

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              {label}
            </Typography>
            <Typography variant="h5" fontWeight={800} color="text.primary">
              {value}
            </Typography>
            {hint && (
              <Typography variant="caption" color="text.secondary">
                {hint}
              </Typography>
            )}
          </Stack>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            <Icon fontSize="small" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
