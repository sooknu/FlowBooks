import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { motion, AnimatePresence } from 'framer-motion';
import { getStripePromise, getStripeAppearance } from '@/lib/stripe';
import { CreditCard, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Receipt, Download } from 'lucide-react';

const API_BASE = window.location.origin;

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ─── Checkout Form (inside Stripe Elements) ─── */

const CheckoutForm = ({ amount, token, paymentIntentId, onSuccess }) => {
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
      confirmParams: { return_url: window.location.href },
    });

    if (confirmError) {
      setError(confirmError.message);
      setLoading(false);
      return;
    }

    if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
      try {
        await apiFetch(`/api/pay/${token}/confirm`, {
          method: 'POST',
          body: { paymentIntentId },
        });
        onSuccess();
      } catch (err) {
        setError(err.message || 'Card verification failed. Please check your card details and try again.');
      }
    } else {
      setError(`Unexpected status: ${paymentIntent.status}. Please try again.`);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="min-h-[160px]">
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'link'],
            wallets: { applePay: 'never', googlePay: 'never' },
          }}
          onReady={() => setReady(true)}
        />
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
        >
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      <button
        type="submit"
        disabled={!stripe || !ready || loading}
        className="action-btn w-full py-3 text-base flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4" />
        )}
        {loading ? 'Processing...' : `Pay $${amount.toFixed(2)}`}
      </button>

      <div className="flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Secured by Stripe</span>
      </div>
    </form>
  );
};

/* ─── Invoice Summary ─── */

