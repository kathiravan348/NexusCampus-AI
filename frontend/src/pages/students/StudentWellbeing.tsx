import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  HeartHandshake, 
  Search, 
  Plus, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Lock 
} from 'lucide-react';

interface WellbeingCase {
  id: string;
  studentName: string;
  rollNo: string;
  category: 'Academic Stress' | 'Exam Anxiety' | 'Peer & Social Conflict' | 'Career Guidance' | 'Personal Wellbeing';
  severity: 'Low' | 'Moderate' | 'High Safeguard';
  assignedCounselor: string;
  sessionsCompleted: number;
  lastSessionDate: string;
  status: 'active' | 'resolved';
}

interface DisciplineRecord {
  id: string;
  studentName: string;
  rollNo: string;
  incidentType: 'Academic Integrity' | 'Hostel Curfew Breach' | 'Lab Safety Violation' | 'Campus Noise Grievance';
  reportedDate: string;
  hearingDate: string;
  committeeVerdict: 'Inquiry Pending' | 'Official Warning Issued' | 'Community Service' | 'Exonerated & Cleared';
  status: 'open' | 'closed';
}

const mockWellbeingCases: WellbeingCase[] = [
  {
    id: 'WB-101',
    studentName: 'Emma Watson',
    rollNo: 'STU-1001',
    category: 'Academic Stress',
    severity: 'Moderate',
    assignedCounselor: 'Dr. Elena Rostova (Lead Clinical Psychologist)',
    sessionsCompleted: 3,
    lastSessionDate: '2026-09-08',
    status: 'active'
  },
  {
    id: 'WB-102',
    studentName: 'Noah Johnson',
    rollNo: 'STU-1003',
    category: 'Exam Anxiety',
    severity: 'Low',
    assignedCounselor: 'Marcus Sterling (Student Wellbeing Coach)',
    sessionsCompleted: 1,
    lastSessionDate: '2026-09-11',
    status: 'active'
  },
  {
    id: 'WB-103',
    studentName: 'Lucas Vance',
    rollNo: 'STU-1007',
    category: 'Peer & Social Conflict',
    severity: 'High Safeguard',
    assignedCounselor: 'Dr. Elena Rostova (Lead Clinical Psychologist)',
    sessionsCompleted: 4,
    lastSessionDate: '2026-09-05',
    status: 'resolved'
  },
  {
    id: 'WB-104',
    studentName: 'William Brown',
    rollNo: 'STU-1005',
    category: 'Career Guidance',
    severity: 'Low',
    assignedCounselor: 'Marcus Sterling (Student Wellbeing Coach)',
    sessionsCompleted: 2,
    lastSessionDate: '2026-09-12',
    status: 'active'
  }
];

const mockDisciplineRecords: DisciplineRecord[] = [
  {
    id: 'DISC-201',
    studentName: 'Liam Smith',
    rollNo: 'STU-1002',
    incidentType: 'Hostel Curfew Breach',
    reportedDate: '2026-09-02',
    hearingDate: '2026-09-06',
    committeeVerdict: 'Official Warning Issued',
    status: 'closed'
  },
  {
    id: 'DISC-202',
    studentName: 'James Jones',
    rollNo: 'STU-1006',
    incidentType: 'Lab Safety Violation',
    reportedDate: '2026-09-09',
    hearingDate: '2026-09-18',
    committeeVerdict: 'Inquiry Pending',
    status: 'open'
  }
];

