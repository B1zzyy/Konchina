# Stripe Payment Setup Guide

This guide will walk you through setting up Stripe payments for coin purchases in your game.

## Step 1: Create a Stripe Account

1. Go to [https://stripe.com](https://stripe.com)
2. Click "Sign up" and create an account
3. Complete the verification process (email, phone, etc.)

## Step 2: Get Your API Keys

### For Development (Test Mode):
1. In Stripe Dashboard, go to **Developers** → **API keys**
2. You'll see two keys:
   - **Publishable key** (starts with `pk_test_...`)
   - **Secret key** (starts with `sk_test_...`) - Click "Reveal" to see it

### For Production:
1. Switch to **Live mode** (toggle in top right)
2. Get your **Live** publishable and secret keys

## Step 3: Set Up Webhook Endpoint

### For Local Development (using Stripe CLI):

1. **Install Stripe CLI:**
   - Download from: https://stripe.com/docs/stripe-cli
   - Or: `brew install stripe/stripe-cli/stripe` (Mac)

2. **Login to Stripe CLI:**
   ```bash
   stripe login
   ```

3. **Forward webhooks to local server:**
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   
   This will give you a webhook signing secret (starts with `whsec_...`)

### For Production (Vercel):

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. Enter your endpoint URL: `https://yourdomain.com/api/webhook`
4. Select events to listen to: `checkout.session.completed`
5. Copy the **Signing secret** (starts with `whsec_...`)

## Step 4: Add Environment Variables

Add these to your `.env.local` file (for development):

```env
# Stripe Keys (Test Mode)
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Your app URL (for redirects)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

For **production** (Vercel):
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add all the above variables with your **live** Stripe keys

## Step 5: Test the Integration

### Test Cards (Stripe Test Mode):
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- Use any future expiry date, any CVC, any postal code

### Test Flow:
1. Click on a coin package
2. You'll be redirected to Stripe Checkout
3. Use test card `4242 4242 4242 4242`
4. Complete payment
5. You should be redirected back to `/payment-success`
6. Check your Firestore `users` collection - coins should be added!

## Step 6: Go Live (Production)

1. **Switch to Live Mode in Stripe:**
   - Toggle the "Test mode" switch in Stripe Dashboard
   - Get your **Live** API keys

2. **Update Environment Variables:**
   - Replace test keys with live keys in Vercel
   - Update `NEXT_PUBLIC_BASE_URL` to your production URL

3. **Set Up Production Webhook:**
   - Add webhook endpoint in Stripe Dashboard
   - Use your production URL: `https://yourdomain.com/api/webhook`
   - Copy the signing secret and update `STRIPE_WEBHOOK_SECRET`

4. **Test with Real Payment:**
   - Make a small test purchase with a real card
   - Verify coins are added correctly

## Important Notes

- **Never commit your secret keys** to Git
- Always use `.env.local` for local development
- Use Vercel's environment variables for production
- Webhook secret is critical for security - keep it secret!
- Test mode and Live mode use different keys

## Troubleshooting

### Payment succeeds but coins aren't added:
- Check webhook is set up correctly
- Verify webhook secret matches in `.env.local`
- Check Stripe Dashboard → Events for webhook delivery status
- Check server logs for errors

### "Stripe failed to load":
- Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set correctly
- Check browser console for errors

### Webhook not receiving events:
- For local: Make sure Stripe CLI is running: `stripe listen --forward-to localhost:3000/api/webhook`
- For production: Verify webhook URL is correct and accessible
- Check Stripe Dashboard → Webhooks for delivery logs

## Security Best Practices

1. **Never expose secret keys** - Only use in server-side code
2. **Always verify webhook signatures** - The webhook handler does this automatically
3. **Use HTTPS in production** - Required for webhooks
4. **Monitor webhook events** - Check Stripe Dashboard regularly
5. **Handle failures gracefully** - Log errors and retry failed webhooks if needed

## Support

- Stripe Docs: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Test Mode Dashboard: https://dashboard.stripe.com/test

