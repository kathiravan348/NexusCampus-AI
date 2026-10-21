import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  CheckCircle2, 
  Clock, 
  FileText, 
  Upload, 
  Download, 
  Sparkles
} from 'lucide-react';

interface CriteriaItem {
  id: string;
  criterionNumber: number;
  name: string;
  weightage: number;
  currentScore: number;
  maxScore: number;
  completionPercentage: number;
  leadCoordinator: string;
  evidenceFilesCount: number;
  status: 'ready' | 'in_progress' | 'audit_required';
}

interface EvidenceDocument {
  id: string;
  criterionCode: string;
  metricNumber: string;
  title: string;
  fileFormat: string;
  fileSize: string;
  uploadedBy: string;
  uploadedDate: string;
  verificationStatus: 'verified' | 'pending' | 'flagged';
}

const initialCriteria: CriteriaItem[] = [
  { id: 'C1', criterionNumber: 1, name: 'Curricular Aspects', weightage: 100, currentScore: 94, maxScore: 100, completionPercentage: 94, leadCoordinator: 'Dr. Alistair Vance', evidenceFilesCount: 28, status: 'ready' },
  { id: 'C2', criterionNumber: 2, name: 'Teaching-Learning & Evaluation', weightage: 350, currentScore: 320, maxScore: 350, completionPercentage: 91, leadCoordinator: 'Dr. Sarah Lin', evidenceFilesCount: 64, status: 'ready' },
  { id: 'C3', criterionNumber: 3, name: 'Research, Innovations & Extension', weightage: 110, currentScore: 96, maxScore: 110, completionPercentage: 87, leadCoordinator: 'Prof. Rajesh Kulkarni', evidenceFilesCount: 42, status: 'in_progress' },
  { id: 'C4', criterionNumber: 4, name: 'Infrastructure & Learning Resources', weightage: 100, currentScore: 96, maxScore: 100, completionPercentage: 96, leadCoordinator: 'Claire Beauchamp', evidenceFilesCount: 35, status: 'ready' },
  { id: 'C5', criterionNumber: 5, name: 'Student Support & Progression', weightage: 140, currentScore: 125, maxScore: 140, completionPercentage: 89, leadCoordinator: 'Elena Gomez', evidenceFilesCount: 31, status: 'in_progress' },
  { id: 'C6', criterionNumber: 6, name: 'Governance, Leadership & Management', weightage: 100, currentScore: 93, maxScore: 100, completionPercentage: 93, leadCoordinator: 'Dr. Michael Chang', evidenceFilesCount: 26, status: 'ready' },
  { id: 'C7', criterionNumber: 7, name: 'Institutional Values & Best Practices', weightage: 100, currentScore: 95, maxScore: 100, completionPercentage: 95, leadCoordinator: 'Dr. Anita Roy', evidenceFilesCount: 22, status: 'ready' },
];

const initialEvidenceDocs: EvidenceDocument[] = [
  { id: 'EVD-101', criterionCode: 'Criterion 1', metricNumber: '1.1.2', title: 'BoS Curriculum Revision Minutes & Stakeholder Feedback Analysis', fileFormat: 'PDF', fileSize: '4.8 MB', uploadedBy: 'Dr. Alistair Vance', uploadedDate: '2026-08-20', verificationStatus: 'verified' },
  { id: 'EVD-102', criterionCode: 'Criterion 2', metricNumber: '2.4.2', title: 'Full-Time PhD Faculty Degree Certificates & Experience Ledger', fileFormat: 'ZIP', fileSize: '22.4 MB', uploadedBy: 'Dr. Sarah Lin', uploadedDate: '2026-08-24', verificationStatus: 'verified' },
  { id: 'EVD-103', criterionCode: 'Criterion 3', metricNumber: '3.1.1', title: 'Sponsored R&D Projects Grants Sanction Letters from DST/SERB', fileFormat: 'PDF', fileSize: '8.1 MB', uploadedBy: 'Prof. Rajesh Kulkarni', uploadedDate: '2026-09-02', verificationStatus: 'pending' },
  { id: 'EVD-104', criterionCode: 'Criterion 4', metricNumber: '4.2.1', title: 'Integrated ILMS Automation Software Purchase Receipt & AMC', fileFormat: 'PDF', fileSize: '2.3 MB', uploadedBy: 'Claire Beauchamp', uploadedDate: '2026-09-05', verificationStatus: 'verified' },
  { id: 'EVD-105', criterionCode: 'Criterion 6', metricNumber: '6.3.3', title: 'Annual Financial Audit Statements & Institutional Budget Allocations', fileFormat: 'PDF', fileSize: '14.6 MB', uploadedBy: 'Dr. Michael Chang', uploadedDate: '2026-09-08', verificationStatus: 'verified' }
];

