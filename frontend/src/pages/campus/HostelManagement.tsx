import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Building, 
  Utensils, 
  ShieldCheck, 
  CheckCircle2, 
  UserPlus, 
  Sparkles
} from 'lucide-react';

interface Room {
  roomNo: string;
  type: 'Double Shared' | 'Single Deluxe';
  bedA: { studentName: string; rollNo: string; occupied: boolean };
  bedB?: { studentName: string; rollNo: string; occupied: boolean };
}

const initialRooms: Room[] = [
  { roomNo: '101', type: 'Double Shared', bedA: { studentName: 'Liam Smith', rollNo: 'STU-1002', occupied: true }, bedB: { studentName: 'Noah Johnson', rollNo: 'STU-1003', occupied: true } },
  { roomNo: '102', type: 'Double Shared', bedA: { studentName: 'William Brown', rollNo: 'STU-1005', occupied: true }, bedB: { studentName: '', rollNo: '', occupied: false } },
  { roomNo: '103', type: 'Double Shared', bedA: { studentName: '', rollNo: '', occupied: false }, bedB: { studentName: '', rollNo: '', occupied: false } },
  { roomNo: '104', type: 'Single Deluxe', bedA: { studentName: 'James Jones', rollNo: 'STU-1006', occupied: true } },
  { roomNo: '105', type: 'Double Shared', bedA: { studentName: '', rollNo: '', occupied: false }, bedB: { studentName: '', rollNo: '', occupied: false } },
  { roomNo: '106', type: 'Double Shared', bedA: { studentName: 'Lucas Vance', rollNo: 'STU-1007', occupied: true }, bedB: { studentName: '', rollNo: '', occupied: false } },
];

