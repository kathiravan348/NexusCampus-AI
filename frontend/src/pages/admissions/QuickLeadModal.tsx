import React, { useState } from 'react';
import { Sparkles, User, Mail, Phone, BookOpen, School } from 'lucide-react';

interface QuickLeadModalProps {
  onClose: () => void;
  onSave?: (lead: any) => void;
}

export const QuickLeadModal: React.FC<QuickLeadModalProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    course: 'Computer Science & AI',
    previousSchool: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    if (onSave) {
      onSave({
        id: Date.now(),
        name: formData.name,
        email: formData.email,
        phone: formData.phone || '+1 (555) 000-0000',
        course: formData.course,
        date: 'Today'
      });
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>AI Lead Scoring will automatically evaluate applicant quality on submission.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Candidate Full Name *</label>
          <div className="relative">
            <User className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Sophia Martinez"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Candidate Email Address *</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. sophia.m@example.com"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Phone Number</label>
          <div className="relative">
            <Phone className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-fg-1 block mb-1.5">Interested Academic Program</label>
          <div className="relative">
            <BookOpen className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
            <select
              value={formData.course}
              onChange={(e) => setFormData({ ...formData, course: e.target.value })}
              className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option>Computer Science & AI</option>
              <option>Business Administration</option>
              <option>Robotics & Autonomous Systems</option>
              <option>Cognitive Psychology</option>
              <option>Data Science & Analytics</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-fg-1 block mb-1.5">Previous School / College</label>
        <div className="relative">
          <School className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
          <input
            type="text"
            value={formData.previousSchool}
            onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
            placeholder="e.g. Westside International High"
            className="w-full bg-bg-2 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-fg-1 block mb-1.5">Counsellor Remarks & Follow-up Notes</label>
        <textarea
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Enter preliminary notes from initial inquiry or walk-in consultation..."
          className="w-full bg-bg-2 border border-line rounded-xl p-3 text-sm text-fg-0 outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
        />
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
          Save & Score Lead
        </button>
      </div>
    </form>
  );
};
