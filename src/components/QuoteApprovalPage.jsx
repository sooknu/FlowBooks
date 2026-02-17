import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { CheckCircle2, AlertCircle, Loader2, CreditCard, Mail, CalendarCheck, Sparkles } from 'lucide-react';

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

const QuoteApprovalPage = () => {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | success | already_approved | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/approve/${token}`, { method: 'POST' });
        if (cancelled) return;
        setData(res);
        setState(res.alreadyApproved ? 'already_approved' : 'success');
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const logoUrl = data?.branding?.loginLogoUrl || data?.branding?.headerLogoUrl;

  const pageTitle = data?.branding
    ? [data.branding.companyName, data.branding.appName].filter(Boolean).join(' - ') || 'Quote Approval'
    : 'Quote Approval';
  const faviconUrl = data?.branding?.faviconUrl
    ? (data.branding.faviconUrl.startsWith('/') ? `${API_BASE}${data.branding.faviconUrl}` : data.branding.faviconUrl)
    : null;

  const formatCurrency = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const padNumber = (n) => String(n).padStart(5, '0');

  const handlePayNow = () => {
    if (data?.invoice?.paymentToken) {
      window.location.href = `/pay/${data.invoice.paymentToken}`;
      window.location.reload();
    }
  };

  const depositAmount = data?.invoice?.depositAmount || 0;
  const hasDeposit = depositAmount > 0;
  const hasPayGateway = data?.branding?.hasPaymentGateway;
  const payButtonAmount = hasDeposit ? depositAmount : data?.invoice?.total;

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
      </Helmet>
      <div className="min-h-screen bg-surface-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            {/* Logo */}
            {logoUrl && (
              <div className="flex justify-center mb-6">
                <img
                  src={logoUrl.startsWith('/') ? `${API_BASE}${logoUrl}` : logoUrl}
                  alt={data?.branding?.companyName || 'Company'}
                  className="max-h-12 w-auto"
                />
              </div>
            )}

            <div className="glass-card p-6 space-y-6">
              {/* Loading */}
              {state === 'loading' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-10 h-10 text-accent animate-spin" />
                  <p className="text-surface-600 text-sm">Confirming your quote...</p>
                </div>
              )}

              {/* Success — freshly approved */}
              {state === 'success' && data && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9 text-green-500" />
                    </div>
                    <h1 className="text-xl font-bold text-foreground">
                      {data.quote.clientName ? `Thank you, ${data.quote.clientName.split(' ')[0]}!` : 'Thank you!'}
                    </h1>
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      Your quote has been approved and we're excited to work with you!
                    </p>
                  </div>

                  {/* What happens next */}
                  <div className="rounded-lg border border-border/60 overflow-hidden">
                    <div className="bg-surface-100 px-4 py-2.5">
                      <span className="text-sm font-semibold text-foreground">Here's what happens next</span>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Invoice on its way</p>
                          <p className="text-xs text-muted-foreground">
                            We've created Invoice #{padNumber(data.invoice.number)} and it's being sent to your email now.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <CalendarCheck className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {hasDeposit ? `Pay the deposit to lock in your date` : `Make a payment to lock in your date`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hasDeposit
                              ? `Once your ${formatCurrency(depositAmount)} deposit is received, your date is officially booked!`
                              : `Once payment is received, your date is officially booked!`
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">We take it from there</p>
                          <p className="text-xs text-muted-foreground">
                            Sit back and relax — we'll handle the rest and keep you in the loop every step of the way.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quote summary */}
                  <div className="rounded-lg bg-surface-100/80 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Quote #{padNumber(data.quote.number)} Total</span>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(data.quote.total)}</span>
                  </div>

                  {/* Pay Now button */}
                  {data.invoice.paymentToken && hasPayGateway && (
                    <button
                      onClick={handlePayNow}
                      className="action-btn w-full py-3 text-base flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      {hasDeposit ? `Pay Deposit — ${formatCurrency(depositAmount)}` : `Pay Now — ${formatCurrency(data.invoice.total)}`}
                    </button>
                  )}

                  {!hasPayGateway && (
                    <p className="text-xs text-muted-foreground text-center">
                      Check your email for payment instructions.
                    </p>
                  )}
                </div>
              )}

              {/* Already approved */}
              {state === 'already_approved' && data && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-9 h-9 text-blue-500" />
                    </div>
                    <h1 className="text-xl font-bold text-foreground">Already Approved</h1>
                    <p className="text-sm text-muted-foreground text-center leading-relaxed">
                      Great news — this quote has already been approved!
                      Invoice #{padNumber(data.invoice.number)} was created and sent to your email.
                    </p>
                  </div>

                  {/* Pay Now button */}
                  {data.invoice.paymentToken && hasPayGateway && (
                    <button
                      onClick={handlePayNow}
                      className="action-btn w-full py-3 text-base flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" />
                      {hasDeposit ? `Pay Deposit — ${formatCurrency(depositAmount)}` : `Pay Invoice — ${formatCurrency(data.invoice.total)}`}
                    </button>
                  )}
                </div>
              )}

              {/* Error */}
              {state === 'error' && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="w-9 h-9 text-red-500" />
                  </div>
                  <h1 className="text-xl font-bold text-foreground">Something Went Wrong</h1>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    {error || 'We couldn\'t process your approval right now. Please try again or reach out to us directly.'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {data?.branding?.companyName && (
              <p className="text-center text-xs text-muted-foreground mt-6">
                {data.branding.companyName}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default QuoteApprovalPage;
