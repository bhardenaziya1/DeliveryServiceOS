import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Link, Stack } from '@mui/material';
import { useVerifyEmailMutation } from './api';
import { AuthLayout } from './AuthLayout';
import { extractApiErrorMessage } from '../../lib/apiClient';

/**
 * Consumes an email-verification link.
 *
 * Public: the link is usually opened in whichever browser the mailbox is in,
 * which is often not the one holding the session.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const verifyEmail = useVerifyEmailMutation();
  const [status, setStatus] = useState<'pending' | 'done' | 'failed'>('pending');
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // The token is single-use, so StrictMode's double-effect would burn it and
    // report a failure for a link that actually worked.
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setStatus('failed');
      setMessage('This verification link is missing its token.');
      return;
    }

    void verifyEmail
      .mutateAsync(token)
      .then(() => setStatus('done'))
      .catch((error: unknown) => {
        setStatus('failed');
        setMessage(extractApiErrorMessage(error));
      });
  }, [token, verifyEmail]);

  return (
    <AuthLayout title="Email verification">
      <Stack spacing={2}>
        {status === 'pending' && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {status === 'done' && (
          <Alert severity="success">Your email address has been confirmed.</Alert>
        )}
        {status === 'failed' && (
          <Alert severity="error">
            {message ?? 'This verification link is invalid or has expired.'}
          </Alert>
        )}
        <Link component={RouterLink} to="/login" underline="hover">
          Continue to VendorOS
        </Link>
      </Stack>
    </AuthLayout>
  );
}
