import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/hooks/useAppData';
import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useSaveProduct, useDeleteProduct, useBulkDeleteProducts, useImportProducts, useUpdateSettings } from '@/hooks/useMutations';
import { Edit2, Trash2, Loader2, ArrowDownUp, Plus, Search, Upload, Download, X, CheckSquare, ChevronDown, Tag, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useDebounce } from '@/hooks/useDebounce';
import { parseCsvLine, groupByCategory, cn } from '@/lib/utils';

const CategoryManager = ({ categories, onSave }) => {
  const [newCategory, setNewCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const handleAdd = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Category already exists", variant: "destructive" });
      return;
    }
    const updated = [...categories, trimmed].sort((a, b) => a.localeCompare(b));
    onSave(updated);
    setNewCategory('');
  };

  const handleRemove = (cat) => {
    onSave(categories.filter(c => c !== cat));
  };

  const filtered = searchTerm
    ? categories.filter(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
    : categories;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New category name..."
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          className="glass-input flex-1"
        />
        <Button type="button" onClick={handleAdd} disabled={!newCategory.trim()}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>
      {categories.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="glass-input w-full pl-10 pr-9"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {categories.length === 0 ? (
        <p className="text-sm text-surface-500">No categories yet. Add one above.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-surface-500">No matching categories.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(cat => (
            <div key={cat} className="flex items-center justify-between glass-card p-2.5">
              <span className="text-sm">{cat}</span>
              <button onClick={() => handleRemove(cat)} className="icon-button">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProductForm = ({ product, onSave, onCancel, defaultProductType = 'product', categories = [], defaultCategory = '' }) => {
  const [productType, setProductType] = useState(product?.productType || defaultProductType);
  const [formData, setFormData] = useState({
    name: product?.name || '',
    retailPrice: product?.retailPrice || '',
    description: product?.description || '',
    category: product?.category || defaultCategory,
  });

  useEffect(() => {
    setProductType(product?.productType || defaultProductType);
    setFormData({
      name: product?.name || '',
      retailPrice: product?.retailPrice ? parseFloat(product.retailPrice).toFixed(2) : '',
      description: product?.description || '',
      category: product?.category || defaultCategory,
    });
  }, [product]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, productType });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Tabs value={productType} onValueChange={setProductType} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="service">Service</TabsTrigger>
        </TabsList>
      </Tabs>

      <input type="text" placeholder="Item Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="glass-input w-full" required />

      <div>
        <Label>Category (Optional)</Label>
        <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="glass-input w-full">
          <option value="">No category</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      <div>
        <Label>Price</Label>
        <input type="number" inputMode="decimal" placeholder="Price" step="0.01" value={formData.retailPrice} onChange={(e) => setFormData({ ...formData, retailPrice: e.target.value })} className="glass-input w-full" required />
      </div>

      <textarea placeholder="Description (optional)" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="glass-input w-full" rows={3} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{product?.id ? 'Update Item' : 'Save Item'}</Button>
      </DialogFooter>
    </form>
  );
};

const ProductRow = React.memo(({ product, onEdit, onDelete, onDuplicate, onSelectionChange, isSelected, isSelectionMode, canManage }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  return (
    <>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{product.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(product.id)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={cn("list-card list-card--accent p-3 px-4 group", canManage && "cursor-pointer")} onClick={canManage ? () => onEdit(product) : undefined}>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isSelectionMode && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelectionChange(product.id, checked)} className="mt-0.5" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex-grow min-w-0">
            {/* Top line: name + retail price + actions */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold truncate">{product.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold tabular-nums text-blue-400">
                  ${parseFloat(product.retailPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {canManage && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); onDuplicate(product); }} className="icon-button !p-1.5" title="Duplicate"><Copy className="w-3 h-3 text-surface-400" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onEdit(product); }} className="icon-button !p-1.5"><Edit2 className="w-3 h-3 text-blue-400" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setIsDeleteDialogOpen(true); }} className="icon-button !p-1.5"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  </div>
                )}
              </div>
            </div>
            {/* Bottom line: category chip + type badge */}
            <div className="flex items-center gap-2 mt-1">
              {product.category && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-surface-100 text-surface-600 border border-surface-200">{product.category}</span>
              )}
              {product.productType === 'service' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">Service</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
});

