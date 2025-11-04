# Customizing Firebase Email Templates

⚠️ **IMPORTANT LIMITATION**: Firebase restricts editing the email body content for security/spam prevention reasons. You can only customize:
- The **subject line**
- The **action URL** (where the link redirects)
- The **sender name** and email

## What You CAN Customize in Firebase Console

1. **Subject Line**
   - Go to: Authentication → Templates → Email address verification
   - Click "Edit"
   - Change the subject (e.g., "Verify your Konchina account")

2. **Action URL** (Optional)
   - Go to: Authentication → Settings → Action URL
   - You can set a custom domain for the verification link
   - This allows you to redirect to your own domain after verification

3. **Sender Information**
   - Go to: Authentication → Settings → Email templates
   - You can customize the sender name (though the email domain is Firebase's)

## Alternative Solutions

Since Firebase doesn't allow editing the email body, here are your options:

### Option 1: Use Firebase Cloud Functions (Recommended)

Create a Cloud Function that sends a custom verification email using a service like SendGrid, Mailgun, or AWS SES.

**Pros:**
- Full control over email design
- Can use your own branding
- Professional appearance

**Cons:**
- Requires setting up Cloud Functions
- May require a paid email service
- More complex setup

### Option 2: Accept Firebase's Default Email

Keep Firebase's default email template but customize what you can:
- Custom subject line
- Custom action URL that redirects to your app
- The verification link will still work

**Pros:**
- Simple and free
- No additional setup needed
- Reliable delivery

**Cons:**
- Limited customization
- Generic Firebase branding

### Option 3: Custom Verification Flow (Advanced)

Instead of using Firebase's built-in verification:
1. Send a custom verification email from your backend
2. Store verification tokens in Firestore
3. Create a custom verification endpoint
4. Update user's emailVerified status manually

**Pros:**
- Complete control
- Custom design

**Cons:**
- More complex implementation
- Need to handle security yourself
- More code to maintain

## Recommended Approach for Your Project

For now, I recommend **Option 2** - customize what you can:

1. **Set a custom subject line** in Firebase Console:
   - "🎴 Verify your Konchina account"

2. **Set up a custom action URL** (optional):
   - Point verification links to your app's domain
   - Create a page that handles the verification and shows a nice success message

3. **Add a helpful message in your app**:
   - In the signup success popup, explain what the email will look like
   - Guide users to check their spam folder if needed

The Firebase email will still be functional and professional, even if it has generic styling.

## If You Want Full Customization Later

If you want full email customization in the future, you would need to:
1. Set up Firebase Cloud Functions
2. Integrate with an email service (SendGrid, Mailgun, etc.)
3. Modify the signup flow to use your custom email function

This is more advanced and requires additional setup, but gives you complete control over the email design.
