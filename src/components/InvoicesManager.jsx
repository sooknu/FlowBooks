import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTabScroll } from '@/hooks/useTabScroll';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateInvoice, useUpdateInvoice, useDeleteInvoice, useBulkDeleteInvoices, useAddPayment, useDeletePayment, useCreateClient, useUpdateClient } from '@/hooks/useMutations';
import { useAppData, useClientsCatalog, useProductsCatalog, useSettings } from '@/hooks/useAppData';
import { useProjectTypes } from '@/lib/projectTypes';
import { useAuth } from '@/contexts/AuthContext';
import { Trash2, DollarSign, Loader2, Search, ChevronLeft, ChevronRight, Plus, X, Save, Zap, Percent, ChevronsUpDown, Check, Edit, CheckSquare, Mail, Printer, ArrowUpDown, ChevronDown, ExternalLink, Gift, Undo2, Clock, PenLine, CreditCard, GripVertical, MapPin, Car, Calendar, Package, FolderKanban } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { resolveEffectiveTaxRate } from '@/lib/taxRateResolver';
import { useDebounce } from '@/hooks/useDebounce';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn, groupByCategory, fmtDate } from "@/lib/utils";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
const SendEmailModal = React.lazy(() => import('@/components/SendEmailModal'));
const StripePaymentModal = React.lazy(() => import('@/components/StripePaymentModal'));

const PAGE_SIZE = 50;

const UserInfo = ({ email, timestamp, label, icon: Icon }) => {
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return fmtDate(ts, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-surface-400">
      {Icon && <Icon className="w-3 h-3 text-surface-500" />}
      <span>{label}</span>
      <span className="text-surface-500">·</span>
      <span className="text-surface-500">{email || 'N/A'}</span>
      {timestamp && <>
        <span className="text-surface-500">·</span>
        <span>{formatDate(timestamp)}</span>
      </>}
    </div>
  );
};

const InvoiceItemRow = ({ item, children }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} className="flat-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="pt-2 cursor-grab active:cursor-grabbing touch-none" onPointerDown={(e) => controls.start(e)}>
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {children}
        </div>
      </div>
    </Reorder.Item>
  );
};

