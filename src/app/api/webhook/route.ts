import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, runTransaction } from 'firebase/firestore';

// Initialize Firebase for server-side (API routes)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app;
let db;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
db = getFirestore(app);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    const userId = session.metadata?.userId;
    const coins = parseInt(session.metadata?.coins || '0');

    if (!userId || !coins) {
      console.error('Missing userId or coins in session metadata');
      return NextResponse.json(
        { error: 'Missing required metadata' },
        { status: 400 }
      );
    }

    try {
      // Update user's coin balance in Firestore transaction
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists()) {
          throw new Error('User not found');
        }

        const currentCoins = (userSnap.data() as any).coins || 0;
        const newCoins = currentCoins + coins;

        transaction.update(userRef, {
          coins: newCoins,
        });

        console.log(`Added ${coins} coins to user ${userId}. New balance: ${newCoins}`);
      });

      return NextResponse.json({ received: true });
    } catch (error: any) {
      console.error('Error updating user coins:', error);
      return NextResponse.json(
        { error: 'Failed to update coins' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}

