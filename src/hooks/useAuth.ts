'use client';

import { useState, useEffect } from 'react';
import { 
  User, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  coins: number;
  createdAt: any;
  emailVerified?: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Reload user to get latest email verification status
        await firebaseUser.reload();
        
        // Load user profile from Firestore
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            // Sync email verification status from Firebase Auth
            profile.emailVerified = firebaseUser.emailVerified;
            // Sync photoURL from Firebase Auth to Firestore if it exists and is different
            if (firebaseUser.photoURL && profile.photoURL !== firebaseUser.photoURL) {
              profile.photoURL = firebaseUser.photoURL;
              // Update Firestore with photoURL
              await setDoc(doc(db, 'users', firebaseUser.uid), { photoURL: firebaseUser.photoURL }, { merge: true });
            }
            setUserProfile(profile);
          } else {
            // Profile doesn't exist - should have been created on signup, but handle edge case
            console.warn('User profile not found for:', firebaseUser.uid);
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Helper function to convert Firebase errors to user-friendly messages
  const getAuthErrorMessage = (error: any): string => {
    const errorCode = error?.code || '';
    
    // Login errors
    if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
      return 'Incorrect email or password. Please try again.';
    }
    if (errorCode === 'auth/user-not-found') {
      return 'No account found with this email address.';
    }
    if (errorCode === 'auth/user-disabled') {
      return 'This account has been disabled. Please contact support.';
    }
    if (errorCode === 'auth/too-many-requests') {
      return 'Too many failed attempts. Please try again later.';
    }
    if (errorCode === 'auth/invalid-email') {
      return 'Invalid email address. Please check and try again.';
    }
    
    // Signup errors
    if (errorCode === 'auth/email-already-in-use') {
      return 'This email is already registered. Please sign in instead.';
    }
    if (errorCode === 'auth/weak-password') {
      return 'Password is too weak. Please use a stronger password.';
    }
    if (errorCode === 'auth/operation-not-allowed') {
      return 'Email/password accounts are not enabled. Please contact support.';
    }
    
    // Network errors
    if (errorCode === 'auth/network-request-failed') {
      return 'Network error. Please check your connection and try again.';
    }
    
    // Default fallback
    return error?.message || 'An error occurred. Please try again.';
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      // Send email verification
      await sendEmailVerification(newUser);

      // Create user profile in Firestore with 2000 starting coins
      const userProfile: UserProfile = {
        uid: newUser.uid,
        email: newUser.email || email,
        displayName: displayName || email.split('@')[0],
        coins: 2000,
        createdAt: serverTimestamp(),
        emailVerified: false,
      };

      await setDoc(doc(db, 'users', newUser.uid), userProfile);
      setUserProfile(userProfile);

      return { 
        success: true, 
        user: newUser,
        needsVerification: true,
        message: 'Account created! Please check your email to verify your account.'
      };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { 
        success: false, 
        error: getAuthErrorMessage(error)
      };
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return { success: true, user: userCredential.user };
    } catch (error: any) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: getAuthErrorMessage(error)
      };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      return { success: true };
    } catch (error: any) {
      console.error('Logout error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to log out' 
      };
    }
  };

  const resendVerificationEmail = async () => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }
      await sendEmailVerification(user);
      return { success: true, message: 'Verification email sent!' };
    } catch (error: any) {
      console.error('Resend verification error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send verification email' 
      };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, message: 'Password reset email sent!' };
    } catch (error: any) {
      console.error('Password reset error:', error);
      return { 
        success: false, 
        error: getAuthErrorMessage(error)
      };
    }
  };

  const updateCoins = async (coinChange: number): Promise<{ success: boolean; error?: string; newBalance?: number }> => {
    try {
      if (!user?.uid || !db) {
        return { success: false, error: 'User not authenticated' };
      }

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        return { success: false, error: 'User profile not found' };
      }

      const currentCoins = (userSnap.data() as UserProfile).coins;
      const newCoins = Math.max(0, currentCoins + coinChange); // Ensure coins don't go below 0

      await setDoc(userRef, {
        ...userSnap.data(),
        coins: newCoins,
      }, { merge: true });

      // Update local profile
      setUserProfile(prev => prev ? { ...prev, coins: newCoins } : null);

      return { success: true, newBalance: newCoins };
    } catch (error: any) {
      console.error('Error updating coins:', error);
      return { success: false, error: error.message || 'Failed to update coins' };
    }
  };

  const refreshUserProfile = async () => {
    if (!user?.uid || !db) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        // Sync email verification status from Firebase Auth
        if (user.emailVerified !== undefined) {
          profile.emailVerified = user.emailVerified;
        }
        setUserProfile(profile);
        return profile;
      } else {
        setUserProfile(null);
        return null;
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error);
      return null;
    }
  };

  return {
    user,
    userProfile,
    loading,
    signUp,
    login,
    logout,
    resendVerificationEmail,
    resetPassword,
    updateCoins,
    refreshUserProfile,
  };
}

