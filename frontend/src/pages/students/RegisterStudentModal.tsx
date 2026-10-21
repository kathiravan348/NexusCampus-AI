import React, { useState } from 'react';
import { User, Mail, Phone, BookOpen, Calendar, ShieldCheck, Sparkles } from 'lucide-react';

interface RegisterStudentModalProps {
  onClose: () => void;
  onRegister?: (student: any) => void;
}

export const RegisterStudentModal: React.FC<RegisterStudentModalProps> = ({ onClose, onRegister }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    program: 'B.Sc. Computer Science & AI',
    cohort: '2024-2028',
    guardianName: '',
    guardianPhone: '',
    dateOfBirth: '2006-05-15',
    bloodGroup: 'O+'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    if (onRegister) {
      onRegister({
        id: `STU-${Math.floor(1006 + Math.random() * 900)}`,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || '+1 (555) 000-0000',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name)}&background=random&color=fff&size=150`,
        program: formData.program,
        cohort: formData.cohort,
        semester: 'Semester 1',
        gpa: 4.0,
        attendanceRate: 100,
        feeStatus: 'paid',
        outstandingAmount: 0,
        admissionsStage: 'enrolled',
        advisor: 'Dr. Alan Turing',
        guardianName: formData.guardianName || 'Guardian',
        guardianPhone: formData.guardianPhone || '+1 (555) 000-1111',
        status: 'active'
      });
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>Enrolling will automatically provision portal credentials and RFID ID card QR.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Full Legal Name *</label>
          <div className="relative">
            <User className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Lucas Vance"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Institutional Email *</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. l.vance@nexuscampus.edu"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Primary Contact Phone</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 789-0123"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Program of Study</label>
          <div className="relative">
            <BookOpen className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <select
              value={formData.program}
              onChange={(e) => setFormData({ ...formData, program: e.target.value })}
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option>B.Sc. Computer Science & AI</option>
              <option>B.BA. Digital Business</option>
              <option>B.Eng. Robotics & Autonomous Systems</option>
              <option>B.Sc. Cognitive Psychology</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Guardian / Parent Name</label>
          <input
            type="text"
            value={formData.guardianName}
            onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
            placeholder="e.g. Thomas Vance"
            className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Guardian Emergency Phone</label>
          <input
            type="tel"
            value={formData.guardianPhone}
            onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
            placeholder="+1 (555) 789-9999"
            className="w-full bg-bg-2 border border-line rounded-xl px-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Date of Birth</label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Blood Group</label>
          <div className="relative">
            <ShieldCheck className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <select
              value={formData.bloodGroup}
              onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option>O+</option>
              <option>O-</option>
              <option>A+</option>
              <option>A-</option>
              <option>B+</option>
              <option>AB+</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium text-fg-1 bg-bg-2 hover:bg-bg-3 border border-line rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-md transition-all"
        >
          Complete Enrolment
        </button>
      </div>
    </form>
  );
};
