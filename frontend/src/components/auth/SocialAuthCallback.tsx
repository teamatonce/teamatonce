/**
 * SocialAuthCallback Component
 * Handles OAuth callback and token exchange
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSocialAuth } from '../../hooks/useSocialAuth';
import { useAuth } from '../../contexts/AuthContext';
import { useCompanyStore } from '../../stores/companyStore';
import { SocialProvider } from '../../types/social-auth';
import { getSocialAuthErrorMessage } from '../../config/social-auth-config';
import AccountLinkingModal from './AccountLinkingModal';

const SocialAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { error: authError } = useSocialAuth();
  const { refreshUser, user } = useAuth();
  const { fetchUserCompanies } = useCompanyStore();

  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLinkingModal, setShowLinkingModal] = useState(false);
  const [linkingData] = useState<{
    email: string;
    provider: SocialProvider;
    socialToken: string;
  } | null>(null);

  // Note: Role selection is now handled in the onboarding flow, not via modal

  // Prevent double-execution in React Strict Mode
  const hasProcessedRef = React.useRef(false);

  useEffect(() => {
    const processCallback = async () => {
      // Prevent double execution in development (React Strict Mode)
      if (hasProcessedRef.current) {
        console.log('Skipping duplicate OAuth callback processing');
        return;
      }
      hasProcessedRef.current = true;
      try {
        setIsProcessing(true);

        // Get URL parameters (database returns tokens directly)
        const databaseToken = searchParams.get('access_token');
        const databaseRefreshToken = searchParams.get('refresh_token');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const provider = searchParams.get('provider') as SocialProvider;
        const email = searchParams.get('email');
        const userId = searchParams.get('user_id');

        console.log('OAuth callback params:', {
          hasdatabaseToken: !!databaseToken,
          hasRefreshToken: !!databaseRefreshToken,
          provider,
          email,
          userId,
          error,
        });

        // Handle OAuth errors
        if (error) {
          const errorMsg = errorDescription || getSocialAuthErrorMessage(error);
          setError(errorMsg);
          toast.error('Authentication Failed', {
            description: errorMsg,
          });

          // Redirect to login after delay
          setTimeout(() => {
            navigate('/auth/login');
          }, 3000);
          return;
        }

        // Validate parameters - now expecting tokens instead of code
        if (!databaseToken || !databaseRefreshToken || !provider || !userId || !email) {
          setError('Invalid authentication response. Please try again.');
          toast.error('Authentication Failed', {
            description: 'Invalid authentication response.',
          });

          setTimeout(() => {
            navigate('/auth/login');
          }, 3000);
          return;
        }

        // Retrieve the role that was stored before OAuth redirect (from signup page)
        const signupRole = localStorage.getItem('oauth_signup_role') as 'client' | 'seller' | null;

        // Exchange database token for Team@Once JWT with role
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
        const exchangeResponse = await fetch(`${apiUrl}/auth/oauth/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            databaseToken: databaseToken,
            userId: userId,
            email: email,
            role: signupRole, // Pass role if available (from signup page)
          }),
        });

        if (!exchangeResponse.ok) {
          const errorData = await exchangeResponse.json().catch(() => null);
          console.error('Exchange token failed:', exchangeResponse.status, errorData);
          throw new Error(errorData?.message || `Failed to exchange OAuth token: ${exchangeResponse.status}`);
        }

        const exchangeData = await exchangeResponse.json();
        console.log('Exchange token response:', exchangeData);

        // Clear the stored role
        localStorage.removeItem('oauth_signup_role');

        // Check if user needs to select role (first-time social auth from login page)
        if (exchangeData.needsRoleSelection) {
          // New user without role - redirect to onboarding with role selection
          // Store temp token as accessToken so user can access protected onboarding route
          // This is a temporary token (10 min expiry) until they select their role
          console.log('Storing tempToken as accessToken');
          localStorage.setItem('accessToken', exchangeData.tempToken);
          localStorage.setItem('tempToken', exchangeData.tempToken);
          localStorage.setItem('pendingUserId', exchangeData.user.id);
          localStorage.setItem('pendingUserEmail', exchangeData.user.email);
          localStorage.setItem('pendingUserName', exchangeData.user.name);
          if (exchangeData.user.avatarUrl) {
            localStorage.setItem('pendingUserAvatar', exchangeData.user.avatarUrl);
          }

          // Dispatch event so AuthContext knows to recheck
          console.log('Dispatching auth-token-stored event');
          window.dispatchEvent(new Event('auth-token-stored'));

          // Small delay to let AuthContext process the token
          await new Promise(resolve => setTimeout(resolve, 200));

          toast.success('Welcome to Team@Once!', {
            description: 'Please complete your profile to continue.',
          });

          // Redirect to onboarding (role selection will be first step)
          console.log('Navigating to onboarding with role selection...');
          navigate('/onboarding/company?needsRole=true');
          console.log('Navigation called, returning from processCallback');
          return;
        }

        // Existing user or role already set - proceed with login
        // Store Team@Once tokens
        localStorage.setItem('accessToken', exchangeData.accessToken);
        localStorage.setItem('refreshToken', exchangeData.refreshToken);

        // Fetch user data
        await refreshUser();

        // Small delay to ensure token is saved
        await new Promise(resolve => setTimeout(resolve, 100));

        // Fetch user companies
        await fetchUserCompanies();

        // Show success message
        const userName = exchangeData.user.name || email?.split('@')[0] || 'User';
        const welcomeMessage = exchangeData.isNewUser
          ? `Welcome to Team@Once, ${userName}!`
          : `Welcome back, ${userName}!`;

        toast.success('Authentication Successful!', {
          description: welcomeMessage,
        });

        // Redirect to select-company page (same as credential login)
        // ProtectedRoute will handle redirecting to appropriate dashboard
        navigate('/select-company');
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        console.error('Error stack:', err?.stack);

        // Handle errors
        const errorMessage =
          err?.message || getSocialAuthErrorMessage(authError?.code || 'unknown_error');
        setError(errorMessage);

        // Show error in toast with more details
        toast.error('Authentication Failed', {
          description: errorMessage,
          duration: 5000,
        });

        console.log('Redirecting to login in 3 seconds due to error:', errorMessage);

        // Redirect to login after delay
        setTimeout(() => {
          navigate('/auth/login');
        }, 3000);
      } finally {
        console.log('processCallback finished, setting isProcessing to false');
        setIsProcessing(false);
      }
    };

    processCallback();
  }, [searchParams, navigate, refreshUser, authError]);

  // Handle successful account linking
  const handleLinkingSuccess = async (linkedUser: any) => {
    setShowLinkingModal(false);
    await refreshUser();
    await fetchUserCompanies();

    toast.success('Account Linked!', {
      description: `Welcome back, ${linkedUser.name}!`,
    });

    // Redirect to select-company page (same as credential login)
    navigate('/select-company');
  };

  // Handle linking modal close
  const handleLinkingClose = () => {
    setShowLinkingModal(false);
    navigate('/auth/login');
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-12 border border-gray-200 max-w-md w-full text-center"
        >
          {isProcessing ? (
            <>
              {/* Processing State */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 mx-auto mb-6"
              >
                <Loader2 className="w-16 h-16 text-blue-600" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Completing Authentication
              </h2>
              <p className="text-gray-600">
                Please wait while we securely log you in...
              </p>
            </>
          ) : error ? (
            <>
              {/* Error State */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center"
              >
                <AlertCircle className="w-10 h-10 text-red-600" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Authentication Failed
              </h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <button
                onClick={() => navigate('/auth/login')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transition-shadow"
              >
                Return to Login
              </button>
            </>
          ) : (
            <>
              {/* Success State */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="w-16 h-16 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center"
              >
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Authentication Successful!
              </h2>
              <p className="text-gray-600">
                Redirecting to your dashboard...
              </p>
            </>
          )}
        </motion.div>
      </div>

      {/* Account Linking Modal */}
      {linkingData && (
        <AccountLinkingModal
          isOpen={showLinkingModal}
          onClose={handleLinkingClose}
          email={linkingData.email}
          provider={linkingData.provider}
          socialToken={linkingData.socialToken}
          onSuccess={handleLinkingSuccess}
        />
      )}

    </>
  );
};

export default SocialAuthCallback;
