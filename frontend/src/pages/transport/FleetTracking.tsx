import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Bus, 
  MapPin, 
  Navigation, 
  AlertTriangle, 
  CheckCircle2, 
  Send
} from 'lucide-react';

interface BusFleetItem {
  id: string;
  routeNumber: string;
  routeName: string;
  driverName: string;
  driverPhone: string;
  plateNumber: string;
  currentSpeed: string;
  nextStop: string;
  eta: string;
  capacity: number;
  boarded: number;
  status: 'on_schedule' | 'delayed' | 'completed';
}

const initialFleet: BusFleetItem[] = [
  { id: 'BUS-01', routeNumber: 'Route 101', routeName: 'North Metro Express', driverName: 'Marcus Miller', driverPhone: '+1 (555) 301-8899', plateNumber: 'NX-24-BUS', currentSpeed: '42 km/h', nextStop: 'Oakwood Crossing', eta: '4 mins', capacity: 45, boarded: 38, status: 'on_schedule' },
  { id: 'BUS-02', routeNumber: 'Route 204', routeName: 'West Valley & Suburbs', driverName: 'Robert Johnson', driverPhone: '+1 (555) 302-7744', plateNumber: 'NX-25-BUS', currentSpeed: '28 km/h', nextStop: 'Grand Central Plaza', eta: '9 mins', capacity: 45, boarded: 41, status: 'delayed' },
  { id: 'BUS-03', routeNumber: 'Route 305', routeName: 'South Tech Corridor', driverName: 'Elena Rostova', driverPhone: '+1 (555) 303-6622', plateNumber: 'NX-26-BUS', currentSpeed: '55 km/h', nextStop: 'Innovation Park Gate', eta: '2 mins', capacity: 50, boarded: 48, status: 'on_schedule' },
  { id: 'BUS-04', routeNumber: 'Route 408', routeName: 'East Hills Shuttle', driverName: 'David Lee', driverPhone: '+1 (555) 304-5511', plateNumber: 'NX-27-BUS', currentSpeed: '0 km/h', nextStop: 'Campus Bus Terminal', eta: 'Arrived', capacity: 35, boarded: 0, status: 'completed' }
];

