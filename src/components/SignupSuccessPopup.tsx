'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface SignupSuccessPopupProps {
  email: string;
  onSignIn: () => void;
  onClose: () => void;
}

export default function SignupSuccessPopup({ email, onSignIn, onClose }: SignupSuccessPopupProps) {
  // Extract email domain
  const getEmailProvider = (email: string): { name: string; url: string } => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    
    if (domain.includes('gmail') || domain === 'gmail.com') {
      return { name: 'Gmail', url: 'https://mail.google.com' };
    } else if (domain.includes('outlook') || domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') {
      return { name: 'Outlook', url: 'https://outlook.live.com' };
    } else if (domain.includes('yahoo') || domain === 'yahoo.com' || domain === 'ymail.com') {
      return { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' };
    } else if (domain.includes('icloud') || domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
      return { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' };
    } else if (domain.includes('proton') || domain === 'protonmail.com') {
      return { name: 'ProtonMail', url: 'https://mail.proton.me' };
    } else if (domain.includes('aol') || domain === 'aol.com') {
      return { name: 'AOL Mail', url: 'https://mail.aol.com' };
    } else {
      // Generic email provider - try to construct a mail URL or use a generic one
      return { name: 'Your Email', url: `https://${domain}` };
    }
  };

  const emailProvider = getEmailProvider(email);

  const handleOpenMail = () => {
    window.open(emailProvider.url, '_blank');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
          className="bg-gray-900/95 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-gray-700/50 max-w-md w-full mx-4"
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-white mb-2">Account Created!</h2>
            <p className="text-gray-400 text-sm">
              Please verify your email to complete registration
            </p>
          </div>

          {/* Email Info */}
          <div className="bg-gray-800/70 rounded-xl p-4 mb-6">
            <p className="text-gray-300 text-sm mb-1">Verification email sent to:</p>
            <p className="text-white font-medium">{email}</p>
          </div>

          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <p className="text-blue-200 text-sm">
              Click the verification link in the email we sent to activate your account and start playing!
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleOpenMail}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              Open {emailProvider.name}
            </button>
            <button
              onClick={onSignIn}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Sign In
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

