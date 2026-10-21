import { useState } from 'react';
import { Shell } from '../../components/layout/Shell';
import { Plus, Search, MoreHorizontal, Mail, Phone, Calendar, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useDialog } from '../../core/dialog';
import { QuickLeadModal } from './QuickLeadModal';

interface Lead {
  id: number;
  name: string;
  email: string;
  phone: string;
  course: string;
  date: string;
}

interface Stage {
  id: string;
  title: string;
  color: string;
  bg: string;
  leads: Lead[];
}

const initialPipeline: Stage[] = [
  {
    id: 'new',
    title: 'New Inquiries',
    color: 'border-l-info',
    bg: 'bg-info/10',
    leads: [
      { id: 1, name: 'Emma Watson', email: 'emma.w@example.com', date: 'Oct 24', phone: '+1 234 567 8900', course: 'Computer Science & AI' },
      { id: 2, name: 'Liam Smith', email: 'liam.s@example.com', date: 'Oct 23', phone: '+1 234 567 8901', course: 'Business Admin' },
    ]
  },
  {
    id: 'contacted',
    title: 'Contacted',
    color: 'border-l-warning',
    bg: 'bg-warning/10',
    leads: [
      { id: 3, name: 'Noah Johnson', email: 'noah.j@example.com', date: 'Oct 22', phone: '+1 234 567 8902', course: 'Robotics Engineering' },
    ]
  },
  {
    id: 'interview',
    title: 'Interview Scheduled',
    color: 'border-l-primary',
    bg: 'bg-primary/10',
    leads: [
      { id: 4, name: 'Olivia Williams', email: 'olivia.w@example.com', date: 'Oct 25', phone: '+1 234 567 8903', course: 'Cognitive Psychology' },
      { id: 5, name: 'William Brown', email: 'william.b@example.com', date: 'Oct 26', phone: '+1 234 567 8904', course: 'Computer Science & AI' },
    ]
  },
  {
    id: 'enrolled',
    title: 'Enrolled',
    color: 'border-l-success',
    bg: 'bg-success/10',
    leads: [
      { id: 6, name: 'James Jones', email: 'james.j@example.com', date: 'Oct 20', phone: '+1 234 567 8905', course: 'Data Science & Analytics' },
    ]
  }
];