export function FleetTracking() {
  const [fleet] = useState<BusFleetItem[]>(initialFleet);
  const [selectedBus, setSelectedBus] = useState<BusFleetItem>(initialFleet[0]);
  const { openDialog } = useDialog();

  const handleBroadcastDelay = (bus: BusFleetItem) => {
    openDialog(
      'M17_DELAY_ALERT',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Broadcast instant route delay notice to all {bus.boarded} boarded student guardians.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Delay Reason</label>
              <select className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none">
                <option>Heavy Traffic Congestion on Expressway</option>
                <option>Road Construction Detour</option>
                <option>Inclement Weather & Low Visibility</option>
                <option>Minor Mechanical Checkup Required</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Estimated Delay Duration</label>
              <select className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none">
                <option>10 - 15 Minutes</option>
                <option>20 - 30 Minutes</option>
                <option>More than 45 Minutes</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Preview SMS Message</label>
              <div className="p-3 bg-bg-2 border border-line rounded-xl text-xs text-fg-2 font-mono">
                "Dear Guardian, NexusCampus {bus.routeNumber} is experiencing a 15-min traffic delay. Current location: {bus.nextStop}. Live track via Parent Portal."
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button
              onClick={() => {
                alert(`Delay SMS broadcast dispatched to ${bus.boarded} parent contacts on ${bus.routeNumber}!`);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-warning hover:bg-warning/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Send SMS Alert
            </button>
          </div>
        </div>
      ),
      {},
      { title: `M17: Broadcast Delay Alert — ${bus.routeNumber}`, size: 'md' }
    );
  };

  return (
    <ModulePageLayout
      moduleId="M17"
      moduleTitle="Transport & Fleet Telemetry"
      portalName="Campus Life & Operations"
      description="Real-time GPS vehicle tracking, route ETA prediction, geo-fence monitoring, and automated guardian pickup alerts."
      tags={['Route Optimization', 'Live GPS Tracking', 'Geo-Fencing']}
    >
      {/* Fleet KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Total Active Fleet</span>
          <span className="text-2xl font-bold text-fg-0 mt-0.5 block">{fleet.length} Buses</span>
        </div>
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Active on Route</span>
          <span className="text-2xl font-bold text-primary mt-0.5 block">3 Vehicles</span>
        </div>
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Total Passengers</span>
          <span className="text-2xl font-bold text-success mt-0.5 block">127 Students</span>
        </div>
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">On-Time Reliability</span>
          <span className="text-2xl font-bold text-fg-0 mt-0.5 block">94.8%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Fleet List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-fg-0">Active Campus Routes</h3>
          <div className="space-y-3">
            {fleet.map((bus) => {
              const isSelected = selectedBus.id === bus.id;
              return (
                <div
                  key={bus.id}
                  onClick={() => setSelectedBus(bus)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                    isSelected
                      ? 'bg-primary/10 border-primary shadow-md'
                      : 'bg-bg-1 border-line hover:border-line-hover'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-line/60 mb-2">
                    <div className="flex items-center gap-2">
                      <Bus className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-fg-2'}`} />
                      <span className="font-bold text-sm text-fg-0">{bus.routeNumber}</span>
                    </div>
                    {bus.status === 'on_schedule' && (
                      <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> On Time
                      </span>
                    )}
                    {bus.status === 'delayed' && (
                      <span className="text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Delayed
                      </span>
                    )}
                    {bus.status === 'completed' && (
                      <span className="text-[10px] font-semibold text-fg-2 bg-bg-2 px-2 py-0.5 rounded-full border border-line">
                        Completed
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs">
                    <span className="font-semibold text-fg-1 block">{bus.routeName}</span>
                    <span className="text-fg-2 block">Driver: {bus.driverName} ({bus.driverPhone})</span>
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-line/40 text-[11px]">
                      <span className="text-fg-2">Next: <strong>{bus.nextStop}</strong></span>
                      <span className="font-mono font-bold text-primary">ETA: {bus.eta}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Visual Simulated Route Telemetry Map */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4 border-b border-line mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {selectedBus.plateNumber}
                  </span>
                  <h3 className="font-bold text-base text-fg-0">{selectedBus.routeName}</h3>
                </div>
                <span className="text-xs text-fg-2 mt-0.5 block">Live Telemetry Feed · Updated 5 seconds ago</span>
              </div>

              <button
                onClick={() => handleBroadcastDelay(selectedBus)}
                className="px-3 py-1.5 bg-warning/10 hover:bg-warning/20 text-warning border border-warning/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Broadcast Delay SMS
              </button>
            </div>

            {/* Visual Simulated Route Map Canvas */}
            <div className="h-72 w-full rounded-2xl bg-gradient-to-br from-bg-2 via-bg-1 to-bg-2 border border-line relative overflow-hidden flex items-center justify-center p-6">
              {/* Simulated Map Grid Roads */}
              <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#888_1px,transparent_1px)] [background-size:16px_16px]" />
              
              {/* Route Line */}
              <div className="w-full flex items-center justify-between relative z-10 px-6">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-success text-white flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-fg-0 mt-2">Origin Terminal</span>
                  <span className="text-[10px] text-fg-2">08:00 AM</span>
                </div>

                <div className="flex-1 h-1 bg-success/60 mx-2 relative" />

                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-success text-white flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-fg-0 mt-2">Metro Junction</span>
                  <span className="text-[10px] text-fg-2">08:20 AM</span>
                </div>

                <div className="flex-1 h-1 bg-primary relative mx-2">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex flex-col items-center animate-pulse">
                    <div className="p-1.5 rounded-full bg-primary text-white shadow-md">
                      <Bus className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary border border-primary flex items-center justify-center shadow-lg">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-fg-0 mt-2">{selectedBus.nextStop}</span>
                  <span className="text-[10px] font-mono text-primary font-bold">ETA: {selectedBus.eta}</span>
                </div>

                <div className="flex-1 h-1 bg-line mx-2" />

                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-bg-2 text-fg-2 border border-line flex items-center justify-center">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-fg-2 mt-2">Campus Terminal</span>
                  <span className="text-[10px] text-fg-2">09:10 AM</span>
                </div>
              </div>
            </div>

            {/* Telemetry Stats Bar */}
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-line text-xs">
              <div>
                <span className="text-fg-2 block">Current Velocity:</span>
                <span className="text-base font-bold text-fg-0 font-mono">{selectedBus.currentSpeed}</span>
              </div>
              <div>
                <span className="text-fg-2 block">Student Capacity:</span>
                <span className="text-base font-bold text-fg-0 font-mono">{selectedBus.boarded} / {selectedBus.capacity} Boarded</span>
              </div>
              <div>
                <span className="text-fg-2 block">Driver Contact:</span>
                <span className="text-base font-bold text-primary">{selectedBus.driverPhone}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
