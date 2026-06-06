import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatCurrency, formatDate } from '../lib/helpers';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ShoppingBag,
  Search,
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  mobile: string | null;
  address: string | null;
}

interface Material {
  id: string;
  name: string;
  unit: string;
}

interface Purchase {
  id: string;
  supplier_id: string | null;
  material_id: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string | null;
  purchase_date: string;
  notes: string | null;
  created_at: string;
  suppliers?: { name: string } | null;
  materials?: { name: string; unit: string } | null;
}

export default function PurchasesPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [search, setSearch] = useState('');

  // Form state
  const [form, setForm] = useState({
    supplier_id: '',
    material_id: '',
    quantity: '',
    unit_price: '',
    amount_paid: '0',
    payment_method: 'cash',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [supplierForm, setSupplierForm] = useState({ name: '', mobile: '', address: '' });
  const [materialForm, setMaterialForm] = useState({ name: '', unit: 'unit' });

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    const [pRes, sRes, mRes] = await Promise.all([
      supabase.from('purchases').select('*, suppliers(name), materials(name, unit)').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('user_id', user!.id).order('name'),
      supabase.from('materials').select('*').eq('user_id', user!.id).order('name'),
    ]);
    setPurchases(pRes.data || []);
    setSuppliers(sRes.data || []);
    setMaterials(mRes.data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ supplier_id: '', material_id: '', quantity: '', unit_price: '', amount_paid: '0', payment_method: 'cash', purchase_date: new Date().toISOString().split('T')[0], notes: '' });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(form.quantity) || 0;
    const price = parseFloat(form.unit_price) || 0;
    const total = qty * price;
    const paid = parseFloat(form.amount_paid) || 0;

    const payload = {
      supplier_id: form.supplier_id || null,
      material_id: form.material_id || null,
      quantity: qty,
      unit_price: price,
      total_amount: total,
      amount_paid: paid,
      payment_method: form.payment_method,
      purchase_date: form.purchase_date,
      notes: form.notes || null,
      user_id: user!.id,
    };

    if (editing) {
      const { error } = await supabase.from('purchases').update(payload).eq('id', editing.id);
      if (!error) {
        // Update ledger
        await supabase.from('ledger_entries').update({
          amount: total,
          description: `Purchase: ${qty} x ${formatCurrency(price)}`,
          entry_date: form.purchase_date,
        }).eq('reference_id', editing.id).eq('reference_type', 'purchase');
        // Adjust for payment difference
        await supabase.from('ledger_entries').delete().eq('reference_id', editing.id).eq('reference_type', 'purchase').eq('description', 'Payment for purchase');
        if (paid > 0) {
          await supabase.from('ledger_entries').insert({
            user_id: user!.id,
            entry_type: 'credit',
            amount: paid,
            reference_type: 'purchase',
            reference_id: editing.id,
            description: 'Payment for purchase',
            entry_date: form.purchase_date,
          });
        }
      }
    } else {
      const { data, error } = await supabase.from('purchases').insert(payload).select().single();
      if (!error && data) {
        // Create ledger entries
        await supabase.from('ledger_entries').insert([
          {
            user_id: user!.id,
            entry_type: 'debit',
            amount: total,
            reference_type: 'purchase',
            reference_id: data.id,
            description: `Purchase: ${qty} x ${formatCurrency(price)}`,
            entry_date: form.purchase_date,
          },
          ...(paid > 0 ? [{
            user_id: user!.id,
            entry_type: 'credit',
            amount: paid,
            reference_type: 'purchase',
            reference_id: data.id,
            description: 'Payment for purchase',
            entry_date: form.purchase_date,
          }] : []),
        ]);

        // Log activity
        await supabase.from('activity_log').insert({
          user_id: user!.id,
          action: 'create',
          entity_type: 'purchase',
          entity_id: data.id,
          details: { amount: total, quantity: qty, material: form.material_id },
        });
      }
    }

    resetForm();
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('ledger_entries').delete().eq('reference_id', id).eq('reference_type', 'purchase');
    await supabase.from('purchases').delete().eq('id', id);
    await supabase.from('activity_log').insert({
      user_id: user!.id,
      action: 'delete',
      entity_type: 'purchase',
      entity_id: id,
    });
    loadData();
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await supabase.from('suppliers').insert({
      name: supplierForm.name,
      mobile: supplierForm.mobile || null,
      address: supplierForm.address || null,
      user_id: user!.id,
    }).select().single();
    if (data) {
      setSuppliers(prev => [...prev, data]);
      setForm(prev => ({ ...prev, supplier_id: data.id }));
    }
    setSupplierForm({ name: '', mobile: '', address: '' });
    setShowSupplierForm(false);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await supabase.from('materials').insert({
      name: materialForm.name,
      unit: materialForm.unit,
      user_id: user!.id,
    }).select().single();
    if (data) {
      setMaterials(prev => [...prev, data]);
      setForm(prev => ({ ...prev, material_id: data.id }));
    }
    setMaterialForm({ name: '', unit: 'unit' });
    setShowMaterialForm(false);
  };

  const openEdit = (purchase: Purchase) => {
    setEditing(purchase);
    setForm({
      supplier_id: purchase.supplier_id || '',
      material_id: purchase.material_id || '',
      quantity: String(purchase.quantity),
      unit_price: String(purchase.unit_price),
      amount_paid: String(purchase.amount_paid),
      payment_method: purchase.payment_method || 'cash',
      purchase_date: purchase.purchase_date,
      notes: purchase.notes || '',
    });
    setShowForm(true);
  };

  const filtered = purchases.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.suppliers?.name || '').toLowerCase().includes(q) ||
      (p.materials?.name || '').toLowerCase().includes(q) ||
      String(p.quantity).includes(q)
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
          <h1 className="text-2xl font-bold text-slate-800">{t('purchases')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{t('purchaseHistory')}</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          {t('addPurchase')}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search')}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Purchase Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{editing ? t('editPurchase') : t('addPurchase')}</h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Supplier select + add */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('supplier')}</label>
                <div className="flex gap-2">
                  <select
                    value={form.supplier_id}
                    onChange={e => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">{t('selectSupplier')}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowSupplierForm(!showSupplierForm)}
                    className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {showSupplierForm && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
                    <input
                      type="text"
                      placeholder={t('supplierName')}
                      value={supplierForm.name}
                      onChange={e => setSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder={t('supplierMobile')}
                      value={supplierForm.mobile}
                      onChange={e => setSupplierForm(prev => ({ ...prev, mobile: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <input
                      type="text"
                      placeholder={t('supplierAddress')}
                      value={supplierForm.address}
                      onChange={e => setSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="button" onClick={handleAddSupplier} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{t('save')}</button>
                  </div>
                )}
              </div>

              {/* Material select + add */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('material')}</label>
                <div className="flex gap-2">
                  <select
                    value={form.material_id}
                    onChange={e => setForm(prev => ({ ...prev, material_id: e.target.value }))}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    required
                  >
                    <option value="">{t('selectMaterial')}</option>
                    {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowMaterialForm(!showMaterialForm)}
                    className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {showMaterialForm && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
                    <input
                      type="text"
                      placeholder={t('materialName')}
                      value={materialForm.name}
                      onChange={e => setMaterialForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder={t('materialUnit')}
                      value={materialForm.unit}
                      onChange={e => setMaterialForm(prev => ({ ...prev, unit: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="button" onClick={handleAddMaterial} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">{t('save')}</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('quantity')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.quantity}
                    onChange={e => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('unitPrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_price}
                    onChange={e => setForm(prev => ({ ...prev, unit_price: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">{t('totalAmount')}</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_price) || 0))}
                  </span>
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
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentMethod')}</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="cash">{t('cash')}</option>
                    <option value="upi">{t('upi')}</option>
                    <option value="bank_transfer">{t('bankTransfer')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('purchaseDate')}</label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={e => setForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
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

      {/* Purchases Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ShoppingBag className="mx-auto text-slate-300" size={48} />
          <p className="text-slate-500 mt-3">{t('noPurchases')}</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-3 text-blue-600 text-sm font-medium hover:text-blue-700"
          >
            {t('addPurchase')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('date')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('supplier')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('material')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('quantity')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('unitPrice')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('totalAmount')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('amountPaid')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('amountDue')}</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-medium">{t('paymentMethod')}</th>
                  <th className="text-right px-4 py-3 text-slate-600 font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700">{formatDate(p.purchase_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{p.suppliers?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{p.materials?.name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700 text-right">{p.quantity} {p.materials?.unit || ''}</td>
                    <td className="px-4 py-3 text-slate-700 text-right">{formatCurrency(p.unit_price)}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium text-right">{formatCurrency(p.total_amount)}</td>
                    <td className="px-4 py-3 text-emerald-600 text-right">{formatCurrency(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={Number(p.total_amount) - Number(p.amount_paid) > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}>
                        {formatCurrency(Number(p.total_amount) - Number(p.amount_paid))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{p.payment_method?.replace('_', ' ') || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Pencil size={15} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
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
