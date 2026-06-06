
-- Suppliers table (whom we buy from)
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Materials table (what we deal in - sand, gravel, bricks etc.)
CREATE TABLE materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'unit',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Purchases table (what we bought from suppliers)
CREATE TABLE purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Customers table
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sales table (orders - header)
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  invoice_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sale items table (what items in each sale)
CREATE TABLE sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_price DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger entries table (all financial transactions)
CREATE TABLE ledger_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount DECIMAL(12,2) NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('purchase', 'sale')),
  reference_id UUID,
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity log table
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stock view - current stock levels
CREATE VIEW stock_summary AS
SELECT
  m.id AS material_id,
  m.user_id,
  m.name AS material_name,
  m.unit,
  COALESCE(purchased.total_in, 0) AS total_purchased,
  COALESCE(sold.total_out, 0) AS total_sold,
  COALESCE(purchased.total_in, 0) - COALESCE(sold.total_out, 0) AS current_stock
FROM materials m
LEFT JOIN (
  SELECT material_id, user_id, SUM(quantity) AS total_in
  FROM purchases
  GROUP BY material_id, user_id
) purchased ON purchased.material_id = m.id AND purchased.user_id = m.user_id
LEFT JOIN (
  SELECT si.material_id, s.user_id, SUM(si.quantity) AS total_out
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  GROUP BY si.material_id, s.user_id
) sold ON sold.material_id = m.id AND sold.user_id = m.user_id;

-- Enable RLS on all tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for suppliers
CREATE POLICY "select_own_suppliers" ON suppliers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_suppliers" ON suppliers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_suppliers" ON suppliers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for materials
CREATE POLICY "select_own_materials" ON materials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_materials" ON materials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_materials" ON materials FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_materials" ON materials FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for purchases
CREATE POLICY "select_own_purchases" ON purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_purchases" ON purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_purchases" ON purchases FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_purchases" ON purchases FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for customers
CREATE POLICY "select_own_customers" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_customers" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_customers" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_customers" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for sales
CREATE POLICY "select_own_sales" ON sales FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_sales" ON sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_sales" ON sales FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_sales" ON sales FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for sale_items (via sales ownership)
CREATE POLICY "select_own_sale_items" ON sale_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "insert_own_sale_items" ON sale_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "update_own_sale_items" ON sale_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);
CREATE POLICY "delete_own_sale_items" ON sale_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid())
);

-- RLS policies for ledger_entries
CREATE POLICY "select_own_ledger" ON ledger_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_ledger" ON ledger_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_ledger" ON ledger_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_ledger" ON ledger_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for activity_log
CREATE POLICY "select_own_activity" ON activity_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_activity" ON activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_activity" ON activity_log FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_activity" ON activity_log FOR DELETE TO authenticated USING (auth.uid() = user_id);
