import { useState, useEffect } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { MOCK_STUDENTS, StudentRecord } from '@mock-platform';
import { useDialog } from '../../core/dialog';
import { useAuth } from '../../core/auth/AuthContext';
import { apiClient } from '../../api/client';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Save, 
  Calendar, 
  CheckCheck, 
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileText,
  Send,
  UserCheck,
  Check,
  Plus
} from 'lucide-react';

interface AttendanceEntry {
  student: StudentRecord;
  status: 'present' | 'absent' | 'late';
  remark?: string;
}

interface LeaveRequest {
  id: string;
  student_id: string;
  student_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
}

const initialLeaves: LeaveRequest[] = [
  {
    id: 'LV-301',
    student_id: 'STU-1001',
    student_name: 'Emma Watson',
    leave_type: 'Academic Symposium',
    start_date: '2026-09-18',
    end_date: '2026-09-19',
    days_count: 2,
    reason: 'Presenting research paper on Distributed ML at IEEE Student Conference.',
    status: 'pending'
  },
  {
    id: 'LV-302',
    student_id: 'STU-1002',
    student_name: 'Liam Smith',
    leave_type: 'Medical Excuse',
    start_date: '2026-09-08',
    end_date: '2026-09-10',
    days_count: 3,
    reason: 'Severe viral flu, physician clearance note submitted.',
    status: 'approved',
    reviewed_by: 'Dr. Alan Turing'
  },
  {
    id: 'LV-303',
    student_id: 'STU-1004',
    student_name: 'Sophia Davis',
    leave_type: 'Personal / Family',
    start_date: '2026-08-28',
    end_date: '2026-08-29',
    days_count: 2,
    reason: 'Family event out of state.',
    status: 'approved',
    reviewed_by: 'Faculty Dean'
  }
];

