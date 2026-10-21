import { useState, useEffect } from 'react';
import { Shell } from '../../components/layout/Shell';
import { 
  Search, 
  Mail, 
  UserPlus, 
  Trash2, 
  Edit, 
  Sparkles, 
  Building2, 
  CheckCircle2, 
  X,
  Send
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { useDialog } from '../../core/dialog';
import { MOCK_STAFF, StaffRecord } from '@mock-platform';
import { apiClient } from '../../api/client';

const initialStaffList: StaffRecord[] = [
  ...MOCK_STAFF,
  {
    id: 'FAC-04',
    name: 'Sarah Jenkins',
    role: 'HR Talent Acquisition Lead',
    department: 'Administration',
    email: 'sarah.j@nexuscampus.edu',
    joiningDate: '2022-03-15',
    status: 'active',
    salaryBand: 'Tier 3 ($95,000)',
    coursesCount: 0,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
  },
  {
    id: 'FAC-05',
    name: 'Kevin Mitnick',
    role: 'Principal Cybersecurity Engineer',
    department: 'IT Support',
    email: 'kevin.m@nexuscampus.edu',
    joiningDate: '2023-01-20',
    status: 'active',
    salaryBand: 'Tier 2 ($125,000)',
    coursesCount: 1,
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150'
  },
  {
    id: 'FAC-06',
    name: 'Prof. Donald Knuth',
    role: 'Professor Emeritus',
    department: 'Applied Mathematics',
    email: 'donald.k@nexuscampus.edu',
    joiningDate: '2019-09-01',
    status: 'on_leave',
    salaryBand: 'Tier 1 ($150,000)',
    coursesCount: 2,
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  }
];

export function StaffDirectory() {
  const [staffList, setStaffList] = useState<StaffRecord[]>(initialStaffList);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const { openDialog, openConfirm } = useDialog();

  useEffect(() => {
    let mounted = true;
    apiClient.getStaff()
      .then(data => {
        if (mounted && Array.isArray(data) && data.length > 0) {
          const mapped: StaffRecord[] = data.map(d => ({
            id: d.id,
            name: d.name,
            role: d.role,
            department: d.department,
            email: d.email,
            avatar: d.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=random&color=fff`,
            joiningDate: d.joining_date || '2026-01-15',
            status: (d.status || 'active') as any,
            salaryBand: d.salary_band || 'Tier 2 ($120,000)',
            coursesCount: d.courses_count || 0
          }));
          setStaffList(mapped);
        }
      })
      .catch(err => {
        console.warn('Using local mock data for staff', err);
      });
    return () => { mounted = false; };
  }, []);

  const departments = ['All', 'Computer Science', 'Software Engineering', 'Applied Mathematics', 'Administration', 'IT Support'];

  // CREATE: Add Staff Modal
  const handleOpenAddStaffModal = () => {
    openDialog(
      'add-staff-modal',
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = (form.elements.namedItem('name') as HTMLInputElement).value;
            const role = (form.elements.namedItem('role') as HTMLInputElement).value;
            const department = (form.elements.namedItem('department') as HTMLSelectElement).value;
            const email = (form.elements.namedItem('email') as HTMLInputElement).value;
            const salaryBand = (form.elements.namedItem('salaryBand') as HTMLSelectElement).value;

            const newStaff: StaffRecord = {
              id: `FAC-${Math.floor(10 + Math.random() * 90)}`,
              name,
              role,
              department,
              email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@nexuscampus.edu`,
              joiningDate: new Date().toISOString().substring(0, 10),
              status: 'active',
              salaryBand,
              coursesCount: 0,
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`
            };

            setStaffList(prev => [newStaff, ...prev]);
            apiClient.createStaff({
              name: newStaff.name,
              role: newStaff.role,
              department: newStaff.department,
              email: newStaff.email,
              salary_band: newStaff.salaryBand
            }).catch(console.error);
            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Onboard a new faculty member or administrative staff to the institution.</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Full Name *</label>
              <input 
                name="name"
                type="text"
                required
                placeholder="e.g. Dr. Grace Hopper"
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Designation / Role *</label>
                <input 
                  name="role"
                  type="text"
                  required
                  placeholder="e.g. Associate Professor"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Department</label>
                <select 
                  name="department"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Software Engineering">Software Engineering</option>
                  <option value="Applied Mathematics">Applied Mathematics</option>
                  <option value="Administration">Administration</option>
                  <option value="IT Support">IT Support</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Work Email</label>
                <input 
                  name="email"
                  type="email"
                  placeholder="name@nexuscampus.edu"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Salary Tier / Compensation</label>
                <select 
                  name="salaryBand"
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Tier 1 ($140,000 - $160,000)">Tier 1 ($140,000 - $160,000)</option>
                  <option value="Tier 2 ($115,000 - $135,000)">Tier 2 ($115,000 - $135,000)</option>
                  <option value="Tier 3 ($85,000 - $110,000)">Tier 3 ($85,000 - $110,000)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> Register Staff
            </button>
          </div>
        </form>
      ),
      {},
      { title: 'M05: Add Staff Personnel', size: 'md' }
    );
  };

  // UPDATE: Edit Staff Modal
  const handleEditStaff = (person: StaffRecord) => {
    openDialog(
      `edit-staff-${person.id}`,
      ({ onClose }) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const role = (form.elements.namedItem('role') as HTMLInputElement).value;
            const department = (form.elements.namedItem('department') as HTMLSelectElement).value;
            const status = (form.elements.namedItem('status') as HTMLSelectElement).value as any;
            const salaryBand = (form.elements.namedItem('salaryBand') as HTMLSelectElement).value;

            setStaffList(prev => prev.map(s => {
              if (s.id === person.id) {
                return { ...s, role, department, status, salaryBand };
              }
              return s;
            }));

            onClose();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center gap-3 pb-3 border-b border-line">
            <img src={person.avatar} alt={person.name} className="w-10 h-10 rounded-full object-cover border border-line" />
            <div>
              <h4 className="text-sm font-bold text-fg-0">{person.name}</h4>
              <span className="text-xs text-fg-2 font-mono">{person.id} · {person.email}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Designation / Role</label>
              <input 
                name="role"
                type="text"
                defaultValue={person.role}
                required
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Department</label>
                <select 
                  name="department"
                  defaultValue={person.department}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Software Engineering">Software Engineering</option>
                  <option value="Applied Mathematics">Applied Mathematics</option>
                  <option value="Administration">Administration</option>
                  <option value="IT Support">IT Support</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-1 block mb-1">Status</label>
                <select 
                  name="status"
                  defaultValue={person.status}
                  className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-fg-1 block mb-1">Salary Band</label>
              <select 
                name="salaryBand"
                defaultValue={person.salaryBand}
                className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none focus:border-primary"
              >
                <option value="Tier 1 ($140,000 - $160,000)">Tier 1 ($140,000 - $160,000)</option>
                <option value="Tier 2 ($115,000 - $135,000)">Tier 2 ($115,000 - $135,000)</option>
                <option value="Tier 3 ($85,000 - $110,000)">Tier 3 ($85,000 - $110,000)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 rounded-xl border border-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm"
            >
              Save Changes
            </button>
          </div>
        </form>
      ),
      {},
      { title: `Edit Personnel — ${person.name}`, size: 'md' }
    );
  };

  // DELETE: Archive Staff confirmation
  const handleArchiveStaff = (person: StaffRecord) => {
    openConfirm({
      title: `Archive Personnel: ${person.name}?`,
      message: `Are you sure you want to transition ${person.name} (${person.id}) to Inactive status? Active payroll runs and department authorizations will be paused.`,
      variant: 'danger',
      confirmLabel: 'Confirm Archive',
      onConfirm: () => {
        setStaffList(prev => prev.filter(s => s.id !== person.id));
        apiClient.deleteStaff(person.id).catch(console.error);
      }
    });
  };

  // CONTACT: Message modal
  const handleMessageStaff = (person: StaffRecord) => {
    openDialog(
      `msg-staff-${person.id}`,
      ({ onClose }) => (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary">
            Send confidential internal memo or notice to <strong>{person.name}</strong> ({person.email}).
          </div>
          <div>
            <label className="text-xs font-semibold text-fg-1 block mb-1">Subject</label>
            <input 
              type="text" 
              defaultValue={`Notice re: ${person.department} Departmental Review`}
              className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-0 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-fg-1 block mb-1">Message Content</label>
            <textarea 
              rows={4}
              placeholder="Write message..."
              defaultValue="Dear Professor, please submit your course evaluation feedback by Friday."
              className="w-full bg-bg-2 border border-line rounded-xl p-3 text-xs text-fg-0 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-line">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 rounded-xl border border-line">Cancel</button>
            <button 
              onClick={() => {
                alert(`Direct memo dispatched to ${person.email}!`);
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Send Dispatch
            </button>
          </div>
        </div>
      ),
      {},
      { title: `Message ${person.name}`, size: 'md' }
    );
  };

  const filteredStaff = staffList.filter(person => {
    const matchesSearch = 
      !searchQuery ||
      person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDept === 'All' || person.department === selectedDept;
    const matchesStatus = selectedStatus === 'all' || person.status === selectedStatus;

    return matchesSearch && matchesDept && matchesStatus;
  });

  return (
    <Shell>
      <div className="flex flex-col h-full gap-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary">
                M05
              </span>
              <h1 className="text-2xl font-bold text-fg-0">Staff & Faculty Directory</h1>
            </div>
            <p className="text-sm text-fg-2">
              Manage academic faculty, research personnel, department assignments, and compensation tiers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff..." 
                className="pl-9 text-xs" 
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

            <Button onClick={handleOpenAddStaffModal} className="gap-2 text-xs">
              <UserPlus className="w-4 h-4" /> Add Staff
            </Button>
          </div>
        </div>

        {/* Department & Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedDept === dept
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-bg-1 border border-line text-fg-2 hover:text-fg-0 hover:bg-bg-2'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-bg-1 rounded-xl border border-line text-xs">
            {['all', 'active', 'on_leave'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                  selectedStatus === st
                    ? 'bg-bg-2 text-primary shadow-xs font-semibold'
                    : 'text-fg-2 hover:text-fg-0'
                }`}
              >
                {st === 'on_leave' ? 'On Leave' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Staff Table */}
        <Card className="flex-1 min-h-0 flex flex-col rounded-2xl border-line shadow-sm overflow-hidden">
          <div className="flex-1 overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee & Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Department</TableHead>
                  <TableHead className="hidden md:table-cell">Work Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Salary Band</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Workable Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((person) => (
                  <TableRow key={person.id} className="hover:bg-bg-2/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img 
                          src={person.avatar} 
                          alt={person.name} 
                          className="w-10 h-10 rounded-full object-cover border border-line shrink-0" 
                        />
                        <div>
                          <p className="font-semibold text-fg-0 text-sm">{person.name}</p>
                          <p className="text-xs text-fg-2">{person.role}</p>
                          <span className="text-[10px] font-mono text-primary">{person.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-fg-1">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                        {person.department}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-fg-1">
                          <Mail className="w-3.5 h-3.5 text-fg-2" />
                          {person.email}
                        </div>
                        <div className="flex items-center gap-1.5 text-fg-2 font-mono text-[11px]">
                          Joined {person.joiningDate}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs font-mono font-medium text-fg-1 bg-bg-2 px-2 py-0.5 rounded border border-line">
                        {person.salaryBand || 'Tier 2 ($120,000)'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={person.status === 'active' ? 'success' : 'warning'}>
                        {person.status === 'active' ? 'Active' : 'On Leave'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          onClick={() => handleMessageStaff(person)} 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-fg-2 hover:text-primary"
                          title="Message Staff"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          onClick={() => handleEditStaff(person)} 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-fg-2 hover:text-primary"
                          title="Edit Staff"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          onClick={() => handleArchiveStaff(person)} 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-fg-2 hover:text-error"
                          title="Archive Staff"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredStaff.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-fg-2">
                      No personnel found matching the specified filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="p-4 border-t border-line flex items-center justify-between text-xs text-fg-2 bg-bg-0/30">
            <span>Showing {filteredStaff.length} of {staffList.length} staff entries</span>
            <span className="font-mono text-[11px] text-success flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active Institutional Roster
            </span>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
