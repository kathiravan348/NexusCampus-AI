import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Package, 
  Search, 
  Plus, 
  Barcode, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  DollarSign, 
  Wrench, 
  Sparkles, 
  Building2, 
  AlertTriangle 
} from 'lucide-react';

interface AssetItem {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  department: string;
  location: string;
  purchaseCost: number;
  currentValue: number;
  condition: 'Excellent' | 'Good' | 'Maintenance Due';
  warrantyUntil: string;
}

interface RequisitionItem {
  id: string;
  requestedBy: string;
  department: string;
  itemDescription: string;
  quantity: number;
  estimatedCost: number;
  priority: 'High' | 'Medium' | 'Standard';
  status: 'pending' | 'approved' | 'dispatched';
}

const mockAssets: AssetItem[] = [
  {
    id: 'AST-1001',
    assetTag: 'NEX-IT-9012',
    name: 'Dell Precision 5820 AI Workstation (NVIDIA RTX A5000)',
    category: 'IT Hardware',
    department: 'School of Computing',
    location: 'Turing Advanced AI Lab (Room 302)',
    purchaseCost: 4800,
    currentValue: 3600,
    condition: 'Excellent',
    warrantyUntil: '2028-06-15'
  },
  {
    id: 'AST-1002',
    assetTag: 'NEX-LAB-3401',
    name: 'Keysight 4-Channel Mixed Signal Oscilloscope (1 GHz)',
    category: 'Lab Instruments',
    department: 'Electrical Engineering',
    location: 'Circuits & Embedded Lab (Room 105)',
    purchaseCost: 6200,
    currentValue: 4900,
    condition: 'Good',
    warrantyUntil: '2027-11-20'
  },
  {
    id: 'AST-1003',
    assetTag: 'NEX-AV-8812',
    name: 'Promethean 86" Interactive Smart Interactive Display',
    category: 'AV Smart Class',
    department: 'General Academics',
    location: 'Lecture Hall Block A (Hall 1)',
    purchaseCost: 3400,
    currentValue: 2400,
    condition: 'Maintenance Due',
    warrantyUntil: '2026-10-30'
  },
  {
    id: 'AST-1004',
    assetTag: 'NEX-PRN-0045',
    name: 'Ultimaker S5 Industrial Dual-Extrusion 3D Printer',
    category: 'Rapid Prototyping',
    department: 'Mechanical Engineering',
    location: 'Makerspace Studio (Room 12)',
    purchaseCost: 7500,
    currentValue: 5800,
    condition: 'Excellent',
    warrantyUntil: '2027-04-12'
  },
  {
    id: 'AST-1005',
    assetTag: 'NEX-MOB-0008',
    name: 'Club Car 6-Passenger Electric Campus Utility Shuttle',
    category: 'Campus Mobility',
    department: 'Campus Facilities',
    location: 'Central Transport Bay',
    purchaseCost: 11500,
    currentValue: 8200,
    condition: 'Good',
    warrantyUntil: '2029-01-10'
  }
];

const mockRequisitions: RequisitionItem[] = [
  {
    id: 'REQ-401',
    requestedBy: 'Dr. Sarah Lin',
    department: 'Electrical Engineering',
    itemDescription: 'FPGA Development Boards (Xilinx Spartan-7) x 15 units',
    quantity: 15,
    estimatedCost: 2850,
    priority: 'High',
    status: 'pending'
  },
  {
    id: 'REQ-402',
    requestedBy: 'Dr. Alistair Vance',
    department: 'School of Computing',
    itemDescription: 'Edge TPU AI Accelerator USB Sticks x 20 units',
    quantity: 20,
    estimatedCost: 1900,
    priority: 'Medium',
    status: 'approved'
  },
  {
    id: 'REQ-403',
    requestedBy: 'David MacIntyre',
    department: 'Campus Facilities',
    itemDescription: 'Solar Rooftop Micro-Inverters (Enphase IQ8) x 6 units',
    quantity: 6,
    estimatedCost: 1440,
    priority: 'Standard',
    status: 'pending'
  }
];

