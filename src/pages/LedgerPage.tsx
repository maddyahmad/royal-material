import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatDate } from '../lib/helpers';
import { BookOpen, Filter, RotateCcw } from 'lucide-react';

interface LedgerEntry {
  id: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  entry_date: string;
  created_at: string;
}

export default function LedgerPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (user) loadEntries();
  }, [user]);

  const loadEntries = async () => {
    let query = supabase.from('ledger_entries').select('*').eq('user_id', user!.id).order('entry_date', { ascending: false }).order('created_at', { ascending: false });

    if (fromDate) query = query.gte('entry_date', fromDate);
    if (toDate) query = query.lte('entry_date', toDate);

    const { data } = await query;
    setEntries(data || []);
    setLoading(false);
  };

  const applyFilter = () => {
    setLoading(true);
    loadEntries();
  };

  const resetFilter = () => {
    setFromDate('');
    setToDate('');
    setLoading(true);
    setTimeout(() => loadEntries(), 50);
  };

  const totalDebit = entries.filter(e => e.entry_type === 'debit').reduce((s, e) => s + Number(e.amount), 0);
  const totalCredit = entries.filter(e => e.entry_type === 'credit').reduce((s, e) => s + Number(e.amount), 0);
  const netBalance = totalCredit - totalDebit;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('ledgerReport')}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{t('ledgerReport')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">{t('totalDebit')}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalDebit)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">{t('totalCredit')}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalCredit)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500">{t('netBalance')}</p>
          <p className={`text-2xl font-bold mt-1 ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(netBalance))} {netBalance >= 0 ? 'CR' : 'DR'}
          </p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('fromDate')}</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('toDate')}</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <button onClick={applyFilter} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Filter size={14} />
            {t('apply')}
          </button>
          <button onClick={resetFilter} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            <RotateCcw size={14} />
            {t('reset')}
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <BookOpen className="mx-auto text-slate-300" size={48} />
          <p className="text-slate-500 mt-3">{t('noEntries')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('date')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('description')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('type')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('debit')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('credit')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('balance')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let runningBalance = 0;
                  // We need to sort entries by date ascending for running balance
                  const sorted = [...entries].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
                  return sorted.map(entry => {
                    if (entry.entry_type === 'credit') {
                      runningBalance += Number(entry.amount);
                    } else {
                      runningBalance -= Number(entry.amount);
                    }
                    const currentBalance = runningBalance;
                    return (
                      <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700">{formatDate(entry.entry_date)}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.description || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            entry.entry_type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {entry.entry_type === 'debit' ? t('debit') : t('credit')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">
                          {entry.entry_type === 'debit' ? formatCurrency(entry.amount) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                          {entry.entry_type === 'credit' ? formatCurrency(entry.amount) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={currentBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                            {formatCurrency(Math.abs(currentBalance))} {currentBalance >= 0 ? 'CR' : 'DR'}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
