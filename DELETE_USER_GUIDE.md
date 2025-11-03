# How to Delete a User Account in Firebase

## Method 1: Delete from Firebase Console (Recommended)

1. **Go to Firebase Console**
   - Visit [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Select your project

2. **Navigate to Authentication**
   - Click on **"Authentication"** in the left sidebar
   - Click on the **"Users"** tab (should be the default view)

3. **Find and Delete the User**
   - You'll see a list of all users who have signed up
   - Find the user you want to delete (search by email if needed)
   - Click the **three dots (⋮)** or the user's row
   - Click **"Delete user"** or **"Delete"**
   - Confirm the deletion

4. **Optional: Delete from Firestore**
   - If you also want to delete the user's profile data:
   - Go to **Firestore Database** → **Data** tab
   - Navigate to the `users` collection
   - Find the user document (document ID = user's UID)
   - Click on the document and click **"Delete"**

## Method 2: Delete from the App (Future Feature)

You could add a "Delete Account" button in your app, but for now, use Method 1 for testing.

## Troubleshooting

- **Can't find the user?** Make sure you're looking in the right Firebase project
- **User not showing up?** It might take a few seconds to appear after signup
- **Still seeing the user?** Try refreshing the Firebase Console page