export function InventoryAssets() {
  const [activeTab, setActiveTab] = useState<'assets' | 'requisitions' | 'maintenance'>('assets');
  const [assets] = useState<AssetItem[]>(mockAssets);
  const [requisitions, setRequisitions] = useState<RequisitionItem[]>(mockRequisitions);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const { openDialog, openConfirm } = useDialog();

  const filteredAssets = assets.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.assetTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const totalBookValue = assets.reduce((acc, a) => acc + a.currentValue, 0);
  const totalPurchaseValue = assets.reduce((acc, a) => acc + a.purchaseCost, 0);

  const handleCreateRequisition = () => {
    openDialog(
      'M16_NEW_REQUISITION',
      ({ onClose }) => {
        let desc = '';
        let dept = 'School of Computing';
        let qty = '5';
        let cost = '1200';
        let priority: 'High' | 'Medium' | 'Standard' = 'Medium';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Departmental purchase requisition links with institutional budget line accounts.</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Item Description & Specifications</label>
                <input
                  type="text"
                  placeholder="e.g. Raspberry Pi 5 AI Starter Kits"
                  onChange={e => { desc = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Requesting Department</label>
                  <select
                    defaultValue={dept}
                    onChange={e => { dept = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="School of Computing">School of Computing</option>
                    <option value="Electrical Engineering">Electrical Engineering</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Campus Facilities">Campus Facilities</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Priority Level</label>
                  <select
                    defaultValue={priority}
                    onChange={e => { priority = e.target.value as any; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="Standard">Standard (Regular restocking)</option>
                    <option value="Medium">Medium (Semester lab prep)</option>
                    <option value="High">High (Immediate research grant need)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Quantity</label>
                  <input
                    type="number"
                    defaultValue={qty}
                    onChange={e => { qty = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Est. Total Cost ($)</label>
                  <input
                    type="number"
                    defaultValue={cost}
                    onChange={e => { cost = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-2 hover:bg-bg-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (desc.trim()) {
                    setRequisitions(prev => [
                      {
                        id: `REQ-${Date.now().toString().slice(-3)}`,
                        requestedBy: 'Dr. Alistair Vance',
                        department: dept,
                        itemDescription: desc,
                        quantity: Number(qty) || 1,
                        estimatedCost: Number(cost) || 500,
                        priority,
                        status: 'pending'
                      },
                      ...prev
                    ]);
                  }
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Plus className="w-3.5 h-3.5" />
                Submit Requisition
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Submit Purchase Requisition', size: 'md' }
    );
  };

  const handleApproveRequisition = (req: RequisitionItem) => {
    openConfirm({
      title: `Approve Requisition ${req.id}`,
      message: `Authorize procurement of ${req.quantity} units (${req.itemDescription}) for ${req.department} totaling $${req.estimatedCost.toLocaleString()}?`,
      variant: 'default',
      confirmLabel: 'Authorize PO & Issue Budget',
      onConfirm: () => {
        setRequisitions(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r));
      }
    });
  };

  const handleCheckoutAsset = (asset: AssetItem) => {
    openConfirm({
      title: `Dispatch Asset Tag ${asset.assetTag}`,
      message: `Confirm checkout of ${asset.name} from current location to temporary faculty research loan? Expected inspection cycle: 90 days.`,
      variant: 'default',
      confirmLabel: 'Confirm Dispatch',
      onConfirm: () => {
        alert(`Asset ${asset.assetTag} successfully dispatched! RFID tracking tag active.`);
      }
    });
  };

  return (
    <ModulePageLayout
      moduleId="M16"
      moduleTitle="Campus Inventory & Capital Assets"
      portalName="Finance & Operations"
      description="Fixed asset registers, automated depreciation schedules, departmental procurement workflows, and maintenance contracts"
    >
      <div className="space-y-6">
        {/* Top Control Bar & High-Level KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Current Book Value</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">${totalBookValue.toLocaleString()}</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Original: ${totalPurchaseValue.toLocaleString()}</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Tracked Capital Assets</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{assets.length} Units</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">100% RFID & Barcoded</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Maintenance Due</span>
              <span className="text-xl font-bold text-amber-400 font-mono tracking-tight">
                {assets.filter(a => a.condition === 'Maintenance Due').length}
              </span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Annual calibration required</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Pending Requisitions</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">
                {requisitions.filter(r => r.status === 'pending').length}
              </span>
              <span className="text-[10px] text-cyan-400 block mt-0.5">Awaiting budget clearance</span>
            </div>
          </div>
        </div>

        {/* Tab Selector & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'assets' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Asset Registry Matrix ({assets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requisitions')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'requisitions' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Procurement Requisitions ({requisitions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('maintenance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'maintenance' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              AMC & Calibration
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCreateRequisition}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Requisition</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Asset Registry Matrix */}
        {activeTab === 'assets' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-bg-1 border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search asset tag, name, location..."
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
              >
                <option value="all">All Categories</option>
                <option value="IT Hardware">IT Hardware</option>
                <option value="Lab Instruments">Lab Instruments</option>
                <option value="AV Smart Class">AV Smart Class</option>
                <option value="Rapid Prototyping">Rapid Prototyping</option>
                <option value="Campus Mobility">Campus Mobility</option>
              </select>
            </div>

            <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Asset Tag & Name</th>
                      <th className="py-3 px-4">Category & Department</th>
                      <th className="py-3 px-4">Current Bay Location</th>
                      <th className="py-3 px-4 text-right">Book Value</th>
                      <th className="py-3 px-4 text-center">Condition</th>
                      <th className="py-3 px-4">Warranty</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filteredAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4 max-w-xs">
                          <span className="font-bold text-fg-0 block leading-snug">{asset.name}</span>
                          <span className="text-[10px] text-primary font-mono font-semibold">{asset.assetTag}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-fg-1 block">{asset.category}</span>
                          <span className="text-[10px] text-fg-2">{asset.department}</span>
                        </td>
                        <td className="py-3 px-4 text-fg-1 text-[11px]">{asset.location}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-fg-0">
                          ${asset.currentValue.toLocaleString()}
                          <span className="block text-[10px] font-normal text-fg-2">
                            Cost: ${asset.purchaseCost.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {asset.condition === 'Excellent' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Excellent
                            </span>
                          )}
                          {asset.condition === 'Good' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Good
                            </span>
                          )}
                          {asset.condition === 'Maintenance Due' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" /> Service Due
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-fg-2">{asset.warrantyUntil}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleCheckoutAsset(asset)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors ml-auto"
                          >
                            <Barcode className="w-3 h-3 text-primary" />
                            Dispatch
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Procurement Requisitions */}
        {activeTab === 'requisitions' && (
          <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Departmental Hardware & Lab Equipment Requisitions
                </h2>
                <p className="text-xs text-fg-2 mt-0.5">Budget authorization pipeline and procurement order generation</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Requisition ID & Item</th>
                    <th className="py-3 px-4">Department & Requester</th>
                    <th className="py-3 px-4 text-center">Quantity</th>
                    <th className="py-3 px-4 text-right">Estimated Cost</th>
                    <th className="py-3 px-4 text-center">Priority</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {requisitions.map((req) => (
                    <tr key={req.id} className="hover:bg-bg-2/40 transition-colors">
                      <td className="py-3 px-4 max-w-sm">
                        <span className="font-bold text-fg-0 block">{req.itemDescription}</span>
                        <span className="text-[10px] text-primary font-mono font-semibold">{req.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-fg-0 block font-medium">{req.department}</span>
                        <span className="text-[10px] text-fg-2">{req.requestedBy}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-fg-0">{req.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-primary">
                        ${req.estimatedCost.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {req.priority === 'High' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            High Priority
                          </span>
                        )}
                        {req.priority === 'Medium' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Medium
                          </span>
                        )}
                        {req.priority === 'Standard' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-bg-2 text-fg-2 border border-line">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {req.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> PO Authorized
                          </span>
                        )}
                        {req.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {req.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleApproveRequisition(req)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
                          >
                            Approve PO
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Maintenance */}
        {activeTab === 'maintenance' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Wrench className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">HVAC & Lab Chiller Annual AMC</h3>
              <p className="text-xs text-fg-2">Contract with Daikin Applied Systems. Valid through December 2026. Next quarterly inspection in 14 days.</p>
              <button
                type="button"
                onClick={() => alert('Viewing Daikin Maintenance SLA & Logbook...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-primary transition-colors"
              >
                Inspect Maintenance Log &rarr;
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Lab Equipment Calibration Certificate</h3>
              <p className="text-xs text-fg-2">NABL accredited ISO 17025 calibration audit for precision electronic spectrum analyzers and scales.</p>
              <button
                type="button"
                onClick={() => alert('Downloading NABL Calibration Certificate Pack...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-cyan-400 transition-colors"
              >
                View Calibration Records &rarr;
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Campus Generator & Solar Microgrid</h3>
              <p className="text-xs text-fg-2">Caterpillar 500 kVA backup diesel generator and 250 kW solar rooftop array telemetry integration.</p>
              <button
                type="button"
                onClick={() => alert('Opening Microgrid IoT Sensor Monitor...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-emerald-400 transition-colors"
              >
                Check Grid Health &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
