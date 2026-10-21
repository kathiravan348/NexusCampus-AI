import { useState, useEffect } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { useAuth } from '../../core/auth/AuthContext';
import { apiClient } from '../../api/client';
import { 
  Briefcase, 
  Building2, 
  CheckCircle2, 
  Search, 
  TrendingUp, 
  Users, 
  Award, 
  Clock, 
  Sparkles, 
  ShieldCheck, 
  Check, 
  PartyPopper 
} from 'lucide-react';

interface RecruitmentDrive {
  id: string;
  companyName: string;
  logoColor: string;
  roleTitle: string;
  location: string;
  ctcPackage: string;
  minCgpa: number;
  openingsCount: number;
  shortlistedCount: number;
  stage: 'Applications Open' | 'Online Assessment' | 'Technical Interviews' | 'Offers Extended';
  deadline: string;
}

interface StudentApplicant {
  id: string;
  studentName: string;
  rollNo: string;
  branch: string;
  cgpa: number;
  company: string;
  role: string;
  currentRound: 'Aptitude Test' | 'Technical Round 1' | 'Technical Round 2' | 'HR Round' | 'Offered' | 'Accepted';
  offerCtc?: string;
  status: 'applied' | 'shortlisted' | 'active' | 'offered' | 'accepted' | 'rejected';
}

const mockDrives: RecruitmentDrive[] = [
  {
    id: 'DRV-101',
    companyName: 'Google Cloud Labs',
    logoColor: 'from-blue-500 to-emerald-500',
    roleTitle: 'Software Development Engineer I',
    location: 'Mountain View, CA / Hybrid',
    ctcPackage: '$48,000 LPA',
    minCgpa: 8.5,
    openingsCount: 12,
    shortlistedCount: 45,
    stage: 'Technical Interviews',
    deadline: '2026-09-22'
  },
  {
    id: 'DRV-102',
    companyName: 'Microsoft Corporation',
    logoColor: 'from-cyan-500 to-blue-600',
    roleTitle: 'Cloud Solutions Architect',
    location: 'Redmond, WA / Remote',
    ctcPackage: '$42,500 LPA',
    minCgpa: 8.0,
    openingsCount: 18,
    shortlistedCount: 62,
    stage: 'Online Assessment',
    deadline: '2026-09-28'
  },
  {
    id: 'DRV-103',
    companyName: 'Amazon Web Services',
    logoColor: 'from-amber-500 to-orange-600',
    roleTitle: 'DevOps & Reliability Engineer',
    location: 'Seattle, WA',
    ctcPackage: '$38,000 LPA',
    minCgpa: 7.8,
    openingsCount: 25,
    shortlistedCount: 88,
    stage: 'Applications Open',
    deadline: '2026-10-05'
  },
  {
    id: 'DRV-104',
    companyName: 'Deloitte Strategy & Analytics',
    logoColor: 'from-emerald-600 to-teal-700',
    roleTitle: 'Technology Strategy Consultant',
    location: 'New York, NY',
    ctcPackage: '$26,000 LPA',
    minCgpa: 7.5,
    openingsCount: 30,
    shortlistedCount: 110,
    stage: 'Offers Extended',
    deadline: '2026-09-10'
  }
];

