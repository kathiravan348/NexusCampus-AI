import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../../components/layout/Shell';
import { useAuth } from '../../core/auth/AuthContext';
import { 
  Mail, 
  Phone, 
  MapPin, 
  GraduationCap, 
  Calendar, 
  CreditCard, 
  FileText, 
  ChevronLeft, 
  Download, 
  CheckCircle2, 
  Upload, 
  Sparkles, 
  Edit, 
  Award, 
  Send,
  BookMarked,
  Briefcase
} from 'lucide-react';
import { useDialog } from '../../core/dialog';

export function StudentProfile() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';

  const [activeTab, setActiveTab] = useState<'overview' | 'academic' | 'finance' | 'documents'>('overview');
  const [profile, setProfile] = useState({
    name: currentStudentName,
    id: currentStudentId,
    year: 'Year 3 (Semester 5)',
    program: 'B.Sc. Computer Science & AI',
    cohort: '2024-2028',
    gpa: '3.94',
    attendance: '94.2%',
    credits: '84 / 120',
    email: isStudent ? (user?.email || 'student@nexuscampus.edu') : 'emma.watson@nexuscampus.edu',
    phone: '+1 (555) 438-9210',
    address: 'Campus Quadrangle Tower B, Rm 304',
    advisor: 'Dr. Alan Turing'
  });

  const [documents, setDocuments] = useState([
    { id: 'DOC-01', name: 'Official Transcripts (Sem 1 & 2)', size: '1.4 MB', date: '2026-08-15', verified: true },
    { id: 'DOC-02', name: 'Institutional Bonafide Certificate', size: '420 KB', date: '2026-09-01', verified: true },
    { id: 'DOC-03', name: 'Health Immunization Clearance', size: '890 KB', date: '2026-07-20', verified: true },
    { id: 'DOC-04', name: 'Google Cloud Labs Campus Offer Letter', size: '1.8 MB', date: '2026-09-12', verified: true }
  ]);

  const navigate = useNavigate();
  const { openDialog } = useDialog();

  // EDIT PROFILE MODAL
  const handleOpenEditProfile = () => {
    openDialog(
      'edit-student-profile-modal',
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const email = (form.elements.namedItem('email') as HTMLInputElement).value;
            const phone = (form.elements.namedItem('phone') as HTMLInputElement).value;
            const address = (form.elements.namedItem('address') as HTMLInputElement).value;

            setProfile(prev => ({ ...prev, email, phone, address }));
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Update contact coordinates and student residence file.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Student Contact Email</label>
              <input 
                name="email"
                type="email"
                defaultValue={profile.email}
                required
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Mobile Contact Phone</label>
              <input 
                name="phone"
                type="text"
                defaultValue={profile.phone}
                required
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Residential Address</label>
              <input 
                name="address"
                type="text"
                defaultValue={profile.address}
                required
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm">Save Profile</button>
          </div>
        </form>
      ),
      {},
      { title: `Edit Profile — ${profile.name}`, size: 'md' }
    );
  };

  // MESSAGE MODAL
  const handleOpenMessageModal = () => {
    openDialog(
      'message-student-modal',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary">
            Send high-priority communication to <strong>{profile.name}</strong> and guardian contact.
          </div>
          <div>
            <label className="text-xs font-semibold text-fg-1 block mb-1">Subject</label>
            <input 
              type="text" 
              defaultValue="Academic Advisory & Course Mentorship" 
              className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-fg-1 block mb-1">Message Content</label>
            <textarea 
              rows={4}
              defaultValue={`Dear ${profile.name}, your departmental mentor review has been scheduled with Dr. Alan Turing.`}
              className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button 
              onClick={() => {
                alert(`Direct circular dispatched to ${profile.name} via portal and SMS!`);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Send Message
            </button>
          </div>
        </div>
      ),
      {},
      { title: `Message ${profile.name}`, size: 'md' }
    );
  };

  // UPLOAD DOCUMENT MODAL
  const handleUploadDocument = () => {
    openDialog(
      'upload-document-modal',
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const docName = (form.elements.namedItem('docName') as HTMLInputElement).value;

            const newDoc = {
              id: `DOC-0${documents.length + 1}`,
              name: docName || 'Student Document',
              size: '1.2 MB',
              date: new Date().toISOString().substring(0, 10),
              verified: true
            };
            setDocuments(prev => [newDoc, ...prev]);
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Document Title *</label>
              <input 
                name="docName"
                type="text"
                required
                placeholder="e.g. Dean's Recommendation Letter"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Select File (.PDF, .PNG, .DOCX)</label>
              <div className="border-2 border-dashed border-line rounded-xl p-6 text-center text-xs text-fg-2 hover:border-primary cursor-pointer">
                <Upload className="w-6 h-6 text-primary mx-auto mb-2" />
                <p>Click to browse or drop certified student file</p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm">Upload File</button>
          </div>
        </form>
      ),
      {},
      { title: 'Upload Student Document', size: 'md' }
    );
  };

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6 max-w-6xl mx-auto">
        {/* Back Link */}
        <div 
          className="flex items-center gap-2 text-xs font-semibold text-fg-2 hover:text-fg-0 cursor-pointer w-fit transition-colors" 
          onClick={() => navigate('/students')}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Student Directory
        </div>

        {/* Profile Header Banner */}
        <div className="bg-bg-1 border border-line rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/10" />
          
          <div className="relative z-10">
            <div className="w-28 h-28 rounded-2xl bg-bg-2 border-4 border-bg-0 shadow-lg overflow-hidden shrink-0 mt-4">
              <img 
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80" 
                alt="Student Profile" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="mt-3 flex gap-2 justify-center">
              <span className="bg-success/10 text-success text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-success/20">
                ACTIVE ENROLLED
              </span>
            </div>
          </div>

          <div className="flex-1 relative z-10 pt-4 md:pt-10 w-full">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-fg-0 mb-1">{profile.name}</h1>
                <p className="text-xs text-fg-2 font-mono flex items-center gap-2">
                  Roll: <span className="font-bold text-primary">{profile.id}</span> 
                  <span className="w-1 h-1 bg-line rounded-full" /> 
                  {profile.year} · Advisor: {profile.advisor}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleOpenEditProfile}
                  className="px-3.5 py-2 bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit Profile
                </button>
                <button 
                  onClick={handleOpenMessageModal}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Mail className="w-3.5 h-3.5" /> Message Student
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-bg-2 border border-line flex items-center justify-center text-primary shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-fg-2">Degree Program</p>
                  <p className="text-xs font-semibold text-fg-0 truncate max-w-[140px]">{profile.program}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-bg-2 border border-line flex items-center justify-center text-secondary shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-fg-2">Cohort Lifecycle</p>
                  <p className="text-xs font-semibold text-fg-0">{profile.cohort}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-bg-2 border border-line flex items-center justify-center text-success shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-fg-2">Contact Phone</p>
                  <p className="text-xs font-semibold text-fg-0 font-mono">{profile.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-bg-2 border border-line flex items-center justify-center text-warning shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] text-fg-2">Residence</p>
                  <p className="text-xs font-semibold text-fg-0">{profile.address}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-line gap-6 px-2 overflow-x-auto custom-scrollbar">
          {(['overview', 'academic', 'finance', 'documents'] as const).map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 font-semibold text-xs border-b-2 whitespace-nowrap capitalize transition-colors ${
                activeTab === tab 
                  ? 'border-primary text-primary font-bold' 
                  : 'border-transparent text-fg-2 hover:text-fg-0'
              }`}
            >
              {tab === 'finance' ? 'Fees & Finance Ledger' : tab === 'academic' ? 'Academic Progress & Grades' : tab}
            </button>
          ))}
        </div>

        {/* Tab Content Areas */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 flex-1 min-h-0">
          <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 pb-6">
            {/* TAB 1: 360° OVERVIEW */}
            {activeTab === 'overview' && (
              <>
                <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-fg-0 text-sm mb-4">Academic Progression Snapshot</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-bg-2/60 border border-line rounded-xl p-4 text-center">
                      <p className="text-xs text-fg-2 font-medium mb-1">Cumulative GPA</p>
                      <p className="text-2xl font-bold text-emerald-400 font-mono">{profile.gpa}</p>
                      <span className="text-[10px] text-emerald-400 font-semibold">Rank #1 in Cohort</span>
                    </div>
                    <div className="bg-bg-2/60 border border-line rounded-xl p-4 text-center">
                      <p className="text-xs text-fg-2 font-medium mb-1">Earned Credits</p>
                      <p className="text-2xl font-bold text-fg-0 font-mono">{profile.credits}</p>
                      <span className="text-[10px] text-fg-2">On track for 2028</span>
                    </div>
                    <div className="bg-bg-2/60 border border-line rounded-xl p-4 text-center">
                      <p className="text-xs text-fg-2 font-medium mb-1">Attendance Rate</p>
                      <p className="text-2xl font-bold text-success font-mono">{profile.attendance}</p>
                      <span className="text-[10px] text-success font-semibold">82/87 Sessions</span>
                    </div>
                  </div>
                </div>

                {/* 360° Unified Multi-Module Widgets */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Library Widget */}
                  <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-fg-0 text-xs">
                        <BookMarked className="w-4 h-4 text-primary" />
                        <span>Active Library Borrowing</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        1 Book Active
                      </span>
                    </div>
                    <div className="p-3 bg-bg-2 rounded-xl border border-line/60 text-xs space-y-1">
                      <div className="font-semibold text-fg-0">Introduction to Algorithms (CLRS 4th Ed)</div>
                      <div className="text-[11px] text-fg-2 flex items-center justify-between">
                        <span>Due Date: Sep 18, 2026</span>
                        <span className="text-cyan-400 font-medium">Due in 4 days</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/library')}
                      className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                    >
                      Open Library Desk &rarr;
                    </button>
                  </div>

                  {/* Placement Widget */}
                  <div className="p-5 rounded-2xl bg-bg-1 border border-line space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-fg-0 text-xs">
                        <Briefcase className="w-4 h-4 text-emerald-400" />
                        <span>Corporate Placement Status</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Offer Extended
                      </span>
                    </div>
                    <div className="p-3 bg-bg-2 rounded-xl border border-line/60 text-xs space-y-1">
                      <div className="font-semibold text-fg-0">Google Cloud Labs — SDE I</div>
                      <div className="text-[11px] text-fg-2 flex items-center justify-between">
                        <span>Compensation Package:</span>
                        <span className="font-mono font-bold text-emerald-400">$48,000 LPA</span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/placement')}
                      className="text-xs text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      View Placement Offer &rarr;
                    </button>
                  </div>
                </div>

                <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-fg-0 text-sm mb-4">Recent Institutional Telemetry</h3>
                  <div className="space-y-3">
                    {[
                      { icon: CheckCircle2, color: 'text-success', title: 'Tuition Fee Cleared', desc: 'Fall 2026 Academic Tuition fully settled with official receipt.', date: 'Today, 10:45 AM' },
                      { icon: Award, color: 'text-primary', title: 'Placement Offer Extended', desc: 'Google Cloud Labs SDE I formal package ready for signature.', date: 'Yesterday' },
                      { icon: BookMarked, color: 'text-cyan-400', title: 'Library Book Loan Issued', desc: 'Introduction to Algorithms checked out via accession desk.', date: 'Sep 01, 2026' },
                    ].map((activity, i) => (
                      <div key={i} className="flex gap-3.5 p-3 rounded-xl bg-bg-2/40 border border-line">
                        <div className={`mt-0.5 ${activity.color} shrink-0`}>
                          <activity.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-fg-0">{activity.title}</p>
                          <p className="text-xs text-fg-2 mt-0.5">{activity.desc}</p>
                          <p className="text-[10px] text-fg-2 font-mono mt-1">{activity.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: ACADEMIC */}
            {activeTab === 'academic' && (
              <div className="space-y-6">
                <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-fg-0 text-sm">Enrolled Courses — Semester 5</h3>
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">
                      17 Credit Hours
                    </span>
                  </div>
                  <div className="divide-y divide-line text-xs">
                    {[
                      { code: 'CS-301', title: 'Advanced Machine Learning & Neural Nets', credits: 4, faculty: 'Dr. Alan Turing', grade: 'A+', score: '96%' },
                      { code: 'SE-204', title: 'Cloud Native Microservices Architecture', credits: 4, faculty: 'Prof. Margaret Hamilton', grade: 'A', score: '92%' },
                      { code: 'MTH-310', title: 'Discrete Mathematics & Cryptography', credits: 3, faculty: 'Dr. Katherine Johnson', grade: 'A+', score: '96%' },
                      { code: 'AI-402', title: 'Computer Vision & Multi-Modal Models', credits: 4, faculty: 'Dr. Geoffrey Hinton', grade: 'A', score: '89%' }
                    ].map((c, i) => (
                      <div key={i} className="py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">{c.code}</span>
                            <span className="font-semibold text-fg-0">{c.title}</span>
                          </div>
                          <p className="text-[11px] text-fg-2 mt-0.5">Instructor: {c.faculty} · {c.credits} Credits</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm text-success font-mono">{c.grade}</span>
                          <span className="text-[11px] text-fg-2 block">{c.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: FINANCE */}
            {activeTab === 'finance' && (
              <div className="space-y-6">
                <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-fg-0 text-sm">Tuition & Fee Ledger Breakdown</h3>
                      <p className="text-xs text-fg-2">Official statements verified through Bursar Office</p>
                    </div>
                    <button
                      onClick={() => navigate('/finance')}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" /> Open Finance Portal
                    </button>
                  </div>

                  <div className="divide-y divide-line text-xs">
                    {[
                      { inv: 'INV-2026-001', item: 'Fall 2026 Academic Tuition Fee', amount: 6500, paid: 6500, status: 'Fully Paid' },
                      { inv: 'INV-2026-015', item: 'Engineering Laboratory & Cloud Cluster', amount: 450, paid: 450, status: 'Fully Paid' },
                    ].map((fee, i) => (
                      <div key={i} className="py-3.5 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-fg-0">{fee.item}</p>
                          <span className="text-[11px] font-mono text-fg-2">{fee.inv}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-fg-0 block">${fee.amount.toLocaleString()}</span>
                          <span className="text-[10px] font-semibold text-success">
                            {fee.status} (${fee.paid.toLocaleString()} credited)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DOCUMENTS */}
            {activeTab === 'documents' && (
              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-fg-0 text-sm">Official Institutional Documents ({documents.length})</h3>
                  <button
                    onClick={handleUploadDocument}
                    className="px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all flex items-center gap-1.5"
                  >
                    <Upload className="w-3 h-3" /> Upload Document
                  </button>
                </div>

                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id}
                      className="flex items-center justify-between p-3.5 bg-bg-2/50 rounded-xl border border-line hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 text-primary rounded-lg">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-fg-0 group-hover:text-primary transition-colors">{doc.name}</h4>
                          <span className="text-[11px] text-fg-2 font-mono">{doc.size} · Uploaded {doc.date}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => alert(`Downloading verified copy of ${doc.name}...`)}
                        className="p-2 text-fg-2 hover:text-primary hover:bg-bg-2 rounded-lg transition-colors"
                        title="Download Document"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Fee Status Card */}
            <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-fg-0 text-sm mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" /> Financial Clearance Status
              </h3>
              <div className="p-4 bg-bg-2 rounded-xl border border-line">
                <p className="text-[11px] font-medium text-fg-2 mb-0.5">Outstanding Balance</p>
                <p className="text-2xl font-bold font-mono text-success">
                  $0.00
                </p>
                <div className="mt-3 space-y-1.5 pt-3 border-t border-line text-xs">
                  <div className="flex justify-between">
                    <span className="text-fg-2">Total Paid</span>
                    <span className="font-semibold text-fg-0 font-mono">$6,950.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-2">Status</span>
                    <span className="font-semibold text-success font-mono">Good Standing</span>
                  </div>
                </div>
                <div className="mt-4 p-2 bg-success/10 text-success rounded-xl text-center text-xs font-semibold flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All Dues Settled
                </div>
              </div>
            </div>

            {/* Quick Links Card */}
            <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm space-y-3">
              <h3 className="font-bold text-fg-0 text-sm">Active Portals</h3>
              <button 
                onClick={() => navigate('/library')}
                className="w-full text-left p-2.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-xs font-medium text-fg-1 transition-colors flex items-center justify-between"
              >
                <span>Library Accession Catalog</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-fg-2" />
              </button>
              <button 
                onClick={() => navigate('/placement')}
                className="w-full text-left p-2.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-xs font-medium text-fg-1 transition-colors flex items-center justify-between"
              >
                <span>Career & Placement Hub</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-fg-2" />
              </button>
              <button 
                onClick={() => navigate('/finance')}
                className="w-full text-left p-2.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-xs font-medium text-fg-1 transition-colors flex items-center justify-between"
              >
                <span>Fees & Online Payments</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-fg-2" />
              </button>
              <button 
                onClick={() => navigate('/daily-attendance')}
                className="w-full text-left p-2.5 rounded-xl bg-bg-2 hover:bg-bg-3 border border-line text-xs font-medium text-fg-1 transition-colors flex items-center justify-between"
              >
                <span>Daily Class Attendance & Leaves</span>
                <ChevronLeft className="w-3.5 h-3.5 rotate-180 text-fg-2" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
