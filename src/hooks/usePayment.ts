import { useAuth } from './useAuth';

export function usePayment() {
  const { user } = useAuth();

  const handlePurchase = async (
    packageId: string,
    setLoadingPackage: (id: string | null) => void
  ) => {
    if (!user) {
      alert('Please sign in to purchase coins');
      return;
    }

    setLoadingPackage(packageId);

    try {
      // Create checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId,
          userId: user.uid,
        }),
      });

      const { sessionId, url, error } = await response.json();

      if (error) {
        throw new Error(error);
      }

      if (!url) {
        throw new Error('No checkout URL returned');
      }

      // Redirect directly to Stripe Checkout URL
      // Using the URL from the session (new Stripe.js approach)
      window.location.href = url;
      
      // Note: setLoadingPackage(null) won't run here because we're redirecting
      // But it's fine - the page will navigate away
    } catch (error: any) {
      console.error('Payment error:', error);
      alert(error.message || 'Failed to process payment. Please try again.');
      setLoadingPackage(null);
    }
  };

  return { handlePurchase };
}

