import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatDate } from '../lib/helpers';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Users,
  Eye,
  ArrowLeft,
  Phone,
  MapPin,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
  created_at: string;
}

interface CustomerSale {
  id: string;
  total_amount: number;
  amount_paid: number;
  sale_date: string;
  invoice_number: string | null;
  created_at: string;
  sale_items: {
    id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    materials: { name: string; unit: string } | null;
  }[];
}

interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  details: any;
  created_at: string;
}

export default function CustomersPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<{
    info: Customer;
    sales: CustomerSale[];
    activity: ActivityEntry[];
    totalPurchased: number;
    totalPaid: number;
    totalDue: number;
  } | null>(null);

  const [form, setForm] = useState({ name: '', mobile: '', address: '' });

  useEffect(() => {
    if (user) loadCustomers();
  }, [user]);

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('*').eq('user_id', user!.id).order('name');
    setCustomers(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ name: '', mobile: '', address: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await supabase.from('customers').update({
        name: form.name,
        mobile: form.mobile,
        address: form.address || null,
      }).eq('id', editing.id);
    } else {
      await supabase.from('customers').insert({
        name: form.name,
        mobile: form.mobile,
        address: form.address || null,
        user_id: user!.id,
      });
    }
    resetForm();
    loadCustomers();
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({ name: customer.name, mobile: customer.mobile, address: customer.address || '' });
    setShowForm(true);
  };

  const openProfile = async (customer: Customer) => {
    const [salesRes, activityRes] = await Promise.all([
      supabase.from('sales').select('*, sale_items(id, quantity, unit_price, total_price, materials(name, unit))').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('activity_log').select('*').eq('details->>customer_id', customer.id).order('created_at', { ascending: false }).limit(20),
    ]);

    // Also get activity for this customer's sales
    const salesData = (salesRes.data || []) as CustomerSale[];
    const totalPurchased = salesData.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPaid = salesData.reduce((s, r) => s + Number(r.amount_paid), 0);

    setViewCustomer({
      info: customer,
      sales: salesData,
      activity: (activityRes.data || []) as ActivityEntry[],
      totalPurchased,
      totalPaid,
      totalDue: totalPurchased - totalPaid,
    });
  };

  const handleDelete = async (id: string) => {
    await supabase.from('customers').delete().eq('id', id);
    loadCustomers();
  };

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.mobile.includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Customer Profile View
  if (viewCustomer) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <button onClick={() => setViewCustomer(null)} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 text-sm">
          <ArrowLeft size={18} />
          {t('back')}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Info Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-blue-700 font-bold text-lg">{viewCustomer.info.name.charAt(0).toUpperCase()}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">{viewCustomer.info.name}</h2>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={14} />
                {viewCustomer.info.mobile}
              </div>
              {viewCustomer.info.address && (
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0" />
                  {viewCustomer.info.address}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400">{t('totalPurchased')}</p>
                <p className="text-lg font-bold text-slate-800">{formatCurrency(viewCustomer.totalPurchased)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-xs text-emerald-500">{t('totalPaid')}</p>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(viewCustomer.totalPaid)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs text-red-400">{t('totalDue')}</p>
                <p className="text-lg font-bold text-red-700">{formatCurrency(viewCustomer.totalDue)}</p>
              </div>
            </div>
          </div>

          {/* Sales & Activity */}
          <div className="lg:col-span-2 space-y-6">
            {/* Sales History */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">{t('saleHistory')}</h3>
              {viewCustomer.sales.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">{t('noSales')}</p>
              ) : (
                <div className="space-y-3">
                  {viewCustomer.sales.map(sale => (
                    <div key={sale.id} className="border border-slate-100 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-mono text-slate-400">{sale.invoice_number}</span>
                          <p className="text-sm text-slate-600">{formatDate(sale.sale_date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-800">{formatCurrency(sale.total_amount)}</p>
                          <p className="text-xs text-emerald-600">{formatCurrency(sale.amount_paid)} {t('paid')}</p>
                        </div>
                      </div>
                      {sale.sale_items.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                          {sale.sale_items.map((item: any) => (
                            <div key={item.id} className="flex justify-between text-xs text-slate-500">
                              <span>{item.materials?.name} x {item.quantity} {item.materials?.unit}</span>
                              <span>{formatCurrency(item.total_price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2">
                        <button
                          onClick={() => navigate(`/sales/invoice/${sale.id}`)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View Invoice
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('customers')}</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          {t('addCustomerTitle')}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchCustomers')}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Customer Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? t('editCustomer') : t('addCustomerTitle')}</h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('customerName')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('customerMobile')}</label>
                <input
                  type="text"
                  value={form.mobile}
                  onChange={e => setForm(prev => ({ ...prev, mobile: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('customerAddress')}</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">{t('save')}</button>
                <button type="button" onClick={resetForm} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="mx-auto text-slate-300" size={48} />
          <p className="text-slate-500 mt-3">{t('noCustomers')}</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-3 text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            {t('addCustomerTitle')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-blue-700 font-bold text-sm">{c.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.mobile}</p>
                  </div>
                </div>
              </div>
              {c.address && <p className="text-xs text-slate-400 mt-2 ml-13">{c.address}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => openProfile(c)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  <Eye size={14} />
                  {t('viewProfile')}
                </button>
                <button onClick={() => openEdit(c)} className="px-3 py-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(c.id)} className="px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
