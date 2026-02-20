import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';

// Helper: invalidate all major query groups (replaces refreshData() with no section)
function invalidateAll(queryClient) {
  [queryKeys.clients.all, queryKeys.quotes.all, queryKeys.invoices.all,
   queryKeys.products.all, queryKeys.projects.all, queryKeys.settings.all,
   queryKeys.profile.all, queryKeys.stats.all, queryKeys.projectTypes.all,
  ].forEach(key => queryClient.invalidateQueries({ queryKey: key }));
}

// ─── Clients ────────────────────────────────────────────────────────────────

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientData) => api.post('/clients', clientData).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Client created successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      const msg = error.message?.includes('email') ? "Email already exists" : error.message;
      toast({ title: "Error saving client", description: msg, variant: "destructive" });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/clients/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Client updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
    onError: (error) => {
      const msg = error.message?.includes('email') ? "Email already exists" : error.message;
      toast({ title: "Error saving client", description: msg, variant: "destructive" });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/clients/' + id),
    onSuccess: () => {
      toast({ title: "Client deleted successfully!" });
      invalidateAll(queryClient);
    },
    onError: (error) => {
      toast({ title: "Error deleting client", description: error.message, variant: "destructive" });
    },
  });
}

export function useImportClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clients) => api.post('/clients/upsert', { clients }),
    onSuccess: (_data, clients) => {
      toast({ title: "Import successful", description: `${clients.length} clients imported.` });
      invalidateAll(queryClient);
    },
    onError: (error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Client Notes ────────────────────────────────────────────────────────────

export function useCreateClientNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, content }) =>
      api.post(`/clients/${clientId}/notes`, { content }).then(r => r.data),
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.notes(clientId) });
    },
    onError: (error) => {
      toast({ title: "Error adding note", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteClientNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, noteId }) =>
      api.delete(`/clients/${clientId}/notes/${noteId}`),
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.notes(clientId) });
    },
    onError: (error) => {
      toast({ title: "Error deleting note", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Quotes ─────────────────────────────────────────────────────────────────

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quoteData) => api.post('/quotes', quoteData).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Quote created successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error creating quote", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/quotes/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Quote updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
    },
    onError: (error) => {
      toast({ title: "Error updating quote", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/quotes/' + id),
    onSuccess: () => {
      toast({ title: "Quote deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting quote", description: error.message, variant: "destructive" });
    },
  });
}

export function useBulkDeleteQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.delete('/quotes/bulk', { ids }),
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length} quotes deleted successfully!` });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting quotes", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceData) => api.post('/invoices', invoiceData).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Invoice created successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error creating invoice", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/invoices/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Invoice updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
    onError: (error) => {
      toast({ title: "Error updating invoice", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/invoices/' + id),
    onSuccess: () => {
      toast({ title: "Invoice deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting invoice", description: error.message, variant: "destructive" });
    },
  });
}

export function useBulkDeleteInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.delete('/invoices/bulk', { ids }),
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length} invoices deleted successfully!` });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting invoices", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Products ───────────────────────────────────────────────────────────────

export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      id ? api.put('/products/' + id, data) : api.post('/products', data),
    onSuccess: (_data, variables) => {
      toast({ title: `Product ${variables.id ? 'updated' : 'created'} successfully!` });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      if (!variables.id) queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error saving product", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/products/' + id),
    onSuccess: () => {
      toast({ title: "Product deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting product", description: error.message, variant: "destructive" });
    },
  });
}

