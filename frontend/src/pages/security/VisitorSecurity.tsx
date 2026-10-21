import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  ShieldCheck, 
  Search, 
  Plus, 
  UserCheck, 
  Car, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  QrCode, 
  Camera 
} from 'lucide-react';

interface VisitorLog {
  id: string;
  badgeNumber: string;
  name: string;
  phone: string;
  category: 'Guest Speaker' | 'Vendor / Contractor' | 'Prospective Student' | 'Guardian / Parent';
  hostPerson: string;
  hostDepartment: string;
  gateName: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'active' | 'checked_out';
}

interface VehicleLog {
  id: string;
  licensePlate: string;
  vehicleModel: string;
  driverName: string;
  entryGate: string;
  parkingZone: string;
  speedKmh: number;
  status: 'authorized' | 'visitor' | 'flagged';
}

const mockVisitors: VisitorLog[] = [
  {
    id: 'VIS-901',
    badgeNumber: 'BDG-042',
    name: 'Marcus Sterling',
    phone: '+1 (555) 482-1920',
    category: 'Guest Speaker',
    hostPerson: 'Dr. Alistair Vance',
    hostDepartment: 'School of Computing',
    gateName: 'Main North Gate (A1)',
    checkInTime: '09:15 AM',
    status: 'active'
  },
  {
    id: 'VIS-902',
    badgeNumber: 'BDG-043',
    name: 'Elena Rostova',
    phone: '+1 (555) 390-2811',
    category: 'Vendor / Contractor',
    hostPerson: 'David MacIntyre',
    hostDepartment: 'Campus Facilities',
    gateName: 'Service Gate (South)',
    checkInTime: '09:40 AM',
    status: 'active'
  },
  {
    id: 'VIS-903',
    badgeNumber: 'BDG-044',
    name: 'Howard & Grace Miller',
    phone: '+1 (555) 819-3320',
    category: 'Guardian / Parent',
    hostPerson: 'Elena Gomez',
    hostDepartment: 'Admissions Center',
    gateName: 'Main North Gate (A1)',
    checkInTime: '10:05 AM',
    status: 'active'
  },
  {
    id: 'VIS-904',
    badgeNumber: 'BDG-038',
    name: 'Samantha Ray',
    phone: '+1 (555) 201-9988',
    category: 'Prospective Student',
    hostPerson: 'Admissions Office',
    hostDepartment: 'Welcome Center',
    gateName: 'Visitor Gate West',
    checkInTime: '08:30 AM',
    checkOutTime: '10:15 AM',
    status: 'checked_out'
  }
];

const mockVehicles: VehicleLog[] = [
  {
    id: 'VEH-101',
    licensePlate: 'CA 7XYZ892',
    vehicleModel: 'Tesla Model Y (Deep Blue)',
    driverName: 'Dr. Sarah Lin (Faculty)',
    entryGate: 'North Gate FastTrack',
    parkingZone: 'Faculty Lot F-2',
    speedKmh: 18,
    status: 'authorized'
  },
  {
    id: 'VEH-102',
    licensePlate: 'NY JKL-4401',
    vehicleModel: 'Ford Transit Van (FedEx Express)',
    driverName: 'Delivery Courier',
    entryGate: 'Commercial Service Gate',
    parkingZone: 'Loading Dock B',
    speedKmh: 15,
    status: 'visitor'
  },
  {
    id: 'VEH-103',
    licensePlate: 'WA 492-WXZ',
    vehicleModel: 'Toyota RAV4 Hybrid (Silver)',
    driverName: 'Marcus Sterling (Guest)',
    entryGate: 'Visitor Gate A',
    parkingZone: 'Visitor Bay V-12',
    speedKmh: 19,
    status: 'visitor'
  }
];

