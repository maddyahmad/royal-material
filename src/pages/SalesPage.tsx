import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatDate, generateInvoiceNumber } from '../lib/helpers';
import {
  Plus,
  Trash2,
  X,
  ShoppingCart,
  Search,
  FileText,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  mobile: string;
  address: string | null;
}

interface Material {
  id: string;
  name: string;
  unit: string;
}

interface SaleItem {
  id?: string;
  material_id: string;
  quantity: string;
  unit_price: string;
  total_price: number;
}

interface Sale {
  id: string;
  customer_id: string | null;
  total_amount: number;
  amount_paid: number;
  payment_method: string | null;
  sale_date: string;
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
  customers?: { name: string; mobile: string } | null;
  sale_items?: {
    id: string;
    material_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    materials?: { name: string; unit: string } | null;
  }[] | null;
}

export default function SalesPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    customer_id: '',
    amount_paid: '0',
    payment_method: 'cash',
    sale_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [items, setItems] = useState<SaleItem[]>([
    { material_id: '', quantity: '', unit_price: '', total_price: 0 },
  ]);

  const [customerForm, setCustomerForm] = useState({ name: '', mobile: '', address: '' });

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const [sRes, cRes, mRes] = await Promise.all([
      supabase.from('sales').select('*, customers(name, mobile), sale_items(id, material_id, quantity, unit_price, total_price, materials(name, unit))').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('user_id', user!.id).order('name'),
      supabase.from('materials').select('*').eq('user_id', user!.id).order('name'),
    ]);
    setSales(sRes.data || []);
    setCustomers(cRes.data || []);
    setMaterials(mRes.data || []);
    setLoading(false);
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);

  const updateItem = (index: number, field: keyof SaleItem, value: string) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        const qty = parseFloat(updated[index].quantity) || 0;
        const price = parseFloat(updated[index].unit_price) || 0;
        updated[index].total_price = qty * price;
      }
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, { material_id: '', quantity: '', unit_price: '', total_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const resetForm = () => {
    setForm({ customer_id: '', amount_paid: '0', payment_method: 'cash', sale_date: new Date().toISOString().split('T')[0], notes: '' });
    setItems([{ material_id: '', quantity: '', unit_price: '', total_price: 0 }]);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const paid = parseFloat(form.amount_paid) || 0;
    const invoiceNumber = generateInvoiceNumber();

    const { data: sale, error } = await supabase.from('sales').insert({
      customer_id: form.customer_id || null,
      total_amount: totalAmount,
      amount_paid: paid,
      payment_method: form.payment_method,
      sale_date: form.sale_date,
      invoice_number: invoiceNumber,
      notes: form.notes || null,
      user_id: user!.id,
    }).select().single();

    if (error) return;
    if (!sale) return;

    // Insert sale items
    const saleItemsData = items
      .filter(item => item.material_id && item.total_price > 0)
      .map(item => ({
        sale_id: sale.id,
        material_id: item.material_id,
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        total_price: item.total_price,
      }));

    if (saleItemsData.length > 0) {
      await supabase.from('sale_items').insert(saleItemsData);
    }

    // Create ledger entries
    const ledgerEntries: any[] = [
      {
        user_id: user!.id,
        entry_type: 'credit',
        amount: totalAmount,
        reference_type: 'sale',
        reference_id: sale.id,
        description: `Sale #${invoiceNumber}`,
        entry_date: form.sale_date,
      },
    ];
    if (paid > 0) {
      ledgerEntries.push({
        user_id: user!.id,
        entry_type: 'debit',
        amount: paid,
        reference_type: 'sale',
        reference_id: sale.id,
        description: `Payment received for Sale #${invoiceNumber}`,
        entry_date: form.sale_date,
      });
    }
    await supabase.from('ledger_entries').insert(ledgerEntries);

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: user!.id,
      action: 'create',
      entity_type: 'sale',
      entity_id: sale.id,
      details: { invoice: invoiceNumber, amount: totalAmount, customer: form.customer_id },
    });

    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('ledger_entries').delete().eq('reference_id', id).eq('reference_type', 'sale');
    await supabase.from('sale_items').delete().eq('sale_id', id);
    await supabase.from('sales').delete().eq('id', id);
    loadData();
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await supabase.from('customers').insert({
      name: customerForm.name,
      mobile: customerForm.mobile,
      address: customerForm.address || null,
      user_id: user!.id,
    }).select().single();
    if (data) {
      setCustomers(prev => [...prev, data]);
      setForm(prev => ({ ...prev, customer_id: data.id }));
    }
    setCustomerForm({ name: '', mobile: '', address: '' });
    setShowCustomerForm(false);
  };

  const openInvoice = (sale: Sale) => {
    navigate(`/sales/invoice/${sale.id}`);
  };

  const filtered = sales.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.customers?.name || '').toLowerCase().includes(q) ||
      (s.customers?.mobile || '').includes(q) ||
      (s.invoice_number || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('sales')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('saleHistory')}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <Plus size={18} />
          {t('addSale')}
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
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
        />
      </div>

      {/* Sale Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{t('addSale')}</h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('customer')}</label>
                <div className="flex gap-2">
                  <select
                    value={form.customer_id}
                    onChange={e => setForm(prev => ({ ...prev, customer_id: e.target.value }))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  >
                    <option value="">{t('selectCustomer')}</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} - {c.mobile}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowCustomerForm(!showCustomerForm)}
                    className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {showCustomerForm && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
                    <input type="text" placeholder={t('customerName')} value={customerForm.name} onChange={e => setCustomerForm(prev => ({ ...prev, name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" required />
                    <input type="text" placeholder={t('customerMobile')} value={customerForm.mobile} onChange={e => setCustomerForm(prev => ({ ...prev, mobile: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" required />
                    <input type="text" placeholder={t('customerAddress')} value={customerForm.address} onChange={e => setCustomerForm(prev => ({ ...prev, address: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <button type="button" onClick={handleAddCustomer} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm hover:bg-emerald-700">{t('save')}</button>
                  </div>
                )}
              </div>

              {/* Sale Items */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t('items')}</label>
                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <select
                          value={item.material_id}
                          onChange={e => updateItem(idx, 'material_id', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          required
                        >
                          <option value="">{t('selectMaterial')}</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={t('quantity')}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          required
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={t('unitPrice')}
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          required
                        />
                      </div>
                      <div className="col-span-1">
                        <span className="text-sm font-medium text-slate-700 py-2.5 block text-right">
                          {formatCurrency(item.total_price)}
                        </span>
                      </div>
                      <div className="col-span-1">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItem} className="mt-2 flex items-center gap-1 text-emerald-600 text-sm font-medium hover:text-emerald-700">
                  <Plus size={16} />
                  {t('addItem')}
                </button>
              </div>

              {/* Totals */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">{t('totalAmount')}</span>
                  <span className="font-bold text-slate-800 text-lg">{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('amountPaid')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount_paid}
                    onChange={e => setForm(prev => ({ ...prev, amount_paid: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentMethod')}</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="cash">{t('cash')}</option>
                    <option value="upi">{t('upi')}</option>
                    <option value="bank_transfer">{t('bankTransfer')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('saleDate')}</label>
                <input
                  type="date"
                  value={form.sale_date}
                  onChange={e => setForm(prev => ({ ...prev, sale_date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">{t('save')}</button>
                <button type="button" onClick={resetForm} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">{t('cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sales Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ShoppingCart className="mx-auto text-slate-300" size={48} />
          <p className="text-slate-500 mt-3">{t('noSales')}</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-3 text-emerald-600 text-sm font-medium hover:text-emerald-700"
          >
            {t('addSale')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('invoiceNo')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('date')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('customer')}</th>
                  <th className="text-center px-4 py-3 text-slate-600 font-medium">{t('items')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('totalAmount')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('amountPaid')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('amountDue')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('paymentMethod')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">{s.invoice_number || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(s.sale_date)}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-slate-700 font-medium">{s.customers?.name || '-'}</p>
                        <p className="text-xs text-slate-400">{s.customers?.mobile || ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{s.sale_items?.length || 0}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium text-right">{formatCurrency(s.total_amount)}</td>
                    <td className="px-4 py-3 text-emerald-600 text-right">{formatCurrency(s.amount_paid)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={Number(s.total_amount) - Number(s.amount_paid) > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}>
                        {formatCurrency(Number(s.total_amount) - Number(s.amount_paid))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{s.payment_method?.replace('_', ' ') || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openInvoice(s)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title={t('generateInvoice')}><FileText size={15} /></button>
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
