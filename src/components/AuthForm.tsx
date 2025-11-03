'use client';

import { useState } from 'react';
import type React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import SignupSuccessPopup from './SignupSuccessPopup';

interface AuthFormProps {
  onSuccess: () => void;
}

export default function AuthForm({ onSuccess }: AuthFormProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPasswordField, setShowConfirmPasswordField] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState('');
  const { signUp, login } = useAuth();
  
  // Show confirm password field when user starts typing password and it's signup mode
  const showConfirmPassword = isSignUp && password.length > 0;

  // Password validation functions
  const validatePassword = (pwd: string): { valid: boolean; error?: string } => {
    if (pwd.length < 12) {
      return { valid: false, error: 'Password must be at least 12 characters long' };
    }
    if (!/[A-Z]/.test(pwd)) {
      return { valid: false, error: 'Password must contain at least one capital letter' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)) {
      return { valid: false, error: 'Password must contain at least one special symbol (!@#$%^&*...)' };
    }
    return { valid: true };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate display name for signup
    if (isSignUp && !displayName.trim()) {
      setError('Display name is required');
      setLoading(false);
      return;
    }

    // Validate password requirements for signup
    if (isSignUp) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        setError(passwordValidation.error || 'Password does not meet requirements');
        setLoading(false);
        return;
      }

      // Validate password match
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
    }

    if (isSignUp) {
      const result = await signUp(email, password, displayName);
      if (result.success) {
        if (result.needsVerification) {
          // Show success popup instead of error message
          setSignedUpEmail(email);
          setShowSuccessPopup(true);
        } else {
          onSuccess();
        }
      } else {
        setError(result.error);
      }
    } else {
      const result = await login(email, password);
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    }

    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black bg-opacity-50 rounded-2xl p-8 md:p-12 max-w-md w-full shadow-2xl"
    >
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">🎴</h1>
        <h2 className="text-3xl font-bold text-white mb-2">Konchina</h2>
        <p className="text-green-200 text-sm">
          {isSignUp ? 'Create an account to play' : 'Sign in to play'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <div>
            <label className="block text-white text-sm font-medium mb-2">
              Display Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 15))}
                placeholder="Your name"
                required
                maxLength={15}
                className="w-full px-4 py-3 rounded-lg bg-white bg-opacity-10 border border-white border-opacity-20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                style={{ paddingRight: displayName.length >= 12 ? '60px' : '16px' }}
              />
              {displayName.length >= 12 && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  {displayName.length}/15
                </span>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-white text-sm font-medium mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full px-4 py-3 rounded-lg bg-white bg-opacity-10 border border-white border-opacity-20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>

        <div>
          <label className="block text-white text-sm font-medium mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={isSignUp ? 12 : 6}
              className="w-full px-4 py-3 pr-12 rounded-lg bg-white bg-opacity-10 border border-white border-opacity-20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Password Requirements - Show between password and confirm password fields */}
        {isSignUp && (
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <p className="text-white text-xs font-medium mb-2">Password Requirements:</p>
            <div className="space-y-1">
              {password.length > 0 ? (
                <>
                  <div className={`text-xs ${password.length >= 12 ? 'text-green-400' : 'text-gray-400'}`}>
                    {password.length >= 12 ? '✓' : '○'} At least 12 characters ({password.length}/12)
                  </div>
                  <div className={`text-xs ${/[A-Z]/.test(password) ? 'text-green-400' : 'text-gray-400'}`}>
                    {/[A-Z]/.test(password) ? '✓' : '○'} One capital letter
                  </div>
                  <div className={`text-xs ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? 'text-green-400' : 'text-gray-400'}`}>
                    {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) ? '✓' : '○'} One special symbol
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-gray-400">○ At least 12 characters</div>
                  <div className="text-xs text-gray-400">○ At least one capital letter</div>
                  <div className="text-xs text-gray-400">○ At least one special character (!@#$%^&*...)</div>
                </>
              )}
            </div>
          </div>
        )}

        {showConfirmPassword && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <label className="block text-white text-sm font-medium mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showConfirmPasswordField ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={12}
                className={`w-full px-4 py-3 pr-12 rounded-lg bg-white bg-opacity-10 border ${
                  confirmPassword && password !== confirmPassword
                    ? 'border-red-500'
                    : confirmPassword && password === confirmPassword
                    ? 'border-green-500'
                    : 'border-white border-opacity-20'
                } text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-500`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPasswordField(!showConfirmPasswordField)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showConfirmPasswordField ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
            )}
            {confirmPassword && password === confirmPassword && (
              <p className="text-green-400 text-xs mt-1">✓ Passwords match</p>
            )}
          </motion.div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="submit"
          disabled={loading}
          className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
        </motion.button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError('');
            setPassword('');
            setConfirmPassword('');
          }}
          className="text-green-200 hover:text-green-100 text-sm"
        >
          {isSignUp 
            ? 'Already have an account? Sign in' 
            : "Don't have an account? Sign up"}
        </button>
      </div>

      {/* Signup Success Popup */}
      {showSuccessPopup && (
        <SignupSuccessPopup
          email={signedUpEmail}
          onSignIn={() => {
            setShowSuccessPopup(false);
            setIsSignUp(false);
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setDisplayName('');
            setError('');
          }}
          onClose={() => {
            setShowSuccessPopup(false);
          }}
        />
      )}
    </motion.div>
  );
}

