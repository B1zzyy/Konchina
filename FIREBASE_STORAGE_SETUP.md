# Firebase Storage Setup Guide

## Enable Firebase Storage

Firebase Storage is included in the **free Spark plan** with **5GB** of storage. If you're getting errors, it's likely just not enabled yet.

### Steps to Enable:

1. **Go to Firebase Console**
   - Visit [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Select your project

2. **Navigate to Storage**
   - Click on **"Storage"** in the left sidebar
   - If you see "Get started", click it
   - If you see "Rules" tab, Storage is already enabled ✅

3. **Set Up Storage (if not already done)**
   - Click **"Get started"**
   - Choose **"Start in test mode"** (for development)
   - Select a location (same as your Firestore location recommended)
   - Click **"Done"**

4. **Configure Security Rules**
   
   Go to the **"Rules"** tab and update the rules to:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Profile pictures - users can read any, but only write their own
    match /profile-pictures/{userId}/{allPaths=**} {
      allow read: if true; // Anyone can view profile pictures
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**What these rules do:**
- ✅ Anyone can view profile pictures (needed for displaying them)
- ✅ Only authenticated users can upload
- ✅ Users can only upload to their own folder (`/profile-pictures/{userId}/...`)
- ✅ Users cannot modify other users' photos

5. **Verify Your Storage Bucket**
   - Your bucket name should be in your `.env.local` file as `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - It typically looks like: `your-project-id.appspot.com`
   - You can find it in Firebase Console > Project Settings > Your apps

### Testing the Setup

After enabling Storage:
1. Restart your Next.js dev server (`npm run dev`)
2. Go to Settings in your app
3. Try uploading a profile picture
4. Check Firebase Console > Storage to see if the file appears

## Troubleshooting

### Error: "Firebase Storage is not enabled"
- **Solution**: Follow steps 1-3 above to enable Storage

### Error: "Permission denied" or "403 Forbidden"
- **Solution**: Update your Storage security rules (step 4 above)
- Make sure you're using the correct bucket name in `.env.local`

### Error: "Storage bucket not found"
- **Solution**: 
  1. Check your `.env.local` file has `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  2. Go to Firebase Console > Project Settings > Your apps
  3. Copy the Storage bucket name (format: `project-id.appspot.com`)
  4. Update `.env.local` with the correct value

### Still Having Issues?

If Firebase Storage doesn't work for you, you can use **Supabase Storage** instead (see `SUPABASE_STORAGE_SETUP.md` for alternative setup).

## Free Plan Limits

- **5GB storage** (free)
- **1GB/day downloads** (free)
- **20K uploads/day** (free)
- Perfect for profile pictures! 📸

---

**Note**: The free plan is sufficient for profile pictures. You'd need thousands of users before hitting limits.

