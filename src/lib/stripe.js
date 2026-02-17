import { loadStripe } from '@stripe/stripe-js';

let stripePromiseCache = null;
let stripePromiseKey = null;

export function getStripePromise(publishableKey) {
  if (!publishableKey) return null;
  if (stripePromiseKey !== publishableKey) {
    stripePromiseCache = loadStripe(publishableKey);
    stripePromiseKey = publishableKey;
  }
  return stripePromiseCache;
}

export function getStripeAppearance() {
  return {
    theme: 'stripe',
    variables: {
      ...shared,
      colorBackground: '#ffffff',
      colorText: 'rgb(30, 30, 30)',
      colorTextSecondary: 'rgb(100, 100, 100)',
    },
    rules: {
      '.Input': {
        backgroundColor: '#ffffff',
        border: '1px solid rgb(210, 210, 210)',
        boxShadow: 'none',
        transition: 'border-color 0.15s ease',
      },
      '.Input:focus': {
        border: '1px solid hsl(211 78% 51%)',
        boxShadow: '0 0 0 1px hsl(211 78% 51% / 0.3)',
      },
      '.Label': {
        color: 'rgb(60, 60, 60)',
        fontSize: '13px',
        fontWeight: '500',
      },
      '.Tab': {
        backgroundColor: 'rgb(245, 245, 245)',
        border: '1px solid rgb(220, 220, 220)',
        color: 'rgb(100, 100, 100)',
      },
      '.Tab--selected': {
        backgroundColor: '#ffffff',
        border: '1px solid hsl(211 78% 51% / 0.5)',
        color: 'rgb(30, 30, 30)',
      },
      '.Tab:hover': {
        backgroundColor: 'rgb(238, 238, 238)',
        color: 'rgb(50, 50, 50)',
      },
    },
  };
}
