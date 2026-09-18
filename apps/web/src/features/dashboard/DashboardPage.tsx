import { Grid, Stack, Typography } from '@mui/material';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { ProjectStatus } from '@vendoros/shared';
import { useAuth } from '../auth/AuthContext';
import { useClients } from '../clients/api';
import { useProjects } from '../projects/api';
import { StatCard } from '../../components/StatCard';
import { RoadmapCard } from './RoadmapCard';

export function DashboardPage() {
  const { user } = useAuth();
  const { data: clientsPage } = useClients({ page: 1, pageSize: 1 });
  const { data: projectsPage } = useProjects({ page: 1, pageSize: 100 });

  const activeProjects =
    projectsPage?.items.filter((project) => project.status === ProjectStatus.ACTIVE).length ?? 0;

  return (
    <>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Good morning{user ? `, ${user.fullName.split(' ')[0]}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Here's what's happening with your business today.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Total clients"
            value={clientsPage?.total ?? '—'}
            icon={BusinessOutlinedIcon}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Active projects"
            value={projectsPage ? activeProjects : '—'}
            icon={AssignmentTurnedInOutlinedIcon}
            hint={projectsPage ? `of ${projectsPage.total} total` : undefined}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Total workforce"
            value="—"
            icon={GroupsOutlinedIcon}
            hint="Coming soon"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Fleet vehicles"
            value="—"
            icon={LocalShippingOutlinedIcon}
            hint="Coming soon"
          />
        </Grid>
      </Grid>

      <Stack spacing={2}>
        <RoadmapCard />
      </Stack>
    </>
  );
}
