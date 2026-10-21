import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Banknote, 
  Calendar, 
  Download, 
  Play, 
  Users, 
  FileText, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Search
} from 'lucide-react';

interface StaffPayrollItem {
  id: string;
  staffId: string;
  name: string;
  department: string;
  designation: string;
  accountNo: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: 'paid' | 'processing' | 'flagged';
  anomalyReason?: string;
}

const mockStaffPayrolls: StaffPayrollItem[] = [
  {
    id: 'PAY-2026-001',
    staffId: 'FAC-101',
    name: 'Dr. Alistair Vance',
    department: 'School of Computing',
    designation: 'Professor & Dean',
    accountNo: '•••• 4920',
    basicSalary: 8500,
    allowances: 2200,
    deductions: 1450,
    netSalary: 9250,
    status: 'paid'
  },
  {
    id: 'PAY-2026-002',
    staffId: 'FAC-104',
    name: 'Dr. Sarah Lin',
    department: 'Electrical Engineering',
    designation: 'Associate Professor',
    accountNo: '•••• 8821',
    basicSalary: 6800,
    allowances: 1600,
    deductions: 1100,
    netSalary: 7300,
    status: 'paid'
  },
  {
    id: 'PAY-2026-003',
    staffId: 'FAC-112',
    name: 'Prof. Rajesh Kulkarni',
    department: 'Mechanical Engineering',
    designation: 'Assistant Professor',
    accountNo: '•••• 3190',
    basicSalary: 5200,
    allowances: 1100,
    deductions: 820,
    netSalary: 5480,
    status: 'flagged',
    anomalyReason: 'Overtime claim exceeds 35-hour monthly departmental cap'
  },
  {
    id: 'PAY-2026-004',
    staffId: 'ADM-042',
    name: 'Elena Gomez',
    department: 'Registrar & Admissions',
    designation: 'Senior Admissions Officer',
    accountNo: '•••• 7114',
    basicSalary: 4200,
    allowances: 950,
    deductions: 640,
    netSalary: 4510,
    status: 'paid'
  },
  {
    id: 'PAY-2026-005',
    staffId: 'OPS-019',
    name: 'David MacIntyre',
    department: 'Campus Facilities',
    designation: 'Lead Maintenance Engineer',
    accountNo: '•••• 1982',
    basicSalary: 3800,
    allowances: 1250,
    deductions: 580,
    netSalary: 4470,
    status: 'flagged',
    anomalyReason: 'Bank IFSC routing code update pending verification'
  },
  {
    id: 'PAY-2026-006',
    staffId: 'LIB-003',
    name: 'Claire Beauchamp',
    department: 'Central Library',
    designation: 'Head Librarian',
    accountNo: '•••• 6031',
    basicSalary: 4600,
    allowances: 800,
    deductions: 710,
    netSalary: 4690,
    status: 'processing'
  }
];

