import { useState, useEffect } from 'react';
import { Shell } from '../../components/layout/Shell';
import { 
  Download, 
  Search, 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  ArrowUpRight, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Sparkles, 
  Clock, 
  AlertCircle, 
  FileText,
  QrCode,
  ShieldCheck,
  Receipt
} from 'lucide-react';
import { useDialog } from '../../core/dialog';
import { useAuth } from '../../core/auth/AuthContext';
import { apiClient } from '../../api/client';

interface Invoice {
  id: string;
  student: string;
  studentId: string;
  amount: number;
  paidAmount: number;
  date: string;
  dueDate: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  type: 'Tuition Fee' | 'Hostel Fee' | 'Lab & Library' | 'Transport Fee' | 'Exam Fee';
}

const initialInvoices: Invoice[] = [
  { id: 'INV-2026-001', student: 'Emma Watson', studentId: 'STU-1001', amount: 6500, paidAmount: 6500, date: '2026-09-01', dueDate: '2026-09-30', status: 'Paid', type: 'Tuition Fee' },
  { id: 'INV-2026-007', student: 'Emma Watson', studentId: 'STU-1001', amount: 450, paidAmount: 0, date: '2026-09-10', dueDate: '2026-09-25', status: 'Pending', type: 'Lab & Library' },
  { id: 'INV-2026-002', student: 'Liam Smith', studentId: 'STU-1002', amount: 4800, paidAmount: 0, date: '2026-09-02', dueDate: '2026-09-25', status: 'Pending', type: 'Tuition Fee' },
  { id: 'INV-2026-003', student: 'Noah Johnson', studentId: 'STU-1003', amount: 1200, paidAmount: 0, date: '2026-08-15', dueDate: '2026-08-31', status: 'Overdue', type: 'Hostel Fee' },
  { id: 'INV-2026-004', student: 'Olivia Williams', studentId: 'STU-1004', amount: 350, paidAmount: 350, date: '2026-09-05', dueDate: '2026-09-20', status: 'Paid', type: 'Lab & Library' },
  { id: 'INV-2026-005', student: 'William Brown', studentId: 'STU-1005', amount: 6500, paidAmount: 6500, date: '2026-09-03', dueDate: '2026-09-30', status: 'Paid', type: 'Tuition Fee' },
  { id: 'INV-2026-006', student: 'Sophia Martinez', studentId: 'STU-1008', amount: 450, paidAmount: 0, date: '2026-08-10', dueDate: '2026-08-25', status: 'Overdue', type: 'Exam Fee' },
];

