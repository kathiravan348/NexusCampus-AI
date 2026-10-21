import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Coffee, 
  ShoppingBag, 
  CreditCard, 
  Plus, 
  Minus, 
  Trash2, 
  Sparkles,
  Search
} from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  category: 'meals' | 'bowls' | 'drinks' | 'snacks';
  price: number;
  calories: number;
  dietary: 'Veg' | 'Vegan' | 'Gluten-Free' | 'Non-Veg';
  image: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

const menuItems: MenuItem[] = [
  { id: 'F01', name: 'Mediterranean Grain Bowl', category: 'bowls', price: 7.50, calories: 420, dietary: 'Vegan', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200' },
  { id: 'F02', name: 'Grilled Herb Chicken Panini', category: 'meals', price: 8.00, calories: 580, dietary: 'Non-Veg', image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=200' },
  { id: 'F03', name: 'Avocado & Egg Sourdough Toast', category: 'snacks', price: 5.50, calories: 340, dietary: 'Veg', image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=200' },
  { id: 'F04', name: 'Cold Brew Oat Milk Latte', category: 'drinks', price: 3.75, calories: 120, dietary: 'Vegan', image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=200' },
  { id: 'F05', name: 'Spicy Tofu Teriyaki Bento', category: 'meals', price: 8.50, calories: 490, dietary: 'Vegan', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200' },
  { id: 'F06', name: 'Organic Berry Acai Smoothie', category: 'drinks', price: 4.50, calories: 210, dietary: 'Gluten-Free', image: 'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=200' },
];

export function CafeteriaPOS() {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'meals' | 'bowls' | 'drinks' | 'snacks'>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = i.quantity + delta;
        return newQty > 0 ? { ...i, quantity: newQty } : null;
      }
      return i;
    }).filter(Boolean) as CartItem[]);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  const handleCheckout = () => {
    if (cart.length === 0) return;

    openDialog(
      'M38_SMART_PAY',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-3">
            <Sparkles className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-bold block">RFID / NFC Smart Card Tap Terminal</span>
              <span>Hold digital campus smart card or student mobile app to the reader</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-2 border border-line text-center py-6 space-y-2">
            <CreditCard className="w-10 h-10 text-primary mx-auto animate-bounce" />
            <span className="text-xs font-semibold text-fg-2 block">Awaiting Student Card Tap</span>
            <span className="text-2xl font-bold text-fg-0 font-mono block">${total.toFixed(2)}</span>
            <span className="text-[11px] text-success font-medium">Auto-deducts from Campus Dining Wallet</span>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button
              onClick={() => {
                alert(`Transaction of $${total.toFixed(2)} approved via Student Smart Card! Receipt printed.`);
                setCart([]);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-success hover:bg-success/90 rounded-xl shadow-sm"
            >
              Simulate Card Tap & Pay
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'Cafeteria POS — Checkout Terminal', size: 'md' }
    );
  };

  const handleClearCart = () => {
    openConfirm({
      title: 'Clear Current Order?',
      message: 'Are you sure you want to discard all items currently in the cart?',
      variant: 'danger',
      confirmLabel: 'Clear Cart',
      onConfirm: () => setCart([])
    });
  };

  const filteredItems = menuItems.filter(item => {
    const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchQuery = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQuery;
  });

  return (
    <ModulePageLayout
      moduleId="M38"
      moduleTitle="Cafeteria & Canteen POS"
      portalName="Finance, Commerce & Assets"
      description="Touchscreen Point of Sale terminal with contactless NFC/RFID smart card payments and real-time inventory deduction."
      tags={['Demand Forecasting', 'Dietary Tags', 'Smart Card Tap']}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Food Menu Catalog */}
        <div className="lg:col-span-2 space-y-6">
          {/* Categories & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
              {(['all', 'meals', 'bowls', 'drinks', 'snacks'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-bg-1 text-fg-2 hover:text-fg-0 border border-line'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-fg-2 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search food..."
                className="w-full bg-bg-1 border border-line rounded-xl pl-8 pr-3 py-1.5 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => addToCart(item)}
                className="p-4 bg-bg-1 border border-line hover:border-primary/50 rounded-2xl shadow-sm transition-all cursor-pointer group flex flex-col justify-between hover:shadow-md"
              >
                <div>
                  <div className="relative h-32 w-full rounded-xl overflow-hidden mb-3 bg-bg-2">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-sm">
                      {item.dietary}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-fg-0 group-hover:text-primary transition-colors line-clamp-1">
                    {item.name}
                  </h4>
                  <span className="text-[11px] text-fg-2 block mt-0.5">{item.calories} kcal</span>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
                  <span className="font-mono text-sm font-bold text-fg-0">${item.price.toFixed(2)}</span>
                  <button className="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Order Checkout Cart */}
        <div className="p-5 bg-bg-1 border border-line rounded-2xl shadow-sm flex flex-col justify-between h-fit sticky top-20">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-fg-0 text-sm">Active Cart ({cart.length})</h3>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-[11px] text-danger hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {cart.map(item => (
                <div key={item.id} className="p-3 rounded-xl bg-bg-2/50 border border-line flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-xs font-semibold text-fg-0 block truncate">{item.name}</span>
                    <span className="text-[11px] font-mono text-fg-2">${item.price.toFixed(2)} each</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center border border-line rounded-lg bg-bg-1 overflow-hidden">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-bg-2">
                        <Minus className="w-3 h-3 text-fg-2" />
                      </button>
                      <span className="font-mono text-xs font-bold px-2">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-bg-2">
                        <Plus className="w-3 h-3 text-fg-2" />
                      </button>
                    </div>
                    <span className="font-mono text-xs font-bold text-fg-0 w-12 text-right">
                      ${(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="py-12 text-center text-xs text-fg-2 border border-dashed border-line rounded-xl">
                  <Coffee className="w-8 h-8 text-fg-2/40 mx-auto mb-2" />
                  Cart is empty. Tap any menu item to add.
                </div>
              )}
            </div>
          </div>

          {/* Cart Totals & Checkout Button */}
          <div className="pt-4 border-t border-line mt-4 space-y-3">
            <div className="space-y-1.5 text-xs text-fg-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono text-fg-0">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Campus Sales Tax (8%):</span>
                <span className="font-mono text-fg-0">${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-fg-0 pt-2 border-t border-line">
                <span>Total Amount:</span>
                <span className="font-mono text-primary text-base">${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" /> Tap Smart Card to Pay
            </button>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
