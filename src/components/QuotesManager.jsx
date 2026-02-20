import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useTabScroll } from '@/hooks/useTabScroll';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateQuote, useUpdateQuote, useDeleteQuote, useBulkDeleteQuotes, useCreateInvoice, useCreateClient, useUpdateClient } from '@/hooks/useMutations';
import { useClientsCatalog, useProductsCatalog, useSettings } from '@/hooks/useAppData';
import { useProjectTypes } from '@/lib/projectTypes';
import { useAuth } from '@/contexts/AuthContext';
import { Trash2, DollarSign, Loader2, Search, ChevronLeft, ChevronRight, Plus, X, Save, Zap, Percent, Tag, ChevronsUpDown, Check, FileText, Edit, CheckSquare, Mail, Printer, ArrowUpDown, ChevronDown, ExternalLink, Clock, PenLine, GripVertical, MapPin, Car, Calendar, FolderKanban } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { resolveEffectiveTaxRate } from '@/lib/taxRateResolver';
import { useDebounce } from '@/hooks/useDebounce';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn, groupByCategory, fmtDate, tzDate } from "@/lib/utils";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
const SendEmailModal = React.lazy(() => import('@/components/SendEmailModal'));

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

const autoResize = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
};

const QuoteItemRow = ({ item, children }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      layout="position"
      className="flat-card p-3 space-y-2"
    >
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

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QuoteEditor = ({ quote: initialQuote, onBack, onUpdate, appData, onSendEmail, onPrint, onCreateInvoice, clientToPreload, projectToPreload, onSwitchToBuilder, onNewQuoteRequest, navigate }) => {
  const { user } = useAuth();
  const { clients, products } = appData;
  const { types: projectTypes, getTypeById } = useProjectTypes();
  const [quote, setQuote] = useState(initialQuote || { id: null, items: [], clientId: clientToPreload?.id || projectToPreload?.clientId || null, projectId: projectToPreload?.id || null });
  const [isEditing, setIsEditing] = useState(!initialQuote?.id);
  const [items, setItems] = useState([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Auto-hydrate blank descriptions from product catalog (safe, non-destructive)
  useEffect(() => {
    if (!products?.length || !items?.length) return;
    let changed = false;
    const updated = items.map((it) => {
      if (it.type === 'product' && (it.productId || it.product_id) && (!it.description || String(it.description).trim().length === 0)) {
        const pid = it.productId || it.product_id;
        const prod = products.find(p => String(p.id) === String(pid));
        if (prod?.description) { changed = true; return { ...it, description: prod.description }; }
      }
      return it;
    });
    if (changed) setItems(updated);
  }, [items, products]);

  const [selectedClient, setSelectedClient] = useState(null);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [eventLocation, setEventLocation] = useState('');
  const [projectTypeId, setProjectTypeId] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const { data: projectsData } = useQuery({
    queryKey: ['projects-catalog'],
    queryFn: () => api.get('/projects?pageSize=200&orderBy=createdAt&asc=false'),
    staleTime: 60_000,
  });
  const [terms, setTerms] = useState('');
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
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isEditingClientMode, setIsEditingClientMode] = useState(false);
  const [newClientData, setNewClientData] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', address: '' });
  const updateQuoteMutation = useUpdateQuote();
  const createQuoteMutation = useCreateQuote();
  const deleteQuoteMutation = useDeleteQuote();
  const createClientMutation = useCreateClient();
  const updateClientMutation = useUpdateClient();
  const isSubmittingClient = createClientMutation.isPending || updateClientMutation.isPending;

  const applyQuote = (q) => {
    setQuote(q);
    setItems((q.items || []).map(item => ({ ...item, id: Math.random(), productId: item.productId || item.product_id || '', isTaxable: (item.isTaxable ?? item.is_taxable) !== false, productType: item.productType || item.product_type, qty: item.qty || 1 })));
    setSelectedClient(q.clientId || null);
    setDiscountType(q.discountType || 'percent');
    setDiscountValue(q.discountValue || 0);
    setNotes(q.notes || '');
    setEventDate(q.eventDate ? new Date(q.eventDate).toISOString().split('T')[0] : '');
    setEventEndDate(q.eventEndDate ? new Date(q.eventEndDate).toISOString().split('T')[0] : '');
    setIsMultiDay(!!q.eventEndDate);
    setEventLocation(q.eventLocation || '');
    setProjectTypeId(q.projectTypeId || '');
    setSelectedProject(q.projectId || '');
    setTerms(q.terms || '');
    setIsEditing(!q.id);
  };

  useEffect(() => {
    const fallback = { id: null, items: [], clientId: clientToPreload?.id || projectToPreload?.clientId || null, projectId: projectToPreload?.id || null };
    if (initialQuote?.id && !initialQuote.items) {
      // Partial object (e.g. from dashboard) — fetch full quote
      api.get('/quotes/' + initialQuote.id).then(res => applyQuote(res.data || res)).catch(() => applyQuote(fallback));
    } else {
      applyQuote(initialQuote || fallback);
    }
  }, [initialQuote, clientToPreload, projectToPreload]);

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
  const addDiscountItem = useCallback(() => setItems(prev => [...prev, { id: Math.random(), type: 'discount', name: '', price: '', description: '', isTaxable: false, qty: 1 }]), []);
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
    const currentTaxRate = forDisplay ? quote.taxRate : taxRate;
    const qty = parseInt(item.qty, 10) || 1;

    if (item.type === 'discount') {
        unitPrice = Math.abs(parseFloat(item.price || 0));
        const basePrice = -unitPrice;
        return { unitPrice, basePrice, taxOnItem: 0, total: basePrice };
    }

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
    let itemsSubtotal = 0;
    let lineDiscountsTotal = 0;
    let totalTax = 0;
    items.forEach(item => {
      const { basePrice, taxOnItem } = calculateItemPrice(item);
      if (item.type === 'discount') {
        lineDiscountsTotal += Math.abs(basePrice);
      } else {
        itemsSubtotal += basePrice;
        totalTax += taxOnItem;
      }
    });
    const subtotal = itemsSubtotal - lineDiscountsTotal;
    const discountAmount = discountType === 'percent' ? subtotal * (parseFloat(discountValue) / 100 || 0) : parseFloat(discountValue) || 0;
    const subtotalAfterDiscount = subtotal - discountAmount;
    const taxAfterDiscount = totalTax > 0 ? (itemsSubtotal > 0 ? totalTax * (subtotalAfterDiscount / itemsSubtotal) : 0) : 0;
    const total = subtotalAfterDiscount + taxAfterDiscount;
    return { itemsSubtotal, lineDiscountsTotal, subtotal, tax: taxAfterDiscount, total, discountAmount };
  }, [items, products, taxRate, discountType, discountValue, calculateItemPrice]);

  const handleSaveQuote = async () => {
    const client = clients.find(c => c.id === selectedClient);
    const clientName = client ? (client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')) : '';
    const { subtotal, tax, total, discountAmount } = calculateTotal;
    const processedItems = items.map(item => {
      const { unitPrice, basePrice } = calculateItemPrice(item);
      const qty = parseInt(item.qty, 10) || 1;
      if (item.type === 'discount' && item.name && unitPrice > 0) {
        return { type: 'discount', name: item.name, price: unitPrice, description: item.description, total: basePrice, isTaxable: false, qty: 1 };
      } else if (item.type === 'product' && item.productId && basePrice > 0) {
        const product = products.find(p => p.id === item.productId);
        if (!product) return null;
        return { type: 'product', name: product.name, productId: product.id, description: item.description, total: basePrice, isTaxable: item.isTaxable, productType: product.productType, price: unitPrice, qty };
      } else if (item.type === 'custom' && item.name && basePrice > 0) {
        return { type: 'custom', name: item.name, price: unitPrice, description: item.description, total: basePrice, isTaxable: item.isTaxable, qty };
      }
      return null;
    }).filter(Boolean);

    if (processedItems.length === 0) {
      toast({ title: "No items in quote", description: "Please add at least one item.", variant: "destructive" });
      return null;
    }

    const quoteData = { clientId: selectedClient || null, clientName, projectId: selectedProject || null, items: processedItems, subtotal, tax, taxRate, total, discountType, discountValue: parseFloat(discountValue) || 0, discountAmount, notes, eventDate: eventDate || null, eventEndDate: (isMultiDay && eventEndDate) ? eventEndDate : null, eventLocation: eventLocation || null, projectTypeId: projectTypeId || null, eventType: getTypeById(projectTypeId)?.label || null, terms: terms || null };

    if (quote.id) {
      try {
        const updatedQuote = await updateQuoteMutation.mutateAsync({ id: quote.id, ...quoteData });
        onUpdate(updatedQuote);
        setQuote(updatedQuote);
        setIsEditing(false);
        return updatedQuote;
      } catch {
        return null;
      }
    } else {
      try {
        const newQuote = await createQuoteMutation.mutateAsync(quoteData);
        onUpdate(newQuote, true);
        onSwitchToBuilder(newQuote);
        return newQuote;
      } catch {
        return null;
      }
    }
  };

  const handleNewQuoteClick = async () => {
    if (items.length > 0 || notes) {
      await handleSaveQuote();
    }
    onNewQuoteRequest();
  };

  const handleDeleteQuote = async () => {
    if (!quote.id) return;
    try {
      await deleteQuoteMutation.mutateAsync(quote.id);
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

  const { itemsSubtotal, lineDiscountsTotal, subtotal, tax, total, discountAmount } = calculateTotal;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this quote. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteQuote}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4">
            <div>
              <h3 className="text-2xl font-bold flex items-center gap-2">
                {quote.id ? `Quote #${String(quote.quoteNumber).padStart(5, '0')}` : 'New Quote'}
                {quote.approvedAt && <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/15 text-green-400">Approved</span>}
              </h3>
              {quote.id && (
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 mt-1.5">
                  <UserInfo label="Created" email={quote.createdBy} timestamp={quote.createdAt} icon={Clock} />
                  {quote.lastEditedBy && <UserInfo label="Edited" email={quote.lastEditedBy} timestamp={quote.updatedAt} icon={PenLine} />}
                </div>
              )}
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              {quote.id && !isEditing && <button onClick={() => setIsEditing(true)} className="action-btn action-btn--secondary flex-1 md:flex-none"><Edit className="w-4 h-4 mr-1" /> Edit</button>}
              {quote.id && !isEditing && <button onClick={() => setIsDeleteDialogOpen(true)} className="action-btn action-btn--danger flex-1 md:flex-none"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        </div>
        <div className="flex flex-row lg:flex-col gap-2">
          <button onClick={handleNewQuoteClick} className="action-btn flex-1 h-10"><Plus className="w-4 h-4 mr-1" /> New Quote</button>
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
                  {!isEditing && selectedClient && navigate && (
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
            const hasEventInfo = eventDate || eventLocation || projectTypeId;
            return (
              <>
                {(isEditing || hasEventInfo) && (
                  <div className="glass-card p-4">
                    <h4 className="text-lg font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Event Details</h4>
                    {isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                          <Label className="text-xs text-surface-600 mb-1 block">Event Type</Label>
                          <select value={projectTypeId} onChange={(e) => setProjectTypeId(e.target.value)} className="glass-input w-full">
                            <option value="">Select type...</option>
                            {projectTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-surface-600 mb-1 block">Location</Label>
                          <input type="text" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} className="glass-input w-full" placeholder="e.g., Central Park, NYC" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-surface-600">Event Date</Label>
                            <label className="flex items-center gap-1.5 cursor-pointer select-none">
                              <input type="checkbox" checked={isMultiDay} onChange={e => { setIsMultiDay(e.target.checked); if (!e.target.checked) setEventEndDate(''); }} className="rounded border-surface-300 w-3.5 h-3.5" />
                              <span className="text-xs text-surface-500">Multi-day</span>
                            </label>
                          </div>
                          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="glass-input w-full" />
                        </div>
                        {isMultiDay ? (
                          <div>
                            <Label className="text-xs text-surface-600 mb-1 block">End Date</Label>
                            <input type="date" value={eventEndDate} min={eventDate || undefined} onChange={(e) => setEventEndDate(e.target.value)} className="glass-input w-full" />
                          </div>
                        ) : (
                          <div>
                            <Label className="text-xs text-surface-600 mb-1 block">Project</Label>
                            <select
                              value={selectedProject}
                              onChange={(e) => {
                                const pid = e.target.value;
                                setSelectedProject(pid);
                                if (pid) {
                                  const proj = (projectsData?.data || []).find(p => p.id === pid);
                                  if (proj) {
                                    if (proj.shootStartDate && !eventDate) setEventDate(new Date(proj.shootStartDate).toISOString().split('T')[0]);
                                    if (proj.shootEndDate) {
                                      setEventEndDate(new Date(proj.shootEndDate).toISOString().split('T')[0]);
                                      setIsMultiDay(true);
                                    }
                                    if (proj.location && !eventLocation) setEventLocation(proj.location);
                                  }
                                }
                              }}
                              className="glass-input w-full"
                            >
                              <option value="">None (auto-create on approval)</option>
                              {(projectsData?.data || []).map(p => (
                                <option key={p.id} value={p.id}>{p.title}{p.client ? ` — ${p.client.displayName || p.client.firstName || ''}` : ''}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {isMultiDay && (
                          <div className="sm:col-span-2">
                            <Label className="text-xs text-surface-600 mb-1 block">Project</Label>
                            <select
                              value={selectedProject}
                              onChange={(e) => {
                                const pid = e.target.value;
                                setSelectedProject(pid);
                                if (pid) {
                                  const proj = (projectsData?.data || []).find(p => p.id === pid);
                                  if (proj) {
                                    if (proj.shootStartDate && !eventDate) setEventDate(new Date(proj.shootStartDate).toISOString().split('T')[0]);
                                    if (proj.shootEndDate) {
                                      setEventEndDate(new Date(proj.shootEndDate).toISOString().split('T')[0]);
                                      setIsMultiDay(true);
                                    }
                                    if (proj.location && !eventLocation) setEventLocation(proj.location);
                                  }
                                }
                              }}
                              className="glass-input w-full"
                            >
                              <option value="">None (auto-create on approval)</option>
                              {(projectsData?.data || []).map(p => (
                                <option key={p.id} value={p.id}>{p.title}{p.client ? ` — ${p.client.displayName || p.client.firstName || ''}` : ''}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                        <div>
                          <Label className="text-xs text-surface-600">Type</Label>
                          <p className="text-sm mt-0.5">{getTypeById(projectTypeId)?.label || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-surface-600">Date</Label>
                          <p className="text-sm mt-0.5">{(() => {
                            if (!eventDate) return '—';
                            const s = new Date(eventDate + 'T00:00:00');
                            if (eventEndDate) {
                              const e = new Date(eventEndDate + 'T00:00:00');
                              const days = Math.round((e - s) / 86400000) + 1;
                              const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
                              const range = sameMonth
                                ? `${fmtDate(eventDate, { month: 'short' })} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
                                : `${fmtDate(eventDate, { month: 'short', day: 'numeric' })} – ${fmtDate(eventEndDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
                              return `${range} (${days}d)`;
                            }
                            return fmtDate(eventDate, { month: 'short', day: 'numeric', year: 'numeric' });
                          })()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-surface-600">Location</Label>
                          <p className="text-sm mt-0.5 flex items-center gap-1">{eventLocation ? <><MapPin className="w-3 h-3 text-surface-400 shrink-0" />{eventLocation}</> : '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-surface-600">Project</Label>
                          <p className="text-sm mt-0.5 flex items-center gap-1">
                            {selectedProject
                              ? <><FolderKanban className="w-3 h-3 text-surface-400 shrink-0" /><span className="truncate">{(projectsData?.data || []).find(p => p.id === selectedProject)?.title || 'Linked'}</span></>
                              : '—'}
                          </p>
                        </div>
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
                        <span>${fmt(travelRate)}/mile</span>
                      </div>
                      {parseFloat(travelMiles) > 0 && (
                        <div className="text-center py-2">
                          <p className="text-2xl font-bold text-primary">${fmt(parseFloat(travelMiles) * travelRate)}</p>
                          <p className="text-xs text-surface-400">{travelMiles} miles &times; ${fmt(travelRate)}</p>
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
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-lg font-semibold shrink-0">Items</h4>
              {isEditing && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button onClick={addProductItem} className="action-btn action-btn--secondary text-xs px-2 py-1.5"><Plus className="w-3 h-3 inline mr-0.5" />Product</button>
                  <button onClick={addCustomItem} className="action-btn action-btn--secondary text-xs px-2 py-1.5"><Plus className="w-3 h-3 inline mr-0.5" />Custom</button>
                  <button onClick={addDiscountItem} className="action-btn action-btn--secondary text-xs px-2 py-1.5"><Tag className="w-3 h-3 inline mr-0.5" />Discount</button>
                  <button onClick={() => setIsTravelDialogOpen(true)} className="action-btn action-btn--secondary text-xs px-2 py-1.5"><Car className="w-3 h-3 inline mr-0.5" />Travel</button>
                </div>
              )}
            </div>
            {isEditing ? (
              <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3">
                <AnimatePresence initial={false}>
                {items.map(item => {
                  const { unitPrice, basePrice, taxOnItem, total: itemTotal } = calculateItemPrice(item);
                  const qty = parseInt(item.qty, 10) || 1;
                  return (
                  <QuoteItemRow key={item.id} item={item}>
                    {item.type === 'discount' ? (
                      <>
                        {/* Row 1: Tag icon + name + amount + delete */}
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <input type="text" placeholder="Discount name" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} className="glass-input flex-1 min-w-0" />
                          <div className="flex items-center gap-1 shrink-0 w-28">
                            <span className="text-sm font-medium text-emerald-500">-$</span>
                            <input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} className="glass-input w-full" />
                          </div>
                          <button onClick={() => removeItem(item.id)} className="icon-button shrink-0"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                        {/* Row 2: Note */}
                        <textarea placeholder="Note (optional)" value={item.description} onChange={(e) => { updateItem(item.id, 'description', e.target.value); autoResize(e.target); }} ref={(el) => { if (el && item.description) autoResize(el); }} className="glass-input w-full resize-y leading-relaxed" rows={2} style={{ minHeight: '2.5rem' }} />
                        {/* Row 3: Total */}
                        <div className="flex items-center justify-end">
                          {unitPrice > 0 && <span className="text-sm font-bold text-emerald-500">- ${fmt(unitPrice)}</span>}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Row 1: Product selector or name + price + qty + delete */}
                        <div className="flex items-center gap-2">
                          {item.type === 'product' ? (
                            <div className="flex-1 min-w-0">
                              <ProductCombobox products={products} value={item.productId} onChange={(val) => {
                                updateItem(item.id, 'productId', val);
                                const prod = products.find(p => String(p.id) === String(val));
                                if (prod) {
                                  updateItem(item.id, 'description', prod.description || '');
                                }
                              }} />
                            </div>
                          ) : (
                            <>
                              <input type="text" placeholder="Item name" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} className="glass-input flex-1 min-w-0" />
                              <input type="number" inputMode="decimal" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} className="glass-input w-28 shrink-0" />
                            </>
                          )}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Label htmlFor={`qty-${item.id}`} className="text-xs text-surface-500">Qty</Label>
                            <input id={`qty-${item.id}`} type="number" inputMode="numeric" value={item.qty} onFocus={handleInputFocus} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} className="glass-input w-14 text-center" />
                          </div>
                          <button onClick={() => removeItem(item.id)} className="icon-button shrink-0"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                        {/* Row 2: Description — full width, auto-expanding textarea */}
                        <textarea placeholder="Description" value={item.description} onChange={(e) => { updateItem(item.id, 'description', e.target.value); autoResize(e.target); }} ref={(el) => { if (el && item.description) autoResize(el); }} className="glass-input w-full resize-y leading-relaxed" rows={3} style={{ minHeight: '4.5rem' }} />
                        {/* Row 3: Taxable + totals */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={`taxable-${item.id}`} checked={item.isTaxable} onCheckedChange={(c) => updateItem(item.id, 'isTaxable', c)} />
                            <Label htmlFor={`taxable-${item.id}`} className="text-xs text-surface-500">Taxable</Label>
                          </div>
                          <div className="flex items-center gap-2 text-sm font-medium tabular-nums">
                            {qty > 1 && unitPrice > 0 && (
                              <span className="text-xs text-surface-400">${fmt(unitPrice)} &times; {qty} =</span>
                            )}
                            <span>${fmt(basePrice)}</span>
                            {taxOnItem > 0 && <span className="text-emerald-500 text-xs">+ ${fmt(taxOnItem)} tax</span>}
                            <span className="font-bold text-blue-400">${fmt(itemTotal)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </QuoteItemRow>
                )})}
                </AnimatePresence>
              </Reorder.Group>
            ) : (
                <div className="space-y-3">
                {(quote.items || []).map((item, idx) => {
                  const { unitPrice, taxOnItem, total: itemTotal } = calculateItemPrice(item, true);
                  const qty = parseInt(item.qty, 10) || 1;
                  const isDiscount = item.type === 'discount';
                  return (
                    <div key={idx} className="flat-card p-4 space-y-2">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {isDiscount && <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <p className="font-medium">{item.name}</p>
                            {item.description && <p className="text-sm text-surface-400 pt-1 whitespace-pre-wrap">{item.description}</p>}
                          </div>
                        </div>
                        <p className={cn("font-bold text-lg shrink-0 tabular-nums", isDiscount ? "text-emerald-500" : "text-blue-400")}>
                          {isDiscount ? `- $${fmt(unitPrice)}` : `$${fmt(itemTotal)}`}
                        </p>
                      </div>
                      {!isDiscount && (
                        <div className="text-right text-xs text-surface-500 flex justify-end items-center gap-2 tabular-nums">
                          <span>{qty} &times; ${fmt(unitPrice)}</span>
                          {taxOnItem > 0 && <span> + ${fmt(taxOnItem)} tax</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {isEditing && (
            <div className="glass-card p-4">
              <h4 className="text-lg font-semibold mb-3">Notes</h4>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any internal notes for this quote..." className="glass-textarea w-full" rows={3}></textarea>
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
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="glass-card p-4">
              <h4 className="text-base font-semibold mb-3">Pricing</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-surface-400">Subtotal:</span><span>${fmt(itemsSubtotal)}</span></div>
                {lineDiscountsTotal > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-emerald-500">Line Discounts:</span><span className="text-emerald-500">- ${fmt(lineDiscountsTotal)}</span></div>
                )}

                <div>
                  <div className="flex justify-between text-sm items-center">
                    <button onClick={() => isEditing && setIsDiscountOpen(!isDiscountOpen)} className="flex items-center gap-1 text-surface-400 hover:text-surface-700 disabled:cursor-not-allowed" disabled={!isEditing}>
                      <Zap className="w-3.5 h-3.5" /> Discount <ChevronDown className={cn("w-4 h-4 transition-transform", isDiscountOpen && "rotate-180")} />
                    </button>
                    {discountAmount > 0 && <span className="text-green-400">- ${fmt(discountAmount)}</span>}
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

                <div className="flex justify-between text-sm"><span className="text-surface-400">Tax ({taxRate}%{taxRateSource !== 'default' && isEditing ? ` · ${taxRateSource}` : ''}):</span><span>${fmt(tax)}</span></div>
                <div className="divider my-2"></div>
                <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-blue-400">${fmt(total)}</span></div>
              </div>
            </div>
            {isEditing && (
              <button onClick={handleSaveQuote} className="action-btn w-full">
                <Save className="w-4 h-4 mr-2" /> {quote.id ? 'Update Quote' : 'Save Quote'}
              </button>
            )}
            {quote.id && !isEditing && (
              <div className="space-y-2">
                <button onClick={() => onCreateInvoice(quote)} className="action-btn w-full"><FileText className="w-4 h-4 mr-2" /> Create Invoice</button>
                <button onClick={() => onPrint(quote)} className="action-btn action-btn--secondary w-full"><Printer className="w-4 h-4 mr-2" /> Print Quote</button>
                <button onClick={() => onSendEmail(quote)} className="action-btn action-btn--secondary w-full"><Mail className="w-4 h-4 mr-2" /> Email Quote</button>
              </div>
            )}
            {quote.id && !isEditing && quote.notes && (
              <div className="glass-card p-4">
                <h4 className="text-base font-semibold mb-2">Notes</h4>
                <p className="text-sm text-surface-500 whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.id && !isEditing && terms && (
              <div className="glass-card p-4">
                <h4 className="text-base font-semibold mb-2">Terms</h4>
                <p className="text-xs text-surface-400 whitespace-pre-wrap">{terms}</p>
              </div>
            )}
          </div>
        </div>
      </div>
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
    return `${fmt(product.retailPrice)}`;
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

const QuoteRow = React.memo(({ quote, onSelect, onDelete, onSelectionChange, isSelected, isSelectionMode, products, taxRate, navigate }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const recalculatedTotal = useMemo(() => {
    if (!quote.items || !products) return quote.total;

    let subtotal = 0;
    (quote.items || []).forEach(item => {
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

    const discountAmount = quote.discountType === 'percent' ? subtotal * (parseFloat(quote.discountValue) / 100 || 0) : parseFloat(quote.discountValue) || 0;
    const subtotalAfterDiscount = subtotal - discountAmount;

    let totalTax = 0;
    (quote.items || []).forEach(item => {
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
  }, [quote, products, taxRate]);

  return (
    <>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this quote. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(quote.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="list-card border-l-blue-500/30 hover:border-l-blue-500 p-3 px-4 group" onClick={() => onSelect(quote)}>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isSelectionMode && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectionChange(quote.id, checked)} />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex-grow min-w-0">
            {/* Top line: doc number, date, amount */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-bold tabular-nums shrink-0">#{String(quote.quoteNumber).padStart(5, '0')}</span>
                {quote.approvedAt && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 shrink-0">Approved</span>}
                <span className="text-xs text-surface-400">{fmtDate(quote.createdAt, { month: 'short', day: 'numeric' })}</span>
              </div>
              <span className="font-bold text-lg tabular-nums text-blue-400 shrink-0">${fmt(recalculatedTotal)}</span>
            </div>
            {/* Bottom line: client name, actions */}
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2 min-w-0">
                {quote.clientId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate('/clients/' + quote.clientId); }}
                    className="text-surface-600 text-sm truncate hover:text-blue-500 transition-colors text-left flex items-center gap-1.5 group/client"
                  >
                    <span className="truncate">{quote.clientName || 'No Client'}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/client:opacity-100 transition-opacity shrink-0" />
                  </button>
                ) : (
                  <p className="text-surface-400 text-sm truncate">{quote.clientName || 'No Client'}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setIsDeleteDialogOpen(true)} className="icon-button !p-1.5" title="Delete Quote"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-surface-500 opacity-0 group-hover:opacity-50 group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </motion.div>
    </>
  );
});

const QuotesManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeQuoteId } = useParams();

  // Read navigation state (set once, then clear)
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

  const quoteToLoad = routeQuoteId ? { id: routeQuoteId } : (navStateRef.current.quoteToLoad || (navStateRef.current.editQuoteId ? { id: navStateRef.current.editQuoteId } : null));
  const clientToPreload = navStateRef.current.clientToPreload || null;
  const projectToPreload = navStateRef.current.projectToPreload || null;

  const { data: clients = [] } = useClientsCatalog();
  const { data: products = [] } = useProductsCatalog();
  const { data: settings = {} } = useSettings();
  const appData = { clients, products, settings };

  const [activeTab, setActiveTab] = useState(quoteToLoad || clientToPreload || projectToPreload ? 'quote_builder' : 'all_quotes');
  const { tabsRef, scrollToTabs } = useTabScroll();
  const [selectedQuote, setSelectedQuote] = useState(quoteToLoad);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const bulkDeleteQuotesMutation = useBulkDeleteQuotes();
  const deleteQuoteMut = useDeleteQuote();
  const createInvoiceMutation = useCreateInvoice();
  const [selectedQuotes, setSelectedQuotes] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
  const [sort, setSort] = useState({ by: 'createdAt', ascending: false });

  const sortOptions = [
    { label: 'Newest First', value: { by: 'createdAt', ascending: false } },
    { label: 'Oldest First', value: { by: 'createdAt', ascending: true } },
    { label: 'Quote # (Desc)', value: { by: 'quoteNumber', ascending: false } },
    { label: 'Quote # (Asc)', value: { by: 'quoteNumber', ascending: true } },
    { label: 'Total (High-Low)', value: { by: 'total', ascending: false } },
    { label: 'Total (Low-High)', value: { by: 'total', ascending: true } },
    { label: 'Approved First', value: { by: 'approvedAt', ascending: false } },
  ];

  // Handle route-based deep linking when component is already mounted
  useEffect(() => {
    if (routeQuoteId) {
      setSelectedQuote({ id: routeQuoteId });
      setActiveTab('quote_builder');
    }
  }, [routeQuoteId]);

  const handleSelectionChange = useCallback((quoteId, isSelected) => {
    setSelectedQuotes(prev => {
      const newSet = new Set(prev);
      if (isSelected) newSet.add(quoteId);
      else newSet.delete(quoteId);
      return newSet;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedQuotes.size === 0) return;
    try {
      await bulkDeleteQuotesMutation.mutateAsync(Array.from(selectedQuotes));
      setSelectedQuotes(new Set());
      setIsSelectionMode(false);
    } catch {}
    setIsConfirmDeleteDialogOpen(false);
  };

  const {
    data: quotesData,
    isLoading: loading,
    isFetchingNextPage,
    hasNextPage: hasMore,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.quotes.list({ search: debouncedSearchTerm, sort }),
    queryFn: async ({ pageParam = 0 }) => {
      return api.get('/quotes', {
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

  const quotes = useMemo(() => quotesData?.pages.flatMap(p => p.data || []) ?? [], [quotesData]);

  const handleUpdateQuote = useCallback(() => {}, []);

  const handleDelete = useCallback((id) => {
    deleteQuoteMut.mutate(id);
  }, [deleteQuoteMut]);

  const handleSendEmail = useCallback(async (quote) => {
    try {
      const result = await api.get('/quotes/' + quote.id);
      const fullQuote = result.data;
      const client = fullQuote.client;
      if (!client?.email) {
        toast({ title: "Client has no email", description: "Please add an email address to the client's profile.", variant: "destructive" });
        return;
      }
      setEmailTarget({ document: fullQuote, client });
      setEmailModalOpen(true);
    } catch (error) {
      toast({ title: "Failed to load quote", description: error.message, variant: "destructive" });
    }
  }, []);

  const handlePrint = useCallback(async (quote) => {
    if (!quote) return;
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups for this site to print.", variant: "destructive" });
      return;
    }
    newWindow.document.write('<html><body style="background-color: #1a1a1a; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;"><h1>Generating PDF...</h1></body></html>');
    try {
      const data = await api.post('/pdf/generate', { type: 'quote', documentId: quote.id });
      const blob = new Blob([Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      newWindow.location.href = url;
    } catch (e) {
      newWindow.document.write(`<html><body style="background-color: #1a1a1a; color: #ff4d4d; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;"><h1>Failed to generate PDF: ${e.message}</h1></body></html>`);
      toast({ title: "Failed to generate PDF", description: e.message, variant: "destructive" });
    }
  }, []);

  const handleCreateInvoice = useCallback(async (quote) => {
    toast({ title: "Creating invoice from quote..." });
    try {
      const createdInvoice = await createInvoiceMutation.mutateAsync({
        quoteId: quote.id,
        clientId: quote.clientId,
        clientName: quote.clientName,
        projectId: quote.projectId || null,
        items: quote.items,
        subtotal: quote.subtotal || 0,
        tax: quote.tax || 0,
        total: quote.total || 0,
        status: 'pending',
        paidAmount: 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        discountType: quote.discountType,
        discountValue: quote.discountValue,
        discountAmount: quote.discountAmount,
        notes: quote.notes,
        eventDate: quote.eventDate,
        eventEndDate: quote.eventEndDate || null,
        eventLocation: quote.eventLocation,
        projectTypeId: quote.projectTypeId || null,
        eventType: quote.eventType,
        terms: quote.terms,
      });
      navigate('/invoices', { state: { invoiceToLoad: createdInvoice } });
    } catch {}
  }, [createInvoiceMutation, navigate]);

  const handleSelectQuote = (quote) => {
    setSelectedQuote(quote);
    setActiveTab('quote_builder');
  };

  const handleBackToList = () => {
    setSelectedQuote(null);
    setActiveTab('all_quotes');
    navigate('/quotes');
  };

  const handleNewQuoteRequest = () => {
    setSelectedQuote(null);
    setActiveTab('quote_builder');
  };

  if (loading && !quotes.length) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex justify-between items-center mb-4">
        <div ref={tabsRef} className="nav-tabs flex gap-1 w-fit relative">
          <button
            onClick={() => { setActiveTab('all_quotes'); scrollToTabs(); }}
            className={cn(
              "nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
              activeTab === 'all_quotes' ? "nav-tab--active" : ""
            )}
          >
            All Quotes
            {activeTab === 'all_quotes' && (
              <motion.div layoutId="quotes-tab-glass" className="nav-tab__glass" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
            )}
          </button>
          <button
            onClick={() => { setActiveTab('quote_builder'); scrollToTabs(); }}
            className={cn(
              "nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
              activeTab === 'quote_builder' ? "nav-tab--active" : ""
            )}
          >
            Quote Builder
            {activeTab === 'quote_builder' && (
              <motion.div layoutId="quotes-tab-glass" className="nav-tab__glass" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
            )}
          </button>
        </div>
        <button onClick={() => { setSelectedQuote(null); setActiveTab('quote_builder'); }} className={cn("action-btn !px-3 !py-2 text-xs md:text-sm whitespace-nowrap", activeTab !== 'all_quotes' && "invisible")}>
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> New Quote
        </button>
      </div>
      <TabsContent value="all_quotes">
        <div className="w-full">
          <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete {selectedQuotes.size} quote(s).</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex flex-col md:flex-row gap-4 mb-4 items-center">
            <div className="relative flex-grow w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input type="text" placeholder="Search by client name or quote #" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-9" />
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
                  <Button variant="destructive" size="sm" onClick={() => setIsConfirmDeleteDialogOpen(true)} disabled={selectedQuotes.size === 0}><Trash2 className="w-4 h-4 mr-2" /> ({selectedQuotes.size})</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedQuotes(new Set()); }}><X className="w-4 h-4" /></Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setIsSelectionMode(true)} className="flex-shrink-0 icon-button"><CheckSquare className="w-4 h-4" /></Button>
              )}
            </div>
          </div>
          {loading ? <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
            <>
              <div className="space-y-3">
                {quotes.map((quote) => (<QuoteRow key={quote.id} quote={quote} onSelect={handleSelectQuote} onDelete={handleDelete} isSelected={selectedQuotes.has(quote.id)} onSelectionChange={handleSelectionChange} isSelectionMode={isSelectionMode} products={appData.products} taxRate={parseFloat(appData.settings?.tax_rate) || 0} navigate={navigate} />))}
              </div>
              {hasMore && (<div className="mt-6 flex justify-center"><Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Load More'}</Button></div>)}
            </>
          )}
        </div>
      </TabsContent>
      <TabsContent value="quote_builder">
        <QuoteEditor
          quote={selectedQuote}
          onBack={handleBackToList}
          onUpdate={handleUpdateQuote}
          appData={appData}
          onSendEmail={handleSendEmail}
          onPrint={handlePrint}
          onCreateInvoice={handleCreateInvoice}
          clientToPreload={clientToPreload}
          projectToPreload={projectToPreload}
          onSwitchToBuilder={(newQuote) => { setSelectedQuote(newQuote); setActiveTab('quote_builder'); }}
          onNewQuoteRequest={handleNewQuoteRequest}
          navigate={navigate}
        />
      </TabsContent>

      {emailModalOpen && (
        <React.Suspense fallback={null}>
          <SendEmailModal
            open={emailModalOpen}
            onOpenChange={setEmailModalOpen}
            type="quote"
            document={emailTarget?.document}
            client={emailTarget?.client}
            settings={appData.settings}
          />
        </React.Suspense>
      )}
    </Tabs>
  );
};

export default QuotesManager;