export function AdmissionsPipeline() {
  const [pipeline, setPipeline] = useState<Stage[]>(initialPipeline);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  const handleOpenNewLeadModal = () => {
    openDialog(
      'M03_QUICK_LEAD',
      QuickLeadModal,
      {
        onSave: (newLead: Lead) => {
          setPipeline(prev => prev.map(stage => {
            if (stage.id === 'new') {
              return { ...stage, leads: [newLead, ...stage.leads] };
            }
            return stage;
          }));
        }
      },
      { title: 'M03: Fast Candidate Lead Intake', size: 'md' }
    );
  };

  const handleAdvanceStage = (lead: Lead, currentStageId: string) => {
    const stageOrder = ['new', 'contacted', 'interview', 'enrolled'];
    const currentIdx = stageOrder.indexOf(currentStageId);
    if (currentIdx === -1 || currentIdx >= stageOrder.length - 1) return;

    const nextStageId = stageOrder[currentIdx + 1];
    const nextStageTitle = pipeline.find(s => s.id === nextStageId)?.title || nextStageId;

    openConfirm({
      title: `Advance ${lead.name}?`,
      message: `Move candidate from "${pipeline.find(s => s.id === currentStageId)?.title}" to "${nextStageTitle}"? This will trigger automated email notifications to the counsellor.`,
      variant: nextStageId === 'enrolled' ? 'success' : 'default',
      confirmLabel: nextStageId === 'enrolled' ? 'Confirm Enrollment' : 'Advance Stage',
      onConfirm: () => {
        setPipeline(prev => {
          return prev.map(stage => {
            if (stage.id === currentStageId) {
              return { ...stage, leads: stage.leads.filter(l => l.id !== lead.id) };
            }
            if (stage.id === nextStageId) {
              return { ...stage, leads: [lead, ...stage.leads] };
            }
            return stage;
          });
        });
      }
    });
  };

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                M03
              </span>
              <h1 className="text-2xl font-bold text-fg-0">Admissions CRM Pipeline</h1>
            </div>
            <p className="text-sm text-fg-2">
              Track and evaluate prospective student applications from inquiry to enrollment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter applicants..." 
                className="w-full md:w-64 bg-bg-1 border border-line rounded-xl pl-9 pr-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm"
              />
            </div>
            <button 
              onClick={handleOpenNewLeadModal}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all shadow-md flex items-center gap-2 hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> New Lead
            </button>
          </div>
        </div>

        {/* AI Funnel Metrics banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-bg-1 border border-line rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-fg-2 block">Total Pipeline</span>
              <span className="text-lg font-bold text-fg-0">
                {pipeline.reduce((acc, s) => acc + s.leads.length, 0)} Leads
              </span>
            </div>
            <Sparkles className="w-5 h-5 text-primary opacity-60" />
          </div>
          <div className="p-3.5 bg-bg-1 border border-line rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-fg-2 block">Conversion Rate</span>
              <span className="text-lg font-bold text-success">38.2%</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-success opacity-60" />
          </div>
          <div className="p-3.5 bg-bg-1 border border-line rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-fg-2 block">Avg. Cycle Time</span>
              <span className="text-lg font-bold text-fg-0">4.5 Days</span>
            </div>
            <Calendar className="w-5 h-5 text-warning opacity-60" />
          </div>
          <div className="p-3.5 bg-bg-1 border border-line rounded-xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-fg-2 block">AI Lead Scoring</span>
              <span className="text-lg font-bold text-primary">Active</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">OCR+RAG</span>
          </div>
        </div>

        {/* Pipeline Columns */}
        <div className="flex-1 min-h-0 overflow-x-auto pb-4 scrollbar-thin">
          <div className="flex gap-6 h-full min-w-max">
            {pipeline.map((stage) => {
              const displayedLeads = stage.leads.filter(l => 
                !searchQuery || 
                l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                l.course.toLowerCase().includes(searchQuery.toLowerCase())
              );

              return (
                <div key={stage.id} className="w-80 flex flex-col bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden h-full">
                  <div className={`p-4 border-b border-line border-l-4 ${stage.color} flex justify-between items-center bg-bg-2/30`}>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-fg-0 text-sm">{stage.title}</h2>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.bg} text-fg-0`}>
                        {displayedLeads.length}
                      </span>
                    </div>
                    <button className="text-fg-2 hover:text-fg-0 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                    {displayedLeads.map((lead) => (
                      <div 
                        key={lead.id} 
                        className="bg-bg-0 border border-line hover:border-primary/50 rounded-xl p-3.5 shadow-sm transition-all group hover:shadow-md"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-sm text-fg-0 group-hover:text-primary transition-colors">
                            {lead.name}
                          </h3>
                          <span className="text-[10px] font-medium text-fg-2 bg-bg-2 px-1.5 py-0.5 rounded border border-line">
                            {lead.date}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-secondary mb-3">{lead.course}</p>
                        
                        <div className="flex items-center justify-between text-fg-2 pt-2.5 border-t border-line">
                          <div className="flex gap-2">
                            <button className="hover:text-primary transition-colors p-1" title="Email"><Mail className="w-3.5 h-3.5" /></button>
                            <button className="hover:text-primary transition-colors p-1" title="Call"><Phone className="w-3.5 h-3.5" /></button>
                            <button className="hover:text-primary transition-colors p-1" title="Schedule"><Calendar className="w-3.5 h-3.5" /></button>
                          </div>

                          {stage.id !== 'enrolled' ? (
                            <button
                              onClick={() => handleAdvanceStage(lead, stage.id)}
                              className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded transition-colors"
                              title="Advance to next pipeline stage"
                            >
                              <span>Next</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-success flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Enrolled
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {displayedLeads.length === 0 && (
                      <div className="py-8 text-center text-xs text-fg-2 border border-dashed border-line rounded-xl">
                        No applicants in this stage
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
}
