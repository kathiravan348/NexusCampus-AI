import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/layout/Shell';
import { useAuth } from '../../core/auth/AuthContext';
import { 
  BookMarked, 
  CreditCard, 
  Calendar, 
  Briefcase, 
  Clock, 
  Award, 
  ArrowRight, 
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Database
} from 'lucide-react';

export function Dashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';
  const isExaminer = role === 'examiner';
  const isPlacement = role === 'placement';
  const isAdmin = role === 'admin' || !role;

  return (
    <Shell>
      <div className="flex flex-col gap-6">
        {/* Welcome Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-primary/15 via-secondary/10 to-transparent border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden shadow-sm">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-white shadow-xs">
                {role ? role.toUpperCase() : 'USER'} PORTAL
              </span>
              <span className="text-xs font-mono text-fg-2">NexusCampus-AI v3.0 Enterprise</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-fg-0">
              Welcome back, {user?.name || (isStudent ? 'Emma Watson' : 'Campus Administrator')}!
            </h1>
            <p className="text-sm text-fg-2 mt-1">
              {isStudent 
                ? 'B.Sc. Computer Science & AI • Semester 5 • Campus Quadrangle Wing' 
                : isTeacher 
                ? 'Head of Faculty • Department of Computer Science & AI' 
                : isExaminer 
                ? 'Office of the Controller of Examinations • Official Moderation Council' 
                : isPlacement 
                ? 'Corporate Relations & Campus Placement Hub' 
                : 'Central Multi-Tenant Campus ERP & Academic Intelligence Wedge'}
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            {isStudent ? (
              <button
                onClick={() => navigate('/placement')}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
              >
                <Award className="w-4 h-4" />
                View Google Offer ($48k)
              </button>
            ) : (
              <button
                onClick={() => navigate('/tenant/onboarding')}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-white transition-all shadow-md flex items-center gap-1.5"
              >
                <Database className="w-4 h-4" />
                Tenant DB Manager
              </button>
            )}
          </div>
        </div>

        {/* STUDENT ROLE DASHBOARD */}
        {isStudent && (
          <div className="space-y-6">
            {/* 4 Live Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div 
                onClick={() => navigate('/academics/gradebook')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary/40 cursor-pointer transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-fg-2">
                  <span>Semester GPA</span>
                  <Award className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-3xl font-bold font-mono text-emerald-400">3.94 <span className="text-xs text-fg-2 font-normal">/ 4.00</span></p>
                <span className="text-[11px] text-emerald-400 font-semibold block">Class Rank #1 (Honors List)</span>
              </div>

              <div 
                onClick={() => navigate('/daily-attendance')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary/40 cursor-pointer transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-fg-2">
                  <span>Attendance Ratio</span>
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <p className="text-3xl font-bold font-mono text-fg-0">94.2%</p>
                <span className="text-[11px] text-success font-medium block">82 of 87 Sessions Attended</span>
              </div>

              <div 
                onClick={() => navigate('/library')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary/40 cursor-pointer transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-fg-2">
                  <span>Library Borrowing</span>
                  <BookMarked className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-3xl font-bold font-mono text-cyan-400">1 Book</p>
                <span className="text-[11px] text-fg-2 block">CLRS Algorithms (Due in 4 days)</span>
              </div>

              <div 
                onClick={() => navigate('/placement')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary/40 cursor-pointer transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-fg-2">
                  <span>Placement Status</span>
                  <Briefcase className="w-4 h-4 text-amber-400" />
                </div>
                <p className="text-xl font-bold text-fg-0 truncate">Google SDE I</p>
                <span className="text-[11px] text-emerald-400 font-bold block">$48,000 LPA • Offer Ready</span>
              </div>
            </div>

            {/* Quick Interactive Portals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div 
                onClick={() => navigate('/library')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <BookMarked className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">
                    Library Catalog & Online Book Requests
                  </h3>
                  <p className="text-xs text-fg-2">
                    Browse shelves, submit borrow requests, renew active loans, and download research papers.
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-line text-xs font-semibold text-primary flex items-center justify-between">
                  <span>Open Library Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              <div 
                onClick={() => navigate('/finance')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">
                    Student Fee Portal & Instant Pay Online
                  </h3>
                  <p className="text-xs text-fg-2">
                    View tuition balance, pay with credit card or instant UPI, and download verified tax receipts.
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-line text-xs font-semibold text-primary flex items-center justify-between">
                  <span>Open Fee Portal</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>

              <div 
                onClick={() => navigate('/placement')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">
                    Corporate Placement Hub & Drives
                  </h3>
                  <p className="text-xs text-fg-2">
                    1-click apply for Amazon, Microsoft, and Google drives, track interview rounds, and accept offers.
                  </p>
                </div>
                <div className="pt-3 mt-3 border-t border-line text-xs font-semibold text-primary flex items-center justify-between">
                  <span>Open Placement Hub</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>

            {/* Today's Schedule */}
            <div className="p-6 rounded-2xl bg-bg-1 border border-line shadow-sm">
              <h3 className="font-bold text-fg-0 text-sm mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Today's Lecture & Lab Schedule (Monday)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-bg-2 border border-line/60 space-y-1">
                  <span className="text-[10px] font-mono text-primary font-bold">10:30 AM — 11:45 AM</span>
                  <h4 className="font-bold text-fg-0 text-xs">CS-301: Machine Learning & Neural Nets</h4>
                  <p className="text-[11px] text-fg-2">Room 402 • Dr. Alan Turing</p>
                </div>
                <div className="p-4 rounded-xl bg-bg-2 border border-line/60 space-y-1">
                  <span className="text-[10px] font-mono text-cyan-400 font-bold">02:00 PM — 03:30 PM</span>
                  <h4 className="font-bold text-fg-0 text-xs">SE-204: Cloud Architecture Studio</h4>
                  <p className="text-[11px] text-fg-2">Lab 2 • Prof. Margaret Hamilton</p>
                </div>
                <div className="p-4 rounded-xl bg-bg-2 border border-line/60 space-y-1">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">04:00 PM — 05:00 PM</span>
                  <h4 className="font-bold text-fg-0 text-xs">Placement Advisory & Mock Interview</h4>
                  <p className="text-[11px] text-fg-2">Seminar Hall A • Marcus Vance</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TEACHER ROLE DASHBOARD */}
        {isTeacher && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Lectures Today</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">3 Sessions</p>
                <span className="text-[11px] text-primary font-semibold mt-1 block">Next: CS-301 in Room 402</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Ungraded Submissions</span>
                <p className="text-3xl font-bold text-amber-400 mt-1 font-mono">18 Papers</p>
                <span className="text-[11px] text-fg-2 mt-1 block">Midterm Project 1</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Leave Requests Pending</span>
                <p className="text-3xl font-bold text-rose-400 mt-1 font-mono">1 Request</p>
                <span className="text-[11px] text-fg-2 mt-1 block">Emma Watson (Symposium)</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Average Cohort Attendance</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">91.4%</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">Healthy engagement</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => navigate('/daily-attendance')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary text-left transition-all group"
              >
                <Calendar className="w-6 h-6 text-primary mb-3" />
                <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">Mark Daily Attendance</h3>
                <p className="text-xs text-fg-2 mt-1">Take roll call for CS-301 slot and dispatch instant guardian alerts.</p>
              </button>
              <button
                onClick={() => navigate('/academics/gradebook')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary text-left transition-all group"
              >
                <FileSpreadsheet className="w-6 h-6 text-emerald-400 mb-3" />
                <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">Faculty Master Gradebook</h3>
                <p className="text-xs text-fg-2 mt-1">Enter assignment & midterm marks with automated GPA calculation.</p>
              </button>
              <button
                onClick={() => navigate('/daily-attendance')}
                className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm hover:border-primary text-left transition-all group"
              >
                <ShieldCheck className="w-6 h-6 text-amber-400 mb-3" />
                <h3 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">Review Student Leaves</h3>
                <p className="text-xs text-fg-2 mt-1">Approve medical clearances and academic conference exemptions.</p>
              </button>
            </div>
          </div>
        )}

        {/* CHIEF EXAMINER DASHBOARD */}
        {isExaminer && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Departments Moderated</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">5 of 5</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">100% faculty marks entered</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Cohort Median GPA</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">3.62 / 4.00</p>
                <span className="text-[11px] text-fg-2 mt-1 block">Normal bell curve distribution</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Transcripts Certification</span>
                <p className="text-3xl font-bold text-primary mt-1 font-mono">Active</p>
                <span className="text-[11px] text-primary font-semibold mt-1 block">Cryptographic RSA-4096 Signatures</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/academics/gradebook')}
              className="w-full p-6 rounded-2xl bg-gradient-to-r from-rose-500/15 via-primary/10 to-transparent border border-rose-500/30 flex items-center justify-between text-left hover:border-rose-500/50 transition-all shadow-sm"
            >
              <div>
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block mb-1">Controller of Examinations</span>
                <h3 className="text-lg font-bold text-fg-0">Open Moderation Council & Release Official Results</h3>
                <p className="text-xs text-fg-2 mt-1">Click to inspect department returns and publish officially certified grade sheets.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-rose-400 shrink-0" />
            </button>
          </div>
        )}

        {/* PLACEMENT OFFICER DASHBOARD */}
        {isPlacement && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Active Campus Drives</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">4 Companies</p>
                <span className="text-[11px] text-primary font-semibold mt-1 block">Google, Microsoft, AWS, Deloitte</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Placement Ratio</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">72.4%</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">90 students placed</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Average Package</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">$38,500</p>
                <span className="text-[11px] text-fg-2 mt-1 block">LPA across all departments</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Highest Package</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">$48,000</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">Google Cloud Labs (Emma Watson)</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/placement')}
              className="w-full p-6 rounded-2xl bg-gradient-to-r from-amber-500/15 via-primary/10 to-transparent border border-amber-500/30 flex items-center justify-between text-left hover:border-amber-500/50 transition-all shadow-sm"
            >
              <div>
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block mb-1">Career & Placements Hub</span>
                <h3 className="text-lg font-bold text-fg-0">Manage Recruitment Pipeline & Issue Offer Letters</h3>
                <p className="text-xs text-fg-2 mt-1">Review student applications, advance interview rounds, and dispatch formal packages.</p>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400 shrink-0" />
            </button>
          </div>
        )}

        {/* ADMIN ROLE DASHBOARD */}
        {isAdmin && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Enrolled Students</span>
                <p className="text-3xl font-bold text-primary mt-1 font-mono">1,248</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">Active across 4 cohorts</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Faculty Members</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">84</p>
                <span className="text-[11px] text-fg-2 mt-1 block">CS, ECE, Mech, BioMed</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Realized Tuition Ledger</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">$31,250</p>
                <span className="text-[11px] text-emerald-400 font-semibold mt-1 block">Cleared via instant gateway</span>
              </div>
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs text-fg-2 font-medium">Multi-Tenant Databases</span>
                <p className="text-3xl font-bold text-cyan-400 mt-1 font-mono">3 Active</p>
                <span className="text-[11px] text-cyan-400 font-semibold mt-1 block">Template + Greenwood + Oxford</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-bg-1 border border-line shadow-sm space-y-4">
              <h3 className="font-bold text-fg-0 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Multi-Tenant Core Architecture & Quick Modules
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={() => navigate('/tenant/onboarding')}
                  className="p-3.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-left text-xs font-semibold text-fg-0 transition-colors"
                >
                  <Database className="w-4 h-4 text-primary mb-1.5" />
                  Tenant Provisioning
                </button>
                <button
                  onClick={() => navigate('/library')}
                  className="p-3.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-left text-xs font-semibold text-fg-0 transition-colors"
                >
                  <BookMarked className="w-4 h-4 text-cyan-400 mb-1.5" />
                  Library Accession
                </button>
                <button
                  onClick={() => navigate('/finance')}
                  className="p-3.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-left text-xs font-semibold text-fg-0 transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-emerald-400 mb-1.5" />
                  Finance & Invoicing
                </button>
                <button
                  onClick={() => navigate('/placement')}
                  className="p-3.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-left text-xs font-semibold text-fg-0 transition-colors"
                >
                  <Briefcase className="w-4 h-4 text-amber-400 mb-1.5" />
                  Placement Drives Hub
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