export function PayrollDashboard() {
  const [payrollList, setPayrollList] = useState<StaffPayrollItem[]>(mockStaffPayrolls);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [selectedCycle] = useState('September 2026');
  const { openDialog, openConfirm } = useDialog();

  const filteredStaff = payrollList.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.staffId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = filterDepartment === 'all' || item.department === filterDepartment;
    return matchesSearch && matchesDept;
  });

  const totalDisbursed = payrollList.reduce((acc, curr) => acc + curr.netSalary, 0);
  const flaggedCount = payrollList.filter(p => p.status === 'flagged').length;
  const processedCount = payrollList.filter(p => p.status === 'paid').length;

  const handleExecuteSalaryRun = () => {
    openConfirm({
      title: 'Execute September 2026 Salary Run',
      message: `You are about to initiate statutory payroll clearance for ${payrollList.length} staff totaling $${totalDisbursed.toLocaleString()}. All direct-deposit ACH / NACH instruction files will be transmitted to partner bank gateways. Continue?`,
      variant: 'default',
      confirmLabel: 'Confirm & Transmit ACH',
      onConfirm: () => {
        setPayrollList(prev => prev.map(p => p.status === 'flagged' ? p : { ...p, status: 'paid' }));
      }
    });
  };

  const handleViewPayslip = (item: StaffPayrollItem) => {
    openDialog(
      'M06_PAYSLIP_VIEW',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-bg-2 border border-line space-y-3">
            <div className="flex items-center justify-between border-b border-line/60 pb-3">
              <div>
                <h3 className="font-bold text-fg-0 text-sm">{item.name}</h3>
                <p className="text-xs text-fg-2 font-mono">{item.staffId} • {item.designation}</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {selectedCycle}
                </span>
                <p className="text-[10px] text-fg-2 mt-0.5">{item.department}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs pt-1">
              <div className="space-y-2">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-fg-2">Earnings (+)</h4>
                <div className="flex justify-between py-1 border-b border-line/40">
                  <span className="text-fg-1">Basic Salary</span>
                  <span className="font-mono text-fg-0">${item.basicSalary.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line/40">
                  <span className="text-fg-1">Allowances (HRA & DA)</span>
                  <span className="font-mono text-fg-0">${item.allowances.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 text-emerald-400">
                  <span>Gross Earnings</span>
                  <span className="font-mono">${(item.basicSalary + item.allowances).toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-fg-2">Deductions (-)</h4>
                <div className="flex justify-between py-1 border-b border-line/40">
                  <span className="text-fg-1">Provident Fund (PF)</span>
                  <span className="font-mono text-fg-0">${Math.round(item.deductions * 0.45).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line/40">
                  <span className="text-fg-1">Tax / TDS</span>
                  <span className="font-mono text-fg-0">${Math.round(item.deductions * 0.55).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 text-rose-400">
                  <span>Total Deductions</span>
                  <span className="font-mono">${item.deductions.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between mt-2">
              <div>
                <span className="text-[11px] font-medium text-fg-2">Net Salary Deposited</span>
                <p className="text-[10px] text-fg-2 font-mono">Disbursed to {item.accountNo}</p>
              </div>
              <span className="text-xl font-bold text-primary font-mono">${item.netSalary.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-2 hover:bg-bg-2 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                alert(`Official PDF Payslip downloaded for ${item.name} (${item.staffId})`);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              <Download className="w-3.5 h-3.5" />
              Download Official PDF
            </button>
          </div>
        </div>
      ),
      {},
      { title: `Payslip Summary • ${item.staffId}`, size: 'md' }
    );
  };

  const handleResolveAnomaly = (item: StaffPayrollItem) => {
    openConfirm({
      title: 'Clear Payroll Flag',
      message: `Mark anomaly on ${item.name}'s salary record as reviewed and approved for statutory clearance?`,
      variant: 'warning',
      confirmLabel: 'Approve Clearance',
      onConfirm: () => {
        setPayrollList(prev => prev.map(p => p.id === item.id ? { ...p, status: 'paid', anomalyReason: undefined } : p));
      }
    });
  };

  return (
    <ModulePageLayout
      moduleId="M06"
      moduleTitle="Staff Payroll & Salary Runs"
      portalName="Workforce & Governance"
      description="Comprehensive salary structures, statutory deductions, monthly disbursement cycles, and AI anomaly auditing"
    >
      <div className="space-y-6">
        {/* Top Control Bar & High-Level KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Disbursed This Cycle</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">${totalDisbursed.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">100% statutory compliant</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Total Active Staff</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{payrollList.length}</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">{processedCount} cleared & deposited</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Flagged Anomalies</span>
              <span className="text-xl font-bold text-amber-400 font-mono tracking-tight">{flaggedCount}</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Require manager clearance</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="text-[11px] font-medium text-fg-2 block">Cycle Timeline</span>
              <span className="text-sm font-bold text-fg-0 block">{selectedCycle}</span>
              <span className="text-[10px] text-cyan-400 block mt-0.5">Clearing Window: 28th-30th</span>
            </div>
          </div>
        </div>

        {/* Action Header & Action Buttons */}
        <div className="p-4 rounded-2xl bg-bg-1 border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search staff name or ID..."
                className="pl-9 pr-3.5 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50 w-52 sm:w-64"
              />
            </div>

            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
            >
              <option value="all">All Departments</option>
              <option value="School of Computing">School of Computing</option>
              <option value="Electrical Engineering">Electrical Engineering</option>
              <option value="Mechanical Engineering">Mechanical Engineering</option>
              <option value="Registrar & Admissions">Registrar & Admissions</option>
              <option value="Campus Facilities">Campus Facilities</option>
              <option value="Central Library">Central Library</option>
            </select>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => alert('Batch exported NACH direct-deposit payment file for processing.')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-0 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-fg-2" />
              <span>Export Bank File</span>
            </button>

            <button
              type="button"
              onClick={handleExecuteSalaryRun}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Execute Salary Run</span>
            </button>
          </div>
        </div>

        {/* Staff Payroll Table */}
        <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-primary" />
                Staff Salary Registers & Disbursement
              </h2>
              <p className="text-xs text-fg-2 mt-0.5">Detailed breakdown of basic pay, allowances, and statutory withholding</p>
            </div>
            <span className="text-xs font-mono text-fg-2">
              Showing {filteredStaff.length} of {payrollList.length} staff
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Department & Role</th>
                  <th className="py-3 px-4 text-right">Basic Pay</th>
                  <th className="py-3 px-4 text-right">Allowances</th>
                  <th className="py-3 px-4 text-right">Deductions</th>
                  <th className="py-3 px-4 text-right">Net Payable</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-bg-2/40 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-bold text-fg-0 block">{staff.name}</span>
                        <span className="text-[11px] text-fg-2 font-mono">{staff.staffId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-fg-1 block">{staff.department}</span>
                      <span className="text-[10px] text-fg-2">{staff.designation}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-fg-1">
                      ${staff.basicSalary.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-400">
                      +${staff.allowances.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-400">
                      -${staff.deductions.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-fg-0">
                      ${staff.netSalary.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {staff.status === 'paid' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Disbursed
                        </span>
                      )}
                      {staff.status === 'processing' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          <Clock className="w-3 h-3" /> Processing
                        </span>
                      )}
                      {staff.status === 'flagged' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <ShieldAlert className="w-3 h-3" /> Flagged
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {staff.status === 'flagged' ? (
                          <button
                            type="button"
                            onClick={() => handleResolveAnomaly(staff)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors"
                          >
                            Resolve Flag
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleViewPayslip(staff)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors"
                          >
                            <FileText className="w-3 h-3 text-primary" />
                            Payslip
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
    </ModulePageLayout>
  );
}