const mockApplicants: StudentApplicant[] = [
  {
    id: 'APP-501',
    studentName: 'Emma Watson',
    rollNo: 'STU-1001',
    branch: 'Computer Science & AI',
    cgpa: 9.4,
    company: 'Google Cloud Labs',
    role: 'Software Development Engineer I',
    currentRound: 'Offered',
    offerCtc: '$48,000 LPA',
    status: 'offered'
  },
  {
    id: 'APP-502',
    studentName: 'Liam Smith',
    rollNo: 'STU-1002',
    branch: 'Computer Science & AI',
    cgpa: 8.8,
    company: 'Google Cloud Labs',
    role: 'Software Development Engineer I',
    currentRound: 'Technical Round 2',
    status: 'active'
  },
  {
    id: 'APP-503',
    studentName: 'Noah Johnson',
    rollNo: 'STU-1003',
    branch: 'Electrical & Computing',
    cgpa: 8.2,
    company: 'Microsoft Corporation',
    role: 'Cloud Solutions Architect',
    currentRound: 'Technical Round 1',
    status: 'active'
  },
  {
    id: 'APP-504',
    studentName: 'Sophia Davis',
    rollNo: 'STU-1004',
    branch: 'Information Systems',
    cgpa: 8.6,
    company: 'Deloitte Strategy & Analytics',
    role: 'Technology Strategy Consultant',
    currentRound: 'Offered',
    offerCtc: '$26,000 LPA',
    status: 'offered'
  },
  {
    id: 'APP-505',
    studentName: 'William Brown',
    rollNo: 'STU-1005',
    branch: 'Mechanical & Mechatronics',
    cgpa: 7.9,
    company: 'Amazon Web Services',
    role: 'DevOps & Reliability Engineer',
    currentRound: 'Aptitude Test',
    status: 'active'
  }
];