export function AccreditationDashboard() {
  const [criteria] = useState<CriteriaItem[]>(initialCriteria);
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceDocument[]>(initialEvidenceDocs);
  const [activeFramework, setActiveFramework] = useState<'NAAC' | 'NIRF' | 'NBA'>('NAAC');
  const { openDialog, openConfirm } = useDialog();

  const totalScore = criteria.reduce((acc, c) => acc + c.currentScore, 0);
  const maxTotalScore = criteria.reduce((acc, c) => acc + c.maxScore, 0);
  const projectedCGPA = ((totalScore / maxTotalScore) * 4.0).toFixed(2);

  const handleUploadEvidence = () => {
    openDialog(
      'M24_UPLOAD_EVIDENCE',
      ({ onClose }) => {
        let title = '';
        let metric = '1.2.1';
        let criterion = 'Criterion 1';

        return (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Evidence documents are cryptographically fingerprinted (SHA-256) for NAAC peer-team DVV validation.</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-fg-1 block mb-1">Select Criterion & Framework</label>
                <select
                  defaultValue={criterion}
                  onChange={(e) => { criterion = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                >
                  {criteria.map(c => (
                    <option key={c.id} value={`Criterion ${c.criterionNumber}`}>
                      Criterion {c.criterionNumber}: {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Metric Code</label>
                <input
                  type="text"
                  defaultValue={metric}
                  onChange={(e) => { metric = e.target.value; }}
                  placeholder="e.g. 1.2.1 or 2.3.4"
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 font-mono focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="font-semibold text-fg-1 block mb-1">Evidence Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Geo-tagged Campus Solar Microgrid Photos & Carbon Audit"
                  onChange={(e) => { title = e.target.value; }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-2 border border-line text-fg-0 focus:outline-none focus:border-primary/50"
                />
              </div>

              <div className="border-2 border-dashed border-line rounded-xl p-4 text-center space-y-1 bg-bg-2/40">
                <Upload className="w-5 h-5 mx-auto text-fg-2" />
                <span className="text-xs font-medium text-fg-1 block">Click to attach SSR file or drag here</span>
                <span className="text-[10px] text-fg-2 block">Accepts PDF, DOCX, ZIP up to 50 MB</span>
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
                    setEvidenceDocs(prev => [
                      {
                        id: `EVD-${Date.now().toString().slice(-3)}`,
                        criterionCode: criterion,
                        metricNumber: metric || '1.1.1',
                        title,
                        fileFormat: 'PDF',
                        fileSize: '3.4 MB',
                        uploadedBy: 'Dr. Alistair Vance',
                        uploadedDate: '2026-09-14',
                        verificationStatus: 'verified'
                      },
                      ...prev
                    ]);
                  }
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload to SSR Repository
              </button>
            </div>
          </div>
        );
      },
      {},
      { title: 'Upload SSR Evidence Proof', size: 'md' }
    );
  };

  const handleExportDataPack = () => {
    openConfirm({
      title: 'Generate NAAC Self-Study Report (SSR) Data Pack',
      message: `Compile all 7 criteria narratives, quantitative metric workbooks, and ${evidenceDocs.length} verified evidence exhibits into the official NAAC Portal ZIP package?`,
      variant: 'default',
      confirmLabel: 'Compile & Export ZIP',
      onConfirm: () => {
        alert('SSR Data Pack compiled successfully! NAAC_SSR_Cycle3_DataPack.zip downloaded.');
      }
    });
  };

  return (
    <ModulePageLayout
      moduleId="M24"
      moduleTitle="Accreditation & Quality Compliance"
      portalName="Workforce & Governance"
      description="Automated NAAC, NIRF, NBA criteria mapping, DVV evidence repository, and Self-Study Report (SSR) generation"
    >
      <div className="space-y-6">
        {/* Framework Selector & Executive Score Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-bg-1 to-secondary/10 border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary text-white shadow-sm">
                CYCLE 3 ACCREDITATION
              </span>
              <span className="text-xs text-fg-2 font-mono">Academic Year 2025-2026</span>
            </div>
            <h2 className="text-2xl font-bold text-fg-0 tracking-tight">
              Institutional Quality & Compliance Radar
            </h2>
            <p className="text-xs text-fg-2 max-w-xl">
              Real-time aggregation of quantitative metrics (QnM) and qualitative metrics (QnM) across all academic and administrative divisions.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-bg-1/80 backdrop-blur-md p-4 rounded-2xl border border-line shrink-0">
            <div className="text-center px-3 border-r border-line">
              <span className="text-[10px] font-medium text-fg-2 uppercase tracking-wider block">Target Grade</span>
              <span className="text-3xl font-extrabold text-primary block mt-0.5">A++</span>
              <span className="text-[10px] text-emerald-400 font-medium">Valid until 2031</span>
            </div>
            <div className="text-center px-3">
              <span className="text-[10px] font-medium text-fg-2 uppercase tracking-wider block">Projected CGPA</span>
              <span className="text-3xl font-extrabold text-fg-0 font-mono block mt-0.5">{projectedCGPA}</span>
              <span className="text-[10px] text-fg-2">out of 4.00</span>
            </div>
          </div>
        </div>

        {/* Framework Tabs & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveFramework('NAAC')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFramework === 'NAAC' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              NAAC Criteria 1–7
            </button>
            <button
              type="button"
              onClick={() => setActiveFramework('NIRF')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFramework === 'NIRF' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              NIRF India Rankings
            </button>
            <button
              type="button"
              onClick={() => setActiveFramework('NBA')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFramework === 'NBA' 
                  ? 'bg-primary text-white shadow-sm' 
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              NBA Tier-1 Outcomes
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleUploadEvidence}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-0 transition-colors shadow-sm"
            >
              <Upload className="w-3.5 h-3.5 text-primary" />
              <span>Upload SSR Evidence</span>
            </button>

            <button
              type="button"
              onClick={handleExportDataPack}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-secondary text-white hover:opacity-95 transition-all shadow-md shadow-primary/20"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export SSR Data Pack</span>
            </button>
          </div>
        </div>

        {/* NAAC 7 Criteria Progress Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-fg-2 uppercase tracking-wider">
              NAAC Key Indicators & Criterion Breakdown
            </h3>
            <span className="text-xs font-mono text-fg-2">Total Weightage: 1,000 Points</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {criteria.map((item) => (
              <div 
                key={item.id}
                className="p-4 rounded-2xl bg-bg-1 border border-line flex flex-col justify-between hover:border-primary/40 transition-all group shadow-sm space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                      Criterion {item.criterionNumber}
                    </span>
                    <span className="text-[10px] text-fg-2 font-mono">
                      Wt: {item.weightage} pts
                    </span>
                  </div>

                  <h4 className="font-bold text-fg-0 text-sm group-hover:text-primary transition-colors">
                    {item.name}
                  </h4>

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-fg-2">Metric Readiness</span>
                      <span className="text-fg-0 font-mono">{item.completionPercentage}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-bg-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          item.completionPercentage >= 90 ? 'bg-emerald-500' : 'bg-primary'
                        }`}
                        style={{ width: `${item.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-line flex items-center justify-between text-[11px]">
                  <span className="text-fg-2 truncate max-w-[140px]">
                    Lead: {item.leadCoordinator.split(' ').slice(0, 2).join(' ')}
                  </span>
                  <span className="font-mono text-primary font-semibold">
                    {item.evidenceFilesCount} proofs attached
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SSR Evidence Documents Ledger */}
        <div className="rounded-2xl border border-line bg-bg-1 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-fg-0 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Data Verification & Validation (DVV) Evidence Repository
              </h2>
              <p className="text-xs text-fg-2 mt-0.5">Audited evidentiary attachments linked to NAAC standard operating procedures</p>
            </div>
            <span className="text-xs font-mono text-fg-2">
              {evidenceDocs.length} Exhibits Ready
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                <tr>
                  <th className="py-3 px-4">Metric & Criterion</th>
                  <th className="py-3 px-4">Evidence Document Title</th>
                  <th className="py-3 px-4">Coordinator</th>
                  <th className="py-3 px-4">Format & Size</th>
                  <th className="py-3 px-4">Date Attached</th>
                  <th className="py-3 px-4 text-center">DVV Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {evidenceDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-bg-2/40 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-primary block font-mono">{doc.metricNumber}</span>
                      <span className="text-[10px] text-fg-2">{doc.criterionCode}</span>
                    </td>
                    <td className="py-3 px-4 max-w-sm">
                      <span className="font-medium text-fg-0 block leading-snug">{doc.title}</span>
                      <span className="text-[10px] text-fg-2 font-mono">{doc.id}</span>
                    </td>
                    <td className="py-3 px-4 text-fg-1">{doc.uploadedBy}</td>
                    <td className="py-3 px-4 font-mono text-fg-2">
                      {doc.fileFormat} • {doc.fileSize}
                    </td>
                    <td className="py-3 px-4 font-mono text-fg-2">{doc.uploadedDate}</td>
                    <td className="py-3 px-4 text-center">
                      {doc.verificationStatus === 'verified' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Peer Verified
                        </span>
                      )}
                      {doc.verificationStatus === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" /> Under Review
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => alert(`Downloading verified exhibit: ${doc.title}`)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-bg-2 hover:bg-bg-3 border border-line text-fg-1 hover:text-fg-0 transition-colors"
                      >
                        Download Exhibit
                      </button>
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
