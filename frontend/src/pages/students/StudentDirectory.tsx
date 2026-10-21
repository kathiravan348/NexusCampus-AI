import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModulePageLayout } from '../../core/templates';
import { DataTableLayout } from '../../core/templates';
import { MOCK_STUDENTS, StudentRecord } from '@mock-platform';
import { useDialog } from '../../core/dialog';
import { RegisterStudentModal } from './RegisterStudentModal';
import { apiClient } from '../../api/client';
import { 
  Plus, 
  ExternalLink, 
  GraduationCap, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  TrendingUp
} from 'lucide-react';

export function StudentDirectory() {
  const [students, setStudents] = useState<StudentRecord[]>(MOCK_STUDENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [feeFilter, setFeeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();
  const { openDialog, openConfirm } = useDialog();

  useEffect(() => {
    let mounted = true;
    apiClient.getStudents()
      .then(data => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          const mapped: StudentRecord[] = data.map(d => ({
            id: d.id,
            name: d.name,
            email: d.email,
            phone: d.phone || '',
            avatar: d.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.name}`,
            program: d.program || 'B.Sc. Computer Science',
            cohort: d.cohort || '2024-2028',
            semester: d.semester || 'Semester 3',
            gpa: Number(d.gpa) || 3.8,
            attendanceRate: Number(d.attendance_rate) || 95,
            feeStatus: (d.fee_status || 'paid') as any,
            outstandingAmount: Number(d.outstanding_amount) || 0,
            admissionsStage: (d.admissions_stage || 'enrolled') as any,
            advisor: d.advisor || 'Faculty Advisor',
            guardianName: d.guardian_name || '',
            guardianPhone: d.guardian_phone || '',
            status: (d.status || 'active') as any,
            createdAt: d.created_at || ''
          }));
          setStudents(mapped);
        }
      })
      .catch(err => {
        console.warn('Using local mock data for students', err);
      });
    return () => { mounted = false; };
  }, []);

  const handleOpenRegister = () => {
    openDialog(
      'M04_REGISTER_STUDENT',
      RegisterStudentModal,
      {
        onRegister: (newStu: StudentRecord) => {
          setStudents(prev => [newStu, ...prev]);
          apiClient.createStudent({
            name: newStu.name,
            email: newStu.email,
            phone: newStu.phone,
            program: newStu.program,
            cohort: newStu.cohort,
            semester: newStu.semester,
            gpa: newStu.gpa,
            fee_status: newStu.feeStatus,
            advisor: newStu.advisor
          }).catch(console.error);
        }
      },
      { title: 'M04: Student Information (SIS) — Direct Enrolment', size: 'lg' }
    );
  };

  const handleArchiveStudent = (student: StudentRecord) => {
    openConfirm({
      title: `Archive Student: ${student.name}?`,
      message: `Are you sure you want to transition ${student.name} (${student.id}) to Inactive status? Active portal access and library checkouts will be flagged.`,
      variant: 'danger',
      confirmLabel: 'Confirm Archive',
      onConfirm: () => {
        setStudents(prev => prev.filter(s => s.id !== student.id));
        apiClient.deleteStudent(student.id).catch(console.error);
      }
    });
  };

  const filteredStudents = students.filter(s => {
    const matchesQuery = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.program.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFee = feeFilter === 'all' || s.feeStatus === feeFilter;
    return matchesQuery && matchesFee;
  });

  return (
    <ModulePageLayout
      moduleId="M04"
      moduleTitle="Student Information System (SIS)"
      portalName="Student Lifecycle & CRM"
      description="Holistic Student 360 directory, enrollment registry, academic progress, and guardian linkages."
      tags={['Student 360', 'ID Card QR', 'Document Wallet']}
      actions={
        <button
          onClick={handleOpenRegister}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-2 hover:scale-[1.02]"
        >
          <Plus className="w-4 h-4" /> Enrol Student
        </button>
      }
    >
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Total Enrolled</span>
          <span className="text-xl font-bold text-fg-0 mt-0.5 block">{students.length} Students</span>
          <span className="text-[11px] text-success flex items-center gap-1 mt-1 font-medium">
            <TrendingUp className="w-3 h-3" /> 100% Active Cohort
          </span>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Average GPA</span>
          <span className="text-xl font-bold text-primary mt-0.5 block">3.71</span>
          <span className="text-[11px] text-fg-2 flex items-center gap-1 mt-1 font-medium">
            <GraduationCap className="w-3 h-3" /> Dean's Honor Threshold: 3.5
          </span>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Attendance Health</span>
          <span className="text-xl font-bold text-success mt-0.5 block">91.2%</span>
          <span className="text-[11px] text-success flex items-center gap-1 mt-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Minimum 75% required
          </span>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <span className="text-xs text-fg-2 block">Fee Dues Pending</span>
          <span className="text-xl font-bold text-warning mt-0.5 block">
            ${students.reduce((acc, s) => acc + s.outstandingAmount, 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-warning flex items-center gap-1 mt-1 font-medium">
            <AlertCircle className="w-3 h-3" /> {students.filter(s => s.feeStatus !== 'paid').length} accounts pending
          </span>
        </div>
      </div>

      {/* Main Table Layout */}
      <DataTableLayout
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by student name, roll number, or program..."
        totalRecords={filteredStudents.length}
        currentPage={currentPage}
        pageSize={8}
        onPageChange={setCurrentPage}
        filters={
          <div className="flex items-center gap-2">
            <select
              value={feeFilter}
              onChange={(e) => setFeeFilter(e.target.value)}
              className="bg-bg-1 border border-line rounded-xl px-3 py-2 text-xs text-fg-1 outline-none focus:border-primary"
            >
              <option value="all">All Fee Statuses</option>
              <option value="paid">Paid in Full</option>
              <option value="partial">Partial Balance</option>
              <option value="overdue">Overdue Arrears</option>
            </select>
          </div>
        }
      >
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-bg-2/40 text-[11px] font-bold text-fg-2 uppercase tracking-wider">
              <th className="p-4">Student</th>
              <th className="p-4">Roll Number</th>
              <th className="p-4">Program & Cohort</th>
              <th className="p-4 text-center">GPA</th>
              <th className="p-4 text-center">Attendance</th>
              <th className="p-4">Fee Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-xs">
            {filteredStudents.map((stu) => (
              <tr 
                key={stu.id} 
                onClick={() => navigate('/student/profile')}
                className="hover:bg-bg-2/50 cursor-pointer transition-colors group"
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={stu.avatar}
                      alt={stu.name}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-line"
                    />
                    <div>
                      <span className="font-semibold text-fg-0 group-hover:text-primary transition-colors block">
                        {stu.name}
                      </span>
                      <span className="text-[11px] text-fg-2">{stu.email}</span>
                    </div>
                  </div>
                </td>

                <td className="p-4 font-mono font-bold text-primary">
                  {stu.id}
                </td>

                <td className="p-4 text-fg-1">
                  <span className="font-medium block">{stu.program}</span>
                  <span className="text-[11px] text-fg-2">{stu.cohort} · {stu.semester}</span>
                </td>

                <td className="p-4 text-center">
                  <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-xs ${
                    stu.gpa >= 3.8 
                      ? 'bg-success/10 text-success' 
                      : stu.gpa >= 3.0 
                      ? 'bg-primary/10 text-primary' 
                      : 'bg-warning/10 text-warning'
                  }`}>
                    {stu.gpa.toFixed(2)}
                  </span>
                </td>

                <td className="p-4 text-center">
                  <div className="inline-flex items-center gap-1.5 font-medium">
                    <span className={`w-2 h-2 rounded-full ${
                      stu.attendanceRate >= 90 ? 'bg-success' : stu.attendanceRate >= 75 ? 'bg-warning' : 'bg-danger'
                    }`} />
                    <span>{stu.attendanceRate}%</span>
                  </div>
                </td>

                <td className="p-4">
                  {stu.feeStatus === 'paid' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                      <CheckCircle2 className="w-3 h-3" /> Paid
                    </span>
                  )}
                  {stu.feeStatus === 'partial' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20">
                      <Clock className="w-3 h-3" /> Partial (${stu.outstandingAmount})
                    </span>
                  )}
                  {stu.feeStatus === 'overdue' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">
                      <AlertCircle className="w-3 h-3" /> Due (${stu.outstandingAmount})
                    </span>
                  )}
                </td>

                <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => navigate('/student/profile')}
                      className="p-1.5 rounded-lg text-fg-2 hover:text-primary hover:bg-bg-2 transition-colors"
                      title="View Student 360 Profile"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleArchiveStudent(stu)}
                      className="text-[11px] text-danger hover:underline px-1.5 py-0.5"
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableLayout>
    </ModulePageLayout>
  );
}
