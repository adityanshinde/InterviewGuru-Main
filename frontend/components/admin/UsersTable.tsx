import { useState } from 'react';
import { 
  Search, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Eye,
  Edit,
  Ban,
  MoreHorizontal,
  Filter,
  X
} from 'lucide-react';

export interface UserRow {
  userId: string;
  email: string;
  plan: string;
  subscriptionStatus: string;
  voiceMinutesUsed: number;
  chatMessagesUsed: number;
  sessionsUsed: number;
  createdAt: string;
  isBanned: boolean;
}

interface UsersTableProps {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onSearch: (search: string) => void;
  onFilter: (filters: { plan?: string; status?: string }) => void;
  onSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onViewUser: (userId: string) => void;
  onEditPlan: (userId: string) => void;
  onBanUser: (userId: string, banned: boolean) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

const planColors: Record<string, string> = {
  free: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  basic: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pro: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  enterprise: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  trial: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  expired: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function UsersTable({
  users,
  total,
  page,
  limit,
  totalPages,
  loading = false,
  onPageChange,
  onSearch,
  onFilter,
  onSort,
  onViewUser,
  onEditPlan,
  onBanUser,
  sortBy,
  sortOrder,
}: UsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const handleSearch = () => {
    onSearch(searchTerm);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      onSort(column, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(column, 'desc');
    }
  };

  const handleFilterApply = () => {
    onFilter({
      plan: planFilter !== 'all' ? planFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    });
    setShowFilters(false);
  };

  const SortIndicator = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
          >
            Search
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showFilters || planFilter !== 'all' || statusFilter !== 'all'
                ? 'bg-purple-500/10 border border-purple-500/20 text-purple-400'
                : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Filter size={16} />
            Filters
            {(planFilter !== 'all' || statusFilter !== 'all') && (
              <span className="w-4 h-4 rounded-full bg-purple-500 text-[10px] font-bold flex items-center justify-center text-white">
                {(planFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-400">Plan:</label>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <button
            onClick={handleFilterApply}
            className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-colors"
          >
            Apply Filters
          </button>

          {(planFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setPlanFilter('all');
                setStatusFilter('all');
                onFilter({});
              }}
              className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th 
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('email')}
              >
                <div className="flex items-center gap-1">
                  User
                  <SortIndicator column="email" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('plan')}
              >
                <div className="flex items-center gap-1">
                  Plan
                  <SortIndicator column="plan" />
                </div>
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Status
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('chat_messages_used')}
              >
                <div className="flex items-center gap-1">
                  Usage
                  <SortIndicator column="chat_messages_used" />
                </div>
              </th>
              <th 
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-1">
                  Joined
                  <SortIndicator column="created_at" />
                </div>
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5 animate-pulse">
                  <td className="px-4 py-4">
                    <div className="h-4 w-40 bg-white/10 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-16 bg-white/10 rounded-full" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-16 bg-white/10 rounded-full" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-24 bg-white/10 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-20 bg-white/10 rounded" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-4 w-8 bg-white/10 rounded ml-auto" />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr 
                  key={user.userId} 
                  className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
                    user.isBanned ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {user.email[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white truncate max-w-[200px]">
                          {user.email}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                          {user.userId.slice(0, 20)}...
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${planColors[user.plan] || planColors.free}`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${statusColors[user.subscriptionStatus] || statusColors.trial}`}>
                      {user.isBanned ? 'Banned' : user.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <div>{user.chatMessagesUsed} msgs</div>
                      <div>{user.voiceMinutesUsed} mins</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-xs text-slate-400">
                      {formatDate(user.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === user.userId ? null : user.userId)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openDropdown === user.userId && (
                        <>
                          <div 
                            className="fixed inset-0 z-40"
                            onClick={() => setOpenDropdown(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-36 py-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50">
                            <button
                              onClick={() => {
                                onViewUser(user.userId);
                                setOpenDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                              <Eye size={14} />
                              View Details
                            </button>
                            <button
                              onClick={() => {
                                onEditPlan(user.userId);
                                setOpenDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                              <Edit size={14} />
                              Edit Plan
                            </button>
                            <button
                              onClick={() => {
                                onBanUser(user.userId, !user.isBanned);
                                setOpenDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Ban size={14} />
                              {user.isBanned ? 'Unban User' : 'Ban User'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} users
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  page === pageNum
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'hover:bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
