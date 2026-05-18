import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import AdminLayout from '@frontend/components/admin/AdminLayout';
import UsersTable, { UserRow } from '@frontend/components/admin/UsersTable';
import UserModal from '@frontend/components/admin/UserModal';
import { useApiAuthHeaders } from '@frontend/providers/ApiAuthContext';

interface FetchParams {
  page: number;
  limit: number;
  search: string;
  plan: string;
  status: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [params, setParams] = useState<FetchParams>({
    page: 1,
    limit: 10,
    search: '',
    plan: 'all',
    status: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    userId: string | null;
    mode: 'view' | 'edit';
  }>({
    isOpen: false,
    userId: null,
    mode: 'view',
  });

  const getAuthHeaders = useApiAuthHeaders();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const headers = await getAuthHeaders();
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        limit: params.limit.toString(),
        ...(params.search && { search: params.search }),
        ...(params.plan !== 'all' && { plan: params.plan }),
        ...(params.status !== 'all' && { status: params.status }),
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
      
      const response = await fetch(`/api/admin/users?${queryParams}`, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have admin access');
        }
        throw new Error('Failed to fetch users');
      }
      
      const data = await response.json();
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [params, getAuthHeaders]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handlePageChange = (page: number) => {
    setParams(prev => ({ ...prev, page }));
  };

  const handleSearch = (search: string) => {
    setParams(prev => ({ ...prev, search, page: 1 }));
  };

  const handleFilter = (filters: { plan?: string; status?: string }) => {
    setParams(prev => ({
      ...prev,
      plan: filters.plan || 'all',
      status: filters.status || 'all',
      page: 1,
    }));
  };

  const handleSort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setParams(prev => ({ ...prev, sortBy, sortOrder }));
  };

  const handleViewUser = (userId: string) => {
    setModalState({ isOpen: true, userId, mode: 'view' });
  };

  const handleEditPlan = (userId: string) => {
    setModalState({ isOpen: true, userId, mode: 'edit' });
  };

  const handleCloseModal = () => {
    setModalState({ isOpen: false, userId: null, mode: 'view' });
  };

  const handleSavePlan = async (userId: string, newPlan: string) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/admin/users/${userId}/plan`, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: newPlan }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update plan');
    }
    
    await fetchUsers();
  };

  const handleBanUser = async (userId: string, banned: boolean) => {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ banned }),
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update ban status');
    }
    
    await fetchUsers();
  };

  if (error && !users.length) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-rose-400 text-lg font-medium mb-2">{error}</div>
            <button
              onClick={fetchUsers}
              className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="text-blue-400" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Users Management</h1>
              <p className="text-sm text-slate-400">
                {total} total users
              </p>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <UsersTable
          users={users}
          total={total}
          page={params.page}
          limit={params.limit}
          totalPages={totalPages}
          loading={loading}
          onPageChange={handlePageChange}
          onSearch={handleSearch}
          onFilter={handleFilter}
          onSort={handleSort}
          onViewUser={handleViewUser}
          onEditPlan={handleEditPlan}
          onBanUser={handleBanUser}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
        />

        {/* User Modal */}
        <UserModal
          isOpen={modalState.isOpen}
          userId={modalState.userId}
          mode={modalState.mode}
          onClose={handleCloseModal}
          onSave={handleSavePlan}
          onBan={handleBanUser}
          getAuthHeaders={getAuthHeaders}
        />
      </div>
    </AdminLayout>
  );
}
