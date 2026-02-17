import React, { useState, useEffect, useMemo } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, CreditCard, ShieldCheck } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getStripePromise, getStripeAppearance } from '@/lib/stripe';
import api from '@/lib/apiClient';

const CheckoutForm = ({ amount, invoiceId, paymentIntentId, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message);
      setLoading(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: window.location.href,
      },
    });

    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
      return;
    }

    if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
      try {
        await api.post('/stripe/confirm-payment', {
          invoiceId,
          paymentIntentId,
          amount,
        });
        toast({ title: 'Payment successful!', description: `$${amount.toFixed(2)} charged via Stripe.` });
        onSuccess();
      } catch (err) {
        setError(err.message || 'Card verification failed. Please check your card details and try again.');
      }
    } else {
      setError(`Unexpected payment status: ${paymentIntent.status}. Please try again.`);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Amount hero */}
      <div className="text-center py-3">
        <p className="text-3xl font-bold tracking-tight text-foreground">
          ${amount.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Card Payment</p>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* Stripe PaymentElement */}
      <div className="min-h-[160px]">
        <PaymentElement
          options={{ layout: 'tabs', paymentMethodOrder: ['card', 'link'], wallets: { applePay: 'never', googlePay: 'never' } }}
          onReady={() => setReady(true)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-red-400 text-xs font-bold">!</span>
          </div>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="action-btn action-btn--secondary flex-1"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !ready || loading}
          className="action-btn flex-1 flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          {loading ? 'Processing...' : 'Pay Now'}
        </button>
      </div>

      {/* Trust badge */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground">Secured by Stripe</p>
      </div>
    </form>
  );
};

const StripePaymentModal = ({ open, onOpenChange, invoice, settings, onPaymentSuccess }) => {
  const [step, setStep] = useState('amount'); // 'amount' | 'payment'
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [amount, setAmount] = useState('');
  const [balanceDue, setBalanceDue] = useState(0);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState(null);
  const publishableKey = settings?.stripe_test_mode === 'true' ? settings?.stripe_test_publishable_key : settings?.stripe_publishable_key;
  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);
  const stripeAppearance = useMemo(() => getStripeAppearance(), []);

  // Reset when modal opens/closes or invoice changes
  useEffect(() => {
    if (!open || !invoice?.id) {
      setStep('amount');
      setClientSecret(null);
      setPaymentIntentId(null);
      setError(null);
      return;
    }

    const bal = Math.max(0, parseFloat(((invoice.total || 0) - (invoice.paidAmount || 0)).toFixed(2)));
    setBalanceDue(bal);
    setAmount(bal.toFixed(2));
    setStep('amount');
  }, [open, invoice?.id]);

  const parsedAmount = parseFloat(amount) || 0;
  const isValidAmount = parsedAmount >= 0.50 && parsedAmount <= balanceDue + 0.01;

  const handleContinueToPayment = async () => {
    if (!isValidAmount) return;
    setLoadingIntent(true);
    setError(null);
    try {
      const res = await api.post('/stripe/create-payment-intent', {
        invoiceId: invoice.id,
        amount: parsedAmount,
      });
      setClientSecret(res.clientSecret);
      setPaymentIntentId(res.paymentIntentId);
      setStep('payment');
    } catch (err) {
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setLoadingIntent(false);
    }
  };

  const handleSuccess = () => {
    onOpenChange(false);
    onPaymentSuccess?.();
  };

  const invoiceLabel = invoice?.invoiceNumber
    ? `Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-elevated sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-accent" />
            Pay with Card
          </DialogTitle>
          <DialogDescription>
            {invoiceLabel}{invoice?.clientName ? ` — ${invoice.clientName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {step === 'amount' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-foreground">Payment Amount</label>
                <span className="text-xs text-muted-foreground">
                  Balance: ${balanceDue.toFixed(2)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-medium">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.50"
                  max={balanceDue}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="glass-input w-full pl-7 text-base tabular-nums"
                  placeholder="0.00"
                />
              </div>
              {parsedAmount > 0 && parsedAmount < balanceDue - 0.01 && (
                <p className="text-xs text-muted-foreground">
                  Remaining after payment: ${(balanceDue - parsedAmount).toFixed(2)}
                </p>
              )}
              {amount && !isValidAmount && (
                <p className="text-xs text-destructive">
                  {parsedAmount < 0.50 ? 'Minimum payment is $0.50' : `Maximum is $${balanceDue.toFixed(2)}`}
                </p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-400 text-xs font-bold">!</span>
                </div>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="action-btn action-btn--secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinueToPayment}
                disabled={!isValidAmount || loadingIntent}
                className="action-btn flex-1 flex items-center justify-center gap-2"
              >
                {loadingIntent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {loadingIntent ? 'Preparing...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'payment' && (
          <>
            {!clientSecret || !stripePromise ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Preparing payment...</p>
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
                <CheckoutForm
                  amount={parsedAmount}
                  invoiceId={invoice.id}
                  paymentIntentId={paymentIntentId}
                  onSuccess={handleSuccess}
                  onCancel={() => onOpenChange(false)}
                />
              </Elements>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StripePaymentModal;
