import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ModulePageLayout } from './ModulePageLayout';
import { MODULES_REGISTRY, PORTALS } from '../../modules/registry';
import { useDialog } from '../dialog';
import { getModuleMockData, BaseModuleData, ModuleRecord, ModuleWorkflow } from '@mock-platform';
import { 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  AlertCircle, 
  FolderCheck, 
  ArrowRight,
  Database,
  Cpu,
  Clock,
  TrendingUp,
  Plus,
  Search,
  Trash2,
  Edit,
  Eye,
  X,
  RefreshCw,
  FileCheck,
  Check
} from 'lucide-react';

export const ModulePlaceholderPage: React.FC = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { openDialog, openConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState('overview');

  // Normalize ID (e.g. 'm14' -> 'M14')
  const formattedId = (moduleId || 'm01').toUpperCase();
  const moduleItem = MODULES_REGISTRY.find(m => m.id === formattedId) || MODULES_REGISTRY[0];
  const portal = PORTALS[moduleItem.portal];

  // Retrieve rich mock data from the external mock platform
  const initialMockData: BaseModuleData = getModuleMockData(formattedId);

  // In-memory reactive state for full CRUD operations
  const [records, setRecords] = useState<ModuleRecord[]>(() => initialMockData.records || []);
  const [workflows, setWorkflows] = useState<ModuleWorkflow[]>(() => initialMockData.workflows || []);
  const [kpis, setKpis] = useState(() => initialMockData.kpis || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState<ModuleRecord | null>(null);

  // Re-sync when moduleId URL parameter changes
  useEffect(() => {
    const data = getModuleMockData(formattedId);
    setRecords(data.records || []);
    setWorkflows(data.workflows || []);
    setKpis(data.kpis || []);
    setSearchQuery('');
    setStatusFilter('all');
    setSelectedRecord(null);
    setActiveTab('overview');
  }, [formattedId]);

  // CREATE: Add new record modal
  const handleOpenCreateModal = () => {
    openDialog(
      `create-record-${moduleItem.id}`,
      ({ onClose }) => {
        const defaultRef = `REF-${formattedId}-${Math.floor(1000 + Math.random() * 9000)}`;
        const categories = initialMockData.options?.categories?.length 
          ? initialMockData.options.categories 
          : initialMockData.tags?.length 
            ? initialMockData.tags 
            : ['Core Operations', 'Institutional Compliance', 'Automation Policy'];

        return (
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem('name') as HTMLInputElement).value;
              const referenceCode = (form.elements.namedItem('referenceCode') as HTMLInputElement).value || defaultRef;
              const scope = (form.elements.namedItem('scope') as HTMLTextAreaElement).value;
              const status = (form.elements.namedItem('status') as HTMLSelectElement).value as any;
              const category = (form.elements.namedItem('category') as HTMLSelectElement).value;
              const notes = (form.elements.namedItem('notes') as HTMLTextAreaElement).value;

              const newRecord: ModuleRecord = {
                id: `${formattedId}-REC-${1000 + records.length + 1}`,
                name,
                referenceCode,
                scope: scope || `Operational execution for ${moduleItem.title} workflow.`,
                status: status || 'active',
                updatedAt: new Date().toISOString().substring(0, 10),
                tags: [category],
                notes: notes || `Direct entry added via ${moduleItem.title} console.`,
                studentId: `ENT-${Math.floor(1000 + Math.random() * 9000)}`,
                cohort: '2024-2028'
              };

              setRecords(prev => [newRecord, ...prev]);
              // Update KPI counter
              setKpis(prev => prev.map((kpi, idx) => {
                if (idx === 0) {
                  const currentVal = parseInt(String(kpi.value));
                  return { ...kpi, value: isNaN(currentVal) ? `${records.length + 1}` : `${currentVal + 1}` };
                }
                return kpi;
              }));

              // Add workflow audit log
              const newWf: ModuleWorkflow = {
                id: `WF-${formattedId}-${Math.floor(100 + Math.random() * 900)}`,
                title: `Created record: ${name}`,
                status: 'completed',
                actor: 'Active Presenter / Demo Admin',
                timestamp: 'Just Now'
              };
              setWorkflows(prev => [newWf, ...prev]);

              onClose();
            }}
            className="flex flex-col gap-4"
          >
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Create a new institutional entity in <strong>{moduleItem.id}: {moduleItem.title}</strong></span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Entity / Record Name *</label>
                <input 
                  name="name"
                  type="text" 
                  required
                  placeholder={`e.g. Standard ${moduleItem.title} Registry Item`}
                  defaultValue={`${moduleItem.title} Entry #${records.length + 1}`}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-fg-1 block mb-1">Reference Code</label>
                  <input 
                    name="referenceCode"
                    type="text" 
                    defaultValue={defaultRef}
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs font-mono text-fg-0 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-1 block mb-1">Category / Tag</label>
                  <select 
                    name="category"
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                  >
                    {categories.map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-fg-1 block mb-1">Initial Status</label>
                  <select 
                    name="status"
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending Review</option>
                    <option value="in_review">In Review</option>
                    <option value="completed">Completed / Verified</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-fg-1 block mb-1">Target Campus Node</label>
                  <select 
                    className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                  >
                    <option>Main Campus (North Wing)</option>
                    <option>South Research Complex</option>
                    <option>Virtual / Online Node</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Operational Scope & Objectives</label>
                <textarea 
                  name="scope"
                  rows={2}
                  placeholder="Describe the operational scope, regulatory bounds, or verification checklist..."
                  defaultValue={`Institutional management, monitoring, and compliance tracking for ${moduleItem.title}.`}
                  className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Audit Notes</label>
                <textarea 
                  name="notes"
                  rows={2}
                  placeholder="Additional audit trail remarks or internal reviewer remarks..."
                  defaultValue="Initial entry established during operational demo verification."
                  className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-line">
              <button 
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Commit Record
              </button>
            </div>
          </form>
        );
      },
      {},
      { title: `${moduleItem.id} — Add New Entity Record`, size: 'md' }
    );
  };

  // UPDATE: Edit existing record
  const handleEditRecord = (record: ModuleRecord) => {
    openDialog(
      `edit-record-${record.id}`,
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = (form.elements.namedItem('name') as HTMLInputElement).value;
            const scope = (form.elements.namedItem('scope') as HTMLTextAreaElement).value;
            const status = (form.elements.namedItem('status') as HTMLSelectElement).value;
            const notes = (form.elements.namedItem('notes') as HTMLTextAreaElement).value;

            setRecords(prev => prev.map(r => {
              if (r.id === record.id) {
                return {
                  ...r,
                  name,
                  scope,
                  status,
                  notes,
                  updatedAt: new Date().toISOString().substring(0, 10)
                };
              }
              return r;
            }));

            if (selectedRecord?.id === record.id) {
              setSelectedRecord((prev: ModuleRecord | null) => prev ? { ...prev, name, scope, status, notes } : null);
            }

            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center justify-between">
            <span className="font-semibold">Edit Record: {record.id}</span>
            <span className="font-mono text-[10px] bg-bg-2 px-2 py-0.5 rounded border border-line">{record.referenceCode}</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Entity Name *</label>
              <input 
                name="name"
                type="text" 
                required
                defaultValue={record.name}
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Status</label>
              <select 
                name="status"
                defaultValue={record.status}
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="in_review">In Review</option>
                <option value="completed">Completed</option>
                <option value="verified">Verified</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Scope / Operational Scope</label>
              <textarea 
                name="scope"
                rows={3}
                defaultValue={record.scope}
                className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none focus:border-primary resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Notes</label>
              <textarea 
                name="notes"
                rows={2}
                defaultValue={record.notes}
                className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button 
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm transition-all"
            >
              Save Changes
            </button>
          </div>
        </form>
      ),
      {},
      { title: `Edit ${record.id} — ${record.name}`, size: 'md' }
    );
  };

  // UPDATE: Quick inline status advancement
  const handleAdvanceStatus = (record: ModuleRecord) => {
    const cycle: Record<string, string> = {
      'pending': 'in_review',
      'in_review': 'active',
      'active': 'completed',
      'completed': 'verified',
      'verified': 'active'
    };
    const nextStatus = cycle[record.status.toLowerCase()] || 'active';

    setRecords(prev => prev.map(r => {
      if (r.id === record.id) {
        return {
          ...r,
          status: nextStatus,
          updatedAt: new Date().toISOString().substring(0, 10)
        };
      }
      return r;
    }));

    if (selectedRecord?.id === record.id) {
      setSelectedRecord((prev: ModuleRecord | null) => prev ? { ...prev, status: nextStatus } : null);
    }
  };

  // DELETE: Delete record with confirm
  const handleDeleteRecord = (record: ModuleRecord) => {
    openConfirm({
      title: `Delete Record ${record.id}?`,
      message: `Are you sure you want to permanently remove "${record.name}" (${record.referenceCode}) from ${moduleItem.title}? This action cannot be undone in this session.`,
      variant: 'danger',
      confirmLabel: 'Confirm Delete',
      onConfirm: () => {
        setRecords(prev => prev.filter(r => r.id !== record.id));
        if (selectedRecord?.id === record.id) {
          setSelectedRecord(null);
        }
        // Decrement KPI counter
        setKpis(prev => prev.map((kpi, idx) => {
          if (idx === 0) {
            const val = parseInt(String(kpi.value));
            return { ...kpi, value: isNaN(val) ? `${Math.max(0, records.length - 1)}` : `${Math.max(0, val - 1)}` };
          }
          return kpi;
        }));
      }
    });
  };

  // WORKFLOW: Trigger or complete a workflow
  const handleTriggerWorkflow = () => {
    openConfirm({
      title: `Trigger Verification Workflow for ${moduleItem.title}?`,
      message: `Execute automated integrity scan across all ${records.length} operational entities. A high-priority audit entry will be dispatched.`,
      variant: 'default',
      confirmLabel: 'Run Verification Scan',
      onConfirm: () => {
        const newWf: ModuleWorkflow = {
          id: `WF-${formattedId}-${Math.floor(100 + Math.random() * 900)}`,
          title: `Automated Compliance Scan for ${moduleItem.title}`,
          status: 'completed',
          actor: 'Institutional AI Engine',
          timestamp: 'Just Now'
        };
        setWorkflows(prev => [newWf, ...prev]);
      }
    });
  };

  // Filtered records based on live search & status
  const filteredRecords = records.filter(rec => {
    const matchesSearch = 
      !searchQuery ||
      rec.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.referenceCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.scope.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rec.notes && rec.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = 
      statusFilter === 'all' || 
      rec.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  // Authentic scenarios derived from mock platform data
  const authenticScenarios = [
    ...(initialMockData.options?.categories?.map((cat, i) => ({
      id: `SCN-${i + 1}`,
      title: cat,
      scope: `Verification of operational workflow: ${cat}`,
      type: 'Core Workflow',
      status: i % 2 === 0 ? 'Verified Ready' : 'Demo Ready'
    })) || []),
    ...(initialMockData.records?.slice(0, 3).map((rec, i) => ({
      id: `SCN-REC-${i + 1}`,
      title: rec.scope,
      scope: `Audit scenario based on reference record ${rec.referenceCode}`,
      type: 'Entity Check',
      status: 'Live Mock'
    })) || [])
  ];

  const tabs = [
    { id: 'overview', label: 'Overview & Blueprint' },
    { id: 'checklist', label: 'Checklist & Scenarios', count: authenticScenarios.length || moduleItem.bulletsCount },
    { id: 'mock', label: 'Workable Records & CRUD', count: records.length },
  ];

  return (
    <ModulePageLayout
      moduleId={moduleItem.id}
      moduleTitle={moduleItem.title}
      portalName={portal.name}
      description={initialMockData.description || moduleItem.summary}
      tags={initialMockData.tags.length > 0 ? initialMockData.tags : moduleItem.tags}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actions={
        <>
          <button
            onClick={handleTriggerWorkflow}
            className="px-3.5 py-2 text-xs font-medium bg-bg-2 hover:bg-bg-3 text-fg-1 border border-line rounded-xl transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" /> Run Audit Scan
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-white rounded-xl transition-all shadow-sm flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add New Record
          </button>
        </>
      }
    >
      {/* Live KPIs from Mock Platform */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs text-fg-2 block">{kpi.label}</span>
              <span className="text-xl font-bold text-fg-0 mt-0.5 block">{kpi.value}</span>
            </div>
            {kpi.change && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                <TrendingUp className="w-3 h-3" /> {kpi.change}
              </span>
            )}
          </div>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Blueprint Box */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-fg-0">Module Architecture & Scope</h2>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-bg-2 border border-line text-fg-1">
                  {portal.badge}
                </span>
              </div>
              <p className="text-sm text-fg-2 leading-relaxed mb-6">
                This module is part of <strong>{portal.name}</strong>. In-memory CRUD operations are active with {records.length} operational records loaded from <code>@mock-platform</code>.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-bg-2/50 border border-line flex items-start gap-3">
                  <Cpu className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-fg-0 uppercase tracking-wider">Capabilities & Heuristics</h4>
                    <p className="text-xs text-fg-2 mt-1">
                      {initialMockData.tags.length > 0 
                        ? initialMockData.tags.join(', ') 
                        : 'Rule-based heuristics, dynamic in-memory CRUD & audit trails'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-bg-2/50 border border-line flex items-start gap-3">
                  <Database className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-fg-0 uppercase tracking-wider">Mock Platform Dataset</h4>
                    <p className="text-xs text-fg-2 mt-1 font-mono text-[11px]">
                      mock-platform/data/{moduleItem.id.toLowerCase()}_*.json
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Workflows Timeline */}
            <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-fg-0">Simulated Workflow Audit Log</h3>
                <button 
                  onClick={handleTriggerWorkflow}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Trigger Workflow
                </button>
              </div>
              <div className="space-y-3">
                {workflows.map((wf) => (
                  <div key={wf.id} className="p-3.5 rounded-xl bg-bg-2/50 border border-line flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${
                        wf.status === 'completed' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                      }`}>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-fg-0">{wf.title}</h4>
                        <span className="text-[11px] text-fg-2 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {wf.timestamp} · Actor: {wf.actor}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono capitalize px-2 py-0.5 rounded bg-bg-3 text-fg-1 border border-line">
                      {wf.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Stats & Info */}
          <div className="space-y-6">
            <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-fg-0 uppercase tracking-wider">Module Telemetry</h3>
              <div className="flex items-center justify-between p-3 rounded-xl bg-bg-2 border border-line">
                <span className="text-xs text-fg-2">Active Entities</span>
                <span className="text-sm font-bold text-fg-0">{records.length} Records</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-bg-2 border border-line">
                <span className="text-xs text-fg-2">Data Engine</span>
                <span className="text-xs font-semibold text-primary">@mock-platform</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-bg-2 border border-line">
                <span className="text-xs text-fg-2">Portal Cluster</span>
                <span className="text-xs font-semibold text-fg-1">{portal.badge}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-bg-2 border border-line">
                <span className="text-xs text-fg-2">CRUD Fidelity</span>
                <span className="text-xs font-semibold text-success flex items-center gap-1">
                  <Check className="w-3 h-3" /> 100% Workable
                </span>
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-primary/10 via-bg-1 to-secondary/10 border border-line rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Interactive Actions</span>
              </div>
              <p className="text-xs text-fg-2 leading-relaxed mb-4">
                You can create records, update fields, advance statuses, or delete records in real time.
              </p>
              <button
                onClick={() => setActiveTab('mock')}
                className="w-full py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
              >
                <FolderCheck className="w-3.5 h-3.5" /> Manage Live Records ({records.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'checklist' && (
        <div className="p-6 bg-bg-1 border border-line rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-fg-0">Authentic Scenarios & Blueprint Checkpoints</h3>
              <p className="text-xs text-fg-2 mt-0.5">
                Validated against <code>Doc/master_ui_checklist.md</code> and <code>@mock-platform</code>:
              </p>
            </div>
            <button
              onClick={handleTriggerWorkflow}
              className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-all flex items-center gap-1.5"
            >
              <FileCheck className="w-3.5 h-3.5" /> Verify All Scenarios
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {authenticScenarios.map((scn, i) => (
              <div key={i} className="p-4 rounded-xl bg-bg-2/50 border border-line flex flex-col justify-between hover:border-primary/40 transition-colors group">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-fg-0 group-hover:text-primary transition-colors">
                        {scn.title}
                      </h4>
                      <p className="text-[11px] text-fg-2 mt-0.5 leading-relaxed">
                        {scn.scope}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-fg-2 bg-bg-3 px-2 py-0.5 rounded shrink-0">
                    {scn.type}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-line/60">
                  <span className="text-[10px] font-semibold text-success flex items-center gap-1">
                    <Check className="w-3 h-3" /> {scn.status}
                  </span>
                  <button
                    onClick={() => {
                      const newWf: ModuleWorkflow = {
                        id: `WF-${formattedId}-${Math.floor(100 + Math.random() * 900)}`,
                        title: `Simulated Scenario: ${scn.title}`,
                        status: 'completed',
                        actor: 'Scenario Tester',
                        timestamp: 'Just Now'
                      };
                      setWorkflows(prev => [newWf, ...prev]);
                      alert(`Scenario "${scn.title}" simulated successfully! Workflow audit entry logged.`);
                    }}
                    className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                  >
                    Simulate Scenario <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'mock' && (
        <div className="space-y-4">
          {/* Controls Bar: Search, Status Filter & Create Button */}
          <div className="bg-bg-1 border border-line rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${records.length} records by name, ID, or scope...`}
                  className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-8 py-2 text-xs text-fg-0 outline-none focus:border-primary transition-colors"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-fg-2 hover:text-fg-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="hidden sm:flex items-center gap-1.5 p-1 bg-bg-2 rounded-xl border border-line text-xs">
                {['all', 'active', 'pending', 'in_review', 'completed'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-all ${
                      statusFilter === st 
                        ? 'bg-bg-0 text-primary shadow-xs font-semibold' 
                        : 'text-fg-2 hover:text-fg-0'
                    }`}
                  >
                    {st === 'in_review' ? 'In Review' : st}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleOpenCreateModal}
              className="w-full md:w-auto px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Add Record
            </button>
          </div>

          {/* Records Data Table */}
          <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-line bg-bg-2/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderCheck className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-fg-0">
                  {moduleItem.title} Entities ({filteredRecords.length} of {records.length})
                </h3>
              </div>
              <span className="text-[11px] text-fg-2">
                Showing live in-memory records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line bg-bg-2/50 text-[11px] font-bold text-fg-2 uppercase tracking-wider">
                    <th className="p-3.5">Record ID</th>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Reference Code</th>
                    <th className="p-3.5">Scope / Description</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Last Updated</th>
                    <th className="p-3.5 text-right">Workable Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {filteredRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-bg-2/50 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-primary whitespace-nowrap">
                        {rec.id}
                      </td>
                      <td className="p-3.5 font-semibold text-fg-0 max-w-xs">
                        <button
                          onClick={() => setSelectedRecord(rec)}
                          className="hover:text-primary hover:underline text-left"
                        >
                          {rec.name}
                        </button>
                      </td>
                      <td className="p-3.5 font-mono text-fg-2 whitespace-nowrap">
                        {rec.referenceCode}
                      </td>
                      <td className="p-3.5 text-fg-2 max-w-sm truncate">
                        {rec.scope}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <button
                          onClick={() => handleAdvanceStatus(rec)}
                          title="Click to advance status"
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 capitalize transition-all flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          {rec.status.replace('_', ' ')}
                        </button>
                      </td>
                      <td className="p-3.5 font-mono text-fg-2 text-[11px] whitespace-nowrap">
                        {rec.updatedAt}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedRecord(rec)}
                            className="p-1.5 text-fg-2 hover:text-primary hover:bg-bg-2 rounded-lg transition-colors"
                            title="View Record Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEditRecord(rec)}
                            className="p-1.5 text-fg-2 hover:text-primary hover:bg-bg-2 rounded-lg transition-colors"
                            title="Edit Record"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(rec)}
                            className="p-1.5 text-fg-2 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-fg-2">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-6 h-6 text-fg-2 opacity-60" />
                          <p className="text-xs">No records matching your search query.</p>
                          <button
                            onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                            className="text-xs text-primary font-semibold hover:underline"
                          >
                            Clear all filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record 360 Detail View Drawer */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-bg-1 border-l border-line h-full flex flex-col shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  {selectedRecord.id}
                </span>
                <h2 className="text-base font-bold text-fg-0">Record 360 Detail</h2>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 text-fg-2 hover:text-fg-0 hover:bg-bg-2 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-6 space-y-5 flex-1">
              <div>
                <span className="text-xs text-fg-2 uppercase tracking-wider font-bold block mb-1">Entity Name</span>
                <h3 className="text-lg font-bold text-fg-0">{selectedRecord.name}</h3>
                <span className="text-xs font-mono text-fg-2 mt-0.5 block">{selectedRecord.referenceCode}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-bg-2 border border-line">
                <div>
                  <span className="text-[11px] text-fg-2 block">Current Status</span>
                  <span className="text-xs font-bold text-primary uppercase mt-0.5 block">
                    {selectedRecord.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-fg-2 block">Last Updated</span>
                  <span className="text-xs font-bold text-fg-0 mt-0.5 block">
                    {selectedRecord.updatedAt}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs text-fg-2 uppercase tracking-wider font-bold block mb-1">Operational Scope</span>
                <div className="p-3.5 rounded-xl bg-bg-2/60 border border-line text-xs text-fg-1 leading-relaxed">
                  {selectedRecord.scope}
                </div>
              </div>

              {selectedRecord.notes && (
                <div>
                  <span className="text-xs text-fg-2 uppercase tracking-wider font-bold block mb-1">Audit Trail & Notes</span>
                  <div className="p-3.5 rounded-xl bg-bg-2/60 border border-line text-xs text-fg-1 leading-relaxed">
                    {selectedRecord.notes}
                  </div>
                </div>
              )}

              {selectedRecord.tags && selectedRecord.tags.length > 0 && (
                <div>
                  <span className="text-xs text-fg-2 uppercase tracking-wider font-bold block mb-1">Tags & Categories</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecord.tags.map((t: string, idx: number) => (
                      <span key={idx} className="text-[11px] font-medium bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                <span className="text-xs font-bold text-primary block mb-1">Relational Entity Binding</span>
                <p className="text-xs text-fg-2">
                  Linked Entity ID: <strong>{selectedRecord.studentId || 'INST-NODE-01'}</strong> · Cohort: <strong>{selectedRecord.cohort || '2024-2028'}</strong>
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-line flex items-center justify-between gap-3">
              <button
                onClick={() => handleDeleteRecord(selectedRecord)}
                className="px-3.5 py-2 text-xs font-semibold text-error bg-error/10 hover:bg-error/20 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAdvanceStatus(selectedRecord)}
                  className="px-3.5 py-2 text-xs font-semibold text-fg-1 bg-bg-2 hover:bg-bg-3 border border-line rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Advance Status
                </button>
                <button
                  onClick={() => handleEditRecord(selectedRecord)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Edit className="w-3.5 h-3.5" /> Edit Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModulePageLayout>
  );
};
