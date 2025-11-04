'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import CoinIcon from '@/components/CoinIcon';

export default function PaymentSuccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUserProfile, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    // Verify payment and refresh user profile
    const verifyPayment = async () => {
      try {
        // Wait a moment for webhook to process
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Refresh user profile to get updated coins
        if (refreshUserProfile) {
          await refreshUserProfile();
        }
        
        setLoading(false);
        
        // Redirect to home after 3 seconds
        setTimeout(() => {
          router.push('/');
        }, 3000);
      } catch (err: any) {
        console.error('Error verifying payment:', err);
        setError('Failed to verify payment');
        setLoading(false);
      }
    };

    verifyPayment();
  }, [searchParams, refreshUserProfile, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Processing payment...</div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-black bg-opacity-90 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-700/50 text-center"
        >
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-white mb-4">Payment Error</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Return to Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-black bg-opacity-90 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-700/50 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="text-green-500 text-6xl mb-4"
        >
          ✓
        </motion.div>
        <h2 className="text-2xl font-bold text-white mb-4">Payment Successful!</h2>
        <p className="text-gray-300 mb-6">
          Your coins have been added to your account.
        </p>
        {userProfile && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <CoinIcon className="text-yellow-400" size={24} />
            <span className="text-yellow-400 font-bold text-xl">
              {userProfile.coins.toLocaleString()} coins
            </span>
          </div>
        )}
        <p className="text-gray-400 text-sm mb-4">
          Redirecting to home...
        </p>
      </motion.div>
    </div>
  );
}

