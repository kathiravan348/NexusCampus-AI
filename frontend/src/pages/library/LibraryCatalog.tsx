import { useState, useEffect } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { useAuth } from '../../core/auth/AuthContext';
import { apiClient } from '../../api/client';
import { 
  BookOpen, 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  RotateCcw, 
  Sparkles, 
  FileText, 
  Library,
  BookMarked,
  AlertTriangle,
  Send,
  UserCheck,
  Check,
  XCircle,
  RefreshCw
} from 'lucide-react';

interface BookItem {
  id: string;
  isbn: string;
  title: string;
  author: string;
  category: string;
  shelfLocation: string;
  totalCopies: number;
  availableCopies: number;
  coverColor: string;
}

interface LoanRecord {
  id: string;
  book_id?: string;
  book_title: string;
  isbn?: string;
  student_id: string;
  student_name: string;
  issue_date: string;
  due_date: string;
  status: 'pending_approval' | 'active' | 'overdue' | 'returned' | 'rejected';
  fine_amount: number;
  renewed_count?: number;
  notes?: string;
}

const initialBooks: BookItem[] = [
  {
    id: 'BK-101',
    isbn: '978-0131103627',
    title: 'The C Programming Language (2nd Edition)',
    author: 'Brian W. Kernighan, Dennis M. Ritchie',
    category: 'Computer Science',
    shelfLocation: 'Aisle 3, Shelf B2',
    totalCopies: 12,
    availableCopies: 5,
    coverColor: 'from-blue-600 to-indigo-800'
  },
  {
    id: 'BK-102',
    isbn: '978-0262033848',
    title: 'Introduction to Algorithms (CLRS 4th Ed)',
    author: 'Thomas H. Cormen, Charles E. Leiserson',
    category: 'Computer Science',
    shelfLocation: 'Aisle 3, Shelf D1',
    totalCopies: 15,
    availableCopies: 2,
    coverColor: 'from-emerald-600 to-teal-800'
  },
  {
    id: 'BK-103',
    isbn: '978-0134685991',
    title: 'Effective Java (3rd Edition)',
    author: 'Joshua Bloch',
    category: 'Software Engineering',
    shelfLocation: 'Aisle 4, Shelf A1',
    totalCopies: 8,
    availableCopies: 6,
    coverColor: 'from-amber-600 to-orange-800'
  },
  {
    id: 'BK-104',
    isbn: '978-1118063330',
    title: 'Operating System Concepts (10th Ed)',
    author: 'Abraham Silberschatz, Peter B. Galvin',
    category: 'Computer Science',
    shelfLocation: 'Aisle 3, Shelf C4',
    totalCopies: 10,
    availableCopies: 7,
    coverColor: 'from-purple-600 to-violet-800'
  },
  {
    id: 'BK-105',
    isbn: '978-0073529325',
    title: 'Principles of Electronic Materials & Devices',
    author: 'S.O. Kasap',
    category: 'Electrical Engineering',
    shelfLocation: 'Aisle 6, Shelf E3',
    totalCopies: 6,
    availableCopies: 1,
    coverColor: 'from-rose-600 to-red-800'
  },
  {
    id: 'BK-106',
    isbn: '978-0199233847',
    title: 'Oxford Handbook of Clinical Medicine',
    author: 'Ian Wilkinson, Tim Raine',
    category: 'Medical Sciences',
    shelfLocation: 'Aisle 8, Shelf B1',
    totalCopies: 9,
    availableCopies: 4,
    coverColor: 'from-cyan-600 to-blue-800'
  },
  {
    id: 'BK-107',
    isbn: '978-1491954249',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    category: 'Software Engineering',
    shelfLocation: 'Aisle 4, Shelf C2',
    totalCopies: 14,
    availableCopies: 8,
    coverColor: 'from-indigo-600 to-sky-800'
  }
];