export function PlacementHub() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';
  const studentCgpa = 9.4; // Emma Watson benchmark

  const [activeTab, setActiveTab] = useState<'my_applications' | 'drives' | 'pipeline' | 'analytics'>(
    isStudent ? 'my_applications' : 'drives'
  );

  const [drives, setDrives] = useState<RecruitmentDrive[]>(mockDrives);
  const [applicants, setApplicants] = useState<StudentApplicant[]>(mockApplicants);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  // Load backend drives and applications if available
  useEffect(() => {
    async function loadData() {
      try {
        const [dData, aData] = await Promise.all([
          apiClient.getPlacementDrives().catch(() => null),
          apiClient.getPlacementApplications().catch(() => null)
        ]);
        if (dData && dData.length > 0) {
          const mappedDrives: RecruitmentDrive[] = dData.map((d: any) => ({
            id: d.id,
            companyName: d.company_name,
            logoColor: 'from-blue-500 to-indigo-600',
            roleTitle: d.role_title,
            location: d.location || 'Remote / Hybrid',
            ctcPackage: d.ctc_package || '$45,000 LPA',
            minCgpa: Number(d.min_gpa) || 8.0,
            openingsCount: d.openings || 10,
            shortlistedCount: 25,
            stage: (d.status === 'open' ? 'Applications Open' : 'Technical Interviews') as any,
            deadline: d.drive_date || '2026-10-01'
          }));
          setDrives(mappedDrives);
        }
        if (aData && aData.length > 0) {
          const mappedApps: StudentApplicant[] = aData.map((a: any) => ({
            id: a.id,
            studentName: a.student_name,
            rollNo: a.student_id,
            branch: 'Computer Science & AI',
            cgpa: 9.4,
            company: a.company_name,
            role: a.role_title,
            currentRound: a.stage === 'offered' ? 'Offered' : a.stage === 'accepted' ? 'Accepted' : 'Technical Round 1',
            offerCtc: a.offer_package || '$48,000 LPA',
            status: a.stage as any
          }));
          setApplicants(mappedApps);
        }
      } catch (err) {
        console.warn('Placement backend offline fallback');
      }
    }
    loadData();
  }, []);

  // STUDENT ACTION: 1-Click Apply for Drive
  const handleApplyToDrive = async (drive: RecruitmentDrive) => {
    const isAlreadyApplied = applicants.some(
      a => a.company === drive.companyName && (a.rollNo === currentStudentId || a.studentName === currentStudentName)
    );

    if (isAlreadyApplied) {
      alert(`You have already submitted an application for ${drive.companyName}.`);
      return;
    }

    const newApp: StudentApplicant = {
      id: `APP-${Math.floor(100 + Math.random() * 900)}`,
      studentName: currentStudentName,
      rollNo: currentStudentId,
      branch: 'Computer Science & AI',
      cgpa: studentCgpa,
      company: drive.companyName,
      role: drive.roleTitle,
      currentRound: 'Aptitude Test',
      status: 'applied'
    };

    try {
      await apiClient.applyPlacementDrive({
        drive_id: drive.id,
        company_name: drive.companyName,
        role_title: drive.roleTitle,
        student_id: currentStudentId,
        student_name: currentStudentName
      });
    } catch (e) {
      console.warn('Offline placement apply fallback');
    }

    setApplicants(prev => [newApp, ...prev]);
    alert(`Application submitted to ${drive.companyName}! You can track interview rounds under 'My Applications'.`);
    setActiveTab('my_applications');
  };

  // STUDENT ACTION: View and Accept Offer Letter
  const handleViewAndAcceptOffer = (app: StudentApplicant) => {
    openDialog(
      'M56_OFFER_LETTER',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/20 text-center space-y-1">
            <PartyPopper className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="font-bold text-fg-0 text-base">Formal Campus Placement Offer</h3>
            <p className="text-xs text-emerald-400 font-semibold">{app.company} • Campus Recruitment 2026</p>
          </div>

          <div className="p-4 bg-bg-2 rounded-2xl border border-line text-xs space-y-2.5">
            <div className="flex justify-between border-b border-line/60 pb-2">
              <span className="text-fg-2">Candidate:</span>
              <span className="font-bold text-fg-0">{app.studentName} ({app.rollNo})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Designation:</span>
              <span className="font-semibold text-fg-0">{app.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Annual Compensation:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">{app.offerCtc}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Reporting Location:</span>
              <span className="text-fg-1 font-medium">Silicon Valley HQ / Hybrid</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-2">Commencement Date:</span>
              <span className="font-mono text-fg-1">July 1, 2027 (Post Graduation)</span>
            </div>
            <div className="p-2.5 bg-bg-1 rounded-xl border border-line/60 text-[11px] text-fg-2">
              Includes comprehensive medical insurance, $10,000 relocation assistance, and restricted stock unit grants vesting over 4 years.
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-fg-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Digitally verified by Placement Cell
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-fg-2 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
              >
                Decide Later
              </button>
              {app.status === 'accepted' ? (
                <span className="inline-flex items-center gap-1 px-4 py-2 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                  <Check className="w-3.5 h-3.5" /> Offer Accepted
                </span>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiClient.updatePlacementApplicationStage(app.id, 'accepted', app.offerCtc);
                    } catch (e) {
                      console.warn('Offline offer acceptance fallback');
                    }

                    setApplicants(prev => prev.map(a => a.id === app.id ? { ...a, status: 'accepted', currentRound: 'Accepted' } : a));
                    onClose();
                    alert(`Congratulations ${app.studentName}! You have officially accepted the offer at ${app.company}.`);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-md shadow-emerald-500/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sign & Accept Offer
                </button>
              )}
            </div>
          </div>
        </div>
      ),
      {},
      { title: `Offer Letter Dossier • ${app.company}`, size: 'md' }
    );
  };

  // PLACEMENT OFFICER ACTION: Advance Stage / Extend Offer
  const handleAdvanceStage = (app: StudentApplicant, nextStage: string, offerPkg?: string) => {
    openConfirm({
      title: `Advance Candidate ${app.studentName}?`,
      message: `Promote ${app.studentName} to "${nextStage.toUpperCase()}" for ${app.company}?`,
      variant: 'default',
      confirmLabel: 'Confirm Stage Advancement',
      onConfirm: async () => {
        try {
          await apiClient.updatePlacementApplicationStage(app.id, nextStage, offerPkg);
        } catch (e) {
          console.warn('Offline stage advancement fallback');
        }
        setApplicants(prev => prev.map(a => a.id === app.id ? {
          ...a,
          status: nextStage as any,
          currentRound: (nextStage === 'offered' ? 'Offered' : 'Technical Round 2') as any,
          offerCtc: offerPkg || a.offerCtc
        } : a));
      }
    });
  };

  // Filtered applicants
  const filteredApplicants = applicants.filter(app => 
    app.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    app.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myApplications = applicants.filter(
    a => a.rollNo === currentStudentId || a.studentName.toLowerCase().includes(currentStudentName.toLowerCase())
  );

  return (
    <ModulePageLayout
      moduleId="M56"
      moduleTitle="Corporate Placements, Drives & Job Offers"
      portalName="Career & Corporate Relations"
      description="Campus recruitment drives, student 1-click applications, automated interview slot scheduling, and formal offer letter acceptance."
      tags={['Campus Drives', 'Offer Letters', 'Pipeline Kanban']}
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('my_applications')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'my_applications'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              My Applications & Offers ({myApplications.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('drives')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'drives'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Active Campus Drives ({drives.length})
            </button>

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('pipeline')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'pipeline'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Recruitment Pipeline ({applicants.length})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-2 font-medium">
              Student CGPA: <span className="font-mono font-bold text-emerald-400">{studentCgpa} / 10.0</span>
            </span>
          </div>
        </div>

        {/* TAB 1: MY APPLICATIONS & OFFER LETTERS (STUDENT EXPERIENCE) */}
        {activeTab === 'my_applications' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Applications Submitted</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">{myApplications.length}</p>
                <p className="text-xs text-fg-2 mt-2">Active corporate evaluation tracks</p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Shortlisted for Rounds</span>
                <p className="text-3xl font-bold text-primary mt-1 font-mono">
                  {myApplications.filter(a => a.status === 'active' || a.status === 'offered' || a.status === 'accepted').length}
                </p>
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Technical & System Design Interviews
                </p>
              </div>

              <div className="bg-bg-1 border border-line rounded-2xl p-6 shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Offer Letters Received</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">
                  {myApplications.filter(a => a.status === 'offered' || a.status === 'accepted').length}
                </p>
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Highest Package: $48,000 LPA
                </p>
              </div>
            </div>

            {/* If any offer is extended, show highlighted action banner */}
            {myApplications.some(a => a.status === 'offered') && (
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-fg-0">
                      Congratulations! You have an official job offer from Google Cloud Labs!
                    </h3>
                    <p className="text-xs text-fg-2 mt-0.5">
                      Software Development Engineer I • Annual Package: <strong>$48,000 LPA</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const off = myApplications.find(a => a.status === 'offered');
                    if (off) handleViewAndAcceptOffer(off);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl shadow-md shadow-emerald-500/20 flex items-center gap-1.5 shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  View & Accept Formal Offer
                </button>
              </div>
            )}

            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-fg-0">My Placement Applications Tracker</h3>
                  <p className="text-xs text-fg-2 mt-0.5">Live recruitment progression for {currentStudentName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('drives')}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
                >
                  + Apply to More Drives
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Company</th>
                      <th className="py-3 px-4">Role Title</th>
                      <th className="py-3 px-4">Compensation</th>
                      <th className="py-3 px-4">Current Stage</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {myApplications.map((app) => (
                      <tr key={app.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4 font-bold text-fg-0">{app.company}</td>
                        <td className="py-3 px-4 text-fg-1">{app.role}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-400">{app.offerCtc || 'Competitive'}</td>
                        <td className="py-3 px-4 font-semibold text-primary">{app.currentRound}</td>
                        <td className="py-3 px-4">
                          {app.status === 'offered' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Sparkles className="w-3 h-3" /> Offer Ready
                            </span>
                          )}
                          {app.status === 'accepted' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              <CheckCircle2 className="w-3 h-3" /> Offer Accepted
                            </span>
                          )}
                          {app.status === 'active' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <Clock className="w-3 h-3" /> Interviewing
                            </span>
                          )}
                          {app.status === 'applied' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Applied
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {(app.status === 'offered' || app.status === 'accepted') ? (
                            <button
                              type="button"
                              onClick={() => handleViewAndAcceptOffer(app)}
                              className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm"
                            >
                              {app.status === 'accepted' ? 'View Offer Letter' : 'Review & Sign Offer'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-fg-2 italic">Awaiting Next Round</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE RECRUITMENT DRIVES */}
        {activeTab === 'drives' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {drives.map((drive) => {
                const isEligible = studentCgpa >= drive.minCgpa;
                const isApplied = applicants.some(
                  a => a.company === drive.companyName && (a.rollNo === currentStudentId || a.studentName === currentStudentName)
                );

                return (
                  <div key={drive.id} className="p-5 rounded-2xl bg-bg-1 border border-line flex flex-col justify-between shadow-sm hover:border-primary/40 transition-all">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider block">
                            {drive.id} • {drive.stage}
                          </span>
                          <h3 className="font-bold text-fg-0 text-base mt-0.5">{drive.companyName}</h3>
                          <p className="text-xs text-fg-1 font-semibold">{drive.roleTitle}</p>
                        </div>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {drive.ctcPackage}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-bg-2 rounded-xl border border-line/60">
                        <div><span className="text-fg-2">Location:</span> <span className="text-fg-1 font-medium">{drive.location}</span></div>
                        <div><span className="text-fg-2">Min CGPA:</span> <span className="text-fg-1 font-bold">{drive.minCgpa}</span></div>
                        <div><span className="text-fg-2">Openings:</span> <span className="text-fg-1 font-medium">{drive.openingsCount} Positions</span></div>
                        <div><span className="text-fg-2">Deadline:</span> <span className="font-mono text-fg-1">{drive.deadline}</span></div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-line flex items-center justify-between">
                      <div className="text-xs">
                        {isEligible ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Eligible (Your CGPA: {studentCgpa})
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold">Min CGPA {drive.minCgpa} required</span>
                        )}
                      </div>

                      {isApplied ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                          <Check className="w-3.5 h-3.5" /> Applied
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!isEligible}
                          onClick={() => handleApplyToDrive(drive)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                            isEligible
                              ? 'bg-primary hover:bg-primary/90 text-white shadow-sm'
                              : 'bg-bg-2 text-fg-2 cursor-not-allowed'
                          }`}
                        >
                          1-Click Apply
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: PLACEMENT OFFICER PIPELINE */}
        {!isStudent && activeTab === 'pipeline' && (
          <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-fg-0">Candidate Recruitment Pipeline</h3>
                <p className="text-xs text-fg-2 mt-0.5">Advance candidates across interview rounds and dispatch official offer packages</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-2" />
                <input
                  type="text"
                  placeholder="Search candidate..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl bg-bg-2 border border-line text-xs text-fg-0 outline-none w-48"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Candidate Student</th>
                    <th className="py-3 px-4">Company & Role</th>
                    <th className="py-3 px-4">CGPA</th>
                    <th className="py-3 px-4">Current Round</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredApplicants.map((app) => (
                    <tr key={app.id} className="hover:bg-bg-2/40 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-fg-0 block">{app.studentName}</span>
                        <span className="text-[11px] text-fg-2 font-mono">{app.rollNo}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-fg-0 block">{app.company}</span>
                        <span className="text-[11px] text-fg-2">{app.role}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-fg-0">{app.cgpa}</td>
                      <td className="py-3 px-4 font-semibold text-primary">{app.currentRound}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          app.status === 'offered' ? 'bg-emerald-500/10 text-emerald-400' :
                          app.status === 'accepted' ? 'bg-primary/10 text-primary' : 'bg-cyan-500/10 text-cyan-400'
                        }`}>
                          {app.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {app.status === 'offered' ? (
                          <span className="text-xs text-emerald-400 font-semibold">Offer Extended ({app.offerCtc})</span>
                        ) : app.status === 'accepted' ? (
                          <span className="text-xs text-primary font-bold">Offer Accepted!</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdvanceStage(app, 'offered', '$48,000 LPA')}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                          >
                            Extend Offer Package
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
      </div>
    </ModulePageLayout>
  );
}
