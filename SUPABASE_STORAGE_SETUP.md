# Supabase Storage Setup (Profile Pictures Only)

This guide sets up Supabase Storage **only** for profile picture uploads. Everything else (Firestore, Auth, etc.) stays on Firebase.

## Quick Setup

### 1. Create Supabase Account
- Go to [https://supabase.com](https://supabase.com)
- Sign up (free tier is perfect - 1GB storage)

### 2. Create a New Project
- Click "New Project"
- Name it (e.g., "konchina-storage")
- Set a database password (save it!)
- Choose a region closest to you (UK: `London`)
- Click "Create new project"
- Wait 2-3 minutes for setup

### 3. Get Your Credentials
- Go to Project Settings (gear icon) → API
- Copy:
  - **Project URL** (looks like: `https://xxxxx.supabase.co`)
  - **anon public** key (under "Project API keys")

### 4. Create Storage Bucket
- Go to **Storage** in left sidebar
- Click **"New bucket"**
- Name: `profile-pictures`
- **Public bucket**: ✅ Enable (so images can be viewed)
- Click **"Create bucket"**

### 5. Set Up Storage Policies
- Click on your `profile-pictures` bucket
- Go to **"Policies"** tab
- Click **"New Policy"** → **"For full customization"**
- Name: `Allow authenticated uploads`
- Policy definition:
```sql
-- Allow anyone to read (view) profile pictures
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

-- Allow authenticated users to upload their own photos
CREATE POLICY "Authenticated upload access"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**OR** use the simpler approach (for development):
- Click **"New Policy"** → **"For full customization"**
- Name: `Public read, authenticated write`
- Policy definition:
```sql
-- Anyone can read
CREATE POLICY "Public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

-- Authenticated users can upload
CREATE POLICY "Authenticated upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.role() = 'authenticated'
);
```

### 6. Add to `.env.local`
Add these to your `.env.local` file:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 7. Restart Dev Server
```bash
npm run dev
```

## How It Works

- Profile pictures are stored in Supabase Storage
- Firebase Auth `photoURL` is updated with the Supabase public URL
- Everything else (games, users, coins) stays on Firebase

## Free Tier Limits

- **1GB storage** (free)
- **2GB bandwidth/month** (free)
- Perfect for profile pictures! 📸

## Troubleshooting

**Error: "Bucket not found"**
- Make sure you created the bucket named exactly `profile-pictures`
- Make sure it's set to **Public**

**Error: "New row violates policy"**
- Check your Storage policies are set correctly
- Try the simpler policy (for development)

**Error: "Invalid API key"**
- Double-check your `.env.local` values
- Make sure you copied the **anon public** key (not the service role key)

---

**That's it!** Profile pictures now use Supabase, everything else stays on Firebase.

