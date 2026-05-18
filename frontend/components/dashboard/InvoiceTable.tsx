export interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  downloadUrl?: string;
}

interface InvoiceTableProps {
  invoices: Invoice[];
  loading?: boolean;
}

const statusColors = {
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export function InvoiceTable({ invoices, loading }: InvoiceTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-slate-800/50 rounded-lg h-16" />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-xl">
        <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-slate-400">No invoices yet</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Date</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Invoice ID</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Amount</th>
            <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Status</th>
            <th className="px-6 py-4 text-right text-sm font-semibold text-slate-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
              <td className="px-6 py-4 text-sm text-white">
                {formatDate(invoice.date)}
              </td>
              <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                {invoice.id}
              </td>
              <td className="px-6 py-4 text-sm text-white font-medium">
                {formatAmount(invoice.amount, invoice.currency)}
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${statusColors[invoice.status]}`}>
                  {invoice.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                {invoice.downloadUrl && (
                  <a
                    href={invoice.downloadUrl}
                    className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
