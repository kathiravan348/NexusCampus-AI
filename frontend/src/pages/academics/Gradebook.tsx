import { useState, useEffect } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { MOCK_STUDENTS } from '@mock-platform';
import { useDialog } from '../../core/dialog';
import { useAuth } from '../../core/auth/AuthContext';
import { apiClient } from '../../api/client';
import { 
  FileSpreadsheet, 
  Send, 
  Award, 
  CheckCircle2, 
  Download,
  GraduationCap,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';

interface GradeRow {
  studentId: string;
  name: string;
  avatar: string;
  a1: number;
  a2: number;
  midterm: number;
  finalProject: number;
}

interface StudentGradeRecord {
  id: string;
  course_code: string;
  course_title: string;
  credits: number;
  student_id: string;
  internal_score: number;
  final_score: number;
  total_score: number;
  letter_grade: string;
  gpa_points: number;
  status: 'draft' | 'published';
  moderated_by?: string;
}

const initialStudentGrades: StudentGradeRecord[] = [
  {
    id: 'GRD-01',
    course_code: 'CS-301',
    course_title: 'Advanced Machine Learning & Neural Nets',
    credits: 4,
    student_id: 'STU-1001',
    internal_score: 38,
    final_score: 58,
    total_score: 96,
    letter_grade: 'A+',
    gpa_points: 4.0,
    status: 'published',
    moderated_by: 'Prof. Donald Knuth (Chief Examiner)'
  },
  {
    id: 'GRD-02',
    course_code: 'SE-204',
    course_title: 'Cloud Native Microservices Architecture',
    credits: 4,
    student_id: 'STU-1001',
    internal_score: 37,
    final_score: 55,
    total_score: 92,
    letter_grade: 'A',
    gpa_points: 3.9,
    status: 'published',
    moderated_by: 'Prof. Donald Knuth (Chief Examiner)'
  },
  {
    id: 'GRD-03',
    course_code: 'MTH-310',
    course_title: 'Discrete Mathematics & Cryptography',
    credits: 3,
    student_id: 'STU-1001',
    internal_score: 39,
    final_score: 57,
    total_score: 96,
    letter_grade: 'A+',
    gpa_points: 4.0,
    status: 'published',
    moderated_by: 'Prof. Donald Knuth (Chief Examiner)'
  },
  {
    id: 'GRD-04',
    course_code: 'AI-402',
    course_title: 'Computer Vision & Multi-Modal Models',
    credits: 4,
    student_id: 'STU-1001',
    internal_score: 36,
    final_score: 53,
    total_score: 89,
    letter_grade: 'A',
    gpa_points: 3.8,
    status: 'published',
    moderated_by: 'Prof. Donald Knuth (Chief Examiner)'
  },
  {
    id: 'GRD-05',
    course_code: 'HSS-102',
    course_title: 'Professional Engineering Ethics & Society',
    credits: 2,
    student_id: 'STU-1001',
    internal_score: 38,
    final_score: 56,
    total_score: 94,
    letter_grade: 'A+',
    gpa_points: 4.0,
    status: 'published',
    moderated_by: 'Prof. Donald Knuth (Chief Examiner)'
  }
];

export function Gradebook() {
  const { user, role } = useAuth();
  const isStudent = role === 'student';
  const isExaminer = role === 'examiner';
  const currentStudentId = isStudent ? (user?.id || 'STU-1001') : 'STU-1001';
  const currentStudentName = isStudent ? (user?.name || 'Emma Watson') : 'Emma Watson';

  const [activeTab, setActiveTab] = useState<'student_transcript' | 'faculty_gradebook' | 'examiner_council'>(
    isStudent ? 'student_transcript' : isExaminer ? 'examiner_council' : 'faculty_gradebook'
  );

  const [selectedCourse, setSelectedCourse] = useState('CS-301: Advanced Machine Learning');
  const [grades, setGrades] = useState<GradeRow[]>(() => 
    MOCK_STUDENTS.map((s, idx) => ({
      studentId: s.id,
      name: s.name,
      avatar: s.avatar,
      a1: 18 + (idx % 3),
      a2: 19 - (idx % 2),
      midterm: 27 + (idx % 3),
      finalProject: 28 - (idx % 3)
    }))
  );

  const [officialGrades, setOfficialGrades] = useState<StudentGradeRecord[]>(initialStudentGrades);

  const { openConfirm, openDialog } = useDialog();

  // Load from backend if available
  useEffect(() => {
    async function loadGrades() {
      try {
        const data = await apiClient.getCourseGrades();
        if (data && data.length > 0) {
          setOfficialGrades(data);
        }
      } catch (err) {
        console.warn('Academics grades backend offline fallback');
      }
    }
    loadGrades();
  }, []);

  const handleScoreChange = (studentId: string, field: 'a1' | 'a2' | 'midterm' | 'finalProject', val: number) => {
    setGrades(prev => prev.map(g => {
      if (g.studentId === studentId) {
        return { ...g, [field]: Math.max(0, val) };
      }
      return g;
    }));
  };

  const getLetterAndGpa = (total: number) => {
    if (total >= 93) return { letter: 'A+', gpa: '4.0', color: 'text-success bg-success/10 border-success/20' };
    if (total >= 88) return { letter: 'A', gpa: '3.9', color: 'text-success bg-success/10 border-success/20' };
    if (total >= 80) return { letter: 'B+', gpa: '3.5', color: 'text-primary bg-primary/10 border-primary/20' };
    if (total >= 70) return { letter: 'B', gpa: '3.0', color: 'text-primary bg-primary/10 border-primary/20' };
    return { letter: 'C', gpa: '2.5', color: 'text-warning bg-warning/10 border-warning/20' };
  };

  // EXAMINER ACTION: Approve and Release Official Results
  const handleApproveAndRelease = () => {
    openConfirm({
      title: 'Release & Certify Official Semester Grades?',
      message: 'As Chief Examiner (Controller of Examinations), certify all moderated course grades. Final transcripts will be released to Student & Parent portals immediately.',
      variant: 'default',
      confirmLabel: 'Certify & Release Official Results',
      onConfirm: async () => {
        try {
          await apiClient.publishOfficialGrades(user?.name || 'Prof. Donald Knuth (Chief Examiner)');
        } catch (e) {
          console.warn('Official publish offline fallback');
        }
        setOfficialGrades(prev => prev.map(g => ({ ...g, status: 'published', moderated_by: user?.name || 'Prof. Donald Knuth (Chief Examiner)' })));
        alert('Official Results Certified and Published! Cryptographic transcript signatures activated.');
      }
    });
  };

  // STUDENT ACTION: Download Transcript
  const handleDownloadTranscript = () => {
    openDialog(
      'M11_TRANSCRIPT_VIEW',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-bg-2 border border-line space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-bold text-fg-0 text-sm">Nexus Campus Institute of Technology</h3>
                <p className="text-[11px] text-fg-2">Official Grade Transcript & Evaluation Dossier</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Official Certified
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-fg-2">Student Name:</span> <span className="font-bold text-fg-0">{currentStudentName}</span></div>
              <div><span className="text-fg-2">Roll Number:</span> <span className="font-mono text-fg-0">{currentStudentId}</span></div>
              <div><span className="text-fg-2">Program:</span> <span className="text-fg-0">B.Sc. Computer Science & AI</span></div>
              <div><span className="text-fg-2">Semester GPA:</span> <span className="font-bold text-emerald-400">3.94 / 4.00</span></div>
            </div>

            <div className="border border-line rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-bg-3 text-fg-2 text-[10px] uppercase">
                  <tr>
                    <th className="p-2">Course</th>
                    <th className="p-2">Credits</th>
                    <th className="p-2">Total Score</th>
                    <th className="p-2">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {officialGrades.map(g => (
                    <tr key={g.id}>
                      <td className="p-2 font-mono text-fg-0">{g.course_code}</td>
                      <td className="p-2">{g.credits}</td>
                      <td className="p-2 font-bold">{g.total_score} / 100</td>
                      <td className="p-2 font-bold text-emerald-400">{g.letter_grade} ({g.gpa_points})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1 text-[10px] text-fg-2">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Moderated by Controller of Examinations
              </span>
              <span className="font-mono">Date: 2026-09-14</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3.5 py-1.5 text-xs text-fg-2 hover:bg-bg-2 rounded-xl">Close</button>
            <button
              onClick={() => {
                alert('Official Digitally Signed Transcript PDF downloaded successfully!');
                onClose();
              }}
              className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 rounded-xl shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Download Signed PDF
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'Official Academic Transcript Dossier', size: 'md' }
    );
  };

  // GPA calculation for student
  const totalCredits = officialGrades.reduce((acc, g) => acc + g.credits, 0);
  const totalGpaPointsWeighted = officialGrades.reduce((acc, g) => acc + (g.gpa_points * g.credits), 0);
  const cumulativeGpa = totalCredits > 0 ? (totalGpaPointsWeighted / totalCredits).toFixed(2) : '3.92';

  return (
    <ModulePageLayout
      moduleId="M11"
      moduleTitle="Academics, Gradebook & Result Certification"
      portalName="Academics & Examination Wedge"
      description="Faculty evaluation spreadsheet, GPA calculation engine, Chief Examiner moderation council, and student transcript portal."
      tags={['GPA Scale 4.0', 'Cryptographic Seal', 'Result Moderation']}
    >
      <div className="space-y-6">
        {/* Navigation Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-1.5 p-1 bg-bg-2 border border-line rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('student_transcript')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'student_transcript'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-fg-2 hover:text-fg-0'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Student Semester Transcript ({currentStudentName})
            </button>

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('faculty_gradebook')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'faculty_gradebook'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Faculty Master Gradebook
              </button>
            )}

            {!isStudent && (
              <button
                type="button"
                onClick={() => setActiveTab('examiner_council')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'examiner_council'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Examination Moderation Council
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTranscript}
              className="px-3.5 py-2 bg-bg-2 hover:bg-bg-3 border border-line text-fg-0 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-primary" /> Download Transcript PDF
            </button>
          </div>
        </div>

        {/* TAB 1: STUDENT SEMESTER TRANSCRIPT */}
        {activeTab === 'student_transcript' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Semester GPA</span>
                <p className="text-3xl font-bold text-emerald-400 mt-1 font-mono">{cumulativeGpa} / 4.00</p>
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Dean's First Class Honors List
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Credits Earned</span>
                <p className="text-3xl font-bold text-fg-0 mt-1 font-mono">{totalCredits} / {totalCredits}</p>
                <p className="text-xs text-fg-2 mt-2">100% Completion Rate</p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Class Rank</span>
                <p className="text-3xl font-bold text-primary mt-1 font-mono">#1 of 124</p>
                <p className="text-xs text-fg-2 mt-2">B.Sc. Computer Science & AI</p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm">
                <span className="text-xs font-medium text-fg-2 block">Result Status</span>
                <p className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5" /> Official
                </p>
                <p className="text-xs text-fg-2 mt-2">Moderated & Certified</p>
              </div>
            </div>

            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-fg-0">Official Fall 2026 Academic Report Card</h3>
                  <p className="text-xs text-fg-2 mt-0.5">Formal grades verified and signed by Controller of Examinations</p>
                </div>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {officialGrades.length} Courses Evaluated
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-2/50 text-fg-2 uppercase tracking-wider font-semibold border-b border-line text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Course Code</th>
                      <th className="py-3 px-4">Course Title</th>
                      <th className="py-3 px-4">Credits</th>
                      <th className="py-3 px-4">Internal (40)</th>
                      <th className="py-3 px-4">Final Exam (60)</th>
                      <th className="py-3 px-4">Total Score (100)</th>
                      <th className="py-3 px-4">Letter Grade</th>
                      <th className="py-3 px-4 text-right">GPA Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {officialGrades.map((g) => (
                      <tr key={g.id} className="hover:bg-bg-2/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-primary">{g.course_code}</td>
                        <td className="py-3 px-4 font-semibold text-fg-0">{g.course_title}</td>
                        <td className="py-3 px-4 font-bold text-fg-1">{g.credits}</td>
                        <td className="py-3 px-4 font-mono text-fg-1">{g.internal_score}</td>
                        <td className="py-3 px-4 font-mono text-fg-1">{g.final_score}</td>
                        <td className="py-3 px-4 font-mono font-bold text-fg-0">{g.total_score}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {g.letter_grade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-fg-0">
                          {g.gpa_points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FACULTY MASTER GRADEBOOK */}
        {!isStudent && activeTab === 'faculty_gradebook' && (
          <div className="space-y-6">
            <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-semibold text-fg-2">Course Cohort:</span>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs font-semibold text-fg-0 outline-none focus:border-primary"
                >
                  <option>CS-301: Advanced Machine Learning</option>
                  <option>SE-204: Cloud Architecture</option>
                  <option>MTH-310: Cryptography</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => alert('Grades spreadsheet saved to local working cache.')}
                  className="px-3.5 py-2 bg-bg-2 hover:bg-bg-3 border border-line text-xs font-semibold text-fg-0 rounded-xl transition-colors"
                >
                  Save Draft Marks
                </button>
                <button
                  type="button"
                  onClick={() => alert('Grades submitted to Examination Council for moderation clearance.')}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Submit to Exam Council
                </button>
              </div>
            </div>

            <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-line bg-bg-2/50 text-[11px] font-bold text-fg-2 uppercase tracking-wider">
                      <th className="p-4">Student</th>
                      <th className="p-4 text-center">Assign 1 (20)</th>
                      <th className="p-4 text-center">Assign 2 (20)</th>
                      <th className="p-4 text-center">Midterm (30)</th>
                      <th className="p-4 text-center">Final Project (30)</th>
                      <th className="p-4 text-center">Total (100)</th>
                      <th className="p-4 text-center">Letter Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {grades.map((g) => {
                      const total = g.a1 + g.a2 + g.midterm + g.finalProject;
                      const { letter, gpa, color } = getLetterAndGpa(total);

                      return (
                        <tr key={g.studentId} className="hover:bg-bg-2/40 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img src={g.avatar} alt={g.name} className="w-8 h-8 rounded-full object-cover ring-1 ring-line" />
                              <div>
                                <span className="font-semibold text-fg-0 block">{g.name}</span>
                                <span className="text-[11px] text-fg-2 font-mono">{g.studentId}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-4 text-center">
                            <input
                              type="number"
                              value={g.a1}
                              onChange={(e) => handleScoreChange(g.studentId, 'a1', parseInt(e.target.value) || 0)}
                              className="w-16 bg-bg-2 border border-line rounded-lg px-2 py-1 text-center font-mono font-semibold text-fg-0"
                            />
                          </td>

                          <td className="p-4 text-center">
                            <input
                              type="number"
                              value={g.a2}
                              onChange={(e) => handleScoreChange(g.studentId, 'a2', parseInt(e.target.value) || 0)}
                              className="w-16 bg-bg-2 border border-line rounded-lg px-2 py-1 text-center font-mono font-semibold text-fg-0"
                            />
                          </td>

                          <td className="p-4 text-center">
                            <input
                              type="number"
                              value={g.midterm}
                              onChange={(e) => handleScoreChange(g.studentId, 'midterm', parseInt(e.target.value) || 0)}
                              className="w-16 bg-bg-2 border border-line rounded-lg px-2 py-1 text-center font-mono font-semibold text-fg-0"
                            />
                          </td>

                          <td className="p-4 text-center">
                            <input
                              type="number"
                              value={g.finalProject}
                              onChange={(e) => handleScoreChange(g.studentId, 'finalProject', parseInt(e.target.value) || 0)}
                              className="w-16 bg-bg-2 border border-line rounded-lg px-2 py-1 text-center font-mono font-semibold text-fg-0"
                            />
                          </td>

                          <td className="p-4 text-center font-mono font-bold text-fg-0 text-sm">
                            {total}
                          </td>

                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${color}`}>
                              {letter} ({gpa})
                            </span>
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

        {/* TAB 3: CHIEF EXAMINER MODERATION COUNCIL */}
        {!isStudent && activeTab === 'examiner_council' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-rose-500/10 via-primary/5 to-transparent border border-rose-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block mb-1">
                  Office of the Controller of Examinations
                </span>
                <h3 className="text-lg font-bold text-fg-0">
                  Moderation & Result Release Certification
                </h3>
                <p className="text-xs text-fg-2 mt-1">
                  Review verified faculty returns, cross-verify Bell curve distributions, and issue official certified grade transcripts.
                </p>
              </div>

              <button
                type="button"
                onClick={handleApproveAndRelease}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve & Certify Official Results
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm space-y-2">
                <span className="text-xs font-semibold text-fg-2">Council Moderation Status</span>
                <p className="text-2xl font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                  <CheckCircle2 className="w-5 h-5" /> Ready for Clearance
                </p>
                <p className="text-xs text-fg-2">All 5 academic departments submitted final scores</p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm space-y-2">
                <span className="text-xs font-semibold text-fg-2">Class Median GPA</span>
                <p className="text-2xl font-bold text-fg-0 font-mono">3.62 / 4.00</p>
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> +0.14 vs. Fall 2025 Semester
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-bg-1 border border-line shadow-sm space-y-2">
                <span className="text-xs font-semibold text-fg-2">Cryptographic Key Signature</span>
                <p className="text-sm font-mono font-bold text-primary truncate">RSA-4096-SHA256: 9E4F...28BA</p>
                <p className="text-xs text-fg-2">Tamper-evident verification stamp active</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModulePageLayout>
  );
}
