import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSendEmail } from '@/hooks/useMutations';

const fmt = (amount) => {
  const n = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
};

function replacePlaceholders(text, data) {
  if (!text) return text;
  let result = text;
  for (const [placeholder, value] of Object.entries(data)) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
}

const SendEmailModal = ({ open, onOpenChange, type, document, client, settings }) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const sendEmail = useSendEmail();

  useEffect(() => {
    if (!open || !document) return;

    const email = client?.email || '';
    setTo(email);

    const companyName = settings?.company_name || settings?.app_name || 'Our Company';
    const clientName = document.clientName || '';

    const placeholders = {
      '[app_name]': settings?.app_name || companyName,
      '[company_name]': companyName,
      '[client_name]': clientName,
      '[quote_number]': type === 'quote' ? String(document.quoteNumber || '') : '',
      '[invoice_number]': type === 'invoice' ? String(document.invoiceNumber || '') : '',
      '[total]': fmt(document.total),
      '[subtotal]': fmt(document.subtotal || 0),
      '[tax]': fmt(document.tax || 0),
      '[discount_amount]': fmt(document.discountAmount || 0),
      '[status]': type === 'invoice' ? (document.status || '') : '',
    };

    // Default templates matching the server defaults
    const defaultSubjects = {
      quote: `Your Quote from ${companyName}`,
      invoice: `Invoice from ${companyName} — #${document.invoiceNumber || ''}`,
    };
    const defaultBodies = {
      quote: `Hi ${clientName || 'there'},\n\nThank you for your interest in working with us. Please find your quote attached for your review.\n\nIf you have any questions or would like to move forward, don't hesitate to reach out — we're happy to help.\n\nBest regards,\n${companyName}`,
      invoice: `Hi ${clientName || 'there'},\n\nPlease find your invoice attached. A summary of the charges is included above for your convenience.\n\nIf you have any questions regarding this invoice, feel free to contact us.\n\nThank you for your business,\n${companyName}`,
    };

    const subjectTemplate = settings?.[`email_subject_${type}`] || defaultSubjects[type];
    const bodyTemplate = settings?.[`email_template_${type}`] || defaultBodies[type];

    setSubject(replacePlaceholders(subjectTemplate, placeholders));
    setBody(replacePlaceholders(bodyTemplate, placeholders));
  }, [open, type, document, client, settings]);

  const handleSend = async () => {
    if (!to) {
      toast({ title: "Recipient email is required", variant: "destructive" });
      return;
    }
    try {
      await sendEmail.mutateAsync({ to, type, documentId: document.id, subject, body });
      onOpenChange(false);
    } catch { /* handled by mutation onError */ }
  };

  const docLabel = type === 'quote' ? 'Quote' : 'Invoice';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-elevated max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {docLabel}</DialogTitle>
          <DialogDescription>
            Review and customize the email before sending. The document summary and PDF attachment are included automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="glass-input w-full"
              placeholder="client@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="glass-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-600 mb-1">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="glass-textarea w-full"
              rows={8}
            />
            <p className="text-xs text-surface-500 mt-1">
              Your logo, document summary, and a link to the PDF are added to the email automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="action-btn action-btn--secondary">
            Cancel
          </button>
          <button onClick={handleSend} disabled={sendEmail.isPending} className="action-btn">
            {sendEmail.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {sendEmail.isPending ? 'Queuing...' : `Send ${docLabel}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendEmailModal;
