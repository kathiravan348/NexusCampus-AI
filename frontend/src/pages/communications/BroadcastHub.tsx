import { useState } from 'react';
import { ModulePageLayout } from '../../core/templates';
import { DataTableLayout } from '../../core/templates';
import { useDialog } from '../../core/dialog';
import { 
  Send, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  Bell, 
  CheckCircle2, 
  Sparkles
} from 'lucide-react';

interface BroadcastRecord {
  id: string;
  title: string;
  audience: string;
  channels: string[];
  sentAt: string;
  recipientsCount: number;
  deliveryRate: string;
  status: 'delivered' | 'scheduled';
}

const initialBroadcasts: BroadcastRecord[] = [
  {
    id: 'BC-2026-091',
    title: 'Mid-Term Exam Schedule Published',
    audience: 'All Students & Guardians',
    channels: ['email', 'whatsapp', 'push'],
    sentAt: '2026-09-12 09:30 AM',
    recipientsCount: 1450,
    deliveryRate: '99.2%',
    status: 'delivered'
  },
  {
    id: 'BC-2026-090',
    title: 'Faculty Senate Meeting & Curriculum Review',
    audience: 'All Teaching Faculty',
    channels: ['email', 'push'],
    sentAt: '2026-09-10 02:15 PM',
    recipientsCount: 86,
    deliveryRate: '100%',
    status: 'delivered'
  },
  {
    id: 'BC-2026-089',
    title: 'Campus Weather Advisory: Heavy Rain Warning',
    audience: 'All Campus Community',
    channels: ['sms', 'whatsapp', 'push'],
    sentAt: '2026-09-08 07:00 AM',
    recipientsCount: 2200,
    deliveryRate: '98.7%',
    status: 'delivered'
  },
  {
    id: 'BC-2026-088',
    title: 'Annual Alumni Homecoming Registration Open',
    audience: 'Graduated Alumni (2018-2025)',
    channels: ['email'],
    sentAt: '2026-09-05 11:00 AM',
    recipientsCount: 3400,
    deliveryRate: '97.4%',
    status: 'delivered'
  }
];

