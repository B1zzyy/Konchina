# Firebase Authentication Setup Guide

## Enable Email/Password Authentication

To fix the `auth/configuration-not-found` error, you need to enable Email/Password authentication in Firebase Console:

### Steps:

1. **Go to Firebase Console**
   - Visit [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Select your project

2. **Navigate to Authentication**
   - Click on **"Authentication"** in the left sidebar
   - If you haven't set it up yet, click **"Get started"**

3. **Enable Email/Password Sign-in**
   - Click on the **"Sign-in method"** tab (or it might be under "Authentication" > "Sign-in method")
   - Click on **"Email/Password"**
   - Toggle **"Enable"** to ON
   - Click **"Save"**

4. **Optional: Configure Email Verification**
   - While in Email/Password settings, you can configure:
     - Email link (passwordless sign-in) - optional
     - Email verification settings

5. **Configure Authorized Domains** (if needed)
   - Go to **Authentication** > **Settings** > **Authorized domains**
   - Make sure `localhost` is listed (should be by default)
   - Add your production domain when deploying

### Verify Your Setup

After enabling Email/Password:
- Refresh your app
- Try signing up again
- The error should be resolved!

## Firestore Security Rules Update

Since we're now using authenticated users, update your Firestore rules to allow authenticated users to access `users` collection:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Troubleshooting

- **Still getting errors?** Make sure your `.env.local` file has all the correct Firebase config values
- **Email verification not working?** Check your Firebase project settings for email configuration
- **Users collection permission denied?** Update your Firestore rules as shown above