const InvoiceEditor = ({ invoice: initialInvoice, onBack, onUpdate, appData, onSendEmail, onPrint, clientToPreload, projectToPreload, onSwitchToBuilder, onNewInvoiceRequest }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clients, products } = appData;
  const { types: projectTypes, getTypeById } = useProjectTypes();
  const [invoice, setInvoice] = useState(initialInvoice || { id: null, items: [], clientId: clientToPreload?.id || projectToPreload?.clientId || null, projectId: projectToPreload?.id || null, payments: [] });
  const [isEditing, setIsEditing] = useState(!initialInvoice?.id);
  const [items, setItems] = useState([]);
  // Auto-hydrate blank descriptions from product catalog (safe, non-destructive)
  useEffect(() => {
    if (!products?.length || !items?.length) return;
    let changed = false;
    const updated = items.map((it) => {
      if (it.type === 'product' && (it.productId || it.product_id) && (!it.description || !String(it.description).trim())) {
        const pid = it.productId || it.product_id;
        const prod = products.find(p => String(p.id) === String(pid));
        if (prod?.description) { changed = true; return { ...it, description: prod.description }; }
      }
      return it;
    });
    if (changed) setItems(updated);
  }, [items, products]);

  const [payments, setPayments] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [projectTypeId, setProjectTypeId] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const { data: projectsData } = useQuery({
    queryKey: ['projects-catalog'],
    queryFn: () => api.get('/projects?pageSize=200&orderBy=createdAt&asc=false'),
    staleTime: 60_000,
  });
  const [terms, setTerms] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [isTravelDialogOpen, setIsTravelDialogOpen] = useState(false);
  const [travelMiles, setTravelMiles] = useState('');
  const defaultTaxRate = parseFloat(appData.settings?.tax_rate) || 0;
  const taxHomeState = appData.settings?.tax_home_state || '';
  const { rate: taxRate, source: taxRateSource } = useMemo(() => {
    const client = clients.find(c => c.id === selectedClient);
    return resolveEffectiveTaxRate({ clientBillingState: client?.billingState, defaultTaxRate, taxHomeState });
  }, [selectedClient, clients, defaultTaxRate, taxHomeState]);
  const [lastAddedItem, setLastAddedItem] = useState(null);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('Cash');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [paymentAction, setPaymentAction] = useState(null); // { id, amount, label, stripePaymentIntentId }
  const [stripeModalOpen, setStripeModalOpen] = useState(false);

  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isEditingClientMode, setIsEditingClientMode] = useState(false);
  const [newClientData, setNewClientData] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', address: '' });
  const updateInvoiceMutation = useUpdateInvoice();
  const createInvoiceMutation = useCreateInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();
  const addPaymentMutation = useAddPayment();
  const deletePaymentMutation = useDeletePayment();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const isSubmittingClient = createClientMutation.isPending || updateClientMutation.isPending;


  const applyInvoice = (inv) => {
    setInvoice(inv);
    setItems((inv.items || []).map(item => ({ ...item, id: Math.random(), productId: item.productId || item.product_id || '', isTaxable: (item.isTaxable ?? item.is_taxable) !== false, productType: item.productType || item.product_type, qty: item.qty || 1 })));
    setPayments(inv.payments || []);
    setSelectedClient(inv.clientId || null);
    setDiscountType(inv.discountType || 'percent');
    setDiscountValue(inv.discountValue || 0);
    setNotes(inv.notes || '');
    setEventDate(inv.eventDate ? new Date(inv.eventDate).toISOString().split('T')[0] : '');
    setEventLocation(inv.eventLocation || '');
    setProjectTypeId(inv.projectTypeId || '');
    setSelectedProject(inv.projectId || '');
    setTerms(inv.terms || '');
    setDeliveryStatus(inv.deliveryStatus || '');
    setIsEditing(!inv.id);
  };

  useEffect(() => {
    const fallback = { id: null, items: [], clientId: clientToPreload?.id || projectToPreload?.clientId || null, projectId: projectToPreload?.id || null, payments: [] };
    if (initialInvoice?.id && !initialInvoice.items) {
      // Partial object (e.g. from dashboard) — fetch full invoice
      api.get('/invoices/' + initialInvoice.id).then(res => applyInvoice(res.data || res)).catch(() => applyInvoice(fallback));
    } else {
      applyInvoice(initialInvoice || fallback);
    }
  }, [initialInvoice, clientToPreload, projectToPreload]);

  const handleInputFocus = (e) => e.target.select();

  const addProductItem = useCallback(() => {
    const newItem = {
      id: Math.random(),
      type: 'product',
      productId: lastAddedItem?.productId || '',
      description: '',
      isTaxable: false,
      qty: 1,
    };
    setItems(prev => [...prev, newItem]);
  }, [lastAddedItem]);

  const addCustomItem = useCallback(() => setItems(prev => [...prev, { id: Math.random(), type: 'custom', name: '', price: '', description: '', isTaxable: false, qty: 1 }]), []);
  const removeItem = useCallback((id) => setItems(prev => prev.filter(item => item.id !== id)), []);

  const updateItem = useCallback((id, field, value) => {
    setItems(prev => {
      const newItems = prev.map(item => item.id === id ? { ...item, [field]: value } : item);
      const updatedItem = newItems.find(item => item.id === id);
      if (updatedItem && updatedItem.type === 'product') {
        setLastAddedItem({
          productId: updatedItem.productId,
        });
      }
      return newItems;
    });
  }, []);

  const calculateItemPrice = (item, forDisplay = false) => {
    let unitPrice = 0;
    const currentProducts = products;
    const currentTaxRate = forDisplay ? (invoice.taxRate || taxRate) : taxRate;
    const qty = parseInt(item.qty, 10) || 1;

    if (item.type === 'product' && (item.productId || item.productId)) {
        const productId = item.productId || item.productId;
        const product = currentProducts.find(p => p.id === productId);
        if (!product) return { unitPrice: 0, basePrice: 0, taxOnItem: 0, total: 0 };
        unitPrice = product.retailPrice;
    } else if (item.type === 'custom' && item.price) {
        unitPrice = parseFloat(item.price || 0);
    }

    const basePrice = unitPrice * qty;
    const taxOnItem = item.isTaxable ? basePrice * (currentTaxRate / 100) : 0;
    return { unitPrice, basePrice, taxOnItem, total: basePrice + taxOnItem };
  };

  const calculateTotal = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    items.forEach(item => {
      const { basePrice, taxOnItem } = calculateItemPrice(item);
      subtotal += basePrice;
      totalTax += taxOnItem;
    });
    const discountAmount = discountType === 'percent' ? subtotal * (parseFloat(discountValue) / 100 || 0) : parseFloat(discountValue) || 0;
    const subtotalAfterDiscount = subtotal - discountAmount;
    const taxAfterDiscount = totalTax > 0 ? (subtotal > 0 ? totalTax * (subtotalAfterDiscount / subtotal) : 0) : 0;
    const total = subtotalAfterDiscount + taxAfterDiscount;
    const paidAmount = payments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
    const balanceDue = total - paidAmount;
    return { subtotal, tax: taxAfterDiscount, total, discountAmount, paidAmount, balanceDue };
  }, [items, products, taxRate, discountType, discountValue, payments, calculateItemPrice]);

  const handleSaveInvoice = async () => {
    const client = clients.find(c => c.id === selectedClient);
    const clientName = client ? (client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')) : '';
    const { subtotal, tax, total, discountAmount, paidAmount } = calculateTotal;
    const processedItems = items.map(item => {
      const { unitPrice, basePrice } = calculateItemPrice(item);
      const qty = parseInt(item.qty, 10) || 1;
      if (item.type === 'product' && item.productId && basePrice > 0) {
        const product = products.find(p => p.id === item.productId);
        if (!product) return null;
        return { type: 'product', name: product.name, productId: product.id, description: item.description, total: basePrice, isTaxable: item.isTaxable, productType: product.productType, price: unitPrice, qty };
      } else if (item.type === 'custom' && item.name && basePrice > 0) {
        return { type: 'custom', name: item.name, price: unitPrice, description: item.description, total: basePrice, isTaxable: item.isTaxable, qty };
      }
      return null;
    }).filter(Boolean);

    if (processedItems.length === 0) {
      toast({ title: "No items in invoice", description: "Please add at least one item.", variant: "destructive" });
      return null;
    }

    const status = paidAmount >= total ? 'paid' : (paidAmount > 0 ? 'partial' : 'pending');
    const invoiceData = { clientId: selectedClient || null, clientName, projectId: selectedProject || null, items: processedItems, subtotal, tax, taxRate, total, discountType, discountValue: parseFloat(discountValue) || 0, discountAmount, notes, paidAmount, status, eventDate: eventDate || null, eventLocation: eventLocation || null, projectTypeId: projectTypeId || null, eventType: getTypeById(projectTypeId)?.label || null, terms: terms || null, deliveryStatus: deliveryStatus || null };

    if (invoice.id) {
      try {
        const updatedInvoice = await updateInvoiceMutation.mutateAsync({ id: invoice.id, ...invoiceData });
        onUpdate(updatedInvoice);
        setInvoice(updatedInvoice);
        setIsEditing(false);
        return updatedInvoice;
      } catch {
        return null;
      }
    } else {
      try {
        const newInvoice = await createInvoiceMutation.mutateAsync({ ...invoiceData, dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        onUpdate(newInvoice, true);
        onSwitchToBuilder(newInvoice);
        return newInvoice;
      } catch {
        return null;
      }
    }
  };

  const handleNewInvoiceClick = async () => {
    if (items.length > 0 || notes) {
      await handleSaveInvoice();
    }
    onNewInvoiceRequest();
  };

  const handleAddPayment = async () => {
    if (!newPaymentAmount || parseFloat(newPaymentAmount) <= 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }
    try {
      const newPayment = await addPaymentMutation.mutateAsync({
        invoiceId: invoice.id,
        amount: parseFloat(newPaymentAmount),
        method: newPaymentMethod,
        paymentDate: new Date().toISOString(),
      });
      const updatedPayments = [...payments, newPayment];
      setPayments(updatedPayments);
      // Re-fetch the invoice to get server-calculated status/paidAmount
      try {
        const invoiceResult = await api.get('/invoices/' + invoice.id);
        onUpdate(invoiceResult.data);
        setInvoice(invoiceResult.data);
      } catch {
        const newPaidAmount = updatedPayments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
        setInvoice(prev => ({ ...prev, paidAmount: newPaidAmount }));
      }
      setNewPaymentAmount('');
      setIsAddingPayment(false);
    } catch {}
  };

  const handlePaymentAction = async (action) => {
    if (!paymentAction) return;
    const { id, amount, stripePaymentIntentId } = paymentAction;
    try {
      if (action === 'stripe_refund' && stripePaymentIntentId) {
        // Stripe refund — calls the Stripe API, returns money to card
        await api.post('/stripe/refund', { paymentId: id, amount });
        toast({ title: `$${parseFloat(amount).toFixed(2)} refunded to card via Stripe.` });
      } else {
        await deletePaymentMutation.mutateAsync(id);
        const updatedPayments = payments.filter(p => p.id !== id);
        setPayments(updatedPayments);

        if (action === 'credit' && selectedClient) {
          await api.post('/credits', {
            clientId: selectedClient,
            amount,
            reason: `Payment deleted — converted to client credit`,
          });
          toast({ title: `Payment removed. $${parseFloat(amount).toFixed(2)} added as client credit.` });
        } else if (action === 'refund') {
          toast({ title: `Payment removed. $${parseFloat(amount).toFixed(2)} marked as refunded.` });
        } else {
          toast({ title: 'Payment deleted successfully!' });
        }
      }

      // Re-fetch the invoice to get server-calculated status/paidAmount
      try {
        const invoiceResult = await api.get('/invoices/' + invoice.id);
        onUpdate(invoiceResult.data);
        setInvoice(invoiceResult.data);
        setPayments(invoiceResult.data.payments || []);
      } catch {
        const remainingPayments = payments.filter(p => p.id !== id);
        const newPaidAmount = remainingPayments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
        const newStatus = newPaidAmount >= calculateTotal.total ? 'paid' : (newPaidAmount > 0 ? 'partial' : 'pending');
        setInvoice(prev => ({ ...prev, paidAmount: newPaidAmount, status: newStatus }));
        setPayments(remainingPayments);
      }
    } catch {}
    setPaymentAction(null);
  };

  const handleDeleteInvoice = async () => {
    if (!invoice.id) return;
    try {
      await deleteInvoiceMutation.mutateAsync(invoice.id);
      onBack();
    } catch {}
    setIsDeleteDialogOpen(false);
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    if (!newClientData.firstName) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    const clientData = { ...newClientData, email: newClientData.email.trim().toLowerCase() };
    if (clientData.email === '') delete clientData.email;

    try {
      let savedClient;
      if (isEditingClientMode && selectedClient) {
        savedClient = await updateClientMutation.mutateAsync({ id: selectedClient, ...clientData });
      } else {
        savedClient = await createClientMutation.mutateAsync(clientData);
      }
      setSelectedClient(savedClient.id);
      setNewClientData({ firstName: '', lastName: '', email: '', phone: '', company: '', address: '' });
      setIsAddingClient(false);
      setIsEditingClientMode(false);
    } catch {}
  };

  const handleEditClientClick = () => {
    const client = clients.find(c => c.id === selectedClient);
    if (client) {
        setNewClientData({
            firstName: client.firstName || '',
            lastName: client.lastName || '',
            email: client.email || '',
            phone: client.phone || '',
            company: client.company || '',
            address: client.address || ''
        });
        setIsEditingClientMode(true);
        setIsAddingClient(true);
    }
  };

  const handleAddNewClientClick = () => {
    setNewClientData({ firstName: '', lastName: '', email: '', phone: '', company: '', address: '' });
    setIsEditingClientMode(false);
    setIsAddingClient(!isAddingClient);
  };

  const { subtotal, tax, total, discountAmount, paidAmount, balanceDue } = calculateTotal;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this invoice and all its associated payments. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteInvoice}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Payment Action Dialog */}
      <AlertDialog open={!!paymentAction} onOpenChange={(open) => { if (!open) setPaymentAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {paymentAction?.label}?</AlertDialogTitle>
            <AlertDialogDescription>What would you like to do with this payment?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button onClick={() => handlePaymentAction('delete')} className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm">
              <Trash2 className="w-4 h-4 text-destructive mr-3 shrink-0" />
              <div className="text-left">
                <div className="font-medium">Just Delete</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment record. No credit or refund.
                </div>
              </div>
            </button>
            <button onClick={() => handlePaymentAction('credit')} className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm">
              <Gift className="w-4 h-4 mr-3 shrink-0" style={{ color: 'rgb(var(--color-success))' }} />
              <div className="text-left">
                <div className="font-medium">Convert to Credit</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment and add {paymentAction ? `$${parseFloat(paymentAction.amount).toFixed(2)}` : ''} as client credit.
                </div>
              </div>
            </button>
            <button onClick={() => handlePaymentAction('refund')} className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm">
              <Undo2 className="w-4 h-4 text-muted-foreground mr-3 shrink-0" />
              <div className="text-left">
                <div className="font-medium">Refund Customer</div>
                <div className="text-xs text-muted-foreground">
                  Remove the payment record. Money was already returned to the customer.
                  {paymentAction?.stripePaymentIntentId && <span className="block text-destructive mt-0.5">The Stripe charge will NOT be refunded.</span>}
                </div>
              </div>
            </button>
            {paymentAction?.stripePaymentIntentId && (
              <button onClick={() => handlePaymentAction('stripe_refund')} className="action-btn action-btn--secondary w-full justify-start !px-4 !py-3 text-sm">
                <CreditCard className="w-4 h-4 text-primary mr-3 shrink-0" />
                <div className="text-left">
                  <div className="font-medium">Refund to Card</div>
                  <div className="text-xs text-muted-foreground">
                    Refund {paymentAction ? `$${parseFloat(paymentAction.amount).toFixed(2)}` : ''} back to the customer's card via Stripe.
                  </div>
                </div>
              </button>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
            <div>
              <h3 className="text-2xl font-bold">{invoice.id ? `Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}` : 'New Invoice'}</h3>
              {invoice.id && (
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 mt-1.5">
                  <UserInfo label="Created" email={invoice.createdBy} timestamp={invoice.createdAt} icon={Clock} />
                  {invoice.lastEditedBy && <UserInfo label="Edited" email={invoice.lastEditedBy} timestamp={invoice.updatedAt} icon={PenLine} />}
                </div>
              )}
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              {invoice.id && !isEditing && <button onClick={() => setIsEditing(true)} className="action-btn action-btn--secondary flex-1 md:flex-none"><Edit className="w-4 h-4 mr-1" /> Edit</button>}
              {invoice.id && !isEditing && <button onClick={() => setIsDeleteDialogOpen(true)} className="action-btn action-btn--danger flex-1 md:flex-none"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
        <div className="flex flex-row lg:flex-col gap-2">
          <button onClick={handleNewInvoiceClick} className="action-btn flex-1 h-10"><Plus className="w-4 h-4 mr-1" /> New Invoice</button>
          {onBack && <button onClick={onBack} className="action-btn action-btn--secondary flex-1 h-10"><ChevronLeft className="w-4 h-4 mr-1" /> Back to List</button>}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-lg font-semibold">{isAddingClient && isEditingClientMode ? 'Edit Client' : 'Client'}</h4>
              {isEditing && (
                <Button variant="ghost" size="sm" onClick={handleAddNewClientClick}>
                  <Plus className="w-4 h-4 mr-2" /> Add New
                </Button>
              )}
            </div>
            <AnimatePresence>
              {isAddingClient && isEditing ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <form onSubmit={handleSaveClient} className="space-y-3 p-3 bg-surface-100 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" placeholder="First Name *" value={newClientData.firstName} onChange={(e) => setNewClientData({ ...newClientData, firstName: e.target.value })} className="glass-input w-full" required />
                      <input type="text" placeholder="Last Name" value={newClientData.lastName} onChange={(e) => setNewClientData({ ...newClientData, lastName: e.target.value })} className="glass-input w-full" />
                      <input type="email" placeholder="Email" value={newClientData.email} onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })} className="glass-input w-full" />
                      <input type="tel" inputMode="tel" placeholder="Phone" value={newClientData.phone} onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })} className="glass-input w-full" />
                      <input type="text" placeholder="Company" value={newClientData.company} onChange={(e) => setNewClientData({ ...newClientData, company: e.target.value })} className="glass-input w-full col-span-2" />
                    </div>
                    <textarea placeholder="Address" value={newClientData.address} onChange={(e) => setNewClientData({ ...newClientData, address: e.target.value })} className="glass-textarea w-full" rows={2} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setIsAddingClient(false); setIsEditingClientMode(false); }}>Cancel</Button>
                      <Button type="submit" className="action-btn" disabled={isSubmittingClient}>
                        {isSubmittingClient ? <Loader2 className="animate-spin" /> : (isEditingClientMode ? 'Update Client' : 'Save Client')}
                      </Button>
                    </div>
                  </form>
                </motion.div>
              ) : (
                <div className="flex items-center gap-2">
                    <div className="flex-grow">
                        <ClientCombobox clients={clients} value={selectedClient} onChange={setSelectedClient} disabled={!isEditing} />
                    </div>
                    {isEditing && selectedClient && (
                        <>
                            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleEditClientClick}>
                                <Edit className="w-4 h-4 text-blue-400" />
                            </Button>
                            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setSelectedClient(null)}>
                                <X className="w-4 h-4 text-red-400" />
                            </Button>
                        </>
                    )}
                    {!isEditing && selectedClient && (
                        <Button variant="ghost" size="icon" className="shrink-0 text-surface-400 hover:text-[#C8C6C2]" title="View Client Profile" onClick={() => navigate('/clients/' + selectedClient)}>
                            <ExternalLink className="w-4 h-4" />
                        </Button>
                    )}
                </div>
              )}
            </AnimatePresence>
          </div>
          {(() => {
            const travelRate = parseFloat(appData.settings?.travel_rate_per_mile) || 0.67;
            const hasEventInfo = eventDate || eventLocation || projectTypeId || selectedProject;
            const deliveryStatusOptions = [
              { value: 'scheduled', label: 'Scheduled', color: 'text-blue-400 bg-blue-500/20' },
              { value: 'in_editing', label: 'In Editing', color: 'text-purple-400 bg-purple-500/20' },
              { value: 'delivered', label: 'Delivered', color: 'text-green-400 bg-green-500/20' },
            ];
            return (
              <>
                {(isEditing || hasEventInfo) && (
                  <div className="glass-card p-4">
                    <h4 className="text-lg font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Event Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs text-surface-400">Event Type</Label>
                        {isEditing ? (
                          <select value={projectTypeId} onChange={(e) => setProjectTypeId(e.target.value)} className="glass-input w-full">
                            <option value="">Select type...</option>
                            {projectTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm mt-1">{getTypeById(projectTypeId)?.label || '—'}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-surface-400">Event Date</Label>
                        {isEditing ? (
                          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="glass-input w-full" />
                        ) : (
                          <p className="text-sm mt-1">{eventDate ? fmtDate(eventDate + 'T00:00:00', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-surface-400">Location</Label>
                        {isEditing ? (
                          <input type="text" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} className="glass-input w-full" placeholder="e.g., Central Park, NYC" />
                        ) : (
                          <p className="text-sm mt-1 flex items-center gap-1">{eventLocation ? <><MapPin className="w-3 h-3 text-surface-500" />{eventLocation}</> : '—'}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-surface-400">Project</Label>
                        {isEditing ? (
                          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} className="glass-input w-full">
                            <option value="">None</option>
                            {(projectsData?.data || []).map(p => (
                              <option key={p.id} value={p.id}>{p.title}{p.client ? ` — ${p.client.displayName || p.client.firstName || ''}` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm mt-1 flex items-center gap-1">
                            {selectedProject
                              ? <><FolderKanban className="w-3 h-3 text-surface-400 shrink-0" /><span className="truncate">{(projectsData?.data || []).find(p => p.id === selectedProject)?.title || 'Linked'}</span></>
                              : '—'}
                          </p>
                        )}
                      </div>
                    </div>
                    {(isEditing || deliveryStatus) && (
                      <div className="mt-3">
                        <Label className="text-xs text-surface-400">Delivery Status</Label>
                        {isEditing ? (
                          <select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)} className="glass-input w-full md:w-auto">
                            <option value="">Not set</option>
                            {deliveryStatusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm mt-1">
                            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", deliveryStatusOptions.find(o => o.value === deliveryStatus)?.color || '')}>
                              <Package className="w-3 h-3" />
                              {deliveryStatusOptions.find(o => o.value === deliveryStatus)?.label || deliveryStatus}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <Dialog open={isTravelDialogOpen} onOpenChange={setIsTravelDialogOpen}>
                  <DialogContent className="glass-card sm:max-w-md">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Car className="w-5 h-5" /> Travel Fee Calculator</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div>
                        <Label>Miles from Studio</Label>
                        <input type="number" inputMode="numeric" value={travelMiles} onChange={e => setTravelMiles(e.target.value)} className="glass-input w-full" placeholder="0" min="0" />
                      </div>
                      <div className="flex justify-between text-sm text-surface-400">
                        <span>Rate</span>
                        <span>${travelRate.toFixed(2)}/mile</span>
                      </div>
                      {parseFloat(travelMiles) > 0 && (
                        <div className="text-center py-2">
                          <p className="text-2xl font-bold text-primary">${(parseFloat(travelMiles) * travelRate).toFixed(2)}</p>
                          <p className="text-xs text-surface-400">{travelMiles} miles &times; ${travelRate.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsTravelDialogOpen(false)}>Cancel</Button>
                      <Button disabled={!parseFloat(travelMiles)} onClick={() => {
                        const fee = parseFloat(travelMiles) * travelRate;
                        setItems(prev => [...prev, { id: Math.random(), type: 'custom', name: `Travel Fee (${travelMiles} mi)`, price: fee.toFixed(2), description: `${travelMiles} miles @ $${travelRate.toFixed(2)}/mi`, isTaxable: false, qty: 1 }]);
                        setIsTravelDialogOpen(false);
                        setTravelMiles('');
                      }}>Add Travel Fee</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            );
          })()}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold">Items</h4>
              {isEditing && (
                <div className="flex gap-2">
                  <button onClick={addProductItem} className="action-btn action-btn--secondary"><Plus className="w-3.5 h-3.5 inline mr-1" />Product</button>
                  <button onClick={addCustomItem} className="action-btn action-btn--secondary"><Plus className="w-3.5 h-3.5 inline mr-1" />Custom</button>
                  <button onClick={() => setIsTravelDialogOpen(true)} className="action-btn action-btn--secondary"><Car className="w-3.5 h-3.5 inline mr-1" />Travel</button>
                </div>
              )}
            </div>
            {isEditing ? (
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3">
                {items.map(item => {
                  const { unitPrice, basePrice, taxOnItem, total: itemTotal } = calculateItemPrice(item);
                  const qty = parseInt(item.qty, 10) || 1;
                  return (
                  <InvoiceItemRow key={item.id} item={item}>
                    <div className="flex flex-wrap items-center gap-3">
                      {item.type === 'product' ? (
                        <>
                          <div className="w-full md:flex-1 md:min-w-[200px]">
                            <ProductCombobox products={products} value={item.productId} onChange={(val) => {
                              updateItem(item.id, 'productId', val);
                              const prod = products.find(p => String(p.id) === String(val));
                              if (prod) {
                                updateItem(item.id, 'description', prod.description || '');
                              }
                            }} />
                          </div>
                          <div className="w-full md:flex-1">
                            <input placeholder="Description" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} className="glass-input w-full" />
                          </div>
                        </>
                      ) : (
                        <>
                          <input type="text" placeholder="Item name" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} className="glass-input w-full md:flex-1" />
                          <input placeholder="Description" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} className="glass-input w-full md:flex-1" />
                          <input type="number" inputMode="decimal" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} className="glass-input w-full md:w-auto md:flex-[0.5]" />
                        </>
                      )}
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`qty-${item.id}`} className="text-xs text-surface-600">Qty</Label>
                        <input id={`qty-${item.id}`} type="number" inputMode="numeric" value={item.qty} onFocus={handleInputFocus} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} className="glass-input w-16 text-center" />
                      </div>
                      <button onClick={() => removeItem(item.id)} className="icon-button ml-auto"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center space-x-2">
                        <Checkbox id={`taxable-${item.id}`} checked={item.isTaxable} onCheckedChange={(c) => updateItem(item.id, 'isTaxable', c)} />
                        <Label htmlFor={`taxable-${item.id}`} className="text-xs text-surface-600">Taxable</Label>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-right flex-wrap justify-end">
                        {qty > 1 && unitPrice > 0 && (
                          <span className="text-xs text-surface-400">
                            ${unitPrice.toFixed(2)} &times; {qty} =
                          </span>
                        )}
                        <span>${basePrice.toFixed(2)}</span>
                        {taxOnItem > 0 && <span className="text-green-400 text-xs">+ ${taxOnItem.toFixed(2)} tax</span>}
                        <span className="font-bold text-blue-300">Total: ${itemTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </InvoiceItemRow>
                )})}
              </Reorder.Group>
            ) : (
                <div className="space-y-3">
                {(invoice.items || []).map((item, idx) => {
                  const { unitPrice, taxOnItem, total: itemTotal } = calculateItemPrice(item, true);
                  const qty = parseInt(item.qty, 10) || 1;
                  return (
                    <div key={idx} className="flat-card p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && <p className="text-xs text-surface-400 pt-1">{item.description}</p>}
                        </div>
                        <p className="font-bold text-lg text-blue-300">${itemTotal.toFixed(2)}</p>
                      </div>
                      <div className="text-right text-xs text-surface-500 flex justify-end items-center gap-2">
                          <span>{qty} &times; ${unitPrice.toFixed(2)}</span>
                          {taxOnItem > 0 && <span> + ${taxOnItem.toFixed(2)} tax</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {isEditing && (
            <div className="glass-card p-4">
              <h4 className="text-lg font-semibold mb-3">Notes</h4>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any internal notes for this invoice..." className="glass-textarea w-full" rows={3}></textarea>
            </div>
          )}
          {isEditing && (
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold">Terms & Conditions</h4>
                {!terms && appData.settings?.terms_template && (
                  <Button variant="ghost" size="sm" onClick={() => setTerms(appData.settings.terms_template)}>Load Template</Button>
                )}
              </div>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter terms & conditions (or load the template)..." className="glass-textarea w-full" rows={4}></textarea>
            </div>
          )}
        </div>
        <div className="lg:col-span-1"> {/* Remains lg:col-span-1 */}
          <div className="sticky top-24 space-y-4">
            <div className="glass-card p-4">
              <h4 className="text-base font-semibold mb-3">Pricing</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-surface-400">Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>

                <div>
                  <div className="flex justify-between text-sm items-center">
                    <button onClick={() => isEditing && setIsDiscountOpen(!isDiscountOpen)} className="flex items-center gap-1 text-surface-400 hover:text-surface-700 disabled:cursor-not-allowed" disabled={!isEditing}>
                      <Zap className="w-3.5 h-3.5" /> Discount <ChevronDown className={cn("w-4 h-4 transition-transform", isDiscountOpen && "rotate-180")} />
                    </button>
                    {discountAmount > 0 && <span className="text-green-400">- ${discountAmount.toFixed(2)}</span>}
                  </div>
                  <AnimatePresence>
                    {isDiscountOpen && isEditing && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 pt-3">
                          <div className="flex items-center bg-surface-100 p-1 rounded-md w-1/2">
                            <Button variant={discountType === 'percent' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDiscountType('percent')} className="w-full h-8"><Percent className="w-4 h-4" /></Button>
                            <Button variant={discountType === 'fixed' ? 'secondary' : 'ghost'} size="sm" onClick={() => setDiscountType('fixed')} className="w-full h-8"><DollarSign className="w-4 h-4" /></Button>
                          </div>
                          <input id="discount-value" type="number" inputMode="decimal" value={discountValue} onFocus={handleInputFocus} onChange={(e) => setDiscountValue(e.target.value)} className="glass-input w-1/2 h-8 text-right" placeholder="0" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex justify-between text-sm"><span className="text-surface-400">Tax ({taxRate}%{taxRateSource !== 'default' && isEditing ? ` · ${taxRateSource}` : ''}):</span><span>${tax.toFixed(2)}</span></div>
                <div className="divider my-2"></div>
                <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-blue-400">${total.toFixed(2)}</span></div>
                {invoice.depositAmount > 0 && (
                  <div className="flex justify-between text-sm text-amber-400"><span>Deposit Due:</span><span>${parseFloat(invoice.depositAmount).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between text-sm text-green-400"><span >Paid:</span><span>- ${paidAmount.toFixed(2)}</span></div>
                <div className="divider my-2"></div>
                <div className="flex justify-between text-lg font-bold"><span>Balance Due:</span><span className="text-orange-400">${balanceDue.toFixed(2)}</span></div>
              </div>
            </div>
            {isEditing && (
              <button onClick={handleSaveInvoice} className="action-btn w-full">
                <Save className="w-4 h-4 mr-2" /> {invoice.id ? 'Update Invoice' : 'Save Invoice'}
              </button>
            )}
            {invoice.id && !isEditing && (
              <div className="space-y-2">
                <button onClick={() => onPrint(invoice)} className="action-btn action-btn--secondary w-full"><Printer className="w-4 h-4 mr-2" /> Print Invoice</button>
                <button onClick={() => onSendEmail(invoice)} className="action-btn action-btn--secondary w-full"><Mail className="w-4 h-4 mr-2" /> Email Invoice</button>
              </div>
            )}
            {invoice.id && (
              <div className="glass-card p-4 space-y-3">
                <h4 className="text-base font-semibold">Payments</h4>
                {/* Progress bar */}
                {total > 0 && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: paidAmount >= total ? 'rgb(74 222 128)' : 'var(--accent-color, hsl(var(--accent)))' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (paidAmount / total) * 100)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-surface-500">
                      <span>${paidAmount.toFixed(2)} paid</span>
                      <span>{paidAmount >= total ? 'Paid in full' : `$${balanceDue.toFixed(2)} remaining`}</span>
                    </div>
                  </div>
                )}
                {/* Payment list */}
                <div className="space-y-1.5">
                  {payments.map(p => {
                    const amt = parseFloat(p.amount);
                    const isStripe = !!p.stripePaymentIntentId;
                    const isPayPal = !!p.paypalOrderId;
                    const isOnline = isStripe || isPayPal;
                    const methodIcon = isStripe ? CreditCard : isPayPal ? CreditCard : p.method === 'Check' ? Check : p.method === 'Bank Transfer' ? ExternalLink : DollarSign;
                    const MethodIcon = methodIcon;
                    return (
                      <div key={p.id} className="group flex items-center gap-3 p-2.5 rounded-lg bg-surface-100 hover:bg-surface-200 transition-colors">
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", isOnline ? "bg-accent/15 text-accent" : "bg-surface-100 text-surface-400")}>
                          <MethodIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-semibold text-sm">${amt.toFixed(2)}</span>
                            <span className="text-[11px] text-surface-500">{p.method}</span>
                            {isStripe && <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-px rounded-full leading-tight">Stripe</span>}
                            {isPayPal && <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-px rounded-full leading-tight">PayPal</span>}
                          </div>
                          <p className="text-[11px] text-surface-500">{fmtDate(p.paymentDate, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                        <button
                          onClick={() => setPaymentAction({ id: p.id, amount: amt, label: `$${amt.toFixed(2)} ${p.method} payment`, stripePaymentIntentId: p.stripePaymentIntentId || null })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/10 text-surface-500 hover:text-red-400"
                          title="Remove payment"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {payments.length === 0 && !isAddingPayment && (
                    <p className="text-xs text-surface-500 text-center py-3">No payments recorded.</p>
                  )}
                </div>
                {/* Add payment form + action buttons */}
                {balanceDue > 0 && (
                  <div className="flex flex-col gap-2">
                    {isAddingPayment ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2"
                      >
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500 pointer-events-none" />
                            <input type="number" inputMode="decimal" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value)} placeholder="0.00" className="glass-input w-full pl-8 text-base" />
                          </div>
                          <select value={newPaymentMethod} onChange={e => setNewPaymentMethod(e.target.value)} className="glass-input w-[130px] text-base">
                            <option>Cash</option><option>Credit Card</option><option>Check</option><option>Bank Transfer</option><option>Other</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setIsAddingPayment(false); setNewPaymentAmount(''); }} className="action-btn action-btn--secondary flex-1 text-sm">Cancel</button>
                          <button onClick={handleAddPayment} className="action-btn flex-1 text-sm">Record</button>
                        </div>
                      </motion.div>
                    ) : (
                      <button onClick={() => setIsAddingPayment(true)} className="action-btn action-btn--secondary w-full text-xs py-2">
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Record Payment
                      </button>
                    )}
                    {appData.settings?.stripe_enabled === 'true' && (
                      <>
                        <div className="divider" />
                        <button onClick={() => setStripeModalOpen(true)} className="action-btn w-full text-xs py-2">
                          <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay with Card
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {invoice.id && !isEditing && invoice.notes && (
              <div className="glass-card p-4">
                <h4 className="text-base font-semibold mb-2">Notes</h4>
                <p className="text-sm text-surface-500 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.id && !isEditing && terms && (
              <div className="glass-card p-4">
                <h4 className="text-base font-semibold mb-2">Terms</h4>
                <p className="text-xs text-surface-400 whitespace-pre-wrap">{terms}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {stripeModalOpen && (
        <React.Suspense fallback={null}>
          <StripePaymentModal
            open={stripeModalOpen}
            onOpenChange={setStripeModalOpen}
            invoice={invoice}
            settings={appData.settings}
            onPaymentSuccess={async () => {
              try {
                const result = await api.get('/invoices/' + invoice.id);
                onUpdate(result.data);
                setInvoice(result.data);
                setPayments(result.data.payments || []);
              } catch {}
            }}
          />
        </React.Suspense>
      )}
    </motion.div>
  );
};

const ClientCombobox = ({ clients, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const selectedClient = clients.find(c => c.id === value);
  const clientFullName = selectedClient ? (selectedClient.displayName || [selectedClient.firstName, selectedClient.lastName].filter(Boolean).join(' ')) : "Select client...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between glass-input text-surface-800"
          disabled={disabled}
        >
          {selectedClient ? <span>{clientFullName} <span className="text-surface-500">— {selectedClient.email || 'No Email'}</span></span> : "Select client..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 glass-elevated">
        <Command>
          <CommandInput placeholder="Search client..." />
          <CommandEmpty>No client found.</CommandEmpty>
          <CommandGroup className="max-h-60 overflow-y-auto">
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={[client.displayName, client.firstName, client.lastName, client.email, client.company].filter(Boolean).join(' ')}
                onSelect={() => {
                  onChange(client.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === client.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')}</span>
                  <span className="text-xs opacity-60">{client.email || client.company || 'No details'}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ProductCombobox = ({ products, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selectedProduct = products.find(p => p.id === value);
  const grouped = useMemo(() => groupByCategory(products), [products]);
  const getPriceDisplay = (product) => {
    return `${parseFloat(product.retailPrice || 0).toFixed(2)}`;
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between glass-input text-surface-800"
        >
          {selectedProduct ? selectedProduct.name : "Select product..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 glass-elevated">
        <Command>
          <CommandInput placeholder="Search product..." />
          <CommandEmpty>No product found.</CommandEmpty>
          <CommandList>
            {grouped.map(({ category, products: catProducts }) => (
              <CommandGroup key={category} heading={category}>
                {catProducts.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.name}
                    onSelect={() => {
                      onChange(product.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === product.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex justify-between w-full">
                      <span>{product.name}</span>
                      <span className="text-xs text-surface-500">
                        {getPriceDisplay(product)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const InvoiceRow = React.memo(({ invoice, onSelect, onDelete, onSelectionChange, isSelected, isSelectionMode, products, taxRate }) => {
  const navigate = useNavigate();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const recalculatedTotal = useMemo(() => {
    if (!invoice.items || !products) return invoice.total;

    let subtotal = 0;
    (invoice.items || []).forEach(item => {
      const qty = parseInt(item.qty, 10) || 1;
      if (item.type === 'product' && item.productId) {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          subtotal += product.retailPrice * qty;
        } else {
          subtotal += item.total || 0;
        }
      } else if (item.type === 'custom') {
        subtotal += (item.price * qty) || 0;
      }
    });

    const discountAmount = invoice.discountType === 'percent' ? subtotal * (parseFloat(invoice.discountValue) / 100 || 0) : parseFloat(invoice.discountValue) || 0;
    const subtotalAfterDiscount = subtotal - discountAmount;

    let totalTax = 0;
    (invoice.items || []).forEach(item => {
      if (item.isTaxable) {
        let itemSubtotal = 0;
        const qty = parseInt(item.qty, 10) || 1;
        if (item.type === 'product' && item.productId) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            itemSubtotal = product.retailPrice * qty;
          } else {
            itemSubtotal = item.total || 0;
          }
        } else if (item.type === 'custom') {
          itemSubtotal = (item.price * qty) || 0;
        }
        const itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * discountAmount : 0;
        totalTax += (itemSubtotal - itemDiscount) * (taxRate / 100);
      }
    });

    return subtotalAfterDiscount + totalTax;
  }, [invoice, products, taxRate]);

  const balanceDue = recalculatedTotal - (invoice.paidAmount || 0);
  const statusColors = {
    paid: 'bg-green-500/20 text-green-400',
    partial: 'bg-yellow-500/20 text-yellow-400',
    pending: 'bg-orange-500/20 text-orange-400',
    overdue: 'bg-red-500/20 text-red-400',
  };

  let status = invoice.status;
  if (balanceDue <= 0) {
    status = 'paid';
  } else if (new Date(invoice.dueDate) < new Date() && balanceDue > 0) {
    status = 'overdue';
  }

  return (
    <>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this invoice and all its associated payments. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(invoice.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className={cn("list-card p-3 px-4 group", {
          'border-l-green-500/30 hover:border-l-green-500': status === 'paid',
          'border-l-yellow-500/30 hover:border-l-yellow-500': status === 'partial',
          'border-l-orange-500/30 hover:border-l-orange-500': status === 'pending',
          'border-l-red-500/30 hover:border-l-red-500': status === 'overdue',
        })}
        onClick={() => onSelect(invoice)}
      >
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isSelectionMode && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectionChange(invoice.id, checked)} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex-grow min-w-0">
            {/* Top line: doc number, status, date, amount */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-bold tabular-nums shrink-0">#{String(invoice.invoiceNumber).padStart(5, '0')}</span>
                <span className={cn("flex items-center gap-1.5 text-xs font-medium", {
                  'text-green-400': status === 'paid',
                  'text-yellow-400': status === 'partial',
                  'text-orange-400': status === 'pending',
                  'text-red-400': status === 'overdue',
                })}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", {
                    'bg-green-400': status === 'paid',
                    'bg-yellow-400': status === 'partial',
                    'bg-orange-400': status === 'pending',
                    'bg-red-400': status === 'overdue',
                  })} />
                  {status}
                </span>
                <span className="text-xs text-surface-400 hidden md:inline">{fmtDate(invoice.createdAt, { month: 'short', day: 'numeric' })}</span>
                {invoice.deliveryStatus && (
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full hidden md:inline-flex items-center gap-1", {
                    'bg-blue-500/20 text-blue-400': invoice.deliveryStatus === 'scheduled',
                    'bg-purple-500/20 text-purple-400': invoice.deliveryStatus === 'in_editing',
                    'bg-green-500/20 text-green-400': invoice.deliveryStatus === 'delivered',
                  })}>
                    <Package className="w-2.5 h-2.5" />
                    {invoice.deliveryStatus === 'in_editing' ? 'Editing' : invoice.deliveryStatus === 'scheduled' ? 'Scheduled' : 'Delivered'}
                  </span>
                )}
              </div>
              <span className="font-bold text-lg tabular-nums text-blue-400 shrink-0">${parseFloat(recalculatedTotal).toFixed(2)}</span>
            </div>
            {/* Bottom line: client, due date, balance, actions */}
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-3 min-w-0">
                {invoice.clientId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate('/clients/' + invoice.clientId); }}
                    className="text-surface-600 text-sm truncate hover:text-blue-500 transition-colors text-left flex items-center gap-1.5 group/client"
                  >
                    <span className="truncate">{invoice.clientName || 'No Client'}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/client:opacity-100 transition-opacity shrink-0" />
                  </button>
                ) : (
                  <p className="text-surface-400 text-sm truncate">{invoice.clientName || 'No Client'}</p>
                )}
                <span className="text-xs text-surface-500 shrink-0">Due {fmtDate(invoice.dueDate, { month: 'short', day: 'numeric' })}</span>
                {balanceDue > 0 && <span className="text-xs font-medium text-orange-400 shrink-0">${balanceDue.toFixed(2)} owed</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setIsDeleteDialogOpen(true)} className="icon-button !p-1.5" title="Delete Invoice"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </motion.div>
    </>
  );
});

const InvoicesManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeInvoiceId } = useParams();
  const navState = location.state || {};
  const navStateRef = useRef(navState);
  // Capture the first non-empty navState and clear without triggering React Router re-mount
  useEffect(() => {
    if (location.state) {
      navStateRef.current = location.state;
      // Clear browser state so refresh won't replay, but don't trigger React Router
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state, location.pathname]);

  const { isDataLoading } = useAppData();
  const { data: clients = [] } = useClientsCatalog();
  const { data: products = [] } = useProductsCatalog();
  const { data: settings = {} } = useSettings();
  const appData = { clients, products, settings };

  // Support /invoices/:id (route param) and location.state
  const invoiceToLoad = routeInvoiceId ? { id: routeInvoiceId } : (navStateRef.current.invoiceToLoad || (navStateRef.current.editInvoiceId ? { id: navStateRef.current.editInvoiceId } : null));
  const clientToPreload = navStateRef.current.clientToPreload || null;
  const projectToPreload = navStateRef.current.projectToPreload || null;

  // Initialize state directly — no useEffect timing issues
  const [activeTab, setActiveTab] = useState(invoiceToLoad || clientToPreload || projectToPreload ? 'invoice_builder' : 'all_invoices');
  const { tabsRef, scrollToTabs } = useTabScroll();
  const [selectedInvoice, setSelectedInvoice] = useState(invoiceToLoad);

  // React to route param changes (navigating from project to /invoices/:id)
  useEffect(() => {
    if (routeInvoiceId) {
      setSelectedInvoice({ id: routeInvoiceId });
      setActiveTab('invoice_builder');
    }
  }, [routeInvoiceId]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const bulkDeleteInvoicesMutation = useBulkDeleteInvoices();
  const deleteInvoiceMut = useDeleteInvoice();
  const [selectedInvoices, setSelectedInvoices] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
  const [sort, setSort] = useState({ by: 'createdAt', ascending: false });

  const sortOptions = [
    { label: 'Newest First', value: { by: 'createdAt', ascending: false } },
    { label: 'Oldest First', value: { by: 'createdAt', ascending: true } },
    { label: 'Invoice # (Desc)', value: { by: 'invoiceNumber', ascending: false } },
    { label: 'Invoice # (Asc)', value: { by: 'invoiceNumber', ascending: true } },
    { label: 'Total (High-Low)', value: { by: 'total', ascending: false } },
    { label: 'Total (Low-High)', value: { by: 'total', ascending: true } },
    { label: 'Due Date', value: { by: 'dueDate', ascending: true } },
  ];

  const handleSelectionChange = useCallback((invoiceId, isSelected) => {
    setSelectedInvoices(prev => {
      const newSet = new Set(prev);
      if (isSelected) newSet.add(invoiceId);
      else newSet.delete(invoiceId);
      return newSet;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedInvoices.size === 0) return;
    try {
      await bulkDeleteInvoicesMutation.mutateAsync(Array.from(selectedInvoices));
      setSelectedInvoices(new Set());
      setIsSelectionMode(false);
    } catch {}
    setIsConfirmDeleteDialogOpen(false);
  };

  const {
    data: invoicesData,
    isLoading: loading,
    isFetchingNextPage,
    hasNextPage: hasMore,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.invoices.list({ search: debouncedSearchTerm, sort }),
    queryFn: async ({ pageParam = 0 }) => {
      return api.get('/invoices', {
        search: debouncedSearchTerm || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        orderBy: sort.by,
        asc: sort.ascending,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
      return totalFetched < (lastPage.count || 0) ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60_000,
  });

  const invoices = useMemo(() => invoicesData?.pages.flatMap(p => p.data || []) ?? [], [invoicesData]);

  const handleUpdateInvoice = useCallback(() => {}, []);

  const handleDelete = useCallback((id) => {
    deleteInvoiceMut.mutate(id);
  }, [deleteInvoiceMut]);

  const handleSendEmail = useCallback(async (invoice) => {
    try {
      const result = await api.get('/invoices/' + invoice.id);
      const fullInvoice = result.data;
      const client = fullInvoice.client || appData.clients.find(c => c.id === invoice.clientId);
      if (!client?.email) {
        toast({ title: "Client has no email", description: "Please add an email address to the client's profile.", variant: "destructive" });
        return;
      }
      setEmailTarget({ document: fullInvoice, client });
      setEmailModalOpen(true);
    } catch (error) {
      toast({ title: "Failed to load invoice", description: error.message, variant: "destructive" });
    }
  }, [appData.clients]);

  const handlePrint = useCallback(async (invoice) => {
    if (!invoice) return;
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups for this site to print.", variant: "destructive" });
      return;
    }
    newWindow.document.write('<html><body style="background-color: #1a1a1a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;"><h1>Generating PDF...</h1></body></html>');
    try {
      const result = await api.post('/pdf/generate', { type: 'invoice', documentId: invoice.id });
      const blob = new Blob([Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      newWindow.location.href = url;
    } catch (e) {
      newWindow.document.write(`<html><body style="background-color: #1a1a1a; color: #ff4d4d; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;"><h1>Failed to generate PDF: ${e.message}</h1></body></html>`);
      toast({ title: "Failed to generate PDF", description: e.message, variant: "destructive" });
    }
  }, []);

  const handleSelectInvoice = (invoice) => {
    setSelectedInvoice(invoice);
    setActiveTab('invoice_builder');
  };

  const handleBackToList = () => {
    setSelectedInvoice(null);
    setActiveTab('all_invoices');
    navigate('/invoices');
  };

  const handleNewInvoiceRequest = () => {
    setSelectedInvoice(null);
    setActiveTab('invoice_builder');
  };

  if (isDataLoading && !invoices.length) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex justify-between items-center mb-4">
        <div ref={tabsRef} className="nav-tabs flex gap-1 w-fit relative">
          <button
            onClick={() => { setActiveTab('all_invoices'); scrollToTabs(); }}
            className={cn(
              "nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
              activeTab === 'all_invoices' ? "nav-tab--active" : ""
            )}
          >
            All Invoices
            {activeTab === 'all_invoices' && (
              <motion.div layoutId="invoices-tab-glass" className="nav-tab__glass" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('invoice_builder'); scrollToTabs(); }}
            className={cn(
              "nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
              activeTab === 'invoice_builder' ? "nav-tab--active" : ""
            )}
          >
            Invoice Builder
            {activeTab === 'invoice_builder' && (
              <motion.div layoutId="invoices-tab-glass" className="nav-tab__glass" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
            )}
          </button>
        </div>
        <button onClick={() => { setSelectedInvoice(null); setActiveTab('invoice_builder'); }} className={cn("action-btn !px-3 !py-2 text-xs md:text-sm whitespace-nowrap", activeTab !== 'all_invoices' && "invisible")}>
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> New Invoice
        </button>
      </div>
      <TabsContent value="all_invoices">
        <div className="w-full">
          <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete {selectedInvoices.size} invoice(s) and their payments.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
            <div className="relative flex-grow w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input type="text" placeholder="Search by client name or invoice #" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-9" />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full md:w-auto flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" className="w-full md:w-auto flex items-center justify-center gap-2"><ArrowUpDown className="w-4 h-4" /><span>Sort by</span></Button></DropdownMenuTrigger>
                <DropdownMenuContent className="glass-elevated">{sortOptions.map(option => (<DropdownMenuItem key={option.label} onSelect={() => setSort(option.value)}>{option.label}</DropdownMenuItem>))}</DropdownMenuContent>
              </DropdownMenu>
              {isSelectionMode ? (
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="destructive" size="sm" onClick={() => setIsConfirmDeleteDialogOpen(true)} disabled={selectedInvoices.size === 0}><Trash2 className="w-4 h-4 mr-2" /> ({selectedInvoices.size})</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedInvoices(new Set()); }}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsSelectionMode(true)} className="flex-shrink-0 icon-button"><CheckSquare className="w-4 h-4" /></Button>
              )}
            </div>
          </div>
          {loading ? <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
            <>
              <div className="space-y-3">
                {invoices.map((invoice) => (<InvoiceRow key={invoice.id} invoice={invoice} onSelect={handleSelectInvoice} onDelete={handleDelete} isSelected={selectedInvoices.has(invoice.id)} onSelectionChange={handleSelectionChange} isSelectionMode={isSelectionMode} products={appData.products} taxRate={parseFloat(appData.settings?.tax_rate) || 0} />))}
              </div>
              {hasMore && (<div className="mt-6 flex justify-center"><Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Load More'}</Button></div>)}
            </>
          )}
        </div>
      </TabsContent>
      <TabsContent value="invoice_builder">
        <InvoiceEditor
          invoice={selectedInvoice}
          onBack={handleBackToList}
          onUpdate={handleUpdateInvoice}
          appData={appData}
          onSendEmail={handleSendEmail}
          onPrint={handlePrint}
          clientToPreload={clientToPreload}
          projectToPreload={projectToPreload}
          onSwitchToBuilder={(newInvoice) => { setSelectedInvoice(newInvoice); setActiveTab('invoice_builder'); }}
          onNewInvoiceRequest={handleNewInvoiceRequest}
        />
      </TabsContent>

      {emailModalOpen && (
        <React.Suspense fallback={null}>
          <SendEmailModal
            open={emailModalOpen}
            onOpenChange={setEmailModalOpen}
            type="invoice"
            document={emailTarget?.document}
            client={emailTarget?.client}
            settings={appData.settings}
          />
        </React.Suspense>
      )}
    </Tabs>
  );
};

export default InvoicesManager;
