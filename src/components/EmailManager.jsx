import React, { useState, useEffect, useMemo } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Mail, Plug, RotateCcw } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import { useUpdateSettings, useTestEmail, useVerifySmtp } from '@/hooks/useMutations';
import { useSettings } from '@/hooks/useAppData';

const DEFAULT_QUOTE_TEMPLATE = 'Hi [client_name],\n\nThank you for your interest in working with us. Please find your quote attached for your review.\n\nIf you have any questions or would like to move forward, don\'t hesitate to reach out — we\'re happy to help.\n\nBest regards,\n[company_name]';
const DEFAULT_INVOICE_TEMPLATE = 'Hi [client_name],\n\nPlease find your invoice attached. A summary of the charges is included above for your convenience.\n\nIf you have any questions regarding this invoice, feel free to contact us.\n\nThank you for your business,\n[company_name]';
const DEFAULTS_EMAIL = { bg: '#1a1a2e', accent: '#8b5cf6', text: '#ffffff' };

const EmailManager = () => {
  const { data: fetchedSettings, isLoading: loading } = useSettings();
  const updateSettings = useUpdateSettings();
  const testEmailMutation = useTestEmail();
  const verifySmtp = useVerifySmtp();

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpEncryption, setSmtpEncryption] = useState('TLS');
  const [smtpEnabled, setSmtpEnabled] = useState(false);

  // Test
  const [testEmail, setTestEmail] = useState('');

  // Email templates
  const [quoteTemplate, setQuoteTemplate] = useState('');
  const [invoiceTemplate, setInvoiceTemplate] = useState('');
  const [quoteSubject, setQuoteSubject] = useState('');
  const [invoiceSubject, setInvoiceSubject] = useState('');
  const [verificationSubject, setVerificationSubject] = useState('');
  const [verificationBody, setVerificationBody] = useState('');

  // Email header colors
  const [emailHeaderBg, setEmailHeaderBg] = useState(DEFAULTS_EMAIL.bg);
  const [emailAccentColor, setEmailAccentColor] = useState(DEFAULTS_EMAIL.accent);
  const [emailHeaderTextColor, setEmailHeaderTextColor] = useState(DEFAULTS_EMAIL.text);

  useEffect(() => {
    if (fetchedSettings) {
      setSmtpHost(fetchedSettings.smtp_host || '');
      setSmtpPort(fetchedSettings.smtp_port || '587');
      setSmtpUser(fetchedSettings.smtp_user || '');
      setSmtpPass(fetchedSettings.smtp_pass || '');
      setSmtpFrom(fetchedSettings.smtp_from || '');
      setSmtpFromName(fetchedSettings.smtp_from_name || '');
      setSmtpEncryption(fetchedSettings.smtp_encryption || 'TLS');
      setSmtpEnabled(fetchedSettings.smtp_enabled === 'true');
      setQuoteTemplate(fetchedSettings.email_template_quote || DEFAULT_QUOTE_TEMPLATE);
      setInvoiceTemplate(fetchedSettings.email_template_invoice || DEFAULT_INVOICE_TEMPLATE);
      setQuoteSubject(fetchedSettings.email_subject_quote || 'Your Quote from [company_name]');
      setInvoiceSubject(fetchedSettings.email_subject_invoice || 'Invoice from [company_name] — #[invoice_number]');
      setVerificationSubject(fetchedSettings.verification_email_subject || 'Verify your email — [app_name]');
      setVerificationBody(fetchedSettings.verification_email_body || 'Thanks for signing up with [company_name]! Please click the button below to verify your email address and activate your account.');
      setEmailHeaderBg(fetchedSettings.email_header_bg_color || DEFAULTS_EMAIL.bg);
      setEmailAccentColor(fetchedSettings.email_accent_color || DEFAULTS_EMAIL.accent);
      setEmailHeaderTextColor(fetchedSettings.email_header_text_color || DEFAULTS_EMAIL.text);
    }
  }, [fetchedSettings]);

  const isDirty = useMemo(() => {
    if (!fetchedSettings) return false;
    const f = fetchedSettings;
    return smtpHost !== (f.smtp_host || '') ||
      smtpPort !== (f.smtp_port || '587') ||
      smtpUser !== (f.smtp_user || '') ||
      smtpPass !== (f.smtp_pass || '') ||
      smtpFrom !== (f.smtp_from || '') ||
      smtpFromName !== (f.smtp_from_name || '') ||
      smtpEncryption !== (f.smtp_encryption || 'TLS') ||
      smtpEnabled !== (f.smtp_enabled === 'true') ||
      quoteTemplate !== (f.email_template_quote || DEFAULT_QUOTE_TEMPLATE) ||
      invoiceTemplate !== (f.email_template_invoice || DEFAULT_INVOICE_TEMPLATE) ||
      quoteSubject !== (f.email_subject_quote || 'Your Quote from [company_name]') ||
      invoiceSubject !== (f.email_subject_invoice || 'Invoice from [company_name] — #[invoice_number]') ||
      verificationSubject !== (f.verification_email_subject || 'Verify your email — [app_name]') ||
      verificationBody !== (f.verification_email_body || 'Thanks for signing up with [company_name]! Please click the button below to verify your email address and activate your account.') ||
      emailHeaderBg !== (f.email_header_bg_color || DEFAULTS_EMAIL.bg) ||
      emailAccentColor !== (f.email_accent_color || DEFAULTS_EMAIL.accent) ||
      emailHeaderTextColor !== (f.email_header_text_color || DEFAULTS_EMAIL.text);
  }, [smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpFromName, smtpEncryption, smtpEnabled, quoteTemplate, invoiceTemplate, quoteSubject, invoiceSubject, verificationSubject, verificationBody, emailHeaderBg, emailAccentColor, emailHeaderTextColor, fetchedSettings]);

  const handleSave = () => {
    updateSettings.mutate([
      { key: 'smtp_host', value: smtpHost },
      { key: 'smtp_port', value: smtpPort },
      { key: 'smtp_user', value: smtpUser },
      { key: 'smtp_pass', value: smtpPass },
      { key: 'smtp_from', value: smtpFrom },
      { key: 'smtp_from_name', value: smtpFromName },
      { key: 'smtp_encryption', value: smtpEncryption },
      { key: 'smtp_enabled', value: String(smtpEnabled) },
      { key: 'email_template_quote', value: quoteTemplate },
      { key: 'email_template_invoice', value: invoiceTemplate },
      { key: 'email_subject_quote', value: quoteSubject },
      { key: 'email_subject_invoice', value: invoiceSubject },
      { key: 'verification_email_subject', value: verificationSubject },
      { key: 'verification_email_body', value: verificationBody },
      { key: 'email_header_bg_color', value: emailHeaderBg },
      { key: 'email_accent_color', value: emailAccentColor },
      { key: 'email_header_text_color', value: emailHeaderTextColor },
    ], {
      onSuccess: () => toast({ title: "Email settings saved successfully!" }),
    });
  };

  const handleTestConnection = () => {
    if (!testEmail) {
      toast({ title: "Enter a test email address", variant: "destructive" });
      return;
    }
    testEmailMutation.mutate(testEmail);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const emailColorPickers = [
    { key: 'bg', label: 'Background', value: emailHeaderBg, setter: setEmailHeaderBg, def: DEFAULTS_EMAIL.bg },
    { key: 'text', label: 'Text', value: emailHeaderTextColor, setter: setEmailHeaderTextColor, def: DEFAULTS_EMAIL.text },
    { key: 'accent', label: 'Accent Bar', value: emailAccentColor, setter: setEmailAccentColor, def: DEFAULTS_EMAIL.accent },
  ];

  return (
    <div className="space-y-5">
      {/* SMTP Configuration */}
      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-surface-800">SMTP Configuration</h3>
          <p className="text-sm text-surface-500 mt-1">Configure your email server for sending quotes and invoices to clients.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="smtp-enabled"
            checked={smtpEnabled}
            onChange={(e) => setSmtpEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 bg-white text-blue-500 focus:ring-blue-500/50"
          />
          <label htmlFor="smtp-enabled" className="text-sm font-medium text-surface-600">
            Enable Email Sending
          </label>
        </div>

        {smtpEnabled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">SMTP Host</label>
                <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)}
                  className="glass-input w-full" placeholder="smtp.example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">SMTP Port</label>
                <input type="number" inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)}
                  className="glass-input w-full" placeholder="587" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Username</label>
                <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)}
                  className="glass-input w-full" placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Password</label>
                <PasswordInput value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
                  className="glass-input w-full pr-9" placeholder="your-password" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">From Email</label>
                <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)}
                  className="glass-input w-full" placeholder="noreply@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">From Name</label>
                <input type="text" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)}
                  className="glass-input w-full" placeholder="Your Company" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Encryption</label>
                <select value={smtpEncryption} onChange={(e) => setSmtpEncryption(e.target.value)}
                  className="glass-select w-full">
                  <option value="TLS">TLS (Port 587)</option>
                  <option value="SSL">SSL (Port 465)</option>
                  <option value="NONE">None (Port 25)</option>
                </select>
              </div>
            </div>

            {/* Test connection */}
            <div className="border-t border-surface-200 pt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Verify Connection</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => verifySmtp.mutate()} disabled={verifySmtp.isPending}
                    className="action-btn action-btn--secondary whitespace-nowrap">
                    {verifySmtp.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Verifying...</> : <><Plug className="w-4 h-4 mr-1" /> Test Connection</>}
                  </button>
                  <span className="text-xs text-surface-500">Tests SMTP credentials without sending an email.</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Send Test Email</label>
                <div className="flex gap-2">
                  <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                    className="glass-input flex-1" placeholder="test@example.com" />
                  <button onClick={handleTestConnection} disabled={testEmailMutation.isPending}
                    className="action-btn action-btn--secondary whitespace-nowrap">
                    {testEmailMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending...</> : <><Mail className="w-4 h-4 mr-1" /> Send Test</>}
                  </button>
                </div>
                <p className="text-xs text-surface-500 mt-1">Save your settings first, then send a test email to verify delivery.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Email Header Customization */}
      <div className="glass-card p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-surface-800">Email Header</h3>
          <p className="text-xs text-surface-400 mt-1">Customize the header of all outgoing emails (quotes, invoices, verification).</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {emailColorPickers.map(({ key, label, value, setter, def }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-surface-600 mb-2">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={value || def}
                  onChange={e => setter(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-surface-200 cursor-pointer p-0.5 shrink-0"
                />
                <input
                  type="text"
                  value={value || def}
                  onChange={e => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setter(v);
                  }}
                  className="glass-input flex-1 font-mono"
                  maxLength={7}
                />
                {value !== def && (
                  <button type="button" onClick={() => setter(def)} className="text-surface-400 hover:text-surface-700 transition-colors shrink-0" title="Reset">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        <div>
          <label className="block text-xs text-surface-400 mb-2">Preview</label>
          <div style={{ background: emailHeaderBg || DEFAULTS_EMAIL.bg }} className="rounded-t-lg px-6 py-4 flex items-center justify-between">
            {(() => {
              const logoUrl = fetchedSettings?.secondary_logo_url || fetchedSettings?.header_logo_url;
              const textColor = emailHeaderTextColor || DEFAULTS_EMAIL.text;
              const companyName = fetchedSettings?.company_name || fetchedSettings?.app_name || 'Your Company';
              return logoUrl
                ? <img src={logoUrl} alt="Logo" className="max-h-[36px] w-auto object-contain" />
                : <span style={{ color: textColor }} className="text-sm font-bold tracking-tight">{companyName}</span>;
            })()}
            <span style={{ color: emailHeaderTextColor || DEFAULTS_EMAIL.text }} className="text-sm font-bold tracking-widest uppercase">Invoice</span>
          </div>
          <div style={{ background: `linear-gradient(90deg, ${emailAccentColor || DEFAULTS_EMAIL.accent}, ${emailAccentColor || DEFAULTS_EMAIL.accent}dd)` }} className="h-1 rounded-b-sm" />
        </div>
      </div>

      {/* Email Messages */}
      <div className="glass-card p-6 space-y-2">
        <h3 className="text-lg font-semibold text-surface-800">Email Messages</h3>
        <p className="text-sm text-surface-400">
          Customize the personal message included in your quote and invoice emails. The email template automatically includes your logo, a document summary with totals, and the attached PDF — this is just the message your client reads.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {['[company_name]', '[client_name]', '[quote_number]', '[invoice_number]', '[total]', '[subtotal]', '[tax]', '[discount_amount]', '[status]'].map(p => (
            <code key={p} className="bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded text-xs">{p}</code>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-5 space-y-4">
          <h4 className="text-base font-semibold text-surface-800">Quote Email</h4>
          <div>
            <label htmlFor="quote-subject" className="block text-sm font-medium text-surface-600 mb-1">Subject Line</label>
            <input
              id="quote-subject"
              value={quoteSubject}
              onChange={(e) => setQuoteSubject(e.target.value)}
              className="glass-input w-full"
              placeholder="Your Quote from [company_name]"
            />
          </div>
          <div>
            <label htmlFor="quote-template" className="block text-sm font-medium text-surface-600 mb-1">Message</label>
            <textarea
              id="quote-template"
              value={quoteTemplate}
              onChange={(e) => setQuoteTemplate(e.target.value)}
              className="glass-textarea w-full"
              rows={8}
              placeholder="Write a personal message to include in the quote email..."
            />
          </div>
        </div>

        <div className="glass-card p-5 space-y-4">
          <h4 className="text-base font-semibold text-surface-800">Invoice Email</h4>
          <div>
            <label htmlFor="invoice-subject" className="block text-sm font-medium text-surface-600 mb-1">Subject Line</label>
            <input
              id="invoice-subject"
              value={invoiceSubject}
              onChange={(e) => setInvoiceSubject(e.target.value)}
              className="glass-input w-full"
              placeholder="Invoice from [company_name] — #[invoice_number]"
            />
          </div>
          <div>
            <label htmlFor="invoice-template" className="block text-sm font-medium text-surface-600 mb-1">Message</label>
            <textarea
              id="invoice-template"
              value={invoiceTemplate}
              onChange={(e) => setInvoiceTemplate(e.target.value)}
              className="glass-textarea w-full"
              rows={8}
              placeholder="Write a personal message to include in the invoice email..."
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold text-surface-800">Verification Email</h4>
          <p className="text-sm text-surface-400 mt-1">
            Sent when a new user signs up. The email wraps your message in a branded template with a verify button automatically.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {['[app_name]', '[company_name]'].map(p => (
              <code key={p} className="bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded text-xs">{p}</code>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="verification-subject" className="block text-sm font-medium text-surface-600 mb-1">Subject Line</label>
          <input
            id="verification-subject"
            value={verificationSubject}
            onChange={(e) => setVerificationSubject(e.target.value)}
            className="glass-input w-full"
            placeholder="Verify your email — [app_name]"
          />
        </div>
        <div>
          <label htmlFor="verification-body" className="block text-sm font-medium text-surface-600 mb-1">Message</label>
          <textarea
            id="verification-body"
            value={verificationBody}
            onChange={(e) => setVerificationBody(e.target.value)}
            className="glass-textarea w-full"
            rows={4}
            placeholder="Thanks for signing up! Please click the button below to verify your email address."
          />
          <p className="text-xs text-surface-500 mt-1">
            A "Verify Email Address" button with the verification link is added to the email automatically.
          </p>
        </div>
      </div>

      <div className="pb-16" />
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={updateSettings.isPending} />
    </div>
  );
};

export default EmailManager;
