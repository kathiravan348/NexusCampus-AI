const API_BASE_URL = 'http://localhost:8000';

export interface ActiveTenant {
  slug: string;
  name: string;
  db_name: string;
  isTemplate: boolean;
}

export function getActiveTenant(): ActiveTenant {
  try {
    const raw = localStorage.getItem('nexus_active_tenant');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to parse active tenant from localStorage', e);
  }
  return {
    slug: 'default',
    name: 'NexusCampus AI Master Demo',
    db_name: 'nexus_default_demo',
    isTemplate: true
  };
}

export function setActiveTenant(tenant: ActiveTenant) {
  localStorage.setItem('nexus_active_tenant', JSON.stringify(tenant));
  localStorage.setItem('nexus_tenant_id', tenant.slug);
  window.dispatchEvent(new CustomEvent('nexus-tenant-changed', { detail: tenant }));
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const tenant = getActiveTenant();
  const token = localStorage.getItem('nexus_auth_token');
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (!headers.has('X-Tenant-Id')) {
    headers.set('X-Tenant-Id', tenant.slug);
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error [${res.status}]: ${errText}`);
  }

  return res.json();
}

export const apiClient = {
  // Authentication & Session
  async login(email: string, password: string) {
    const tenant = getActiveTenant();
    return request<any>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenant_id: tenant.slug })
    });
  },

  async getMe() {
    return request<any>('/api/v1/auth/me');
  },

  async getDemoAccounts() {
    return request<any[]>('/api/v1/auth/demo-accounts');
  },

  async logout() {
    return request<any>('/api/v1/auth/logout', {
      method: 'POST'
    });
  },

  // Tenant Provisioning
  async onboardTenant(data: { name: string; slug: string; admin_email: string; campus_name?: string }) {
    return request<any>('/api/v1/tenants/onboard', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async listTenants() {
    return request<any[]>('/api/v1/tenants');
  },

  async resetTenant(slug: string) {
    return request<any>(`/api/v1/tenants/${slug}/reset`, {
      method: 'POST'
    });
  },

  // Institution & Core
  async getInstitution() {
    return request<any>('/api/v1/core/institution');
  },

  async getStudents() {
    return request<any[]>('/api/v1/core/students');
  },

  async createStudent(payload: any) {
    return request<any>('/api/v1/core/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deleteStudent(studentId: string) {
    return request<any>(`/api/v1/core/students/${studentId}`, {
      method: 'DELETE'
    });
  },

  async getStaff() {
    return request<any[]>('/api/v1/core/staff');
  },

  async createStaff(payload: any) {
    return request<any>('/api/v1/core/staff', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deleteStaff(staffId: string) {
    return request<any>(`/api/v1/core/staff/${staffId}`, {
      method: 'DELETE'
    });
  },

  async getInvoices() {
    return request<any[]>('/api/v1/core/invoices');
  },

  async createInvoice(payload: any) {
    return request<any>('/api/v1/core/invoices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateInvoiceStatus(invoiceId: string, status: string) {
    return request<any>(`/api/v1/core/invoices/${invoiceId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  // 64 Modules Dynamic Records
  async getModuleRecords(moduleCode: string) {
    return request<any[]>(`/api/v1/core/modules/${moduleCode}/records`);
  },

  async createModuleRecord(moduleCode: string, payload: any) {
    return request<any>(`/api/v1/core/modules/${moduleCode}/records`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deleteModuleRecord(moduleCode: string, recordId: string) {
    return request<any>(`/api/v1/core/modules/${moduleCode}/records/${recordId}`, {
      method: 'DELETE'
    });
  },

  async updateModuleRecordStatus(moduleCode: string, recordId: string, status: string) {
    return request<any>(`/api/v1/core/modules/${moduleCode}/records/${recordId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  // AI Microservice
  async calculateLeadScore(payload: { lead_id: string; gpa: number; test_score: number; prior_interactions: number; program_interest: string }) {
    return request<any>('/api/v1/ai/lead-score', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async ragSearch(query: string) {
    return request<any>('/api/v1/ai/rag-search', {
      method: 'POST',
      body: JSON.stringify({ query, context_scope: 'all_campus' })
    });
  },

  async getAttritionRisk() {
    return request<any>('/api/v1/ai/attrition-risk');
  },

  // M17 Library Management
  async getLibraryLoans(studentId?: string, status?: string) {
    const params = new URLSearchParams();
    if (studentId) params.append('student_id', studentId);
    if (status) params.append('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<any[]>(`/api/v1/core/library/loans${qs}`);
  },

  async requestLibraryLoan(payload: { book_id: string; book_title: string; isbn?: string; student_id: string; student_name: string; loan_days?: number; notes?: string }) {
    return request<any>('/api/v1/core/library/loans', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateLibraryLoanStatus(loanId: string, status: string, options: { renewed_count?: number; fine_amount?: number; due_date?: string } = {}) {
    return request<any>(`/api/v1/core/library/loans/${loanId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, ...options })
    });
  },

  // M09 Attendance & Leaves
  async getStudentLeaves(studentId?: string, status?: string) {
    const params = new URLSearchParams();
    if (studentId) params.append('student_id', studentId);
    if (status) params.append('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<any[]>(`/api/v1/core/attendance/leaves${qs}`);
  },

  async applyStudentLeave(payload: { student_id: string; student_name: string; leave_type: string; start_date: string; end_date: string; days_count?: number; reason: string }) {
    return request<any>('/api/v1/core/attendance/leaves', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateLeaveStatus(leaveId: string, status: string, reviewer: string = 'Faculty Dean') {
    return request<any>(`/api/v1/core/attendance/leaves/${leaveId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewed_by: reviewer })
    });
  },

  // M11 Academics & Gradebook
  async getCourseGrades(studentId?: string, courseCode?: string) {
    const params = new URLSearchParams();
    if (studentId) params.append('student_id', studentId);
    if (courseCode) params.append('course_code', courseCode);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<any[]>(`/api/v1/core/academics/grades${qs}`);
  },

  async publishOfficialGrades(moderator: string = 'Prof. Donald Knuth (Chief Examiner)') {
    return request<any>('/api/v1/core/academics/grades/publish', {
      method: 'PUT',
      body: JSON.stringify({ moderated_by: moderator })
    });
  },

  // M56 Placement Hub & Drives
  async getPlacementDrives() {
    return request<any[]>('/api/v1/core/placement/drives');
  },

  async getPlacementApplications(studentId?: string) {
    const qs = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
    return request<any[]>(`/api/v1/core/placement/applications${qs}`);
  },

  async applyPlacementDrive(payload: { drive_id: string; company_name: string; role_title: string; student_id: string; student_name: string; offer_package?: string }) {
    return request<any>('/api/v1/core/placement/applications', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updatePlacementApplicationStage(appId: string, stage: string, offerPackage?: string) {
    return request<any>(`/api/v1/core/placement/applications/${appId}/stage`, {
      method: 'PUT',
      body: JSON.stringify({ stage, offer_package: offerPackage })
    });
  }
};