export function HostelManagement() {
  const [activeTab, setActiveTab] = useState('rooms');
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const { openDialog, openConfirm } = useDialog();

  const handleAllocateBed = (roomNo: string, bedSlot: 'A' | 'B') => {
    openDialog(
      'M18_ALLOCATE_BED',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Room {roomNo} · Bed Slot {bedSlot} ready for occupancy allocation.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Select Enrolled Student *</label>
              <select className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none">
                <option>William Brown (STU-1005) — B.Sc. Computer Science</option>
                <option>Sophia Martinez (STU-1008) — Cognitive Psychology</option>
                <option>David Chen (STU-1009) — Robotics Engineering</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Check-in Date</label>
              <input type="date" defaultValue="2026-09-15" className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none" />
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Hostel Fee Schedule</label>
              <div className="p-3 bg-bg-2 border border-line rounded-xl text-xs text-fg-2">
                Standard double room fee ($1,200 / term) includes full mess plan & laundry subscription.
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button
              onClick={() => {
                setRooms(prev => prev.map(r => {
                  if (r.roomNo === roomNo) {
                    if (bedSlot === 'A') {
                      return { ...r, bedA: { studentName: 'William Brown', rollNo: 'STU-1005', occupied: true } };
                    } else if (r.bedB) {
                      return { ...r, bedB: { studentName: 'William Brown', rollNo: 'STU-1005', occupied: true } };
                    }
                  }
                  return r;
                }));
                alert(`Bed ${bedSlot} in Room ${roomNo} allocated!`);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
            >
              Confirm Bed Allotment
            </button>
          </div>
        </div>
      ),
      {},
      { title: `M18: Room ${roomNo} Bed ${bedSlot} Allotment`, size: 'md' }
    );
  };

  const handleApproveGatePass = (studentName: string) => {
    openConfirm({
      title: `Approve Outing Gate-Pass for ${studentName}?`,
      message: `Guardian consent has been verified via SMS. Return curfew is scheduled for 08:30 PM tonight.`,
      variant: 'success',
      confirmLabel: 'Authorize Digital Gate-Pass',
      onConfirm: () => {
        alert(`Digital gate-pass issued for ${studentName}! Security gate console notified.`);
      }
    });
  };

  const tabs = [
    { id: 'rooms', label: 'Room & Bed Allotment Matrix' },
    { id: 'mess', label: 'Weekly Mess Menu & Diet' },
    { id: 'passes', label: 'Outing Gate-Pass Approval Queue', count: 2 },
  ];

  return (
    <ModulePageLayout
      moduleId="M18"
      moduleTitle="Hostel & Mess Accommodation"
      portalName="Campus Life & Operations"
      description="Hostel bed allocation matrix, meal demand forecasting, nutritional menus, and digital outing gate-pass approvals."
      tags={['Room Allotment', 'Curfew Tracking', 'Mess Menu Planner']}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'rooms' && (
        <div className="space-y-6">
          {/* Hostel Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <span className="text-xs text-fg-2 block">Total Bed Capacity</span>
              <span className="text-2xl font-bold text-fg-0 mt-0.5 block">11 Beds</span>
            </div>
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <span className="text-xs text-fg-2 block">Occupied Beds</span>
              <span className="text-2xl font-bold text-primary mt-0.5 block">5 Beds</span>
            </div>
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <span className="text-xs text-fg-2 block">Vacant Beds</span>
              <span className="text-2xl font-bold text-success mt-0.5 block">6 Beds</span>
            </div>
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <span className="text-xs text-fg-2 block">Occupancy Rate</span>
              <span className="text-2xl font-bold text-fg-0 mt-0.5 block">45.4%</span>
            </div>
          </div>

          {/* Visual Room Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <div key={room.roomNo} className="p-5 bg-bg-1 border border-line rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-primary" />
                    <span className="font-bold text-fg-0 text-sm">Room {room.roomNo}</span>
                  </div>
                  <span className="text-[11px] font-mono text-fg-2 bg-bg-2 px-2 py-0.5 rounded border border-line">
                    {room.type}
                  </span>
                </div>

                {/* Bed A */}
                <div className="p-3 bg-bg-2/50 rounded-xl border border-line flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-fg-2 uppercase tracking-wider block">Bed Slot A</span>
                    {room.bedA.occupied ? (
                      <div>
                        <span className="text-xs font-semibold text-fg-0 block">{room.bedA.studentName}</span>
                        <span className="font-mono text-[10px] text-primary">{room.bedA.rollNo}</span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-success">Vacant & Ready</span>
                    )}
                  </div>
                  {!room.bedA.occupied ? (
                    <button
                      onClick={() => handleAllocateBed(room.roomNo, 'A')}
                      className="px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" /> Assign
                    </button>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-primary" title="Occupied" />
                  )}
                </div>

                {/* Bed B (if double) */}
                {room.bedB && (
                  <div className="p-3 bg-bg-2/50 rounded-xl border border-line flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-fg-2 uppercase tracking-wider block">Bed Slot B</span>
                      {room.bedB.occupied ? (
                        <div>
                          <span className="text-xs font-semibold text-fg-0 block">{room.bedB.studentName}</span>
                          <span className="font-mono text-[10px] text-primary">{room.bedB.rollNo}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-success">Vacant & Ready</span>
                      )}
                    </div>
                    {!room.bedB.occupied ? (
                      <button
                        onClick={() => handleAllocateBed(room.roomNo, 'B')}
                        className="px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <UserPlus className="w-3 h-3" /> Assign
                      </button>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-primary" title="Occupied" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'mess' && (
        <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-primary" />
              <h3 className="text-base font-bold text-fg-0">Weekly Dining & Nutrition Menu</h3>
            </div>
            <span className="text-xs font-semibold text-success bg-success/10 px-3 py-1 rounded-full border border-success/20">
              Dietician Certified
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-bg-2 border border-line space-y-2">
              <span className="text-xs font-bold text-primary block uppercase tracking-wider">Breakfast (07:30 - 09:00)</span>
              <p className="text-xs font-semibold text-fg-0">Pancakes, Scrambled Eggs / Tofu, Oatmeal, Fresh Fruit & Juice</p>
              <span className="text-[10px] text-fg-2 block">High protein · 450 kcal</span>
            </div>

            <div className="p-4 rounded-xl bg-bg-2 border border-line space-y-2">
              <span className="text-xs font-bold text-primary block uppercase tracking-wider">Lunch (12:30 - 02:00)</span>
              <p className="text-xs font-semibold text-fg-0">Grilled Herb Chicken / Lentil Curry, Brown Rice, Steamed Greens & Yogurt</p>
              <span className="text-[10px] text-fg-2 block">Balanced carbs · 650 kcal</span>
            </div>

            <div className="p-4 rounded-xl bg-bg-2 border border-line space-y-2">
              <span className="text-xs font-bold text-primary block uppercase tracking-wider">Evening Snacks (05:00 - 06:00)</span>
              <p className="text-xs font-semibold text-fg-0">Assorted Tea, Coffee, Cookies & Veggie Spring Rolls</p>
              <span className="text-[10px] text-fg-2 block">Energy booster · 200 kcal</span>
            </div>

            <div className="p-4 rounded-xl bg-bg-2 border border-line space-y-2">
              <span className="text-xs font-bold text-primary block uppercase tracking-wider">Dinner (08:00 - 09:30)</span>
              <p className="text-xs font-semibold text-fg-0">Baked Salmon / Paneer Tikka, Warm Pita, Greek Salad & Minestrone Soup</p>
              <span className="text-[10px] text-fg-2 block">Light evening digest · 550 kcal</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'passes' && (
        <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-fg-0">Pending Digital Outing Gate-Pass Requests</h3>
            </div>
            <span className="text-xs text-fg-2">Curfew deadline strictly enforced at 08:30 PM</span>
          </div>

          <div className="divide-y divide-line text-xs">
            <div className="p-4 flex items-center justify-between">
              <div>
                <span className="font-semibold text-fg-0 block">Liam Smith (STU-1002) · Room 101</span>
                <span className="text-fg-2 text-[11px]">Reason: Medical Consultation & Prescriptions · Destination: City Clinic</span>
                <span className="text-success text-[10px] block mt-0.5 font-medium">✓ Guardian SMS Consent Verified</span>
              </div>
              <button
                onClick={() => handleApproveGatePass('Liam Smith')}
                className="px-3 py-1.5 bg-success hover:bg-success/90 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Authorize Pass
              </button>
            </div>

            <div className="p-4 flex items-center justify-between">
              <div>
                <span className="font-semibold text-fg-0 block">William Brown (STU-1005) · Room 102</span>
                <span className="text-fg-2 text-[11px]">Reason: Weekend Family Visit · Destination: Home</span>
                <span className="text-success text-[10px] block mt-0.5 font-medium">✓ Parent Call Signed Off</span>
              </div>
              <button
                onClick={() => handleApproveGatePass('William Brown')}
                className="px-3 py-1.5 bg-success hover:bg-success/90 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Authorize Pass
              </button>
            </div>
          </div>
        </div>
      )}
    </ModulePageLayout>
  );
}