export function StudentWellbeing() {
  const [activeTab, setActiveTab] = useState<'wellbeing' | 'counseling' | 'discipline'>('wellbeing');
  const [cases, setCases] = useState<WellbeingCase[]>(mockWellbeingCases);
  const [discipline] = useState<DisciplineRecord[]>(mockDisciplineRecords);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  const filteredCases = cases.filter(c =>
    c.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBookSession = (studentCase?: WellbeingCase) => {
    openDialog(
      'M22_BOOK_SESSION',
      ({ onClose }) => {
        let student = studentCase ? studentCase.studentName : 'Emma Watson (STU-1001)';
        let counselor = 'Dr. Elena Rostova (Lead Clinical Psychologist)';
        let sessionDate = '2026-09-18';
        let format = 'In-Person Private Therapy Room (Wellbeing Center)';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Lock className="w-4 h-4 shrink-0" />
              <span>All counseling interactions are strictly HIPAA/FERPA confidential and encrypted.</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Enrolled Student</label>
                <input
                  type="text"
                  defaultValue={student}
                  onChange={e => { student = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Certified Counselor</label>
                <select
                  defaultValue={counselor}
                  onChange={e => { counselor = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                >
                  <option value="Dr. Elena Rostova (Lead Clinical Psychologist)">Dr. Elena Rostova (Lead Clinical Psychologist)</option>
                  <option value="Marcus Sterling (Student Wellbeing Coach)">Marcus Sterling (Student Wellbeing Coach)</option>
                  <option value="Sarah Jenkins (Cognitive Behavioral Specialist)">Sarah Jenkins (Cognitive Behavioral Specialist)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Appointment Date</label>
                  <input
                    type="date"
                    defaultValue={sessionDate}
                    onChange={e => { sessionDate = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Session Format</label>
                  <select
                    defaultValue={format}
                    onChange={e => { format = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="In-Person Private Therapy Room (Wellbeing Center)">In-Person (Wellbeing Center)</option>
                    <option value="Confidential Telehealth Video Call">Confidential Video Call</option>
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
                  alert(`Confidential counseling session confirmed for ${student} on ${sessionDate}!`);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Calendar className="w-3.5 h-3.5" />
                Confirm Confidential Booking
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Schedule Counseling Appointment', size: 'md' }
    );
  };

  const handleLogIncident = () => {
    openDialog(
      'M22_LOG_INCIDENT',
      ({ onClose }) => {
        let studentRoll = 'STU-1008';
        let category: any = 'Academic Stress';
        let severity: any = 'Moderate';

        return (
          <div className="space-y-4">
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Student Roll Number</label>
                <input
                  type="text"
                  defaultValue={studentRoll}
                  onChange={e => { studentRoll = e.target.value; }}
                  placeholder="e.g. STU-1008"
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Concern Category</label>
                  <select
                    defaultValue={category}
                    onChange={e => { category = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="Academic Stress">Academic Stress</option>
                    <option value="Exam Anxiety">Exam Anxiety</option>
                    <option value="Peer & Social Conflict">Peer & Social Conflict</option>
                    <option value="Personal Wellbeing">Personal Wellbeing</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Severity Classification</label>
                  <select
                    defaultValue={severity}
                    onChange={e => { severity = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                  >
                    <option value="Low">Low (Support Check-in)</option>
                    <option value="Moderate">Moderate (Counselling Recommended)</option>
                    <option value="High Safeguard">High Safeguard (Urgent Care)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Confidential Clinical Observation Notes</label>
                <textarea
                  rows={3}
                  placeholder="Describe academic fatigue, attendance anomalies, or behavioral changes..."
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50 resize-none"
                />
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
                  setCases(prev => [
                    {
                      id: `WB-${Date.now().toString().slice(-3)}`,
                      studentName: 'Sophia Martinez',
                      rollNo: studentRoll,
                      category,
                      severity,
                      assignedCounselor: 'Dr. Elena Rostova (Lead Clinical Psychologist)',
                      sessionsCompleted: 0,
                      lastSessionDate: 'Scheduled',
                      status: 'active'
                    },
                    ...prev
                  ]);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Plus className="w-3.5 h-3.5" />
                Open Support Case
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Open Student Wellbeing Support Case', size: 'md' }
    );
  };

  const handleResolveCase = (c: WellbeingCase) => {
    openConfirm({
      title: `Mark Wellbeing Case ${c.id} as Resolved`,
      message: `Confirm that counseling goals for ${c.studentName} have been achieved and student has signed off on support conclusion?`,
      variant: 'default',
      confirmLabel: 'Close & Archive Case',
      onConfirm: () => {
        setCases(prev => prev.map(item => item.id === c.id ? { ...item, status: 'resolved' } : item));
      }
    });
  };

  const activeCount = cases.filter(c => c.status === 'active').length;

  return (
    <ModulePageLayout
      moduleId="M22"
      moduleTitle="Student Wellbeing & Discipline Radar"
      portalName="Student Lifecycle & CRM"
      description="Confidential mental health counseling, student sentiment radar, pastoral care, and disciplinary committee reviews"
    >
      <div className="space-y-6">
        {/* Top Control Bar & High-Level KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Active Support Cases</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{activeCount} Students</span>
              <span className="text-[10px] text-primary block mt-0.5">Assigned to certified therapists</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Resolution Rate</span>
              <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">94.2%</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Avg. 3.2 sessions to close</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Sessions Completed</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">64 Sessions</span>
              <span className="text-[10px] text-cyan-400 block mt-0.5">Fall 2026 Academic Term</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Disciplinary Cases</span>
              <span className="text-xl font-bold text-amber-400 font-mono tracking-tight">
                {discipline.filter(d => d.status === 'open').length} Open
              </span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Under committee inquiry</span>
            </div>
          </div>
        </div>

        {/* Tab Selector & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('wellbeing')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'wellbeing' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Wellbeing Support Cases ({cases.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('counseling')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'counseling' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Counselor Schedules
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('discipline')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'discipline' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Disciplinary Committee ({discipline.length})
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleBookSession()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-0 transition-colors shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Book Appointment</span>
            </button>

            <button
              type="button"
              onClick={handleLogIncident}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Open Support Case</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Wellbeing Cases */}
        {activeTab === 'wellbeing' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-bg-1 border border-line flex items-center justify-between gap-3 shadow-sm">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search student, roll, or category..."
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>
              <span className="text-xs font-mono text-fg-2">
                Showing {filteredCases.length} cases
              </span>
            </div>

            <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Category & Concern</th>
                      <th className="py-3 px-4">Severity Tag</th>
                      <th className="py-3 px-4">Assigned Counselor</th>
                      <th className="py-3 px-4 text-center">Sessions</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filteredCases.map((item) => (
                      <tr key={item.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-fg-0 block">{item.studentName}</span>
                          <span className="text-[10px] text-fg-2 font-mono">{item.rollNo}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-fg-1 block">{item.category}</span>
                          <span className="text-[10px] text-fg-2">Last: {item.lastSessionDate}</span>
                        </td>
                        <td className="py-3 px-4">
                          {item.severity === 'High Safeguard' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              High Safeguard
                            </span>
                          )}
                          {item.severity === 'Moderate' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Moderate
                            </span>
                          )}
                          {item.severity === 'Low' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              Support
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-fg-1 text-[11px]">{item.assignedCounselor}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-fg-0">
                          {item.sessionsCompleted}
                        </td>
                        <td className="py-3 px-4">
                          {item.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <Clock className="w-3 h-3" /> Active Care
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Resolved
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleBookSession(item)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors"
                            >
                              Book Next
                            </button>
                            {item.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleResolveCase(item)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors"
                              >
                                Resolve
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

        {/* Tab 2: Counselor Profiles & Timeslots */}
        {activeTab === 'counseling' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                ER
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Dr. Elena Rostova, Ph.D.</h3>
              <p className="text-xs text-fg-2">Licensed Clinical Psychologist specializing in adolescent cognitive behavioral therapy, anxiety reduction, and mindfulness.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Office:</span>
                  <span className="font-medium text-fg-0">Room 204, Student Wellbeing Wing</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Next Open Slot:</span>
                  <span className="font-mono text-emerald-400">Today at 02:30 PM</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleBookSession()}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
              >
                Book with Dr. Rostova
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
                MS
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Marcus Sterling, M.Ed.</h3>
              <p className="text-xs text-fg-2">Certified Academic Performance Coach focused on study habits, executive functioning, time-management, and career transitions.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Office:</span>
                  <span className="font-medium text-fg-0">Room 206, Career & Pastoral Bay</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Next Open Slot:</span>
                  <span className="font-mono text-cyan-400">Tomorrow at 10:00 AM</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleBookSession()}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-cyan-400 transition-colors"
              >
                Book with Coach Marcus
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                SJ
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Sarah Jenkins, LMFT</h3>
              <p className="text-xs text-fg-2">Family & Systems Counselor addressing roommate conflicts, peer mediation, campus community adjustment, and homesickness.</p>
              <div className="p-2.5 bg-bg-2 rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-fg-2">Office:</span>
                  <span className="font-medium text-fg-0">Room 208, Counseling Center</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-2">Next Open Slot:</span>
                  <span className="font-mono text-emerald-400">Thursday 03:00 PM</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleBookSession()}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-emerald-400 transition-colors"
              >
                Book with Counselor Sarah
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Disciplinary Committee */}
        {activeTab === 'discipline' && (
          <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  Campus Disciplinary Committee Formal Proceedings
                </h2>
                <p className="text-xs text-fg-2 mt-0.5">Procedural fairness hearings, honor code compliance, and remedial community service tracking</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Case ID & Student</th>
                    <th className="py-3 px-4">Incident Category</th>
                    <th className="py-3 px-4">Reported Date</th>
                    <th className="py-3 px-4">Hearing Date</th>
                    <th className="py-3 px-4">Committee Finding</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {discipline.map((d) => (
                    <tr key={d.id} className="hover:bg-bg-2/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-fg-0 block">{d.studentName}</span>
                        <span className="text-[10px] text-primary font-mono font-semibold">{d.id} ({d.rollNo})</span>
                      </td>
                      <td className="py-3 px-4 text-fg-1">{d.incidentType}</td>
                      <td className="py-3 px-4 font-mono text-fg-2">{d.reportedDate}</td>
                      <td className="py-3 px-4 font-mono text-fg-2">{d.hearingDate}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-fg-0 block">{d.committeeVerdict}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {d.status === 'closed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-bg-2 text-fg-2 border border-line">
                            Closed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Hearing Pending
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
      </div>
    </ModulePageLayout>
  );
}
