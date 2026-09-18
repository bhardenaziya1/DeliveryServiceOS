import { Avatar } from '@mui/material';

const PALETTE = ['#dc2626', '#2f6feb', '#1a9f5c', '#d97706', '#7c3aed', '#0ea5a0', '#db2777'];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export interface EntityAvatarProps {
  name: string;
  size?: number;
}

/** Colored initial avatar for clients/workers/projects, keyed off the entity's name. */
export function EntityAvatar({ name, size = 32 }: EntityAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        fontWeight: 700,
        bgcolor: colorForName(name),
      }}
    >
      {initial}
    </Avatar>
  );
}
