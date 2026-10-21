import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Calendar, 
  CreditCard, 
  Award, 
  Bell, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  Download,
  BookOpen
} from 'lucide-react';

export function ParentPortal() {
  const [selectedWard] = useState('Emma Watson');
  const { openDialog } = useDialog();

  const handleBookPTM = () => {
    openDialog(
      'M20_BOOK_PTM',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Select an available 15-minute slot with faculty for Fall Term review.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Faculty Advisor / Subject Teacher</label>
              <select className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none">
                <option>Dr. Alan Turing — Dean & Computing Advisor</option>
                <option>Prof. Margaret Hamilton — Software Engineering</option>
                <option>Dr. Katherine Johnson — Applied Mathematics</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Preferred Date</label>
              <input 
                type="date" 
                defaultValue="2026-09-20"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Available Meeting Slots</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="p-2.5 rounded-xl border border-primary bg-primary/10 text-primary text-xs font-semibold">
                  10:00 AM – 10:15 AM
                </button>
                <button type="button" className="p-2.5 rounded-xl border border-line bg-bg-2 hover:bg-bg-3 text-fg-1 text-xs font-medium">
                  11:30 AM – 11:45 AM
                </button>
                <button type="button" className="p-2.5 rounded-xl border border-line bg-bg-2 hover:bg-bg-3 text-fg-1 text-xs font-medium">
                  02:15 PM – 02:30 PM
                </button>
                <button type="button" className="p-2.5 rounded-xl border border-line bg-bg-2 hover:bg-bg-3 text-fg-1 text-xs font-medium">
                  03:45 PM – 04:00 PM
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Discussion Agenda / Specific Inquiry</label>
              <textarea
                rows={2}
                placeholder="e.g. Inquiring about advanced lab projects and internship eligibility..."
                className="w-full bg-bg-2 border border-line rounded-xl p-2.5 text-xs text-fg-0 outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                alert('PTM Slot booked! Calendar invite sent to parent email.');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
            >
              Confirm Appointment
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'M20: Book Parent-Teacher Consultation', size: 'md' }
    );
  };

  const handlePayFees = () => {
    openDialog(
      'M15_QUICK_PAY',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-xs text-success flex items-center gap-3">
            <CreditCard className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-bold block">Instant Tuition Fee Settlement</span>
              <span>Secure zero-fee gateway via Campus Gateway</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-bg-2 border border-line space-y-2 text-xs">
            <div className="flex justify-between text-fg-2">
              <span>Student Name:</span>
              <span className="font-bold text-fg-0">Emma Watson (STU-1001)</span>
            </div>
            <div className="flex justify-between text-fg-2">
              <span>Term:</span>
              <span className="font-bold text-fg-0">Fall Semester 2026</span>
            </div>
            <div className="flex justify-between text-fg-2 pt-2 border-t border-line">
              <span>Amount Due:</span>
              <span className="text-base font-bold text-primary font-mono">$6,500.00</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-fg-1 block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button type="button" className="p-2.5 rounded-xl border border-primary bg-primary/10 text-primary">Credit Card</button>
              <button type="button" className="p-2.5 rounded-xl border border-line bg-bg-2 text-fg-2">ACH Bank</button>
              <button type="button" className="p-2.5 rounded-xl border border-line bg-bg-2 text-fg-2">Smart Wallet</button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button
              onClick={() => {
                alert('Payment of $6,500 processed! Receipt sent to Chris Watson.');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-success hover:bg-success/90 rounded-xl shadow-sm"
            >
              Pay $6,500.00 Now
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'Settle Tuition Fee Invoice', size: 'md' }
    );
  };

  return (
    <ModulePageLayout
      moduleId="M20"
      moduleTitle="Parent Engagement & Ward Portal"
      portalName="Student Lifecycle & CRM"
      description="Dedicated guardian hub for tracking child academic progress, live attendance, fee settlements, and teacher consultations."
      tags={['Parent 360', 'PTM Scheduler', 'Fee Payments']}
      actions={
        <button
          onClick={handleBookPTM}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" /> Book Teacher Meeting (PTM)
        </button>
      }
    >
      {/* Ward Profile Banner */}
      <div className="p-6 bg-gradient-to-r from-primary/10 via-bg-1 to-secondary/10 border border-line rounded-2xl shadow-sm mb-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
            alt={selectedWard}
            className="w-16 h-16 rounded-full object-cover ring-4 ring-primary/20 shadow-md"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-fg-0">{selectedWard}</h2>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                STU-1001
              </span>
            </div>
            <p className="text-xs text-fg-2 mt-0.5">
              B.Sc. Computer Science & AI · Cohort 2024-2028 · Semester 3
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs font-medium text-fg-1">
              <span>Advisor: <strong>Dr. Alan Turing</strong></span>
              <span>·</span>
              <span>Campus: <strong>Main Tech Campus</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePayFees}
            className="px-4 py-2 bg-success hover:bg-success/90 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" /> Settle Fees ($0 Due)
          </button>
        </div>
      </div>

      {/* Progress Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <div className="p-5 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-fg-2 uppercase tracking-wider">Cumulative GPA</span>
            <Award className="w-5 h-5 text-primary" />
          </div>
          <span className="text-3xl font-bold text-fg-0 block">3.92</span>
          <span className="text-xs text-success flex items-center gap-1 mt-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Top 5% of Cohort · Dean's List
          </span>
        </div>

        <div className="p-5 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-fg-2 uppercase tracking-wider">Term Attendance</span>
            <Clock className="w-5 h-5 text-success" />
          </div>
          <span className="text-3xl font-bold text-success block">96.5%</span>
          <span className="text-xs text-fg-2 flex items-center gap-1 mt-1 font-medium">
            58 of 60 sessions attended
          </span>
        </div>

        <div className="p-5 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-fg-2 uppercase tracking-wider">Tuition Clearance</span>
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <span className="text-3xl font-bold text-fg-0 block">Cleared</span>
          <span className="text-xs text-success flex items-center gap-1 mt-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Receipt #INV-2026-001 Issued
          </span>
        </div>
      </div>

      {/* Notice Board & Upcoming Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-fg-0">Recent Institutional Circulars</h3>
            </div>
            <span className="text-xs text-fg-2">Updated today</span>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-bg-2 border border-line flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-fg-0">Mid-Term Examination Dates Announced</h4>
                <p className="text-xs text-fg-2 mt-0.5">Formal offline schedule released for CS & Mathematics streams.</p>
                <span className="text-[10px] text-fg-2 block mt-1">Sep 12, 2026 · Dean's Office</span>
              </div>
              <button className="p-1 text-primary hover:bg-bg-3 rounded" title="Download Circular PDF">
                <Download className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-bg-2 border border-line flex items-start justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-fg-0">Annual Hackathon & Tech Fest 2026</h4>
                <p className="text-xs text-fg-2 mt-0.5">Registrations open for intra-campus project exhibitions.</p>
                <span className="text-[10px] text-fg-2 block mt-1">Sep 10, 2026 · Student Council</span>
              </div>
              <button className="p-1 text-primary hover:bg-bg-3 rounded" title="Download Circular PDF">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-fg-0">Enrolled Courses & Faculty Notes</h3>
            </div>
            <span className="text-xs font-semibold text-primary">3 Enrolled</span>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-bg-2 border border-line">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-fg-0">CS-301: Advanced Machine Learning</span>
                <span className="text-xs font-bold font-mono text-success">Grade: A+</span>
              </div>
              <span className="text-[11px] text-fg-2 block mt-0.5">Faculty: Dr. Alan Turing</span>
              <p className="text-xs text-fg-1 mt-1.5 bg-bg-1 p-2 rounded-lg border border-line/50 italic">
                "Emma consistently demonstrates exemplary critical thinking in deep neural network design."
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-bg-2 border border-line">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-fg-0">SE-204: Cloud Architecture</span>
                <span className="text-xs font-bold font-mono text-primary">Grade: A</span>
              </div>
              <span className="text-[11px] text-fg-2 block mt-0.5">Faculty: Prof. Margaret Hamilton</span>
            </div>
          </div>
        </div>
      </div>
    </ModulePageLayout>
  );
}
