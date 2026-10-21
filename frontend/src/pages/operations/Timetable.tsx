import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  Plus, 
  Sparkles, 
  Trash2, 
  CheckCircle2
} from 'lucide-react';
import { useDialog } from '../../core/dialog';

interface ClassSession {
  id: string;
  name: string;
  code: string;
  room: string;
  instructor: string;
  type: 'Lecture' | 'Seminar' | 'Lab' | 'Break' | 'Workshop';
  duration: number;
  color: string;
}

interface TimeSlot {
  time: string;
  classes: ClassSession[];
}

const initialSchedule: TimeSlot[] = [
  { time: '09:00 AM', classes: [
    { id: 'CLS-101', name: 'Data Structures & Algorithms', code: 'CS-301', room: 'Lab 402', instructor: 'Dr. Alan Turing', type: 'Lecture', duration: 2, color: 'bg-primary/10 border-primary/30 text-primary' },
    { id: 'CLS-102', name: 'Business Ethics & Law', code: 'BUS-205', room: 'Room 105', instructor: 'Sarah Jenkins', type: 'Seminar', duration: 1, color: 'bg-warning/10 border-warning/30 text-warning' }
  ]},
  { time: '10:00 AM', classes: [
    { id: 'CLS-103', name: 'Advanced Calculus & Cryptography', code: 'MTH-401', room: 'Hall B', instructor: 'Dr. Katherine Johnson', type: 'Lecture', duration: 1.5, color: 'bg-secondary/10 border-secondary/30 text-secondary' }
  ]},
  { time: '11:00 AM', classes: [] },
  { time: '12:00 PM', classes: [
    { id: 'CLS-LUNCH', name: 'Institutional Lunch Break', code: '', room: 'Central Cafeteria', instructor: '', type: 'Break', duration: 1, color: 'bg-bg-2 border-line text-fg-2' }
  ]},
  { time: '01:00 PM', classes: [
    { id: 'CLS-104', name: 'Cloud Distributed Systems Lab', code: 'SE-405', room: 'Lab 405', instructor: 'Prof. Margaret Hamilton', type: 'Lab', duration: 3, color: 'bg-success/10 border-success/30 text-success' }
  ]},
  { time: '02:00 PM', classes: [] },
  { time: '03:00 PM', classes: [] },
  { time: '04:00 PM', classes: [
    { id: 'CLS-105', name: 'Deep Neural Networks & Vision', code: 'AI-501', room: 'Room 302', instructor: 'Dr. Geoffrey Hinton', type: 'Lecture', duration: 2, color: 'bg-info/10 border-info/30 text-info' }
  ]}
];

const daysOfWeek = ['Monday, Oct 24', 'Tuesday, Oct 25', 'Wednesday, Oct 26', 'Thursday, Oct 27', 'Friday, Oct 28'];