const InvoiceSummary = ({ invoice, payingAmount }) => {
  const rows = [
    { label: 'Total', value: `$${invoice.total.toFixed(2)}` },
  ];
  if (invoice.paidAmount > 0) {
    rows.push({ label: 'Paid', value: `- $${invoice.paidAmount.toFixed(2)}`, muted: true });
  }
  const isPartial = payingAmount && payingAmount < invoice.balanceDue - 0.01;
  rows.push({ label: 'Balance Due', value: `$${invoice.balanceDue.toFixed(2)}`, accent: !isPartial });
  if (isPartial) {
    rows.push({ label: 'Paying Now', value: `$${payingAmount.toFixed(2)}`, accent: true });
    rows.push({ label: 'Remaining', value: `$${(invoice.balanceDue - payingAmount).toFixed(2)}`, muted: true });
  }

  return (
    <div className="flat-card rounded-xl overflow-hidden">
      {/* Invoice header bar */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(var(--accent-rgb) / 0.08)' }}>
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">
            Invoice #{String(invoice.invoiceNumber).padStart(5, '0')}
          </span>
        </div>
        {invoice.clientName && (
          <span className="text-xs text-muted-foreground truncate ml-3">{invoice.clientName}</span>
        )}
      </div>

      {/* Line items */}
      <div className="px-4 py-2.5 divide-y divide-border/50">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between py-1.5 text-sm">
            <span className={r.muted ? 'text-muted-foreground' : 'text-foreground'}>{r.label}</span>
            <span className={`font-semibold tabular-nums ${r.accent ? 'text-accent text-base' : r.muted ? 'text-muted-foreground' : 'text-foreground'}`}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Success State ─── */

const SuccessView = ({ invoice, branding, transactionId, token, paidAmount }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadReceipt = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pay/${token}/receipt`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${String(invoice.invoiceNumber).padStart(5, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Receipt download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="text-center space-y-5 py-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
        className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
        style={{ background: 'rgba(var(--color-success) / 0.15)' }}
      >
        <CheckCircle2 className="w-8 h-8" style={{ color: 'rgb(var(--color-success))' }} />
      </motion.div>

      <div>
        <h2 className="text-xl font-bold text-foreground">Payment Successful</h2>
        <p className="text-sm text-muted-foreground mt-1">
          ${(paidAmount || invoice.balanceDue).toFixed(2)} paid for Invoice #{String(invoice.invoiceNumber).padStart(5, '0')}
        </p>
      </div>

      {transactionId && (
        <div className="rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-left space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Transaction ID</p>
          <p className="text-xs font-mono text-foreground/80 break-all select-all">{transactionId}</p>
        </div>
      )}

      <button
        onClick={handleDownloadReceipt}
        disabled={downloading}
        className="action-btn w-full py-2.5 text-sm flex items-center justify-center gap-2"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? 'Generating Receipt...' : 'Download Receipt'}
      </button>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <p className="text-xs text-muted-foreground">
        {branding.companyName ? `Thank you for your payment to ${branding.companyName}.` : 'Thank you for your payment.'}<br />
        You may close this page.
      </p>
    </motion.div>
  );
};

/* ─── Already Paid State ─── */

const AlreadyPaidView = ({ invoice, branding, token }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadReceipt = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pay/${token}/receipt`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${String(invoice.invoiceNumber).padStart(5, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Receipt download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center space-y-4 py-4"
    >
      <div
        className="w-14 h-14 mx-auto rounded-full flex items-center justify-center"
        style={{ background: 'rgba(var(--color-success) / 0.15)' }}
      >
        <CheckCircle2 className="w-7 h-7" style={{ color: 'rgb(var(--color-success))' }} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">Invoice Already Paid</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Invoice #{String(invoice.invoiceNumber).padStart(5, '0')} has been fully paid.
        </p>
      </div>
      <button
        onClick={handleDownloadReceipt}
        disabled={downloading}
        className="action-btn w-full py-2.5 text-sm flex items-center justify-center gap-2"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {downloading ? 'Generating Receipt...' : 'Download Receipt'}
      </button>
      <p className="text-xs text-muted-foreground">
        {branding.companyName && `Thank you for your payment to ${branding.companyName}.`}
      </p>
    </motion.div>
  );
};

/* ─── Receipt Download Link ─── */

const ReceiptDownloadLink = ({ token, invoiceNumber }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pay/${token}/receipt`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${String(invoiceNumber).padStart(5, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Receipt download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="w-full flex items-center justify-center gap-2 py-2 text-sm text-accent hover:underline disabled:opacity-50"
    >
      {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {downloading ? 'Generating...' : 'Download Previous Payment Receipt'}
    </button>
  );
};

/* ─── Error / Not Found State ─── */

const ErrorView = ({ message }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="text-center space-y-4 py-6"
  >
    <div className="w-14 h-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
      <AlertCircle className="w-7 h-7 text-red-400" />
    </div>
    <div>
      <h2 className="text-lg font-bold text-foreground">Unable to Load Invoice</h2>
      <p className="text-sm text-muted-foreground mt-1">{message}</p>
    </div>
  </motion.div>
);

/* ─── Main Component ─── */

const PayOnlinePage = () => {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | error | already_paid | no_gateway | checkout | paying | paying_paypal | success
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paypalError, setPaypalError] = useState(null);
  const [paypalCompletedOrderId, setPaypalCompletedOrderId] = useState(null);

  // Fetch invoice data
  useEffect(() => {
    setState('loading');
    apiFetch(`/api/pay/${token}`)
      .then((res) => {
        setData(res);
        setPayAmount(res.invoice.balanceDue.toFixed(2));

        // Determine state
        const stripeAvailable = res.stripe?.enabled && res.stripe?.publishableKey;
        const paypalAvailable = res.paypal?.enabled && res.paypal?.clientId;
        if (res.invoice.balanceDue <= 0 || res.invoice.status === 'paid') {
          setState('already_paid');
        } else if (!stripeAvailable && !paypalAvailable) {
          setState('no_gateway');
        } else {
          setState('checkout');
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || 'This payment link is invalid or has expired.');
        setState('error');
      });
  }, [token]);


  const parsedPayAmount = parseFloat(payAmount) || 0;
  const balanceDue = data?.invoice?.balanceDue || 0;
  const isValidAmount = parsedPayAmount >= 0.50 && parsedPayAmount <= balanceDue + 0.01;

  const handleContinueToPayment = async () => {
    if (!isValidAmount) return;
    setLoadingIntent(true);
    try {
      const res = await apiFetch(`/api/pay/${token}/create-intent`, {
        method: 'POST',
        body: { amount: parsedPayAmount },
      });
      setClientSecret(res.clientSecret);
      setPaymentIntentId(res.paymentIntentId);
      setState('paying');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initialize payment.');
      setState('error');
    } finally {
      setLoadingIntent(false);
    }
  };

  const stripePromise = useMemo(
    () => data?.stripe?.publishableKey ? getStripePromise(data.stripe.publishableKey) : null,
    [data?.stripe?.publishableKey]
  );
  const stripeAppearance = useMemo(() => getStripeAppearance(), []);

  const handleSuccess = useCallback(() => setState('success'), []);

  // Gateway availability
  const stripeAvailable = data?.stripe?.enabled && data?.stripe?.publishableKey;
  const paypalAvailable = data?.paypal?.enabled && data?.paypal?.clientId;

  const paypalScriptOptions = useMemo(() => ({
    clientId: data?.paypal?.clientId || '',
    currency: 'USD',
    intent: 'capture',
  }), [data?.paypal?.clientId]);

  // Logo rendering
  const effectiveLogo = data?.branding?.loginLogoUrl || data?.branding?.headerLogoUrl;
  const isSvg = effectiveLogo?.split('?')[0]?.toLowerCase().endsWith('.svg');

  // Page title: "Company Name - App Name" or just app name
  const pageTitle = data?.branding
    ? [data.branding.companyName, data.branding.appName].filter(Boolean).join(' - ') || 'Payment'
    : 'Payment';
  const faviconUrl = data?.branding?.faviconUrl
    ? (data.branding.faviconUrl.startsWith('/') ? `${API_BASE}${data.branding.faviconUrl}` : data.branding.faviconUrl)
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: 'rgb(var(--surface-50))' }}>
      <Helmet>
        <title>{pageTitle}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
      </Helmet>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-elevated w-full max-w-md"
      >
        {/* Accent bar */}
        <div className="h-1 w-full" style={{ background: 'hsl(var(--accent))' }} />

        <div className="p-6 space-y-5">
          {/* Branding header */}
          {data && (
            <div className="text-center space-y-2">
              {effectiveLogo ? (
                isSvg ? (
                  <div
                    role="img"
                    aria-label={data.branding?.companyName || 'Company'}
                    className="mx-auto text-foreground"
                    style={{
                      display: 'inline-block',
                      width: '180px',
                      height: '40px',
                      maskImage: `url(${effectiveLogo.startsWith('/') ? `${API_BASE}${effectiveLogo}` : effectiveLogo})`,
                      WebkitMaskImage: `url(${effectiveLogo.startsWith('/') ? `${API_BASE}${effectiveLogo}` : effectiveLogo})`,
                      maskSize: 'contain',
                      WebkitMaskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      WebkitMaskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      WebkitMaskPosition: 'center',
                      backgroundColor: 'currentColor',
                    }}
                  />
                ) : (
                  <img
                    src={effectiveLogo.startsWith('/') ? `${API_BASE}${effectiveLogo}` : effectiveLogo}
                    alt={data.branding?.companyName || 'Company'}
                    className="max-h-10 max-w-[180px] mx-auto object-contain"
                  />
                )
              ) : data.branding?.companyName ? (
                <h1 className="text-lg font-bold text-foreground tracking-tight">
                  {data.branding.companyName}
                </h1>
              ) : null}

              {/* Company contact info */}
              {(data.branding?.companyAddress || data.branding?.companyContact) && (
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  {data.branding.companyAddress?.split('\n').map((line, i) => (
                    <span key={i}>{line}{i < data.branding.companyAddress.split('\n').length - 1 && <br />}</span>
                  ))}
                  {data.branding.companyContact && (
                    <span>{data.branding.companyAddress ? <br /> : ''}{data.branding.companyContact}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading invoice...</p>
            </div>
          )}

          {/* Error */}
          {state === 'error' && <ErrorView message={errorMsg} />}

          {/* Already paid */}
          {state === 'already_paid' && data && (
            <AlreadyPaidView invoice={data.invoice} branding={data.branding} token={token} />
          )}

          {/* No payment gateway enabled */}
          {state === 'no_gateway' && data && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4 py-6">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Online Payment Unavailable</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Online payments are not currently enabled. Please contact{' '}
                  {data.branding.companyName || 'us'} for payment instructions.
                </p>
              </div>
            </motion.div>
          )}

          {/* Checkout — amount selection + payment methods */}
          {state === 'checkout' && data && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5"
            >
              <InvoiceSummary invoice={data.invoice} />

              {data.invoice.hasOnlinePayment && (
                <ReceiptDownloadLink token={token} invoiceNumber={data.invoice.invoiceNumber} />
              )}

              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

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
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="glass-input w-full pl-7 text-base tabular-nums"
                    placeholder="0.00"
                  />
                </div>
                {parsedPayAmount > 0 && parsedPayAmount < balanceDue - 0.01 && (
                  <p className="text-xs text-muted-foreground">
                    Remaining after payment: ${(balanceDue - parsedPayAmount).toFixed(2)}
                  </p>
                )}
                {payAmount && !isValidAmount && (
                  <p className="text-xs" style={{ color: 'rgb(var(--color-danger))' }}>
                    {parsedPayAmount < 0.50 ? 'Minimum payment is $0.50' : `Maximum is $${balanceDue.toFixed(2)}`}
                  </p>
                )}
              </div>

              {paypalError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{paypalError}</p>
                </motion.div>
              )}

              {/* Stripe — Pay with Card */}
              {stripeAvailable && (
                <button
                  type="button"
                  onClick={handleContinueToPayment}
                  disabled={!isValidAmount || loadingIntent}
                  className="action-btn w-full py-3 text-base flex items-center justify-center gap-2"
                >
                  {loadingIntent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {loadingIntent ? 'Preparing...' : 'Pay with Card'}
                </button>
              )}

              {/* Divider between gateways */}
              {stripeAvailable && paypalAvailable && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
              )}

              {/* PayPal Button */}
              {paypalAvailable && data.paypal.clientId && (
                <PayPalScriptProvider options={paypalScriptOptions}>
                  <PayPalButtons
                    fundingSource="paypal"
                    style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay', height: 45 }}
                    disabled={!isValidAmount}
                    forceReRender={[parsedPayAmount]}
                    createOrder={async () => {
                      setPaypalError(null);
                      try {
                        const res = await apiFetch(`/api/pay/${token}/paypal-create-order`, {
                          method: 'POST',
                          body: { amount: parsedPayAmount },
                        });
                        return res.orderID;
                      } catch (err) {
                        setPaypalError(err.message || 'Failed to create PayPal order');
                        throw err;
                      }
                    }}
                    onApprove={async (approveData) => {
                      try {
                        await apiFetch(`/api/pay/${token}/paypal-capture-order`, {
                          method: 'POST',
                          body: { orderID: approveData.orderID },
                        });
                        setPaypalCompletedOrderId(approveData.orderID);
                        setState('success');
                      } catch (err) {
                        setPaypalError(err.message || 'Failed to capture PayPal payment');
                      }
                    }}
                    onError={() => setPaypalError('PayPal encountered an error. Please try again.')}
                    onCancel={() => {}}
                  />
                </PayPalScriptProvider>
              )}

              <div className="flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {stripeAvailable && paypalAvailable
                    ? 'Secured by Stripe & PayPal'
                    : stripeAvailable ? 'Secured by Stripe' : 'Secured by PayPal'}
                </span>
              </div>
            </motion.div>
          )}

          {/* Paying — Stripe Elements form */}
          {state === 'paying' && data && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-5"
            >
              <InvoiceSummary invoice={data.invoice} payingAmount={parsedPayAmount} />

              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

              {!clientSecret || !stripePromise ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Preparing secure payment...</p>
                </div>
              ) : (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
                  <CheckoutForm
                    amount={parsedPayAmount}
                    token={token}
                    paymentIntentId={paymentIntentId}
                    onSuccess={handleSuccess}
                  />
                </Elements>
              )}
            </motion.div>
          )}

          {/* Success */}
          {state === 'success' && data && (
            <SuccessView invoice={data.invoice} branding={data.branding} transactionId={paymentIntentId || paypalCompletedOrderId} token={token} paidAmount={parsedPayAmount} />
          )}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[11px] text-muted-foreground mt-6 text-center"
      >
        {stripeAvailable && paypalAvailable
          ? 'Payments processed securely by Stripe & PayPal'
          : stripeAvailable ? 'Payments processed securely by Stripe'
          : paypalAvailable ? 'Payments processed securely by PayPal'
          : 'Secure payment processing'}
      </motion.p>
    </div>
  );
};

export default PayOnlinePage;