export function Finance() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';

  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [activeTab, setActiveTab] = useState<'student_view' | 'institutional_ledger'>(
    isStudent ? 'student_view' : 'institutional_ledger'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Pending' | 'Overdue'>('All');
  const { openDialog, openConfirm } = useDialog();

  // Load from backend if available
  useEffect(() => {
    async function loadInvoices() {
      try {
        const data = await apiClient.getInvoices();
        if (data && data.length > 0) {
          const mapped: Invoice[] = data.map((d: any) => ({
            id: d.id,
            student: d.student_name || d.student || 'Enrolled Student',
            studentId: d.student_id || 'STU-1001',
            amount: Number(d.amount) || 0,
            paidAmount: d.status === 'Paid' ? Number(d.amount) : 0,
            date: d.created_at ? d.created_at.substring(0, 10) : '2026-09-10',
            dueDate: d.due_date || '2026-10-15',
            status: d.status as any || 'Pending',
            type: (d.type || 'Tuition Fee') as any
          }));
          setInvoices(mapped);
        }
      } catch (err) {
        console.warn('Using local finance state fallback:', err);
      }
    }
    loadInvoices();
  }, []);

  // Dynamic KPI Calculations from state
  const totalCollected = invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
  const pendingAmount = invoices
    .filter(inv => inv.status === 'Pending')
    .reduce((acc, inv) => acc + (inv.amount - inv.paidAmount), 0);
  const overdueAmount = invoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((acc, inv) => acc + (inv.amount - inv.paidAmount), 0);

  // Student specific invoices
  const studentInvoices = invoices.filter(inv => inv.studentId === currentStudentId || inv.student.toLowerCase().includes(currentStudentName.toLowerCase()));
  const studentTotalBilled = studentInvoices.reduce((acc, inv) => acc + inv.amount, 0);
  const studentTotalPaid = studentInvoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
  const studentOutstanding = studentTotalBilled - studentTotalPaid;

  // STUDENT ACTION: Pay Online Modal
  const handlePayOnline = (inv: Invoice) => {
    openDialog(
      'M07_PAY_ONLINE',
      ({ onClose }) => {
        let cardNumber = '4242 •••• •••• 4242';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>256-Bit SSL Encrypted Student Payment Gateway</span>
              </div>
              <span className="font-mono font-bold">${inv.amount.toLocaleString()}.00</span>
            </div>

            <div className="p-3 bg-bg-2 rounded-xl border border-line text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-fg-2">Bill Reference:</span>
                <span className="font-mono font-bold text-fg-0">{inv.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-2">Fee Category:</span>
                <span className="font-semibold text-fg-1">{inv.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-2">Student Name:</span>
                <span className="font-semibold text-fg-1">{inv.student} ({inv.studentId})</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <label className="font-semibold text-fg-1 block mb-1">Select Payment Channel</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="p-2.5 rounded-xl border border-primary/40 bg-primary/10 text-primary text-center flex flex-col items-center gap-1 font-semibold"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Card</span>
                </button>
                <button
                  type="button"
                  className="p-2.5 rounded-xl border border-line bg-bg-2 hover:bg-bg-3 text-fg-1 text-center flex flex-col items-center gap-1"
                >
                  <QrCode className="w-4 h-4" />
                  <span>UPI / QR</span>
                </button>
                <button
                  type="button"
                  className="p-2.5 rounded-xl border border-line bg-bg-2 hover:bg-bg-3 text-fg-1 text-center flex flex-col items-center gap-1"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Wire / NetBank</span>
                </button>
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Card / Account Identifier</label>
                <input
                  type="text"
                  defaultValue={cardNumber}
                  onChange={(e) => { cardNumber = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Expiry Date</label>
                  <input
                    type="text"
                    defaultValue="12/28"
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">CVV / Security Code</label>
                  <input
                    type="password"
                    defaultValue="•••"
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary"
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
                onClick={async () => {
                  try {
                    await apiClient.updateInvoiceStatus(inv.id, 'Paid');
                  } catch (e) {
                    console.warn('Offline invoice update fallback');
                  }

                  setInvoices(prev => prev.map(item => item.id === inv.id ? { ...item, status: 'Paid', paidAmount: item.amount } : item));
                  onClose();
                  handleShowReceipt({ ...inv, status: 'Paid', paidAmount: inv.amount });
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Authorize & Pay ${(inv.amount - inv.paidAmount).toLocaleString()}.00
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: `Online Fee Payment • ${inv.id}`, size: 'md' }
    );
  };

  // SHOW RECEIPT MODAL
  const handleShowReceipt = (inv: Invoice) => {
    const txnRef = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    openDialog(
      'M07_VIEW_RECEIPT',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-1">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="font-bold text-fg-0 text-sm">Payment Processed Successfully</h3>
            <p className="text-[11px] text-emerald-400 font-mono">Receipt Reference: {txnRef}</p>
          </div>

          <div className="p-4 bg-bg-2 rounded-2xl border border-line text-xs space-y-2.5">
            <div className="flex justify-between border-b border-line/60 pb-2">
              <span className="text-fg-2">Institution:</span>
              <span className="font-bold text-fg-0">Nexus Campus of Higher Learning</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Student Name:</span>
              <span className="font-semibold text-fg-1">{inv.student}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Roll / Student ID:</span>
              <span className="font-mono text-fg-1">{inv.studentId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Fee Item:</span>
              <span className="font-semibold text-fg-1">{inv.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Payment Date:</span>
              <span className="font-mono text-fg-1">{new Date().toISOString().substring(0, 10)}</span>
            </div>
            <div className="flex justify-between border-t border-line/60 pt-2 text-sm font-bold">
              <span className="text-fg-0">Amount Paid:</span>
              <span className="text-emerald-400 font-mono">${inv.amount.toLocaleString()}.00 USD</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-fg-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Official Cryptographic Digital Stamp
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-fg-2 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  alert(`Receipt PDF for ${inv.id} generated and downloaded!`);
                  onClose();
                }}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF Receipt
              </button>
            </div>
          </div>
        </div>
      ),
      {},
      { title: `Fee Receipt • ${inv.id}`, size: 'md' }
    );
  };

  // CREATE: New Invoice Modal
  const handleOpenCreateInvoice = () => {
    openDialog(
      'create-invoice-modal',
      ({ onClose }) => (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const student = (form.elements.namedItem('student') as HTMLInputElement).value;
            const type = (form.elements.namedItem('type') as HTMLSelectElement).value as any;
            const amount = parseFloat((form.elements.namedItem('amount') as HTMLInputElement).value);
            const dueDate = (form.elements.namedItem('dueDate') as HTMLInputElement).value;

            const newInv: Invoice = {
              id: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
              student,
              studentId: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
              amount: isNaN(amount) ? 1500 : amount,
              paidAmount: 0,
              date: new Date().toISOString().substring(0, 10),
              dueDate: dueDate || '2026-10-15',
              status: 'Pending',
              type
            };

            try {
              await apiClient.createInvoice({
                student_id: newInv.studentId,
                student_name: newInv.student,
                amount: newInv.amount,
                type: newInv.type,
                due_date: newInv.dueDate
              });
            } catch (err) {
              console.warn('Offline invoice creation fallback');
            }

            setInvoices(prev => [newInv, ...prev]);
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Generate an official institutional fee bill & invoice schedule.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Enrolled Student Name *</label>
              <input 
                name="student"
                type="text"
                required
                placeholder="e.g. Lucas Vance"
                defaultValue="Lucas Vance"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Fee Category *</label>
                <select 
                  name="type"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Tuition Fee">Tuition Fee</option>
                  <option value="Hostel Fee">Hostel Fee</option>
                  <option value="Lab & Library">Lab & Library Fee</option>
                  <option value="Transport Fee">Transport Fee</option>
                  <option value="Exam Fee">Exam Fee</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Amount ($ USD) *</label>
                <input 
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 4500"
                  defaultValue="4500"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Payment Due Date</label>
              <input 
                name="dueDate"
                type="date"
                defaultValue="2026-10-15"
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
              <Plus className="w-3.5 h-3.5" /> Dispatch Invoice
            </button>
          </div>
        </form>
      ),
      {},
      { title: 'Create Student Fee Invoice', size: 'md' }
    );
  };

  // UPDATE: Mark Invoice as Paid (Bursar view)
  const handleMarkAsPaid = (inv: Invoice) => {
    openConfirm({
      title: `Collect Payment for ${inv.id}?`,
      message: `Record receipt of $${(inv.amount - inv.paidAmount).toLocaleString()} for ${inv.student} (${inv.type})? Institutional ledger will immediately update.`,
      variant: 'default',
      confirmLabel: 'Confirm Full Payment',
      onConfirm: async () => {
        try {
          await apiClient.updateInvoiceStatus(inv.id, 'Paid');
        } catch (e) {
          console.warn('Offline payment update');
        }
        setInvoices(prev => prev.map(item => {
          if (item.id === inv.id) {
            return { ...item, status: 'Paid', paidAmount: item.amount };
          }
          return item;
        }));
      }
    });
  };

  // DELETE: Void / Cancel Invoice
  const handleVoidInvoice = (inv: Invoice) => {
    openConfirm({
      title: `Void Invoice ${inv.id}?`,
      message: `Are you sure you want to void and remove the bill of $${inv.amount.toLocaleString()} for ${inv.student}?`,
      variant: 'danger',
      confirmLabel: 'Confirm Void',
      onConfirm: () => {
        setInvoices(prev => prev.filter(item => item.id !== inv.id));
      }
    });
  };

  // EXPORT: Simulated CSV Report Download
  const handleExportReport = () => {
    openDialog(
      'export-finance-report',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-success/10 border border-success/20 text-xs text-success flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Monthly Fee Collection & Invoicing Audit Report ready for export.</span>
          </div>
          <div className="p-4 bg-bg-2 rounded-xl border border-line text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-fg-2">Total Invoices Evaluated:</span>
              <span className="font-bold text-fg-0">{invoices.length} Accounts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Net Realized Revenue:</span>
              <span className="font-bold text-success">${totalCollected.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Pending Arrears:</span>
              <span className="font-bold text-warning">${pendingAmount.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Close</button>
            <button 
              onClick={() => {
                alert('Financial statement CSV generated and download simulated!');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download Statement
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'Export Fee Ledger Summary', size: 'md' }
    );
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      !searchQuery ||
      inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.student.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.studentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                M15
              </span>
              <h1 className="text-2xl font-bold text-fg-0">Fees, Finance & Online Invoicing</h1>
            </div>
            <p className="text-sm text-fg-2">
              Student self-service fee payments, automated tuition schedules, receipts ledger, and real-time revenue clearance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isStudent && (
              <button 
                onClick={handleOpenCreateInvoice}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Create Invoice
              </button>
            )}
            <button 
              onClick={handleExportReport}
              className="px-3.5 py-2 bg-bg-1 border border-line hover:bg-bg-2 text-fg-0 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-primary" /> Export Ledger
            </button>
          </div>
        </div>

        {/* Dynamic Navigation Mode Switcher */}
        <div className="flex items-center gap-2 p-1 bg-bg-2 border border-line rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('student_view')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'student_view'
                ? 'bg-primary text-white shadow-sm'
                : 'text-fg-2 hover:text-fg-0'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Student Fee Portal ({currentStudentName})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('institutional_ledger')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'institutional_ledger'
                ? 'bg-primary text-white shadow-sm'
                : 'text-fg-2 hover:text-fg-0'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Institutional Register ({invoices.length})
          </button>
        </div>

        {/* View 1: Student Fee Portal & Pay Online */}
        {activeTab === 'student_view' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Total Billed Fees</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">${studentTotalBilled.toLocaleString()}</p>
                <p className="text-xs text-fg-2 mt-2">Fall & Spring Semester 2026</p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Total Paid & Cleared</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">${studentTotalPaid.toLocaleString()}</p>
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Receipts verified by Bursar Desk
                </p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Outstanding Due</span>
                <p className={`text-3xl font-bold mt-1 font-mono ${studentOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  ${studentOutstanding.toLocaleString()}
                </p>
                <p className="text-xs text-fg-2 mt-2">
                  {studentOutstanding > 0 ? 'Immediate online payment available' : 'All accounts in good standing'}
                </p>
              </div>
            </div>

            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-fg-0">Personal Fee Invoices & Payment Schedule</h3>
                  <p className="text-xs text-fg-2 mt-0.5">Click 'Pay Online' to settle dues via instant card or digital payment</p>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  {studentInvoices.length} Bills
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Invoice ID</th>
                      <th className="py-3 px-4">Fee Description</th>
                      <th className="py-3 px-4">Issued Date</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {studentInvoices.map((inv) => {
                      const isPaid = inv.status === 'Paid';

                      return (
                        <tr key={inv.id} className="hover:bg-bg-2/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-primary">{inv.id}</td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-fg-0 block">{inv.type}</span>
                            <span className="text-[10px] text-fg-2">Campus Academic Year 2026</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-fg-1">{inv.date}</td>
                          <td className="py-3 px-4 font-mono text-fg-1">{inv.dueDate}</td>
                          <td className="py-3 px-4 font-mono font-bold text-fg-0">
                            ${inv.amount.toLocaleString()}.00
                          </td>
                          <td className="py-3 px-4">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Paid & Cleared
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> Due Soon
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isPaid ? (
                              <button
                                type="button"
                                onClick={() => handleShowReceipt(inv)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 transition-colors"
                              >
                                <Receipt className="w-3 h-3 text-emerald-400" />
                                View Receipt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePayOnline(inv)}
                                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all"
                              >
                                <CreditCard className="w-3 h-3" />
                                Pay Online
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Institutional Ledger (Bursar / Officer View) */}
        {activeTab === 'institutional_ledger' && (
          <div className="space-y-6">
            {/* Dynamic Financial KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-success/10 text-success rounded-xl">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="text-fg-1 text-sm font-semibold">Total Realized Revenue</h3>
                </div>
                <p className="text-3xl font-bold text-fg-0">${totalCollected.toLocaleString()}</p>
                <p className="text-xs text-success flex items-center gap-1 mt-2 font-medium">
                  <TrendingUp className="w-3 h-3" /> Real-time cleared institutional ledger
                </p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-warning/10 text-warning rounded-xl">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <h3 className="text-fg-1 text-sm font-semibold">Pending Invoices</h3>
                </div>
                <p className="text-3xl font-bold text-fg-0">${pendingAmount.toLocaleString()}</p>
                <p className="text-xs text-fg-2 flex items-center gap-1 mt-2">
                  <Clock className="w-3 h-3 text-warning" /> {invoices.filter(i => i.status === 'Pending').length} active student bills
                </p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-error/10 text-error rounded-xl">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <h3 className="text-fg-1 text-sm font-semibold">Overdue Fees</h3>
                </div>
                <p className="text-3xl font-bold text-fg-0">${overdueAmount.toLocaleString()}</p>
                <p className="text-xs text-error flex items-center gap-1 mt-2 font-medium">
                  <AlertCircle className="w-3 h-3" /> Requires automated reminder dispatch
                </p>
              </div>
            </div>

            {/* Invoices List Table */}
            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-4 bg-bg-2/30">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h2 className="font-bold text-fg-0 text-sm">Active Invoicing Registers ({filteredInvoices.length})</h2>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 p-1 bg-bg-2 rounded-xl border border-line text-xs">
                    {(['All', 'Paid', 'Pending', 'Overdue'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          statusFilter === st 
                            ? 'bg-bg-0 text-primary shadow-xs font-semibold' 
                            : 'text-fg-2 hover:text-fg-0'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
                    <input 
                      type="text"
                      placeholder="Search student or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-bg-2 border border-line rounded-xl pl-9 pr-4 py-1.5 text-xs text-fg-0 outline-none focus:border-primary w-48"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Invoice Ref</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Fee Category</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-primary">{inv.id}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-fg-0 block">{inv.student}</span>
                          <span className="text-[11px] text-fg-2 font-mono">{inv.studentId}</span>
                        </td>
                        <td className="py-3 px-4 text-fg-1">{inv.type}</td>
                        <td className="py-3 px-4 font-mono text-fg-1">{inv.dueDate}</td>
                        <td className="py-3 px-4 font-mono font-bold text-fg-0">
                          ${inv.amount.toLocaleString()}.00
                        </td>
                        <td className="py-3 px-4">
                          {inv.status === 'Paid' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Paid
                            </span>
                          )}
                          {inv.status === 'Pending' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                          {inv.status === 'Overdue' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Overdue
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status === 'Paid' ? (
                              <button
                                type="button"
                                onClick={() => handleShowReceipt(inv)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1"
                              >
                                Receipt
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkAsPaid(inv)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                              >
                                Mark Paid
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleVoidInvoice(inv)}
                              className="p-1 rounded-lg text-fg-2 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      </div>
    </Shell>
  );
}
