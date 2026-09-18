import { Card, CardContent, Grid, Typography } from '@mui/material';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Welcome back{user ? `, ${user.fullName.split(' ')[0]}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Administration, Clients and Projects are live. More domains (Contracts, Rate Cards,
        Workforce, Fleet, Attendance, Payroll, Billing) roll out in upcoming sprints.
      </Typography>

      <Grid container spacing={2}>
        {[
          { label: 'Clients', hint: 'Manage delivery/logistics companies you supply' },
          { label: 'Projects', hint: 'Track engagements and commercial scope per client' },
        ].map((item) => (
          <Grid item xs={12} sm={6} md={4} key={item.label}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600}>
                  {item.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.hint}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