const ProductList = ({ title, products, onEdit, onDelete, onDuplicate, selectedProducts, onSelectionChange, isSelectionMode, onShowMore, hasMore, loadingMore, isSearching, canManage }) => {
    const grouped = useMemo(() => groupByCategory(products), [products]);
    const allCategories = grouped.map(g => g.category);
    const [collapsedCategories, setCollapsedCategories] = useState(() => new Set(allCategories));

    // Collapse all when search is cleared; expand all when searching
    useEffect(() => {
      if (isSearching) {
        setCollapsedCategories(new Set());
      } else {
        setCollapsedCategories(new Set(allCategories));
      }
    }, [isSearching]);

    // When new categories appear (e.g. products finish loading), keep them collapsed
    useEffect(() => {
      if (!isSearching) {
        setCollapsedCategories(prev => {
          const next = new Set(prev);
          allCategories.forEach(c => next.add(c));
          return next;
        });
      }
    }, [allCategories.length]);

    const toggleCategory = (cat) => {
      setCollapsedCategories(prev => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
      });
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-surface-700/20 pb-2">{title}</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto p-1 -m-1">
                {products.length > 0 ? grouped.map(({ category, products: catProducts }) => (
                    <div key={category} className="space-y-2">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="flex items-center gap-2 text-sm font-medium text-surface-600 hover:text-surface-800 transition-colors w-full"
                      >
                        <ChevronDown className={cn("w-4 h-4 transition-transform", collapsedCategories.has(category) && "-rotate-90")} />
                        <span>{category}</span>
                        <span className="text-xs text-surface-500">({catProducts.length})</span>
                      </button>
                      <AnimatePresence>
                        {!collapsedCategories.has(category) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
                            animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
                            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                            className="space-y-2"
                          >
                            {catProducts.map(product => (
                              <ProductRow key={product.id} product={product} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} isSelected={selectedProducts.has(product.id)} onSelectionChange={onSelectionChange} isSelectionMode={isSelectionMode} canManage={canManage} />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                )) : <p className="text-sm text-surface-500">No {title.toLowerCase()} found.</p>}
                {hasMore && (
                    <div className="mt-4 flex justify-center">
                        <Button onClick={onShowMore} disabled={loadingMore}>
                            {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Load More'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};


const PAGE_SIZE = 20;

const ProductsManager = ({ isDataLoading }) => {
  const { user } = useAuth();
  const { can } = useAppData();
  const canManage = can('manage_services');
  const saveProduct = useSaveProduct();
  const deleteProduct = useDeleteProduct();
  const bulkDeleteProducts = useBulkDeleteProducts();
  const importProducts = useImportProducts();
  const updateSettings = useUpdateSettings();
  const [editingProduct, setEditingProduct] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', ascending: true });
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [lastProductType, setLastProductType] = useState('service');
  const [lastCategory, setLastCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  const getNextPageParam = (lastPage, allPages) => {
    const totalFetched = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
    return totalFetched < (lastPage.count || 0) ? allPages.length : undefined;
  };

  const productQuery = useInfiniteQuery({
    queryKey: queryKeys.products.list({ type: 'product', search: debouncedSearchTerm, sort: sortConfig }),
    queryFn: async ({ pageParam = 0 }) => api.get('/products', {
      type: 'product', search: debouncedSearchTerm || undefined,
      page: pageParam, pageSize: PAGE_SIZE,
      orderBy: sortConfig.key, asc: sortConfig.ascending,
    }),
    getNextPageParam,
    initialPageParam: 0,
    staleTime: 2 * 60_000,
  });

  const serviceQuery = useInfiniteQuery({
    queryKey: queryKeys.products.list({ type: 'service', search: debouncedSearchTerm, sort: sortConfig }),
    queryFn: async ({ pageParam = 0 }) => api.get('/products', {
      type: 'service', search: debouncedSearchTerm || undefined,
      page: pageParam, pageSize: PAGE_SIZE,
      orderBy: sortConfig.key, asc: sortConfig.ascending,
    }),
    getNextPageParam,
    initialPageParam: 0,
    staleTime: 2 * 60_000,
  });

  const products = {
    product: productQuery.data?.pages.flatMap(p => p.data || []) ?? [],
    service: serviceQuery.data?.pages.flatMap(p => p.data || []) ?? [],
  };
  const loading = productQuery.isLoading || serviceQuery.isLoading;

  const loadCategories = useCallback(async () => {
    try {
      const result = await api.get('/settings');
      const raw = result.data?.product_categories;
      if (raw) {
        try { setCategories(JSON.parse(raw)); } catch { setCategories([]); }
      } else {
        setCategories([]);
      }
    } catch (e) { /* non-critical */ }
  }, []);

  const saveCategories = useCallback((updated) => {
    setCategories(updated);
    updateSettings.mutate([{ key: 'product_categories', value: JSON.stringify(updated) }]);
  }, [updateSettings]);

  useEffect(() => {
    loadCategories();
  }, []);


  const handleSelectionChange = useCallback((productId, isSelected) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  }, []);

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return;
    try {
      await bulkDeleteProducts.mutateAsync(Array.from(selectedProducts));
      setSelectedProducts(new Set());
      setIsSelectionMode(false);
    } catch { /* handled by mutation onError */ }
    setIsConfirmDeleteDialogOpen(false);
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { ...prev, ascending: !prev.ascending };
      }
      return { key, ascending: true };
    });
  };

  const handleExport = useCallback(async () => {
    toast({ title: "Exporting catalog...", description: "Please wait while we prepare your data." });
    try {
      const result = await api.get('/products/export');
      const data = result.data;
      const csvContent = "data:text/csv;charset=utf-8," +
          ["name", "retail_price", "description", "category", "product_type"].join(",") + "\n" +
          data.map(e => `"${e.name || ''}","${(e.retailPrice || 0).toFixed(2)}","${e.description?.replace(/"/g, '""') || ''}","${e.category?.replace(/"/g, '""') || ''}","${e.productType || 'product'}"`).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "products_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export complete!", description: "Your catalog has been downloaded." });
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
        toast({ title: "Import failed", description: "CSV file is empty or invalid.", variant: "destructive" });
        return;
      }
      const headers = parseCsvLine(lines[0]);
      const productsToImport = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        if (values.length !== headers.length) continue;

        const row = {};
        headers.forEach((header, index) => {
            row[header.trim()] = values[index];
        });
        if (row.name) {
          productsToImport.push({
            name: row.name,
            retailPrice: parseFloat(row.retail_price) || 0,
            productType: ['product', 'service'].includes(row.product_type) ? row.product_type : 'service',
            description: row.description || '',
            category: row.category || null,
          });
        }
      }

      if (productsToImport.length > 0) {
        importProducts.mutate(productsToImport);
      } else {
        toast({ title: "No items to import", description: "Please check your CSV file format.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSave = useCallback(async (formData) => {
    const productData = {
      id: editingProduct?.id || undefined,
      name: formData.name,
      productType: formData.productType,
      retailPrice: parseFloat(formData.retailPrice),
      description: formData.description,
      category: formData.category || null,
    };

    try {
      await saveProduct.mutateAsync(productData);
      setLastProductType(formData.productType);
      setLastCategory(formData.category || '');
      setIsModalOpen(false);
      setEditingProduct(null);
    } catch { /* handled by mutation onError */ }
  }, [editingProduct, saveProduct]);

  const handleDelete = useCallback((id) => {
    deleteProduct.mutate(id);
  }, [deleteProduct]);

  const handleEdit = useCallback((product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  }, []);

  const handleDuplicate = useCallback((product) => {
    setEditingProduct({
      ...product,
      id: undefined,
      name: `${product.name} (Copy)`,
    });
    setIsModalOpen(true);
  }, []);

  const handleAddNew = useCallback(() => {
    setEditingProduct(null);
    setIsModalOpen(true);
  }, []);

  return (
    <div className="w-full">
      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {selectedProducts.size} item(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between mb-4">
        <div className="hidden md:block">
          <h2 className="text-2xl font-bold">Services & Products</h2>
          <p className="text-surface-400 text-sm">Manage your service and product catalog</p>
        </div>
        {canManage && (
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={() => setIsCategoryDialogOpen(true)} className="action-btn action-btn--secondary"><Tag className="w-4 h-4 md:mr-2" /><span className="hidden md:inline"> Categories</span></button>
            <label htmlFor="product-import" className="action-btn action-btn--secondary cursor-pointer"><Upload className="w-4 h-4 md:mr-2" /><span className="hidden md:inline"> Import</span></label>
            <input id="product-import" type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
            <button onClick={handleExport} className="action-btn action-btn--secondary"><Download className="w-4 h-4 md:mr-2" /><span className="hidden md:inline"> Export</span></button>
            <button onClick={handleAddNew} className="action-btn"><Plus className="w-4 h-4 md:mr-2" /><span className="hidden md:inline">Add</span></button>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={(isOpen) => { if (!isOpen) setEditingProduct(null); setIsModalOpen(isOpen); }}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle>{editingProduct?.id ? 'Edit Item' : 'Add New Item'}</DialogTitle>
          </DialogHeader>
          <ProductForm product={editingProduct} onSave={handleSave} onCancel={() => setIsModalOpen(false)} defaultProductType={lastProductType} defaultCategory={lastCategory} categories={categories} />
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
          </DialogHeader>
          <CategoryManager categories={categories} onSave={saveCategories} />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col md:flex-row gap-4 mb-4 items-start">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input type="text" placeholder="Search catalog..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="glass-input w-full pl-10 pr-9" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 ml-auto flex-shrink-0">
          {canManage && (isSelectionMode ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => setIsConfirmDeleteDialogOpen(true)} disabled={selectedProducts.size === 0}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedProducts.size})
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setIsSelectionMode(false); setSelectedProducts(new Set()); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setIsSelectionMode(true)}>
              <CheckSquare className="w-4 h-4 mr-2" /> Select
            </Button>
          ))}
          <button onClick={() => handleSort('name')} className="action-btn action-btn--secondary text-xs">
            Name <ArrowDownUp className="w-3 h-3 ml-1" />
          </button>
          <button onClick={() => handleSort('retailPrice')} className="action-btn action-btn--secondary text-xs">
            Price <ArrowDownUp className="w-3 h-3 ml-1" />
          </button>
        </div>
      </div>

      {loading || isDataLoading ? <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProductList
                title="Services"
                products={products.service}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                selectedProducts={selectedProducts}
                onSelectionChange={handleSelectionChange}
                isSelectionMode={isSelectionMode}
                canManage={canManage}
                onShowMore={() => serviceQuery.fetchNextPage()}
                hasMore={!!serviceQuery.hasNextPage}
                loadingMore={serviceQuery.isFetchingNextPage}
                isSearching={!!debouncedSearchTerm}
            />
            <ProductList
                title="Products"
                products={products.product}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                selectedProducts={selectedProducts}
                onSelectionChange={handleSelectionChange}
                isSelectionMode={isSelectionMode}
                canManage={canManage}
                onShowMore={() => productQuery.fetchNextPage()}
                hasMore={!!productQuery.hasNextPage}
                loadingMore={productQuery.isFetchingNextPage}
                isSearching={!!debouncedSearchTerm}
            />
        </div>
      )}
    </div>
  );
};

export default ProductsManager;
