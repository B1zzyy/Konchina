# Firestore Security Rules Setup

## Quick Setup for Development

Go to Firebase Console → Firestore Database → Rules tab

### For Development (Allows authenticated users):

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
    match /matchmaking/{playerId} {
      // Players can read and write their own queue entry
      allow read, write: if request.auth != null && request.auth.uid == playerId;
      // Allow reading other players' queue status for matching
      allow read: if request.auth != null;
      // Allow authenticated users to write to matchmaking documents during matching transactions
      // This is needed for the matchmaking system where one player matches with another
      allow write: if request.auth != null;
    }
  }
}
```

Click "Publish" to save.

**Important**: These rules require authentication. Make sure Email/Password auth is enabled (see `FIREBASE_AUTH_SETUP.md`).

## Production Rules (Recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        request.auth.uid in resource.data.players;
      allow delete: if false; // Rooms should not be deleted
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
      allow delete: if false; // Users should not be deleted
    }
  }
}
```

