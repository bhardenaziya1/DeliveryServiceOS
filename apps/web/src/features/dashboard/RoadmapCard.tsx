import { Card, CardContent, Chip, Stack, Typography } from '@mui/material';

const UPCOMING_MODULES = [
  'Contracts & rate configuration',
  'Workforce onboarding & assignments',
  'Fleet',
  'Attendance & productivity',
  'Payroll',
  'Client billing & reconciliation',
  'Compliance & reports',
];

export function RoadmapCard() {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
          On the roadmap
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Administration, Clients and Projects are live today. These domains roll out in upcoming
          sprints.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {UPCOMING_MODULES.map((module) => (
            <Chip key={module} label={module} size="small" color="default" />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
