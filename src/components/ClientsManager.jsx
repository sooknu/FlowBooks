import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateClient, useUpdateClient, useDeleteClient, useImportClients } from '@/hooks/useMutations';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatPhoneNumber, parseCsvLine } from '@/lib/utils';
import { Edit2, Trash2, Mail, Phone, Loader2, Search, Upload, Download, X, ChevronDown, ChevronRight, FileText, Receipt, ArrowUpDown, Plus, Users } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { US_STATE_NAMES } from '@/lib/usStateTaxRates';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PAGE_SIZE = 50;

const ClientRow = React.memo(({ client, onViewProfile, onEdit, onDelete, onNewQuote, onNewInvoice }) => {
  const clientFullName = client.displayName || `${client.firstName || ''} ${client.lastName || ''}`.trim();
  const initials = ((client.firstName?.[0] || '') + (client.lastName?.[0] || '')).toUpperCase() || '?';

  return (
    <div
      className="list-card list-card--accent p-3 px-4 group cursor-pointer"
      onClick={() => onViewProfile(client.id)}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
          style={{ background: 'rgba(var(--accent-rgb) / 0.12)', color: 'rgba(var(--accent-rgb) / 0.85)' }}
        >
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-surface-800 truncate">
              {clientFullName || 'Unnamed Client'}
            </span>
            {client.company && clientFullName !== client.company && (
              <span className="hidden lg:inline text-xs text-surface-400 truncate">{client.company}</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5">
            {client.phone && (
              <a
                href={`tel:${client.phone}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-surface-500 hover:text-primary transition-colors"
              >
                <Phone className="w-3 h-3" />
                <span>{formatPhoneNumber(client.phone)}</span>
              </a>
            )}
            {client.email && (
              <a
                href={`mailto:${client.email}`}
                onClick={e => e.stopPropagation()}
                className="hidden sm:flex items-center gap-1 text-xs text-surface-400 hover:text-primary transition-colors truncate max-w-[200px]"
              >
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{client.email}</span>
              </a>
            )}
          </div>
        </div>

        {/* Quick actions — desktop hover */}
        <div
          className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => onNewQuote(client)} className="icon-button !p-1.5" title="New Estimate">
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
          </button>
          <button onClick={() => onNewInvoice(client)} className="icon-button !p-1.5" title="New Invoice">
            <Receipt className="w-3.5 h-3.5 text-amber-500" />
          </button>
          <button onClick={() => onEdit(client)} className="icon-button !p-1.5" title="Edit">
            <Edit2 className="w-3.5 h-3.5 text-blue-400" />
          </button>
          <button onClick={() => onDelete(client.id)} className="icon-button !p-1.5" title="Delete">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>

        <ChevronRight className="w-4 h-4 text-surface-300 shrink-0 md:opacity-0 md:group-hover:opacity-60 transition-opacity" />
      </div>
    </div>
  );
});
ClientRow.displayName = 'ClientRow';

const SORT_OPTIONS = [
  { label: 'Last Name A-Z', orderBy: 'lastName', asc: true },
  { label: 'Last Name Z-A', orderBy: 'lastName', asc: false },
  { label: 'First Name A-Z', orderBy: 'firstName', asc: true },
  { label: 'First Name Z-A', orderBy: 'firstName', asc: false },
  { label: 'Newest First', orderBy: 'createdAt', asc: false },
  { label: 'Oldest First', orderBy: 'createdAt', asc: true },
];

const ClientsManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state || {};
  const showFormProp = navState.showForm;
  const { user } = useAuth();
  const [editingClient, setEditingClient] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(showFormProp || false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', firstName: '', lastName: '', email: '', phone: '', phone2: '', company: '', billingStreet: '', billingCity: '', billingState: '', billingPostalCode: '', billingCountry: 'US', shippingStreet: '', shippingCity: '', shippingState: '', shippingPostalCode: '', shippingCountry: 'US' });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortIndex, setSortIndex] = useState(0);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClientMutation = useDeleteClient();
  const importClients = useImportClients();
  const sentinelRef = useRef(null);

  const currentSort = SORT_OPTIONS[sortIndex];

  const {
    data: clientsData,
    isLoading: loading,
    isFetchingNextPage,
    hasNextPage: hasMore,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.clients.list({ search: debouncedSearchTerm, orderBy: currentSort.orderBy, asc: currentSort.asc }),
    queryFn: async ({ pageParam = 0 }) => {
      return api.get('/clients', {
        search: debouncedSearchTerm || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        orderBy: currentSort.orderBy,
        asc: currentSort.asc,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
      return totalFetched < (lastPage.count || 0) ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60_000,
  });

  const clients = useMemo(() => clientsData?.pages.flatMap(p => p.data || []) ?? [], [clientsData]);
  const totalCount = clientsData?.pages[0]?.count ?? 0;
  const isSubmitting = createClient.isPending || updateClient.isPending;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

  useEffect(() => {
    if (showFormProp) {
      setIsFormVisible(true);
    }
  }, [showFormProp]);

  // Auto-load next page on scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !isFetchingNextPage) fetchNextPage(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  const handlePhoneInputChange = useCallback((field) => (e) => {
    const input = e.target.value;
    const cleaned = ('' + input).replace(/\D/g, '');
    if (cleaned.length <= 10) {
      setFormData(prev => ({ ...prev, [field]: cleaned }));
    }
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ displayName: '', firstName: '', lastName: '', email: '', phone: '', phone2: '', company: '', billingStreet: '', billingCity: '', billingState: '', billingPostalCode: '', billingCountry: 'US', shippingStreet: '', shippingCity: '', shippingState: '', shippingPostalCode: '', shippingCountry: 'US' });
    setEditingClient(null);
    setIsFormVisible(false);
    setShowMoreDetails(false);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!formData.firstName) {
        toast({ title: "First name is required", variant: "destructive" });
        return;
    }
    const clientData = { ...formData, email: formData.email.trim().toLowerCase() };
    if (clientData.email === '') delete clientData.email;

    try {
        if (editingClient) {
            await updateClient.mutateAsync({ id: editingClient.id, ...clientData });
        } else {
            await createClient.mutateAsync(clientData);
        }
        resetForm();
    } catch { /* handled by mutation onError */ }
  }, [formData, editingClient, resetForm, createClient, updateClient]);

  const confirmDelete = (id) => {
    setClientToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = useCallback(async () => {
    if (!clientToDelete) return;
    try {
      await deleteClientMutation.mutateAsync(clientToDelete);
    } catch { /* handled by mutation onError */ }
    setIsDeleteDialogOpen(false);
    setClientToDelete(null);
  }, [deleteClientMutation, clientToDelete]);

  const handleEdit = useCallback(async (client) => {
    setEditingClient(client);
    const hasAddress = client.billingStreet || client.billingCity || client.billingState || client.shippingStreet || client.shippingCity || client.shippingState;
    setFormData({ displayName: client.displayName || '', firstName: client.firstName, lastName: client.lastName, email: client.email || '', phone: client.phone || '', phone2: client.phone2 || '', company: client.company || '', billingStreet: client.billingStreet || '', billingCity: client.billingCity || '', billingState: client.billingState || '', billingPostalCode: client.billingPostalCode || '', billingCountry: client.billingCountry || '', shippingStreet: client.shippingStreet || '', shippingCity: client.shippingCity || '', shippingState: client.shippingState || '', shippingPostalCode: client.shippingPostalCode || '', shippingCountry: client.shippingCountry || '' });
    if (hasAddress) setShowMoreDetails(true);
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleExport = useCallback(async () => {
    toast({ title: "Exporting clients...", description: "Please wait while we prepare your data." });
    try {
      const result = await api.get('/clients/export');
      const data = result.data || [];
      const headers = ["display_name", "first_name", "last_name", "email", "phone", "phone2", "company", "billing_street", "billing_city", "billing_state", "billing_postal_code", "billing_country", "shipping_street", "shipping_city", "shipping_state", "shipping_postal_code", "shipping_country"];
      const csvContent = "data:text/csv;charset=utf-8," +
          headers.join(",") + "\n" +
          data.map(e => `"${e.displayName || ''}","${e.firstName || ''}","${e.lastName || ''}","${e.email || ''}","${e.phone || ''}","${e.phone2 || ''}","${e.company || ''}","${e.billingStreet || ''}","${e.billingCity || ''}","${e.billingState || ''}","${e.billingPostalCode || ''}","${e.billingCountry || ''}","${e.shippingStreet || ''}","${e.shippingCity || ''}","${e.shippingState || ''}","${e.shippingPostalCode || ''}","${e.shippingCountry || ''}"`).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "clients_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export complete!", description: "Your clients have been downloaded." });
    } catch (error) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const csv = event.target.result;
        const lines = csv.split(/[\r\n]+/).filter(line => line.trim() !== '');
        if (lines.length < 2) {
            toast({ title: "Import failed", description: "CSV file is empty or has no data rows.", variant: "destructive" });
            return;
        }

        toast({ title: "Importing...", description: "Processing your CSV file." });

        const headers = parseCsvLine(lines[0]);
        const emailHeaderIndex = headers.findIndex(h => h.toLowerCase() === 'email');
        if (emailHeaderIndex === -1) {
            toast({ title: "Import failed", description: "CSV must contain an 'email' column.", variant: "destructive" });
            return;
        }

        const headerMap = {
            'first_name': 'firstName', 'last_name': 'lastName', 'email': 'email',
            'phone': 'phone', 'phone2': 'phone2', 'phone_2': 'phone2', 'company': 'company',
            'billing_street': 'billingStreet', 'billing_city': 'billingCity',
            'billing_state': 'billingState', 'billing_postal_code': 'billingPostalCode',
            'billing_country': 'billingCountry', 'shipping_street': 'shippingStreet',
            'shipping_city': 'shippingCity', 'shipping_state': 'shippingState',
            'shipping_postal_code': 'shippingPostalCode', 'shipping_country': 'shippingCountry',
            'address': 'billingStreet', 'firstname': 'firstName', 'lastname': 'lastName',
        };

        const clientsToProcess = lines.slice(1).map(line => {
            const values = parseCsvLine(line);
            if (values.length !== headers.length) return null;
            const client = {};
            headers.forEach((header, index) => {
                const h = header.trim().toLowerCase();
                const fieldName = headerMap[h];
                if (fieldName) client[fieldName] = values[index];
            });
            client.email = client.email?.trim().toLowerCase();
            return client.email && client.firstName ? client : null;
        }).filter(Boolean);

        if (clientsToProcess.length === 0) {
            toast({ title: "No valid clients to import", description: "Check your CSV for required fields: first_name, email.", variant: "destructive" });
            return;
        }

        importClients.mutate(clientsToProcess);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleViewProfile = useCallback((clientId) => {
    const main = document.querySelector('main');
    if (main) sessionStorage.setItem('scroll:/clients', String(main.scrollTop));
    navigate('/clients/' + clientId);
  }, [navigate]);

  const handleNewQuote = useCallback((client) => {
    navigate('/quotes', { state: { clientToPreload: client } });
  }, [navigate]);

  const handleNewInvoice = useCallback((client) => {
    navigate('/invoices', { state: { clientToPreload: client } });
  }, [navigate]);

  const handleCycleSort = useCallback(() => {
    setSortIndex(prev => (prev + 1) % SORT_OPTIONS.length);
  }, []);

  return (
    <div className="space-y-5">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the client and all their associated quotes and invoices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="hidden md:block">
          <h2 className="text-2xl font-bold text-surface-800">Clients</h2>
          <p className="text-surface-400 text-sm">Manage your client information</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCycleSort} className="action-btn action-btn--secondary text-xs" title={`Sort: ${currentSort.label}`}>
            <ArrowUpDown className="w-4 h-4 mr-1.5" /><span className="hidden sm:inline">{currentSort.label}</span>
          </button>
          <label htmlFor="client-import" className="action-btn action-btn--secondary cursor-pointer text-xs"><Upload className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Import</span></label>
          <input id="client-import" type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          <button onClick={handleExport} className="action-btn action-btn--secondary text-xs"><Download className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Export</span></button>
          <button onClick={() => { resetForm(); setIsFormVisible(!isFormVisible); }} className="action-btn">
            <Plus className="action-btn__icon" />
            {isFormVisible ? 'Cancel' : 'Add Client'}
          </button>
        </div>
      </div>

      {/* Form */}
      <AnimatePresence>
        {isFormVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flat-card p-5">
              <h3 className="text-base font-bold text-surface-800 mb-4">{editingClient ? 'Edit Client' : 'Add New Client'}</h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <input type="text" placeholder="Display / Business Name (optional — e.g. &quot;Sarah &amp; Mike Thompson&quot;)" value={formData.displayName} onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} className="glass-input w-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" placeholder="First Name *" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="glass-input w-full" required />
                  <input type="text" placeholder="Last Name" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="glass-input w-full" />
                  <input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="glass-input w-full" />
                  <input type="tel" inputMode="tel" placeholder="Phone (555) 555-5555" value={formatPhoneNumber(formData.phone)} onChange={handlePhoneInputChange('phone')} className="glass-input w-full" />
                  <input type="tel" inputMode="tel" placeholder="Phone 2 (optional)" value={formatPhoneNumber(formData.phone2)} onChange={handlePhoneInputChange('phone2')} className="glass-input w-full" />
                  <input type="text" placeholder="Company" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="glass-input w-full" />
                </div>
                <button type="button" onClick={() => setShowMoreDetails(!showMoreDetails)} className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-700 transition-colors">
                  <ChevronDown className={`w-4 h-4 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} />
                  {showMoreDetails ? 'Less details' : 'More details'}
                </button>
                <AnimatePresence>
                  {showMoreDetails && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-surface-500 mb-2">Billing Address</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input type="text" placeholder="Street" value={formData.billingStreet} onChange={(e) => setFormData({ ...formData, billingStreet: e.target.value })} className="glass-input w-full md:col-span-2" />
                          <input type="text" placeholder="City" value={formData.billingCity} onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })} className="glass-input w-full" />
                          <select value={formData.billingState} onChange={(e) => setFormData({ ...formData, billingState: e.target.value })} className="glass-select w-full">
                            <option value="">State / Province</option>
                            {Object.entries(US_STATE_NAMES).map(([code, name]) => (
                              <option key={code} value={code}>{name} ({code})</option>
                            ))}
                          </select>
                          <input type="text" placeholder="Postal Code" value={formData.billingPostalCode} onChange={(e) => setFormData({ ...formData, billingPostalCode: e.target.value })} className="glass-input w-full" />
                          <select value={formData.billingCountry || 'US'} onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })} className="glass-select w-full">
                            <option value="US">United States</option>
                            <option value="CA">Canada</option>
                            <option value="MX">Mexico</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-surface-500 mb-2">Shipping Address</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input type="text" placeholder="Street" value={formData.shippingStreet} onChange={(e) => setFormData({ ...formData, shippingStreet: e.target.value })} className="glass-input w-full md:col-span-2" />
                          <input type="text" placeholder="City" value={formData.shippingCity} onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })} className="glass-input w-full" />
                          <select value={formData.shippingState} onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })} className="glass-select w-full">
                            <option value="">State / Province</option>
                            {Object.entries(US_STATE_NAMES).map(([code, name]) => (
                              <option key={code} value={code}>{name} ({code})</option>
                            ))}
                          </select>
                          <input type="text" placeholder="Postal Code" value={formData.shippingPostalCode} onChange={(e) => setFormData({ ...formData, shippingPostalCode: e.target.value })} className="glass-input w-full" />
                          <select value={formData.shippingCountry || 'US'} onChange={(e) => setFormData({ ...formData, shippingCountry: e.target.value })} className="glass-select w-full">
                            <option value="US">United States</option>
                            <option value="CA">Canada</option>
                            <option value="MX">Mexico</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="submit" className="action-btn" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : (editingClient ? 'Update Client' : 'Save Client')}
                  </button>
                  <button type="button" onClick={resetForm} className="action-btn action-btn--secondary" disabled={isSubmitting}>Cancel</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input type="text" placeholder="Search clients..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-9" />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 mb-1">
            {searchTerm ? 'No clients found' : 'No clients yet'}
          </h3>
          <p className="text-surface-400 text-sm mb-4">
            {searchTerm ? 'Try a different search term.' : 'Add your first client to get started.'}
          </p>
          {!searchTerm && (
            <button onClick={() => { resetForm(); setIsFormVisible(true); }} className="action-btn">
              <Plus className="w-4 h-4 mr-2" /> Add Client
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-surface-400">{totalCount} client{totalCount !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {clients.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                onViewProfile={handleViewProfile}
                onEdit={handleEdit}
                onDelete={confirmDelete}
                onNewQuote={handleNewQuote}
                onNewInvoice={handleNewInvoice}
              />
            ))}
          </div>
          {(hasMore || clients.length > 6) && (
            <div className="sticky bottom-0 h-16 -mt-16 pointer-events-none z-10" style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--surface-50)))' }} />
          )}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ClientsManager;