const initialLoans: LoanRecord[] = [
  {
    id: 'LN-901',
    book_id: 'BK-102',
    book_title: 'Introduction to Algorithms (CLRS 4th Ed)',
    isbn: '978-0262033848',
    student_id: 'STU-1001',
    student_name: 'Emma Watson',
    issue_date: '2026-09-01',
    due_date: '2026-09-18',
    status: 'active',
    fine_amount: 0.00,
    renewed_count: 0,
    notes: 'Semester algorithms project reference'
  },
  {
    id: 'LN-902',
    book_id: 'BK-107',
    book_title: 'Designing Data-Intensive Applications',
    isbn: '978-1491954249',
    student_id: 'STU-1001',
    student_name: 'Emma Watson',
    issue_date: '2026-09-14',
    due_date: '2026-09-28',
    status: 'pending_approval',
    fine_amount: 0.00,
    renewed_count: 0,
    notes: 'Distributed systems research thesis'
  },
  {
    id: 'LN-903',
    book_id: 'BK-101',
    book_title: 'The C Programming Language (2nd Edition)',
    isbn: '978-0131103627',
    student_id: 'STU-1002',
    student_name: 'Liam Smith',
    issue_date: '2026-08-25',
    due_date: '2026-09-08',
    status: 'overdue',
    fine_amount: 6.00,
    renewed_count: 1,
    notes: 'Standard checkout'
  },
  {
    id: 'LN-904',
    book_id: 'BK-103',
    book_title: 'Effective Java (3rd Edition)',
    isbn: '978-0134685991',
    student_id: 'STU-1004',
    student_name: 'Sophia Davis',
    issue_date: '2026-08-15',
    due_date: '2026-08-29',
    status: 'returned',
    fine_amount: 0.00,
    renewed_count: 0,
    notes: 'Returned in good condition'
  }
];

