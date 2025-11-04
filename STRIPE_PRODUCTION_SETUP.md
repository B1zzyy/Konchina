# Stripe Production Setup - Quick Guide

## Step 1: Get Live Stripe Keys

1. Go to https://dashboard.stripe.com
2. **Toggle "Test mode" OFF** → Switch to **"Live mode"** (top right)
3. Go to **Developers** → **API keys**
4. Copy these two keys:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (starts with `sk_live_...`) - Click "Reveal"

## Step 2: Set Up Production Webhook

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter your production URL:
   ```
   https://your-production-domain.com/api/webhook
   ```
   (Replace with your actual Vercel URL or custom domain)
4. Select events:
   - Click **"Select events"**
   - Check **`checkout.session.completed`**
   - Click **"Add events"**
5. Click **"Add endpoint"**
6. **Copy the Signing Secret:**
   - Click on the endpoint you just created
   - Under "Signing secret", click **"Reveal"**
   - Copy the value (starts with `whsec_...`)

## Step 3: Add to Vercel Environment Variables

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add these 4 variables:

   | Variable Name | Value | Environment |
   |--------------|-------|-------------|
   | `STRIPE_SECRET_KEY` | `sk_live_...` (from Step 1) | Production |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (from Step 1) | Production |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from Step 2) | Production |
   | `NEXT_PUBLIC_BASE_URL` | `https://your-domain.com` | Production |

5. Make sure each is set to **"Production"** environment
6. Click **"Save"** for each

## Step 4: Redeploy

1. In Vercel, go to **Deployments**
2. Click the **"..."** menu on latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete

## Step 5: Test Production

1. Visit your production site
2. Click any "Buy" button
3. Complete a real payment (start with a small amount!)
4. Check that coins are added to user's account in Firestore

## Troubleshooting

- **Payment succeeds but coins not added?**
  - Check Stripe Dashboard → **Events** → Look for webhook delivery status
  - Check Vercel logs for errors
  - Verify webhook secret matches in Vercel env vars

- **"Stripe failed to load" error?**
  - Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set correctly in Vercel
  - Check browser console for errors

- **Webhook not receiving events?**
  - Verify webhook URL is correct: `https://your-domain.com/api/webhook`
  - Check webhook is set to "Live mode" in Stripe Dashboard
  - Verify endpoint is active (green status)

