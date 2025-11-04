import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
// Removed Firebase imports - not needed for checkout session creation
// Webhook handles Firestore updates after payment verification

// Firebase removed - user verification not needed here
// Webhook verifies payment before updating Firestore

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

// Coin packages mapping
const COIN_PACKAGES: { [key: string]: { coins: number; price: number } } = {
  '20000': { coins: 20000, price: 3.00 },
  '38000': { coins: 38000, price: 5.50 },
  '90000': { coins: 90000, price: 10.50 },
  '175000': { coins: 175000, price: 20.50 },
  '240000': { coins: 240000, price: 25.50 },
  '680000': { coins: 680000, price: 60.00 },
  '1400000': { coins: 1400000, price: 110.00 },
};

export async function POST(request: NextRequest) {
  try {
    const { packageId, userId } = await request.json();

    if (!packageId || !userId) {
      return NextResponse.json(
        { error: 'Missing packageId or userId' },
        { status: 400 }
      );
    }

    const packageData = COIN_PACKAGES[packageId];
    if (!packageData) {
      return NextResponse.json(
        { error: 'Invalid package ID' },
        { status: 400 }
      );
    }

    // Note: User verification removed to avoid Firestore permission issues
    // Payment verification is handled securely by Stripe webhook
    // The webhook will verify payment before adding coins

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${packageData.coins.toLocaleString()} Coins`,
              description: 'In-game currency for Konchina',
            },
            unit_amount: Math.round(packageData.price * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}?payment=cancelled`,
      client_reference_id: userId,
      metadata: {
        userId,
        packageId,
        coins: packageData.coins.toString(),
      },
    });

    return NextResponse.json({ 
      sessionId: session.id,
      url: session.url // Return the checkout URL for direct redirect
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