export function Timetable() {
  const [schedule, setSchedule] = useState<TimeSlot[]>(initialSchedule);
  const [selectedRoom, setSelectedRoom] = useState('All Rooms');
  const [dayIndex, setDayIndex] = useState(0);
  const { openDialog, openConfirm } = useDialog();

  const rooms = ['All Rooms', 'Lab 402', 'Hall B', 'Room 105', 'Lab 405', 'Room 302'];

  // CREATE: Schedule Class Modal
  const handleOpenScheduleModal = () => {
    openDialog(
      'schedule-class-modal',
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = (form.elements.namedItem('name') as HTMLInputElement).value;
            const code = (form.elements.namedItem('code') as HTMLInputElement).value;
            const room = (form.elements.namedItem('room') as HTMLSelectElement).value;
            const instructor = (form.elements.namedItem('instructor') as HTMLInputElement).value;
            const time = (form.elements.namedItem('time') as HTMLSelectElement).value;
            const type = (form.elements.namedItem('type') as HTMLSelectElement).value as any;
            const duration = parseFloat((form.elements.namedItem('duration') as HTMLInputElement).value);

            const colorMap: Record<string, string> = {
              'Lecture': 'bg-primary/10 border-primary/30 text-primary',
              'Seminar': 'bg-warning/10 border-warning/30 text-warning',
              'Lab': 'bg-success/10 border-success/30 text-success',
              'Workshop': 'bg-secondary/10 border-secondary/30 text-secondary',
              'Break': 'bg-bg-2 border-line text-fg-2'
            };

            const newClass: ClassSession = {
              id: `CLS-${Math.floor(100 + Math.random() * 900)}`,
              name,
              code,
              room,
              instructor,
              type,
              duration: isNaN(duration) ? 1.5 : duration,
              color: colorMap[type] || 'bg-primary/10 border-primary/30 text-primary'
            };

            setSchedule(prev => prev.map(slot => {
              if (slot.time === time) {
                return { ...slot, classes: [...slot.classes, newClass] };
              }
              return slot;
            }));

            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Schedule a lecture session or lab slot in the master campus timetable.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Subject / Session Name *</label>
              <input 
                name="name"
                type="text"
                required
                placeholder="e.g. Mobile Computing & Embedded Systems"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Course Code *</label>
                <input 
                  name="code"
                  type="text"
                  required
                  placeholder="e.g. CS-412"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs font-mono text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Room / Venue</label>
                <select 
                  name="room"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Lab 402">Lab 402</option>
                  <option value="Hall B">Hall B</option>
                  <option value="Room 105">Room 105</option>
                  <option value="Lab 405">Lab 405</option>
                  <option value="Room 302">Room 302</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Time Slot</label>
                <select 
                  name="time"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="09:00 AM">09:00 AM</option>
                  <option value="10:00 AM">10:00 AM</option>
                  <option value="11:00 AM">11:00 AM</option>
                  <option value="01:00 PM">01:00 PM</option>
                  <option value="02:00 PM">02:00 PM</option>
                  <option value="03:00 PM">03:00 PM</option>
                  <option value="04:00 PM">04:00 PM</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Type</label>
                <select 
                  name="type"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Lecture">Lecture</option>
                  <option value="Lab">Lab</option>
                  <option value="Seminar">Seminar</option>
                  <option value="Workshop">Workshop</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Duration (Hours)</label>
                <input 
                  name="duration"
                  type="number"
                  step="0.5"
                  defaultValue={1.5}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Assigned Faculty / Instructor</label>
              <input 
                name="instructor"
                type="text"
                defaultValue="Dr. Alan Turing"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Book Session
            </button>
          </div>
        </form>
      ),
      {},
      { title: 'M07: Master Schedule — Book Time Slot', size: 'md' }
    );
  };

  // DETAILS & CANCEL: Class Slot Details
  const handleClassClick = (cls: ClassSession, time: string) => {
    if (cls.type === 'Break') return;

    openDialog(
      `class-details-${cls.id}`,
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="flex items-start justify-between pb-3 border-b border-line">
            <div>
              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {cls.code} · {cls.type}
              </span>
              <h3 className="text-base font-bold text-fg-0 mt-1">{cls.name}</h3>
            </div>
            <span className="text-xs font-mono font-bold text-fg-2">{time}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3.5 bg-bg-2 rounded-xl border border-line text-xs">
            <div>
              <span className="text-fg-2 block">Room Allocation</span>
              <span className="font-bold text-fg-0 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-primary" /> {cls.room}
              </span>
            </div>
            <div>
              <span className="text-fg-2 block">Instructor</span>
              <span className="font-bold text-fg-0 flex items-center gap-1 mt-0.5">
                <Users className="w-3.5 h-3.5 text-secondary" /> {cls.instructor}
              </span>
            </div>
            <div>
              <span className="text-fg-2 block">Session Duration</span>
              <span className="font-bold text-fg-0 flex items-center gap-1 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-warning" /> {cls.duration} Hours
              </span>
            </div>
            <div>
              <span className="text-fg-2 block">Attendance Policy</span>
              <span className="font-bold text-success flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mandatory (Biometric)
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-line">
            <button
              onClick={() => {
                onClose();
                openConfirm({
                  title: `Cancel Session: ${cls.name}?`,
                  message: `Are you sure you want to cancel the ${time} session in ${cls.room}? All enrolled students will receive an automated schedule cancellation SMS.`,
                  variant: 'danger',
                  confirmLabel: 'Confirm Cancellation',
                  onConfirm: () => {
                    setSchedule(prev => prev.map(slot => ({
                      ...slot,
                      classes: slot.classes.filter(c => c.id !== cls.id)
                    })));
                  }
                });
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-error bg-error/10 hover:bg-error/20 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Cancel Class
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-fg-1 bg-bg-2 hover:bg-bg-3 border border-line rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      ),
      {},
      { title: `${cls.code} — Class Session Details`, size: 'md' }
    );
  };

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                M07
              </span>
              <h1 className="text-2xl font-bold text-fg-0">Master Campus Timetable</h1>
            </div>
            <p className="text-sm text-fg-2">
              Coordinate lecture hall allocations, lab schedules, room conflict detection, and faculty calendars.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-bg-1 border border-line rounded-xl p-1 shadow-sm">
              <button 
                onClick={() => setDayIndex(prev => Math.max(0, prev - 1))}
                disabled={dayIndex === 0}
                className="p-1.5 text-fg-2 hover:text-fg-0 hover:bg-bg-2 rounded-lg transition-colors disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 font-semibold text-xs text-fg-0 px-2">
                <CalendarIcon className="w-3.5 h-3.5 text-primary" /> {daysOfWeek[dayIndex]}
              </div>
              <button 
                onClick={() => setDayIndex(prev => Math.min(daysOfWeek.length - 1, prev + 1))}
                disabled={dayIndex === daysOfWeek.length - 1}
                className="p-1.5 text-fg-2 hover:text-fg-0 hover:bg-bg-2 rounded-lg transition-colors disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleOpenScheduleModal}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Book Session
            </button>
          </div>
        </div>

        {/* Timetable Matrix Box */}
        <div className="bg-bg-1 border border-line rounded-2xl shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Room Filter Tabs Bar */}
          <div className="flex border-b border-line bg-bg-2/30">
            <div className="w-20 md:w-32 border-r border-line p-3 flex items-center justify-center text-[11px] font-bold text-fg-2 uppercase tracking-wider">
              Time Slot
            </div>
            <div className="flex-1 p-2.5 flex gap-2 overflow-x-auto custom-scrollbar items-center">
              {rooms.map((room) => (
                <button 
                  key={room} 
                  onClick={() => setSelectedRoom(room)}
                  className={`px-3.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedRoom === room 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'bg-bg-2 text-fg-2 hover:text-fg-0 hover:bg-bg-3 border border-line'
                  }`}
                >
                  {room}
                </button>
              ))}
            </div>
          </div>

          {/* Time Slots Rows */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative divide-y divide-line">
            {schedule.map((slot, i) => {
              const displayedClasses = slot.classes.filter(cls => 
                selectedRoom === 'All Rooms' || cls.room === selectedRoom || cls.type === 'Break'
              );

              return (
                <div key={i} className="flex min-h-[90px] hover:bg-bg-2/20 transition-colors">
                  <div className="w-20 md:w-32 border-r border-line p-3 flex flex-col items-center justify-start text-xs font-mono font-bold text-fg-2 bg-bg-2/20 shrink-0">
                    {slot.time}
                  </div>
                  <div className="flex-1 p-2.5 md:p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {displayedClasses.map((cls, j) => (
                      <div 
                        key={j} 
                        onClick={() => handleClassClick(cls, slot.time)}
                        className={`border rounded-xl p-3 flex flex-col ${cls.color} cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all`}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <h3 className="font-bold text-xs leading-tight">{cls.name}</h3>
                          {cls.code && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-white/30 dark:bg-black/30 rounded">
                              {cls.code}
                            </span>
                          )}
                        </div>
                        <div className="mt-auto space-y-1 text-[11px] opacity-90">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" /> {cls.duration}h ({cls.type})
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-current/20">
                            <span className="flex items-center gap-1 font-semibold">
                              <MapPin className="w-3 h-3" /> {cls.room}
                            </span>
                            {cls.instructor && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" /> {cls.instructor.split(' ').slice(-1)[0]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {displayedClasses.length === 0 && (
                      <div className="flex items-center justify-center border border-dashed border-line/60 rounded-xl p-3 text-xs text-fg-2 col-span-full font-mono">
                        No scheduled sessions in this room for {slot.time}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
}