export function LibraryCatalog() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';

  const [activeTab, setActiveTab] = useState<'catalog' | 'my_loans' | 'approvals' | 'circulation' | 'digital'>(
    isStudent ? 'catalog' : 'catalog'
  );
  const [books, setBooks] = useState<BookItem[]>(initialBooks);
  const [loans, setLoans] = useState<LoanRecord[]>(initialLoans);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { openDialog, openConfirm } = useDialog();

  // Load loans from backend if available
  useEffect(() => {
    async function loadData() {
      try {
        const data = await apiClient.getLibraryLoans();
        if (data && data.length > 0) {
          setLoans(data);
        }
      } catch (err) {
        console.warn('Using local loans state fallback:', err);
      }
    }
    loadData();
  }, []);

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          book.isbn.includes(searchQuery);
    const matchesCat = selectedCategory === 'all' || book.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // STUDENT ACTION: Request Book to Borrow
  const handleRequestBook = (book: BookItem) => {
    openDialog(
      'M17_REQUEST_BOOK',
      ({ onClose }) => {
        let loanPeriod = 14;
        let researchNote = '';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Submit loan reservation request. Central library desk will review and stage your book copy.</span>
            </div>

            <div className="p-3 bg-bg-2 rounded-xl border border-line space-y-1.5 text-xs">
              <div className="font-bold text-fg-0">{book.title}</div>
              <div className="text-fg-2">Author: {book.author}</div>
              <div className="text-fg-2">Location: <span className="font-mono text-fg-1">{book.shelfLocation}</span></div>
              <div className="text-fg-2">Available Copies: <span className="font-semibold text-emerald-400">{book.availableCopies}</span></div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Borrower Student</label>
                  <input
                    type="text"
                    disabled
                    value={`${currentStudentName} (${currentStudentId})`}
                    className="w-full px-3 py-2 rounded-xl bg-bg-3 border border-line text-fg-2 cursor-not-allowed font-medium"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Requested Loan Duration</label>
                  <select
                    defaultValue="14"
                    onChange={(e) => { loanPeriod = parseInt(e.target.value); }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
                  >
                    <option value="7">7 Days (Express Coursework)</option>
                    <option value="14">14 Days (Standard Student Loan)</option>
                    <option value="28">28 Days (Research / Term Project)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Research Purpose / Academic Note</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reference reading for Machine Learning capstone assignment..."
                  onChange={(e) => { researchNote = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
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
                onClick={async () => {
                  const newLoan: LoanRecord = {
                    id: `LN-${Date.now().toString().slice(-3)}`,
                    book_id: book.id,
                    book_title: book.title,
                    isbn: book.isbn,
                    student_id: currentStudentId,
                    student_name: currentStudentName,
                    issue_date: new Date().toISOString().substring(0, 10),
                    due_date: new Date(Date.now() + loanPeriod * 86400000).toISOString().substring(0, 10),
                    status: 'pending_approval',
                    fine_amount: 0.00,
                    renewed_count: 0,
                    notes: researchNote || 'Coursework study reference'
                  };

                  try {
                    await apiClient.requestLibraryLoan({
                      book_id: book.id,
                      book_title: book.title,
                      isbn: book.isbn,
                      student_id: currentStudentId,
                      student_name: currentStudentName,
                      loan_days: loanPeriod,
                      notes: researchNote
                    });
                  } catch (e) {
                    console.warn('Offline backend fallback for loan request');
                  }

                  setLoans(prev => [newLoan, ...prev]);
                  onClose();
                  alert(`Request submitted for "${book.title}"! You can track approval status under 'My Loans & History'.`);
                  setActiveTab('my_loans');
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Send className="w-3.5 h-3.5" />
                Submit Borrow Request
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Library Accession • Request Book Loan', size: 'md' }
    );
  };

  // STUDENT ACTION: 7-Day Renewal
  const handleRenewLoan = (loan: LoanRecord) => {
    openConfirm({
      title: `Renew Loan for "${loan.book_title}"?`,
      message: `Extend loan due date by +7 days? Currently due on ${loan.due_date}. (Limit: 2 extensions per semester).`,
      variant: 'default',
      confirmLabel: 'Confirm 7-Day Renewal',
      onConfirm: async () => {
        const curDueDate = new Date(loan.due_date);
        curDueDate.setDate(curDueDate.getDate() + 7);
        const newDueStr = curDueDate.toISOString().substring(0, 10);
        const newRenewedCount = (loan.renewed_count || 0) + 1;

        try {
          await apiClient.updateLibraryLoanStatus(loan.id, 'active', {
            renewed_count: newRenewedCount,
            due_date: newDueStr
          });
        } catch (e) {
          console.warn('Renewal offline fallback');
        }

        setLoans(prev => prev.map(l => l.id === loan.id ? {
          ...l,
          due_date: newDueStr,
          renewed_count: newRenewedCount,
          status: 'active'
        } : l));

        alert(`Loan renewed! New due date: ${newDueStr}`);
      }
    });
  };

  // LIBRARIAN / ADMIN ACTION: Approve Request
  const handleApproveRequest = async (loan: LoanRecord) => {
    try {
      await apiClient.updateLibraryLoanStatus(loan.id, 'active');
    } catch (e) {
      console.warn('Approval offline fallback');
    }

    setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status: 'active' } : l));
    if (loan.book_id) {
      setBooks(prev => prev.map(b => b.id === loan.book_id ? { ...b, availableCopies: Math.max(0, b.availableCopies - 1) } : b));
    }
  };

  // LIBRARIAN / ADMIN ACTION: Decline Request
  const handleDeclineRequest = async (loan: LoanRecord) => {
    openConfirm({
      title: `Decline Borrow Request?`,
      message: `Decline loan request from ${loan.student_name} for "${loan.book_title}"?`,
      variant: 'danger',
      confirmLabel: 'Decline Request',
      onConfirm: async () => {
        try {
          await apiClient.updateLibraryLoanStatus(loan.id, 'rejected');
        } catch (e) {
          console.warn('Decline offline fallback');
        }
        setLoans(prev => prev.map(l => l.id === loan.id ? { ...l, status: 'rejected' } : l));
      }
    });
  };

  // LIBRARIAN / ADMIN ACTION: Return Book
  const handleReturnBook = (loan: LoanRecord) => {
    openConfirm({
      title: 'Return Book to Physical Stock',
      message: `Confirm check-in for "${loan.book_title}" from ${loan.student_name} (${loan.student_id})? ${loan.fine_amount > 0 ? `Overdue fine collected: $${loan.fine_amount.toFixed(2)}.` : 'No fines outstanding.'}`,
      variant: 'default',
      confirmLabel: 'Confirm Return & Restock',
      onConfirm: async () => {
        try {
          await apiClient.updateLibraryLoanStatus(loan.id, 'returned', { fine_amount: 0 });
        } catch (e) {
          console.warn('Return offline fallback');
        }
        setLoans(prev => prev.map(c => c.id === loan.id ? { ...c, status: 'returned' } : c));
        setBooks(prev => prev.map(b => (b.id === loan.book_id || b.isbn === loan.isbn) ? { ...b, availableCopies: b.availableCopies + 1 } : b));
      }
    });
  };

  // LIBRARIAN / ADMIN ACTION: Add Book
  const handleAddNewBook = () => {
    openDialog(
      'M17_ADD_BOOK',
      ({ onClose }) => {
        let title = '';
        let author = '';
        let isbn = '';
        let category = 'Computer Science';
        let copies = '5';
        let shelf = 'Aisle 2, Shelf D1';

        return (
          <div className="space-y-4">
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Book Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Designing Data-Intensive Applications"
                  onChange={e => { title = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Author(s)</label>
                  <input
                    type="text"
                    placeholder="e.g. Martin Kleppmann"
                    onChange={e => { author = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">ISBN-13</label>
                  <input
                    type="text"
                    placeholder="e.g. 978-1449373320"
                    onChange={e => { isbn = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Category</label>
                  <select
                    defaultValue={category}
                    onChange={e => { category = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Software Engineering">Software Engineering</option>
                    <option value="Electrical Engineering">Electrical Engineering</option>
                    <option value="Medical Sciences">Medical Sciences</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Shelf Location</label>
                  <input
                    type="text"
                    defaultValue={shelf}
                    onChange={e => { shelf = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold text-fg-1 block mb-1">Copies</label>
                  <input
                    type="number"
                    defaultValue={copies}
                    onChange={e => { copies = e.target.value; }}
                    className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary"
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
                  if (title.trim()) {
                    setBooks(prev => [
                      {
                        id: `BK-${Date.now().toString().slice(-3)}`,
                        title,
                        author: author || 'Nexus Faculty Authors',
                        isbn: isbn || '978-0000000000',
                        category,
                        shelfLocation: shelf,
                        totalCopies: Number(copies) || 1,
                        availableCopies: Number(copies) || 1,
                        coverColor: 'from-violet-600 to-indigo-900'
                      },
                      ...prev
                    ]);
                  }
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Accession Register
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'New Accession • Add Book to Library', size: 'md' }
    );
  };

  // KPIs
  const totalPhysicalBooks = books.reduce((acc, b) => acc + b.totalCopies, 0);
  const totalAvailable = books.reduce((acc, b) => acc + b.availableCopies, 0);
  const activeLoansCount = loans.filter(c => c.status === 'active' || c.status === 'overdue').length;
  const pendingApprovalsCount = loans.filter(c => c.status === 'pending_approval').length;

  // Student specific loans
  const myStudentLoans = loans.filter(l => l.student_id === currentStudentId);
  const myActiveLoans = myStudentLoans.filter(l => l.status === 'active' || l.status === 'overdue');

  return (
    <ModulePageLayout
      moduleId="M17"
      moduleTitle="Library & Circulation Management"
      portalName="Academics & Life"
      description="Accession cataloging, student online borrow requests, librarian circulation desk, and RFID automated returns."
    >
      <div className="space-y-6">
        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Library className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Catalog Volumes</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{totalPhysicalBooks}</span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">{totalAvailable} available on shelf</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <BookMarked className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Active Circulation Loans</span>
              <span className="text-xl font-bold text-fg-0 font-mono tracking-tight">{activeLoansCount}</span>
              <span className="text-[10px] text-cyan-400 block mt-0.5">Automated tracking</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">Pending Requests</span>
              <span className="text-xl font-bold text-amber-400 font-mono tracking-tight">{pendingApprovalsCount}</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">Awaiting desk approval</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bg-1 border border-line flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-fg-2 block">My Active Loans</span>
              <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">{myActiveLoans.length}</span>
              <span className="text-[10px] text-fg-2 block mt-0.5">{currentStudentName}</span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'catalog' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Book Catalog ({books.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my_loans')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'my_loans' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              My Loans & History ({myStudentLoans.length})
            </button>

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('approvals')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'approvals' 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Borrow Requests & Approvals
                {pendingApprovalsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-[10px] text-black font-bold">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('circulation')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'circulation' 
                    ? 'bg-primary text-white shadow-sm' 
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                Circulation Desk ({loans.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('digital')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'digital' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              Digital Repository
            </button>
          </div>

          {!isStudent && (
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleAddNewBook}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Book Volume</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: Book Catalog */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-bg-1 border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search title, author, or ISBN..."
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 focus:outline-none focus:border-primary/50"
              >
                <option value="all">All Categories</option>
                <option value="Computer Science">Computer Science</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Electrical Engineering">Electrical Engineering</option>
                <option value="Medical Sciences">Medical Sciences</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBooks.map((book) => {
                const isAlreadyRequested = loans.some(
                  l => (l.book_id === book.id || l.book_title === book.title) && 
                       l.student_id === currentStudentId && 
                       (l.status === 'pending_approval' || l.status === 'active')
                );

                return (
                  <div 
                    key={book.id} 
                    className="rounded-2xl border border-line bg-bg-1 p-4 flex flex-col justify-between hover:border-primary/40 transition-all group shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-16 rounded-lg bg-gradient-to-br ${book.coverColor} p-1.5 flex flex-col justify-between text-white shadow-sm shrink-0`}>
                          <BookOpen className="w-4 h-4 opacity-80" />
                          <span className="text-[8px] font-mono leading-none tracking-tight truncate block">
                            {book.id}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider block">
                            {book.category}
                          </span>
                          <h3 className="font-bold text-fg-0 text-xs leading-snug line-clamp-2 mt-0.5 group-hover:text-primary transition-colors">
                            {book.title}
                          </h3>
                          <p className="text-[11px] text-fg-2 truncate mt-1">by {book.author}</p>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-bg-2 border border-line/50 text-[11px] space-y-1">
                        <div className="flex justify-between">
                          <span className="text-fg-2">Location:</span>
                          <span className="font-medium text-fg-1">{book.shelfLocation}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-fg-2">ISBN-13:</span>
                          <span className="font-mono text-fg-1">{book.isbn}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 mt-3 border-t border-line flex items-center justify-between">
                      <div>
                        <span className={`text-xs font-bold font-mono ${book.availableCopies > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {book.availableCopies} of {book.totalCopies} Available
                        </span>
                      </div>
                      
                      {isAlreadyRequested ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                          <Check className="w-3 h-3" /> Requested / Issued
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={book.availableCopies === 0}
                          onClick={() => handleRequestBook(book)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            book.availableCopies > 0
                              ? 'bg-primary hover:bg-primary/90 text-white shadow-sm'
                              : 'bg-bg-2 text-fg-2 cursor-not-allowed'
                          }`}
                        >
                          {book.availableCopies > 0 ? 'Request to Borrow' : 'Out of Stock'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: My Loans & History (Student Persona View) */}
        {activeTab === 'my_loans' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  Circulation Profile for {currentStudentName} ({currentStudentId})
                </h3>
                <p className="text-xs text-fg-2 mt-0.5">
                  Track your active book borrowings, remaining loan countdowns, and renewal options.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('catalog')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm shrink-0"
              >
                + Browse & Request More Books
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                <h2 className="text-sm font-bold text-fg-0">Active & Historical Circulation Records</h2>
                <span className="text-xs text-fg-2">{myStudentLoans.length} total transactions recorded</span>
              </div>

              {myStudentLoans.length === 0 ? (
                <div className="p-10 text-center text-fg-2 text-xs">
                  No active or past book loans found. Explore the Book Catalog to request your first volume!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Book Title</th>
                        <th className="py-3 px-4">Issue Date</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Fine</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {myStudentLoans.map((loan) => {
                        const isOverdue = loan.status === 'overdue';
                        const isActive = loan.status === 'active';
                        const isPending = loan.status === 'pending_approval';

                        return (
                          <tr key={loan.id} className="hover:bg-bg-2/40 transition-colors">
                            <td className="py-3 px-4">
                              <span className="font-bold text-fg-0 block">{loan.book_title}</span>
                              <span className="text-[10px] text-fg-2 font-mono">Loan Ref: {loan.id}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-fg-1">{loan.issue_date}</td>
                            <td className="py-3 px-4 font-mono text-fg-1">{loan.due_date}</td>
                            <td className="py-3 px-4">
                              {isPending && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <Clock className="w-3 h-3" /> Awaiting Approval
                                </span>
                              )}
                              {isActive && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  <Clock className="w-3 h-3" /> Active Loan ({loan.renewed_count || 0} renewals)
                                </span>
                              )}
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  <AlertTriangle className="w-3 h-3" /> Overdue
                                </span>
                              )}
                              {loan.status === 'returned' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" /> Returned
                                </span>
                              )}
                              {loan.status === 'rejected' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                  <XCircle className="w-3 h-3" /> Declined
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {loan.fine_amount > 0 ? (
                                <span className="font-bold text-rose-400">${loan.fine_amount.toFixed(2)}</span>
                              ) : (
                                <span className="text-fg-2">$0.00</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isActive && (
                                <button
                                  type="button"
                                  onClick={() => handleRenewLoan(loan)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-primary transition-colors ml-auto"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Renew (+7 Days)
                                </button>
                              )}
                              {isPending && (
                                <span className="text-[11px] text-fg-2 italic">Desk Reviewing</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Librarian Approval Queue */}
        {!isStudent && activeTab === 'approvals' && (
          <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  Student Borrow Requests Queue
                </h2>
                <p className="text-xs text-fg-2 mt-0.5">Approve and stage book volumes requested by students through their portals</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {pendingApprovalsCount} pending
              </span>
            </div>

            {pendingApprovalsCount === 0 ? (
              <div className="p-10 text-center text-fg-2 text-xs">
                All student borrow requests have been processed!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Requested Book</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Request Date</th>
                      <th className="py-3 px-4">Purpose / Note</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {loans.filter(l => l.status === 'pending_approval').map((req) => (
                      <tr key={req.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-fg-0 block">{req.book_title}</span>
                          <span className="text-[10px] text-fg-2 font-mono">Ref: {req.id}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-fg-0 block">{req.student_name}</span>
                          <span className="text-[11px] text-fg-2 font-mono">{req.student_id}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-fg-1">{req.issue_date}</td>
                        <td className="py-3 px-4 text-fg-2 italic max-w-xs truncate">{req.notes || 'Academic coursework study'}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeclineRequest(req)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveRequest(req)}
                              className="flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Approve & Issue
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

        {/* Tab 4: Circulation Desk (Full History) */}
        {!isStudent && activeTab === 'circulation' && (
          <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-primary" />
                  Institutional Circulation Desk
                </h2>
                <p className="text-xs text-fg-2 mt-0.5">Complete circulation log across all campus departments</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Book Title</th>
                    <th className="py-3 px-4">Borrower Student</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Fine</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {loans.map((record) => (
                    <tr key={record.id} className="hover:bg-bg-2/40 transition-colors">
                      <td className="py-3 px-4 max-w-xs">
                        <span className="font-bold text-fg-0 block truncate">{record.book_title}</span>
                        <span className="text-[10px] text-fg-2 font-mono">Ref: {record.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-fg-0 block">{record.student_name}</span>
                        <span className="text-[11px] text-fg-2 font-mono">{record.student_id}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-fg-1">{record.issue_date}</td>
                      <td className="py-3 px-4 font-mono text-fg-1">{record.due_date}</td>
                      <td className="py-3 px-4">
                        {record.status === 'active' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Clock className="w-3 h-3" /> Active Loan
                          </span>
                        )}
                        {record.status === 'overdue' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Overdue
                          </span>
                        )}
                        {record.status === 'pending_approval' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Pending
                          </span>
                        )}
                        {record.status === 'returned' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Returned
                          </span>
                        )}
                        {record.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                            Declined
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {record.fine_amount > 0 ? (
                          <span className="font-bold text-rose-400">${record.fine_amount.toFixed(2)}</span>
                        ) : (
                          <span className="text-fg-2">$0.00</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(record.status === 'active' || record.status === 'overdue') && (
                          <button
                            type="button"
                            onClick={() => handleReturnBook(record)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors ml-auto"
                          >
                            <RotateCcw className="w-3 h-3 text-primary" />
                            Return Book
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

        {/* Tab 5: Digital Repository */}
        {activeTab === 'digital' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">IEEE Xplore Digital Subscription</h3>
              <p className="text-xs text-fg-2">Direct campus IP authenticated access to over 5 million engineering conference proceedings and journals.</p>
              <button
                type="button"
                onClick={() => alert('Launching IEEE Xplore Single-Sign-On Gateway...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-primary transition-colors"
              >
                Access Repository Portal &rarr;
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Institutional Theses & Dissertations</h3>
              <p className="text-xs text-fg-2">Open access archives of Master & PhD graduate dissertations approved by the Academic Council.</p>
              <button
                type="button"
                onClick={() => alert('Opening Institutional Theses Repository...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-cyan-400 transition-colors"
              >
                Browse Theses Archives &rarr;
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg-0 text-sm">Past Exam Question Papers (10 Yrs)</h3>
              <p className="text-xs text-fg-2">Searchable repository of past semester final examination papers with model solution keys.</p>
              <button
                type="button"
                onClick={() => alert('Downloading Past Paper Archive Index...')}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-emerald-400 transition-colors"
              >
                Download Question Bank &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