export function DailyAttendance() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';

  const [activeTab, setActiveTab] = useState<'roster' | 'my_attendance' | 'leaves_queue'>(
    isStudent ? 'my_attendance' : 'roster'
  );

  const [selectedClass, setSelectedClass] = useState('CS-301: Machine Learning');
  const [selectedDate, setSelectedDate] = useState('2026-09-14');
  const [attendanceList, setAttendanceList] = useState<AttendanceEntry[]>(() => 
    MOCK_STUDENTS.map((s, idx) => ({
      student: s,
      status: idx === 1 ? 'late' : idx === 3 ? 'absent' : 'present',
      remark: idx === 3 ? 'Medical Excuse Pending' : ''
    }))
  );
  const [leaves, setLeaves] = useState<LeaveRequest[]>(initialLeaves);

  const { openConfirm, openDialog } = useDialog();

  // Load leaves from backend if available
  useEffect(() => {
    async function loadLeaves() {
      try {
        const data = await apiClient.getStudentLeaves();
        if (data && data.length > 0) {
          setLeaves(data);
        }
      } catch (err) {
        console.warn('Leaves backend offline fallback');
      }
    }
    loadLeaves();
  }, []);

  const handleToggleStatus = (studentId: string, newStatus: 'present' | 'absent' | 'late') => {
    setAttendanceList(prev => prev.map(item => {
      if (item.student.id === studentId) {
        return { ...item, status: newStatus };
      }
      return item;
    }));
  };

  const handleMarkAllPresent = () => {
    setAttendanceList(prev => prev.map(item => ({ ...item, status: 'present' })));
  };

  const handleSubmitAttendance = () => {
    const absentCount = attendanceList.filter(a => a.status === 'absent').length;
    openConfirm({
      title: 'Submit Daily Attendance Register?',
      message: `Locking attendance for ${selectedClass} on ${selectedDate}. ${absentCount} absence notices will be dispatched to guardians via SMS/WhatsApp.`,
      variant: 'default',
      confirmLabel: 'Lock & Dispatch Alerts',
      onConfirm: () => {
        alert('Attendance locked and guardian SMS notifications dispatched!');
      }
    });
  };

  // STUDENT ACTION: Apply for Leave
  const handleApplyLeave = () => {
    openDialog(
      'M09_APPLY_LEAVE',
      ({ onClose }) => {
        let leaveType = 'Medical Excuse';
        let startDate = '2026-09-21';
        let endDate = '2026-09-22';
        let reason = '';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Submit student leave request for formal faculty advisory board review.</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Student</label>
                <input
                  type="text"
                  disabled
                  value={`${currentStudentName} (${currentStudentId})`}
                  className="w-full bg-bg-3 border border-line rounded-xl px-3 py-2 text-fg-2 font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Leave Category *</label>
                <select
                  defaultValue={leaveType}
                  onChange={(e) => { leaveType = e.target.value; }}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Medical Excuse">Medical Excuse (Doctor Certificate)</option>
                  <option value="Academic Symposium">Academic Symposium / Paper Presentation</option>
                  <option value="Personal / Family">Personal / Family Emergency</option>
                  <option value="Sports / Extracurricular">Inter-University Athletics / Sports</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Start Date *</label>
                  <input
                    type="date"
                    defaultValue={startDate}
                    onChange={(e) => { startDate = e.target.value; }}
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-fg-0 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">End Date *</label>
                  <input
                    type="date"
                    defaultValue={endDate}
                    onChange={(e) => { endDate = e.target.value; }}
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-fg-0 outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Detailed Explanation & Reason *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide context for faculty advisor review..."
                  onChange={(e) => { reason = e.target.value; }}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-fg-0 outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-fg-2 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!reason.trim()) {
                    alert('Please enter a reason for leave.');
                    return;
                  }
                  const newLv: LeaveRequest = {
                    id: `LV-${Math.floor(100 + Math.random() * 900)}`,
                    student_id: currentStudentId,
                    student_name: currentStudentName,
                    leave_type: leaveType,
                    start_date: startDate,
                    end_date: endDate,
                    days_count: 2,
                    reason,
                    status: 'pending'
                  };

                  try {
                    await apiClient.applyStudentLeave(newLv);
                  } catch (e) {
                    console.warn('Offline leave apply fallback');
                  }

                  setLeaves(prev => [newLv, ...prev]);
                  onClose();
                  alert('Leave application submitted successfully! Your department faculty will review.');
                  setActiveTab('my_attendance');
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Submit Application
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Student Leave of Absence Request', size: 'md' }
    );
  };

  // FACULTY ACTION: Approve or Reject Leave
  const handleReviewLeave = async (leaveId: string, status: 'approved' | 'rejected') => {
    try {
      await apiClient.updateLeaveStatus(leaveId, status, user?.name || 'Dr. Alan Turing');
    } catch (e) {
      console.warn('Offline leave review fallback');
    }

    setLeaves(prev => prev.map(l => l.id === leaveId ? { ...l, status, reviewed_by: user?.name || 'Dr. Alan Turing' } : l));
    alert(`Leave application marked as ${status.toUpperCase()}.`);
  };

  // KPI Calculations
  const presentCount = attendanceList.filter(a => a.status === 'present').length;
  const absentCount = attendanceList.filter(a => a.status === 'absent').length;
  const lateCount = attendanceList.filter(a => a.status === 'late').length;
  const totalCount = attendanceList.length;
  const rate = Math.round(((presentCount + lateCount) / totalCount) * 100);

  const pendingLeavesCount = leaves.filter(l => l.status === 'pending').length;
  const myLeaves = leaves.filter(l => l.student_id === currentStudentId || l.student_name.toLowerCase().includes(currentStudentName.toLowerCase()));

  return (
    <ModulePageLayout
      moduleId="M09"
      moduleTitle="Attendance & Leave Management"
      portalName="Campus Life & Operations"
      description="Daily period-by-period class register, student leave of absence workflow, and biometric attendance records."
      tags={['Biometric RFID', 'Automated SMS', 'Leave Workflow']}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('roster')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'roster' 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                Class Attendance Roster
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('my_attendance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'my_attendance' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              My Attendance & Leaves ({myLeaves.length})
            </button>

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('leaves_queue')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'leaves_queue' 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Leave Approvals Queue
                {pendingLeavesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-[10px] text-black font-bold">
                    {pendingLeavesCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyLeave}
              className="px-3.5 py-2 bg-gradient-to-r from-primary to-secondary hover:opacity-95 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Apply for Leave
            </button>
          </div>
        </div>

        {/* TAB 1: FACULTY CLASS ROSTER */}
        {!isStudent && activeTab === 'roster' && (
          <div className="space-y-6">
            {/* Selector & Date Filter Controls */}
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-fg-2">Class Slot:</span>
                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs font-semibold text-fg-0 outline-none focus:border-primary"
                  >
                    <option>CS-301: Machine Learning (Room 402)</option>
                    <option>SE-204: Cloud Architecture (Lab 2)</option>
                    <option>MTH-310: Cryptography (Lecture Hall B)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-fg-2" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-bg-2 border border-line rounded-xl px-3 py-1.5 text-xs font-semibold text-fg-0 outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="px-3 py-2 bg-bg-2 hover:bg-bg-3 border border-line text-xs font-semibold text-fg-0 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-success" /> Mark All Present
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAttendance}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Submit Register
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
                <span className="text-xs text-fg-2 block">Present</span>
                <span className="text-2xl font-bold text-success mt-0.5 block">{presentCount}</span>
                <span className="text-[11px] text-fg-2 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3 h-3 text-success" /> In class on time
                </span>
              </div>

              <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
                <span className="text-xs text-fg-2 block">Late Arrivals</span>
                <span className="text-2xl font-bold text-warning mt-0.5 block">{lateCount}</span>
                <span className="text-[11px] text-fg-2 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3 text-warning" /> Grace period &lt; 15 mins
                </span>
              </div>

              <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
                <span className="text-xs text-fg-2 block">Absent / Truant</span>
                <span className="text-2xl font-bold text-danger mt-0.5 block">{absentCount}</span>
                <span className="text-[11px] text-danger flex items-center gap-1 mt-1 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Auto-SMS alert armed
                </span>
              </div>

              <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
                <span className="text-xs text-fg-2 block">Attendance Ratio</span>
                <span className="text-2xl font-bold text-primary mt-0.5 block">{rate}%</span>
                <span className="text-[11px] text-success flex items-center gap-1 mt-1 font-medium">
                  <TrendingUp className="w-3 h-3" /> Minimum benchmark: 85%
                </span>
              </div>
            </div>

            {/* Attendance Register Table */}
            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-fg-0">Class Roster ({attendanceList.length} Students)</h3>
                <span className="text-xs text-fg-2">Click status buttons to toggle student attendance</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-bg-2/50 text-[11px] font-bold text-fg-2 uppercase tracking-wider">
                      <th className="p-4">Student</th>
                      <th className="p-4">Roll Number</th>
                      <th className="p-4 text-center">Historical Attendance</th>
                      <th className="p-4 text-center">Current Status</th>
                      <th className="p-4">Remarks / Excuse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {attendanceList.map((entry) => (
                      <tr key={entry.student.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={entry.student.avatar}
                              alt={entry.student.name}
                              className="w-8 h-8 rounded-full object-cover ring-1 ring-line"
                            />
                            <div>
                              <span className="font-semibold text-fg-0 block">{entry.student.name}</span>
                              <span className="text-[11px] text-fg-2">{entry.student.program}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-4 font-mono font-bold text-primary">
                          {entry.student.id}
                        </td>

                        <td className="p-4 text-center">
                          <span className="font-mono font-bold text-fg-0">{entry.student.attendanceRate}%</span>
                        </td>

                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(entry.student.id, 'present')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                entry.status === 'present'
                                  ? 'bg-success text-white shadow-sm ring-2 ring-success/30'
                                  : 'bg-bg-2 text-fg-2 hover:text-success hover:bg-success/10'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> P
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleStatus(entry.student.id, 'late')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                entry.status === 'late'
                                  ? 'bg-warning text-white shadow-sm ring-2 ring-warning/30'
                                  : 'bg-bg-2 text-fg-2 hover:text-warning hover:bg-warning/10'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5" /> L
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleStatus(entry.student.id, 'absent')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                entry.status === 'absent'
                                  ? 'bg-danger text-white shadow-sm ring-2 ring-danger/30'
                                  : 'bg-bg-2 text-fg-2 hover:text-danger hover:bg-danger/10'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" /> A
                            </button>
                          </div>
                        </td>

                        <td className="p-4">
                          <input
                            type="text"
                            defaultValue={entry.remark || ''}
                            placeholder="Add teacher remark..."
                            className="w-full bg-bg-2 border border-line rounded-lg px-2.5 py-1 text-xs text-fg-0 outline-none focus:border-primary"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STUDENT ATTENDANCE SCORE & LEAVES HISTORY */}
        {activeTab === 'my_attendance' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">My Overall Attendance</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">94.2%</p>
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Above 85% Exam Eligibility Cutoff
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Sessions Attended</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">82 / 87</p>
                <p className="text-xs text-fg-2 mt-2">Lectures, Labs & Seminars</p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Approved Leaves</span>
                <p className="text-3xl font-bold text-primary mt-1 font-mono">5 Days</p>
                <p className="text-xs text-fg-2 mt-2">Excused with faculty sanction</p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Pending Requests</span>
                <p className="text-3xl font-bold text-amber-400 mt-1 font-mono">
                  {myLeaves.filter(l => l.status === 'pending').length}
                </p>
                <p className="text-xs text-fg-2 mt-2">Awaiting advisor signature</p>
              </div>
            </div>

            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-fg-0">My Leave Applications & Medical Sanctions</h3>
                  <p className="text-xs text-fg-2 mt-0.5">Formal records of authorized leaves submitted for {currentStudentName}</p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyLeave}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
                >
                  + Apply New Leave
                </button>
              </div>

              {myLeaves.length === 0 ? (
                <div className="p-10 text-center text-xs text-fg-2">
                  No leave applications recorded. You have a clean attendance sheet!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Application ID</th>
                        <th className="py-3 px-4">Leave Category</th>
                        <th className="py-3 px-4">Dates Window</th>
                        <th className="py-3 px-4">Days</th>
                        <th className="py-3 px-4">Reason</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Reviewed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {myLeaves.map((lv) => (
                        <tr key={lv.id} className="hover:bg-bg-2/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-primary">{lv.id}</td>
                          <td className="py-3 px-4 font-semibold text-fg-0">{lv.leave_type}</td>
                          <td className="py-3 px-4 font-mono text-fg-1">{lv.start_date} to {lv.end_date}</td>
                          <td className="py-3 px-4 font-bold text-fg-0">{lv.days_count}</td>
                          <td className="py-3 px-4 text-fg-2 max-w-xs truncate">{lv.reason}</td>
                          <td className="py-3 px-4">
                            {lv.status === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> In Review
                              </span>
                            )}
                            {lv.status === 'approved' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Approved
                              </span>
                            )}
                            {lv.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                <XCircle className="w-3 h-3" /> Declined
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right text-fg-1 font-medium">
                            {lv.reviewed_by || 'Pending Advisor'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FACULTY LEAVE APPROVALS QUEUE */}
        {!isStudent && activeTab === 'leaves_queue' && (
          <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-fg-0">Student Leave Applications Approval Queue</h3>
                <p className="text-xs text-fg-2 mt-0.5">Faculty advisory review for medical, academic symposium, and emergency leaves</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {pendingLeavesCount} pending approval
              </span>
            </div>

            {pendingLeavesCount === 0 ? (
              <div className="p-10 text-center text-xs text-fg-2">
                All student leave requests have been reviewed and resolved!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {leaves.filter(l => l.status === 'pending').map((lv) => (
                      <tr key={lv.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-fg-0 block">{lv.student_name}</span>
                          <span className="text-[11px] text-fg-2 font-mono">{lv.student_id}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-primary">{lv.leave_type}</td>
                        <td className="py-3 px-4 font-mono text-fg-1">
                          {lv.start_date} &rarr; {lv.end_date} ({lv.days_count} days)
                        </td>
                        <td className="py-3 px-4 text-fg-2 max-w-sm">{lv.reason}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lv.id, 'rejected')}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewLeave(lv.id, 'approved')}
                              className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                            >
                              <Check className="w-3 h-3" /> Approve Leave
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
