export const queryKeys = {
  profile: {
    all: ['profile'],
    me: () => [...queryKeys.profile.all, 'me'],
    accounts: () => [...queryKeys.profile.all, 'accounts'],
    approvalStatus: () => [...queryKeys.profile.all, 'approval-status'],
  },

  settings: {
    all: ['settings'],
    full: () => [...queryKeys.settings.all, 'full'],
    public: () => [...queryKeys.settings.all, 'public'],
  },

  clients: {
    all: ['clients'],
    list: (filters) => [...queryKeys.clients.all, 'list', filters],
    detail: (id) => [...queryKeys.clients.all, 'detail', id],
    catalog: () => [...queryKeys.clients.all, 'catalog'],
    notes: (clientId) => [...queryKeys.clients.all, 'notes', clientId],
  },

  products: {
    all: ['products'],
    list: (filters) => [...queryKeys.products.all, 'list', filters],
    catalog: () => [...queryKeys.products.all, 'catalog'],
  },

  quotes: {
    all: ['quotes'],
    list: (filters) => [...queryKeys.quotes.all, 'list', filters],
    detail: (id) => [...queryKeys.quotes.all, 'detail', id],
    catalog: () => [...queryKeys.quotes.all, 'catalog'],
    byClient: (clientId) => [...queryKeys.quotes.all, 'byClient', clientId],
  },

  invoices: {
    all: ['invoices'],
    list: (filters) => [...queryKeys.invoices.all, 'list', filters],
    detail: (id) => [...queryKeys.invoices.all, 'detail', id],
    catalog: () => [...queryKeys.invoices.all, 'catalog'],
    byClient: (clientId) => [...queryKeys.invoices.all, 'byClient', clientId],
  },

  projectTypes: {
    all: ['projectTypes'],
    list: () => ['projectTypes', 'list'],
  },

  projectRoles: {
    all: ['projectRoles'],
    list: () => ['projectRoles', 'list'],
  },

  projects: {
    all: ['projects'],
    list: (filters) => [...queryKeys.projects.all, 'list', filters],
    detail: (id) => [...queryKeys.projects.all, 'detail', id],
    catalog: () => [...queryKeys.projects.all, 'catalog'],
    byClient: (clientId) => [...queryKeys.projects.all, 'byClient', clientId],
    notes: (projectId) => [...queryKeys.projects.all, 'notes', projectId],
  },

  users: {
    all: ['users'],
    list: () => [...queryKeys.users.all, 'list'],
    pendingCount: () => [...queryKeys.users.all, 'pending-count'],
  },

  credits: {
    all: ['credits'],
    byClient: (clientId) => [...queryKeys.credits.all, 'byClient', clientId],
  },

  activityLog: {
    all: ['activity-log'],
    list: (filters) => [...queryKeys.activityLog.all, 'list', filters],
  },

  stats: {
    all: ['stats'],
    dashboard: () => ['stats', 'dashboard'],
  },

  team: {
    all: ['team'],
    list: () => [...queryKeys.team.all, 'list'],
    detail: (id) => [...queryKeys.team.all, 'detail', id],
    me: () => [...queryKeys.team.all, 'me'],
    unlinked: () => [...queryKeys.team.all, 'unlinked'],
  },

  assignments: {
    all: ['assignments'],
    byProject: (projectId) => [...queryKeys.assignments.all, 'byProject', projectId],
    byMember: (memberId) => [...queryKeys.assignments.all, 'byMember', memberId],
  },

  teamPayments: {
    all: ['team-payments'],
    byProject: (projectId) => [...queryKeys.teamPayments.all, 'byProject', projectId],
    byMember: (memberId) => [...queryKeys.teamPayments.all, 'byMember', memberId],
  },

  calendar: {
    all: ['calendar'],
    range: (start, end, teamMemberId) => ['calendar', start, end, teamMemberId],
  },

  expenses: {
    all: ['expenses'],
    list: (filters) => [...queryKeys.expenses.all, 'list', filters],
    stats: () => [...queryKeys.expenses.all, 'stats'],
  },

  expenseCategories: {
    all: ['expense-categories'],
    list: () => [...queryKeys.expenseCategories.all, 'list'],
  },

  recurringExpenses: {
    all: ['recurring-expenses'],
    list: () => [...queryKeys.recurringExpenses.all, 'list'],
  },

  teamAdvances: {
    all: ['team-advances'],
    list: (filters) => [...queryKeys.teamAdvances.all, 'list', filters],
    balance: (teamMemberId) => [...queryKeys.teamAdvances.all, 'balance', teamMemberId],
  },

  teamSalary: {
    all: ['team-salary'],
    list: (filters) => [...queryKeys.teamSalary.all, 'list', filters],
    balance: (teamMemberId) => [...queryKeys.teamSalary.all, 'balance', teamMemberId],
  },

  permissions: {
    all: ['permissions'],
    keys: () => ['permissions', 'keys'],
    defaults: () => ['permissions', 'defaults'],
    user: (userId) => ['permissions', 'user', userId],
  },

  backups: {
    all: ['backups'],
    config: () => ['backups', 'config'],
    history: () => ['backups', 'history'],
  },

  verification: {
    check: (email) => ['verification', 'check', email],
  },

  hub: {
    all: ['hub'],
    list: (filters) => [...queryKeys.hub.all, 'list', filters],
    detail: (id) => [...queryKeys.hub.all, 'detail', id],
  },
};