export function BroadcastHub() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>(initialBroadcasts);
  const [searchQuery, setSearchQuery] = useState('');
  const { openDialog, openConfirm } = useDialog();

  const handleComposeBroadcast = () => {
    openDialog(
      'M19_COMPOSE_BROADCAST',
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>AI Copilot is available to refine message tone and translate into multi-lingual formats.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Circular / Announcement Title *</label>
              <input
                type="text"
                placeholder="e.g. Revised Campus Transport Schedule"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-sm text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Target Audience Cohort *</label>
              <select className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none">
                <option>All Students & Guardians</option>
                <option>All Teaching & Administrative Staff</option>
                <option>Grade 11 & 12 Senior Students</option>
                <option>Fee Defaulters & Arrears Accounts</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Dispatch Channels</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-bg-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-primary" />
                  <span>Email</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-bg-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-primary" />
                  <span>WhatsApp</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-bg-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-primary" />
                  <span>App Push</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-line bg-bg-2 cursor-pointer">
                  <input type="checkbox" className="rounded text-primary" />
                  <span>SMS</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Message Body</label>
              <textarea
                rows={4}
                placeholder="Draft message content with merge tags e.g. Dear {GuardianName}, please be informed..."
                className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none resize-none"
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
                const newRecord: BroadcastRecord = {
                  id: `BC-2026-${Math.floor(100 + Math.random() * 900)}`,
                  title: 'Campus Notice: Revised Schedule',
                  audience: 'All Students & Guardians',
                  channels: ['email', 'whatsapp', 'push'],
                  sentAt: 'Just Now',
                  recipientsCount: 1450,
                  deliveryRate: '100%',
                  status: 'delivered'
                };
                setBroadcasts(prev => [newRecord, ...prev]);
                alert('Broadcast queued and dispatched across channels!');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Dispatch Broadcast
            </button>
          </div>
        </div>
      ),
      {},
      { title: 'M19: Compose Omnichannel Broadcast Circular', size: 'lg' }
    );
  };

  const handleResend = (record: BroadcastRecord) => {
    openConfirm({
      title: `Resend "${record.title}"?`,
      message: `Re-dispatching this notification to ${record.recipientsCount} recipients across ${record.channels.join(', ')}.`,
      variant: 'default',
      confirmLabel: 'Confirm Re-Dispatch',
      onConfirm: () => {
        alert('Re-dispatch scheduled successfully!');
      }
    });
  };

  const filtered = broadcasts.filter(b => 
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.audience.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ModulePageLayout
      moduleId="M19"
      moduleTitle="Omnichannel Communication Hub"
      portalName="Campus Life & Operations"
      description="Centralized broadcast engine delivering instant multi-channel notices via Email, SMS, WhatsApp, and Mobile Push."
      tags={['Multi-lingual Drafting', 'WhatsApp API', 'Sentiment Analysis']}
      actions={
        <button
          onClick={handleComposeBroadcast}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all shadow-md flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> Compose Announcement
        </button>
      }
    >
      {/* Channel Delivery KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-fg-2 block">Email Open Rate</span>
            <span className="text-xl font-bold text-fg-0">78.4%</span>
          </div>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-success/10 text-success">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-fg-2 block">WhatsApp Read Rate</span>
            <span className="text-xl font-bold text-success">96.1%</span>
          </div>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-warning/10 text-warning">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-fg-2 block">SMS Delivery Rate</span>
            <span className="text-xl font-bold text-fg-0">99.2%</span>
          </div>
        </div>

        <div className="p-4 bg-bg-1 border border-line rounded-2xl shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-secondary/10 text-secondary">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-fg-2 block">In-App Push Clicks</span>
            <span className="text-xl font-bold text-secondary">82.3%</span>
          </div>
        </div>
      </div>

      {/* Outbox Data Table */}
      <DataTableLayout
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search broadcasts by subject or audience..."
        totalRecords={filtered.length}
        currentPage={1}
        pageSize={10}
      >
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-bg-2/40 text-[11px] font-bold text-fg-2 uppercase tracking-wider">
              <th className="p-4">Circular Subject</th>
              <th className="p-4">Audience</th>
              <th className="p-4">Channels</th>
              <th className="p-4 text-center">Recipients</th>
              <th className="p-4 text-center">Delivery Rate</th>
              <th className="p-4">Sent Time</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-xs">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-bg-2/40 transition-colors">
                <td className="p-4">
                  <div>
                    <span className="font-semibold text-fg-0 block">{item.title}</span>
                    <span className="font-mono text-[10px] text-fg-2">{item.id}</span>
                  </div>
                </td>

                <td className="p-4 font-medium text-fg-1">
                  {item.audience}
                </td>

                <td className="p-4">
                  <div className="flex items-center gap-1.5">
                    {item.channels.includes('email') && <span title="Email"><Mail className="w-3.5 h-3.5 text-primary" /></span>}
                    {item.channels.includes('whatsapp') && <span title="WhatsApp"><MessageSquare className="w-3.5 h-3.5 text-success" /></span>}
                    {item.channels.includes('push') && <span title="Push"><Bell className="w-3.5 h-3.5 text-secondary" /></span>}
                    {item.channels.includes('sms') && <span title="SMS"><Smartphone className="w-3.5 h-3.5 text-warning" /></span>}
                  </div>
                </td>

                <td className="p-4 text-center font-mono font-bold text-fg-0">
                  {item.recipientsCount.toLocaleString()}
                </td>

                <td className="p-4 text-center">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                    <CheckCircle2 className="w-3 h-3" /> {item.deliveryRate}
                  </span>
                </td>

                <td className="p-4 text-fg-2 font-mono text-[11px]">
                  {item.sentAt}
                </td>

                <td className="p-4 text-right">
                  <button
                    onClick={() => handleResend(item)}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    Resend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableLayout>
    </ModulePageLayout>
  );
}
