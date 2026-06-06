import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Package } from 'lucide-react';

interface StockItem {
  material_id: string;
  user_id: string;
  material_name: string;
  unit: string;
  total_purchased: number;
  total_sold: number;
  current_stock: number;
}

export default function StockPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadStock();
  }, [user]);

  const loadStock = async () => {
    const { data } = await supabase.from('stock_summary').select('*').eq('user_id', user!.id);
    setStock(data || []);
    setLoading(false);
  };

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
        <h1 className="text-2xl font-bold text-slate-800">{t('stockSummary')}</h1>
      </div>

      {stock.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Package className="mx-auto text-slate-300" size={48} />
          <p className="text-slate-500 mt-3">{t('noStock')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stock.map(item => {
            const stockValue = Number(item.current_stock);
            const isLow = stockValue > 0 && stockValue <= 10;
            const isEmpty = stockValue <= 0;
            return (
              <div
                key={item.material_id}
                className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${
                  isEmpty ? 'border-red-200' : isLow ? 'border-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{item.material_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">per {item.unit}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isEmpty ? 'bg-red-100' : isLow ? 'bg-amber-100' : 'bg-emerald-100'
                  }`}>
                    <Package size={20} className={isEmpty ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-emerald-500'} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-500">{t('purchased')}</p>
                    <p className="text-sm font-bold text-blue-700">{item.total_purchased}</p>
                  </div>
                  <div className="text-center p-2 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500">{t('sold')}</p>
                    <p className="text-sm font-bold text-slate-700">{item.total_sold}</p>
                  </div>
                  <div className={`text-center p-2 rounded-lg ${
                    isEmpty ? 'bg-red-50' : isLow ? 'bg-amber-50' : 'bg-emerald-50'
                  }`}>
                    <p className={`text-xs ${isEmpty ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {t('remaining')}
                    </p>
                    <p className={`text-sm font-bold ${isEmpty ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {item.current_stock}
                    </p>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="mt-3">
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        isEmpty ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(5, (Number(item.current_stock) / (Number(item.total_purchased) || 1)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