export function VisitorSecurity() {
  const [activeTab, setActiveTab] = useState<'visitors' | 'vehicles' | 'preregistered'>('visitors');
  const [visitors, setVisitors] = useState<VisitorLog[]>(mockVisitors);
  const [vehicles] = useState<VehicleLog[]>(mockVehicles);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  const filteredVisitors = visitors.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.badgeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.hostPerson.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRegisterVisitor = () => {
    openDialog(
      'M40_VISITOR_CHECKIN',
      ({ onClose }) => {
        let name = '';
        let phone = '';
        let category: any = 'Guest Speaker';
        let host = 'Dr. Alistair Vance';
        let gate = 'Main North Gate (A1)';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Camera className="w-4 h-4 shrink-0" />
              <span>Gate webcam active. Automatic facial snapshot embedded in digital NFC badge.</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Visitor Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Arthur Pendelton"
                  onChange={e => { name = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Mobile Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +1 (555) 928-1100"
                    onChange={e => { phone = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Visitor Category</label>
                  <select
                    defaultValue={category}
                    onChange={e => { category = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="Guest Speaker">Guest Speaker</option>
                    <option value="Vendor / Contractor">Vendor / Contractor</option>
                    <option value="Prospective Student">Prospective Student</option>
                    <option value="Guardian / Parent">Guardian / Parent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Host Staff / Faculty Member</label>
                  <input
                    type="text"
                    defaultValue={host}
                    onChange={e => { host = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Entry Gate</label>
                  <select
                    defaultValue={gate}
                    onChange={e => { gate = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="Main North Gate (A1)">Main North Gate (A1)</option>
                    <option value="Visitor Gate West">Visitor Gate West</option>
                    <option value="Service Gate (South)">Service Gate (South)</option>
                  </select>
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
                  if (name.trim()) {
                    setVisitors(prev => [
                      {
                        id: `VIS-${Date.now().toString().slice(-3)}`,
                        badgeNumber: `BDG-${Math.floor(100 + Math.random() * 900)}`,
                        name,
                        phone: phone || '+1 (555) 000-0000',
                        category,
                        hostPerson: host,
                        hostDepartment: 'Campus Academic Division',
                        gateName: gate,
                        checkInTime: 'Just now',
                        status: 'active'
                      },
                      ...prev
                    ]);
                  }
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <QrCode className="w-3.5 h-3.5" />
                Issue Pass & Print Badge
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Campus Gate Access • Check-In Visitor', size: 'md' }
    );
  };

  const handleCheckoutVisitor = (visitor: VisitorLog) => {
    openConfirm({
      title: `Check Out Visitor Badge ${visitor.badgeNumber}`,
      message: `Confirm departure for ${visitor.name}? The digital NFC visitor badge will be revoked and marked returned.`,
      variant: 'default',
      confirmLabel: 'Confirm Check-Out',
      onConfirm: () => {
        setVisitors(prev => prev.map(v => v.id === visitor.id ? { ...v, status: 'checked_out', checkOutTime: 'Just now' } : v));
      }
    });
  };

  const handleLockdownDrill = () => {
    openConfirm({
      title: 'Trigger Campus Gate Emergency Lockdown Drill',
      message: 'This action tests institutional emergency preparedness by signaling all automatic hydraulic bollards and barrier arms across all 4 vehicle perimeters to secure closed. Proceed with safety drill?',
      variant: 'danger',
      confirmLabel: 'Authorize Emergency Drill',
      onConfirm: () => {
        alert('Lockdown safety simulation active: Security team radios alerted and automatic barriers secured.');
      }
    });
  };

  const activeVisitorsCount = visitors.filter(v => v.status === 'active').length;

  return (
    <ModulePageLayout
      moduleId="M40"
      moduleTitle="Visitor Gate & Campus Security Console"
      portalName="Campus Life & Operations"
      description="Automated visitor pre-registration, digital badge pass printing, ANPR license plate logging, and perimeter access control"
    >
      <div className="space-y-6">
        {/* Top Control Bar & High-Level KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">On-Campus Visitors</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{activeVisitorsCount} Active</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">84 total visits today</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Vehicles In (ANPR)</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">142 Vehicles</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">100% camera match</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Pre-Registered</span>
              <span className="text-xl font-bold text-cyan-400 font-mono tracking-tight">26 Expected</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Guest lectures & vendor deliveries</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Perimeter Security</span>
              <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">NORMAL</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">All 4 gates operational</span>
            </div>
          </div>
        </div>

        {/* Tab Selector & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('visitors')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'visitors' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Visitor Check-In Log ({visitors.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vehicles')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'vehicles' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              ANPR Vehicle Cameras ({vehicles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preregistered')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'preregistered' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Pre-Registered VIPs
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleLockdownDrill}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors shadow-sm"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Lockdown Drill</span>
            </button>

            <button
              type="button"
              onClick={handleRegisterVisitor}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Check-In New Visitor</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Visitors */}
        {activeTab === 'visitors' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-bg-1 border border-line flex items-center justify-between gap-3 shadow-sm">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search visitor, badge, or host..."
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>
              <span className="text-xs font-mono text-fg-2">
                Showing {filteredVisitors.length} visitors
              </span>
            </div>

            <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Visitor & Badge</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Host Contact & Dept</th>
                      <th className="py-3 px-4">Entry Gate</th>
                      <th className="py-3 px-4">Time In / Out</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filteredVisitors.map((vis) => (
                      <tr key={vis.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-fg-0 block">{vis.name}</span>
                          <span className="text-[10px] text-primary font-mono font-semibold">{vis.badgeNumber}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-fg-1 text-[11px] block">{vis.category}</span>
                          <span className="text-[10px] text-fg-2 font-mono">{vis.phone}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-fg-0 block">{vis.hostPerson}</span>
                          <span className="text-[10px] text-fg-2">{vis.hostDepartment}</span>
                        </td>
                        <td className="py-3 px-4 text-fg-1 text-[11px]">{vis.gateName}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-fg-2">
                          <span className="text-emerald-400 block">{vis.checkInTime}</span>
                          {vis.checkOutTime && <span className="text-fg-2 block">Out: {vis.checkOutTime}</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {vis.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> On Campus
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-bg-2 text-fg-2 border border-line">
                              Checked Out
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => alert(`Printing RFID Gate Badge for ${vis.name} (${vis.badgeNumber})...`)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors"
                            >
                              Badge
                            </button>
                            {vis.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleCheckoutVisitor(vis)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                              >
                                Check Out
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: ANPR Vehicles */}
        {activeTab === 'vehicles' && (
          <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <Car className="w-4 h-4 text-primary" />
                  Automatic Number Plate Recognition (ANPR) Gate Feeds
                </h2>
                <p className="text-xs text-fg-2 mt-0.5">High-speed optical camera detection with automatic perimeter boom-barrier triggering</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                  <tr>
                    <th className="py-3 px-4">License Plate</th>
                    <th className="py-3 px-4">Vehicle Model & Make</th>
                    <th className="py-3 px-4">Driver / Registered Owner</th>
                    <th className="py-3 px-4">Perimeter Gate</th>
                    <th className="py-3 px-4">Assigned Parking Zone</th>
                    <th className="py-3 px-4 text-center">Approach Speed</th>
                    <th className="py-3 px-4 text-center">Access Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {vehicles.map((veh) => (
                    <tr key={veh.id} className="hover:bg-bg-2/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-fg-0 font-mono tracking-wider block bg-bg-2 px-2.5 py-1 rounded border border-line w-fit">
                          {veh.licensePlate}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-fg-1">{veh.vehicleModel}</td>
                      <td className="py-3 px-4 text-fg-0">{veh.driverName}</td>
                      <td className="py-3 px-4 text-fg-2">{veh.entryGate}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-primary font-semibold">{veh.parkingZone}</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-fg-1">{veh.speedKmh} km/h</td>
                      <td className="py-3 px-4 text-center">
                        {veh.status === 'authorized' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> RFID Authorized
                          </span>
                        )}
                        {veh.status === 'visitor' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            Visitor Tag
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Pre-Registered VIPs */}
        {activeTab === 'preregistered' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                11:30 AM Today
              </span>
              <h3 className="font-bold text-fg-0 text-sm">State Higher Education Accreditation Committee</h3>
              <p className="text-xs text-fg-2">5-member external audit delegation arriving via Main North Gate for physical library and lab inspections.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Host:</span>
                  <span className="font-medium text-fg-0">Office of the Provost</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Reserved Parking:</span>
                  <span className="font-mono text-primary">VIP Bay 1–5</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                02:00 PM Today
              </span>
              <h3 className="font-bold text-fg-0 text-sm">Google Cloud AI Campus Tech Talk Speaker</h3>
              <p className="text-xs text-fg-2">Distinguished engineering guest lecture at Turing Auditorium with 450 registered computer science students.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Host:</span>
                  <span className="font-medium text-fg-0">ACM Student Chapter</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Reserved Parking:</span>
                  <span className="font-mono text-cyan-400">Speaker Bay S-1</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Tomorrow 09:00 AM
              </span>
              <h3 className="font-bold text-fg-0 text-sm">Campus Solar Microgrid Maintenance Engineers</h3>
              <p className="text-xs text-fg-2">Certified technicians conducting scheduled quarterly battery storage calibration on engineering rooftop.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Host:</span>
                  <span className="font-medium text-fg-0">Campus Facilities</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Pass Type:</span>
                  <span className="font-mono text-emerald-400">Multi-Day Contractor Pass</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