export function useBulkDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api.delete('/products/bulk', { ids }),
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length} products deleted successfully!` });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting products", description: error.message, variant: "destructive" });
    },
  });
}

export function useImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (products) => api.post('/products/upsert', { products }),
    onSuccess: (_data, products) => {
      toast({ title: "Import successful", description: `${products.length} products imported.` });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Payments ───────────────────────────────────────────────────────────────

export function useAddPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentData) => api.post('/payments', paymentData).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Payment added successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error adding payment", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId) => api.delete('/payments/' + paymentId),
    onSuccess: () => {
      toast({ title: "Payment deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting payment", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

export function useStripeRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, amount }) => api.post('/stripe/refund', { paymentId, amount }),
    onSuccess: (data) => {
      toast({ title: "Refund processed", description: `$${data.data.amount.toFixed(2)} refunded via Stripe.` });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Refund failed", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Credits ───────────────────────────────────────────────────────────────

export function useDeleteCredit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (creditId) => api.delete('/credits/' + creditId),
    onSuccess: () => {
      toast({ title: "Credit deleted successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting credit", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Projects ────────────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/projects', data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Project created successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error creating project", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/projects/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Project updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error) => {
      toast({ title: "Error updating project", description: error.message, variant: "destructive" });
    },
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/projects/' + id),
    onSuccess: () => {
      toast({ title: "Project archived successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error archiving project", description: error.message, variant: "destructive" });
    },
  });
}

export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put('/projects/' + id + '/restore'),
    onSuccess: () => {
      toast({ title: "Project restored!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error restoring project", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteProjectPermanently() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/projects/' + id + '/permanent'),
    onSuccess: () => {
      toast({ title: "Project permanently deleted" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting project", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Project Notes ───────────────────────────────────────────────────────────

export function useCreateProjectNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content }) =>
      api.post(`/projects/${projectId}/notes`, { content }).then(r => r.data),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.notes(projectId) });
    },
    onError: (error) => {
      toast({ title: "Error adding note", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateProjectNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, noteId, content }) =>
      api.put(`/projects/${projectId}/notes/${noteId}`, { content }).then(r => r.data),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.notes(projectId) });
    },
    onError: (error) => {
      toast({ title: "Error updating note", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteProjectNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, noteId }) =>
      api.delete(`/projects/${projectId}/notes/${noteId}`),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.notes(projectId) });
    },
    onError: (error) => {
      toast({ title: "Error deleting note", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userData) => api.post('/users', userData),
    onSuccess: () => {
      toast({ title: "User created successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error creating user", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/users/' + id, data),
    onSuccess: () => {
      toast({ title: "User updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error updating user", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/users/' + id),
    onSuccess: () => {
      toast({ title: "User deleted successfully." });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting user", description: error.message, variant: "destructive" });
    },
  });
}

export function useVerifyUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put(`/users/${id}/verify`),
    onSuccess: () => {
      toast({ title: "User email verified successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error verifying user", description: error.message, variant: "destructive" });
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (id) => api.put(`/users/${id}/send-verification`),
    onSuccess: () => {
      toast({ title: "Verification email sent!" });
    },
    onError: (error) => {
      toast({ title: "Error sending verification email", description: error.message, variant: "destructive" });
    },
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, teamRole, linkTeamMemberId }) => api.put(`/users/${id}/approve`, { teamRole, linkTeamMemberId }),
    onSuccess: () => {
      toast({ title: "User approved successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.team?.all });
    },
    onError: (error) => {
      toast({ title: "Error approving user", description: error.message, variant: "destructive" });
    },
  });
}

export function useRejectUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put(`/users/${id}/reject`),
    onSuccess: () => {
      toast({ title: "User rejected and removed." });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error rejecting user", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings) => api.put('/settings', { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
    onError: (error) => {
      toast({ title: "Error saving settings", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Profile ────────────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData) => api.put('/users/me/profile', formData),
    onSuccess: () => {
      toast({ title: "Profile updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Failed to update profile", description: error.message, variant: "destructive" });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file) => {
      const uploadResult = await api.upload('/storage/avatars', file);
      const newAvatarUrl = uploadResult.data?.publicUrl || uploadResult.publicUrl || uploadResult.url;
      await api.put('/users/me/profile', { avatarUrl: newAvatarUrl });
      return newAvatarUrl;
    },
    onSuccess: () => {
      toast({ title: "Avatar updated successfully!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useUnlinkAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId) => api.delete(`/users/me/accounts/${providerId}`),
    onSuccess: () => {
      toast({ title: "Account unlinked successfully" });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.accounts() });
    },
    onError: (error) => {
      toast({ title: "Failed to unlink account", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Email ──────────────────────────────────────────────────────────────────

export function useSendEmail() {
  return useMutation({
    mutationFn: (emailData) => api.post('/email/send', emailData),
    onSuccess: () => {
      toast({ title: "Email queued", description: "The email will be sent shortly." });
    },
    onError: (error) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    },
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: (testEmail) => api.post('/email/test', { testEmail }),
    onSuccess: (result) => {
      toast({ title: "Test email sent!", description: result.message || "Check your inbox." });
    },
    onError: (error) => {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useVerifySmtp() {
  return useMutation({
    mutationFn: () => api.post('/email/verify'),
    onSuccess: (result) => {
      toast({ title: "Connection verified", description: result.message || "SMTP credentials are working." });
    },
    onError: (error) => {
      toast({ title: "Connection failed", description: error.message, variant: "destructive" });
    },
  });
}

// ─── PDF ────────────────────────────────────────────────────────────────────

export function useGeneratePdf() {
  return useMutation({
    mutationFn: ({ type, documentId }) => api.post('/pdf/generate', { type, documentId }),
  });
}

// ─── Branding ───────────────────────────────────────────────────────────────

export function useUploadBranding() {
  return useMutation({
    mutationFn: ({ file, type }) => api.upload('/storage/branding', file, { type }),
    onError: (error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Team Members ──────────────────────────────────────────────────────────

export function useCreateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/team', data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Team member added!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.team.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error adding team member", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/team/${id}`, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Team member updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.team.all });
    },
    onError: (error) => {
      toast({ title: "Error updating team member", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/team/${id}`),
    onSuccess: () => {
      toast({ title: "Team member removed." });
      queryClient.invalidateQueries({ queryKey: queryKeys.team.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error) => {
      toast({ title: "Error removing team member", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Assignments ───────────────────────────────────────────────────────────

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/assignments', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: "Crew assigned!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error assigning crew", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId, ...data }) => api.put(`/assignments/${id}`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: "Assignment updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error updating assignment", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }) => api.delete(`/assignments/${id}`),
    onSuccess: (_data, variables) => {
      toast({ title: "Assignment removed." });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error removing assignment", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Team Payments ─────────────────────────────────────────────────────────

export function useCreateTeamPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/team-payments', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: "Payment recorded!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamPayments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamAdvances.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamSalary.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error recording payment", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTeamPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/team-payments/${id}`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: "Payment updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamPayments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error updating payment", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteTeamPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projectId }) => api.delete(`/team-payments/${id}`),
    onSuccess: (_data, variables) => {
      toast({ title: "Payment deleted." });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamPayments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      if (variables.projectId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(variables.projectId) });
    },
    onError: (error) => {
      toast({ title: "Error deleting payment", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Project Types ──────────────────────────────────────────────────────────

export function useCreateProjectType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/project-types', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
    },
    onError: (error) => {
      toast({ title: "Error creating project type", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateProjectType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/project-types/' + id, data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
    },
    onError: (error) => {
      toast({ title: "Error updating project type", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteProjectType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/project-types/' + id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting project type", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Team Advances ────────────────────────────────────────────────────────

export function useCreateTeamAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/team-advances', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: variables.type === 'advance' ? 'Advance recorded!' : 'Repayment recorded!' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamAdvances.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error recording entry', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTeamAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/team-advances/${id}`, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: 'Entry updated!' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamAdvances.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error updating entry', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteTeamAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/team-advances/${id}`),
    onSuccess: () => {
      toast({ title: 'Entry deleted.' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamAdvances.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error deleting entry', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Team Salary ──────────────────────────────────────────────────────────

export function useCreateTeamSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/team-salary', data).then(r => r.data),
    onSuccess: (_data, variables) => {
      toast({ title: variables.type === 'accrued' ? 'Salary accrued!' : 'Salary payment recorded!' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamSalary.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error recording entry', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateTeamSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/team-salary/${id}`, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: 'Entry updated!' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamSalary.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error updating entry', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteTeamSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/team-salary/${id}`),
    onSuccess: () => {
      toast({ title: 'Entry deleted.' });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamSalary.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: 'Error deleting entry', description: error.message, variant: 'destructive' });
    },
  });
}

// ─── Permissions ───────────────────────────────────────────────────────────

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ role, permissions }) => api.put('/permissions/defaults', { role, permissions }),
    onSuccess: () => {
      toast({ title: "Role permissions updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Error updating permissions", description: error.message, variant: "destructive" });
    },
  });
}

export function useResetRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role) => api.put('/permissions/defaults/reset', { role }),
    onSuccess: () => {
      toast({ title: "Role permissions reset to defaults!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Error resetting permissions", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, permissions }) => api.put(`/permissions/user/${userId}`, { permissions }),
    onSuccess: (_data, { userId }) => {
      toast({ title: "User permissions updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissions.user(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Error updating user permissions", description: error.message, variant: "destructive" });
    },
  });
}

export function useClearUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => api.put(`/permissions/user/${userId}/clear`),
    onSuccess: (_data, userId) => {
      toast({ title: "User overrides cleared!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.permissions.user(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.all });
    },
    onError: (error) => {
      toast({ title: "Error clearing overrides", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Expenses ──────────────────────────────────────────────────────────────

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/expenses', data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Expense added!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error) => {
      toast({ title: "Error adding expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/expenses/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Expense updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamPayments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error) => {
      toast({ title: "Error updating expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/expenses/' + id),
    onSuccess: () => {
      toast({ title: "Expense deleted." });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamPayments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting expense", description: error.message, variant: "destructive" });
    },
  });
}

// ─── Recurring Expenses ─────────────────────────────────────────────────────

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/recurring-expenses', data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Recurring expense created!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
    },
    onError: (error) => {
      toast({ title: "Error creating recurring expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put('/recurring-expenses/' + id, data).then(r => r.data),
    onSuccess: () => {
      toast({ title: "Recurring expense updated!" });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
    },
    onError: (error) => {
      toast({ title: "Error updating recurring expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useToggleRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.put('/recurring-expenses/' + id + '/toggle').then(r => r.data),
    onSuccess: (data) => {
      toast({ title: data.isActive ? "Recurring expense resumed" : "Recurring expense paused" });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
    },
    onError: (error) => {
      toast({ title: "Error toggling recurring expense", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete('/recurring-expenses/' + id),
    onSuccess: () => {
      toast({ title: "Recurring expense deleted." });
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringExpenses.all });
    },
    onError: (error) => {
      toast({ title: "Error deleting recurring expense", description: error.message, variant: "destructive" });
    },
  });
}
