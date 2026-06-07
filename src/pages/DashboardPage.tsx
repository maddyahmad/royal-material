import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/helpers';
import {
  ShoppingCart,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Plus,
  BookOpen,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface DashboardData {
  totalSales: number;
  totalPurchases: number;
  receivable: number;
  payable: number;
  recentSales: any[];
  stockItems: any[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData>({
    totalSales: 0,
    totalPurchases: 0,
    receivable: 0,
    payable: 0,
    recentSales: [],
    stockItems: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const [salesRes, purchasesRes, stockRes, recentRes] = await Promise.all([
      supabase.from('sales').select('total_amount, amount_paid').eq('user_id', user!.id),
      supabase.from('purchases').select('total_amount, amount_paid').eq('user_id', user!.id),
      supabase.from('stock_summary').select('*').eq('user_id', user!.id),
      supabase.from('sales').select('*, customers(name)').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(5),
    ]);

    const sales = salesRes.data || [];
    const purchases = purchasesRes.data || [];

    const totalSales = sales.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
    const totalPurchases = purchases.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
    const receivable = sales.reduce((s: number, r: any) => s + (Number(r.total_amount) - Number(r.amount_paid)), 0);
    const payable = purchases.reduce((s: number, r: any) => s + (Number(r.total_amount) - Number(r.amount_paid)), 0);

    setData({
      totalSales,
      totalPurchases,
      receivable,
      payable,
      recentSales: recentRes.data || [],
      stockItems: stockRes.data || [],
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    { label: t('totalSales'), value: data.totalSales, icon: ShoppingCart, color: 'bg-emerald-50 text-emerald-600', arrow: ArrowUpRight },
    { label: t('totalPurchases'), value: data.totalPurchases, icon: ShoppingBag, color: 'bg-blue-50 text-blue-600', arrow: ArrowDownRight },
    { label: t('outstandingReceivable'), value: data.receivable, icon: TrendingUp, color: 'bg-amber-50 text-amber-600', arrow: ArrowUpRight },
    { label: t('outstandingPayable'), value: data.payable, icon: TrendingDown, color: 'bg-red-50 text-red-600', arrow: ArrowDownRight },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('welcome')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('appTagline')}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, arrow: Arrow }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                <Icon size={20} />
              </div>
              <Arrow size={16} className="text-slate-400" />
            </div>
            <div className="mt-3">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-800 mt-0.5">{formatCurrency(value)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">{t('quickActions')}</h2>
          <div className="space-y-2">
            <Link
              to="/sales/new"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              {t('newSale')}
            </Link>
            <Link
              to="/purchases/new"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              {t('newPurchase')}
            </Link>
            <Link
              to="/customers/new"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-sm font-medium"
            >
              <Users size={18} />
              {t('addCustomer')}
            </Link>
            <Link
              to="/ledger"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-medium"
            >
              <BookOpen size={18} />
              {t('viewLedger')}
            </Link>
          </div>
        </div>

        {/* Recent Sales */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">{t('recentActivity')}</h2>
          {data.recentSales.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">{t('noSales')}</p>
          ) : (
            <div className="space-y-3">
              {data.recentSales.map((sale: any) => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{sale.customers?.name || 'N/A'}</p>
                    <p className="text-xs text-slate-400">{new Date(sale.created_at).toLocaleDateString('en-IN')}</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600">{formatCurrency(sale.total_amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock Overview */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">{t('stockOverview')}</h2>
          {data.stockItems.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">{t('noStock')}</p>
          ) : (
            <div className="space-y-3">
              {data.stockItems.slice(0, 6).map((item: any) => (
                <div key={item.material_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{item.material_name}</p>
                    <p className="text-xs text-slate-400">{item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${Number(item.current_stock) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {item.current_stock} {item.unit}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/stock" className="flex items-center gap-1 mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
            <Package size={14} />
            {t('viewAllStock')}
          </Link>
        </div>
      </div>
    </div>
  );
}
