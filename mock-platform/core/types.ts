// Core shared types for the Mock Platform

export type PortalType = 'core' | 'lifecycle' | 'academics' | 'governance' | 'finance' | 'operations';

export interface ModuleKPI {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface ModuleWorkflow {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'pending' | 'flagged';
  actor?: string;
  timestamp: string;
}

export interface ModuleRecord {
  id: string;
  name: string;
  referenceCode: string;
  scope: string;
  status: string;
  updatedAt: string;
  tags?: string[];
  notes?: string;
  studentId?: string;
  cohort?: string;
  [key: string]: any;
}

export interface BaseModuleData {
  moduleId: string;
  moduleName: string;
  portal: PortalType;
  description: string;
  tags: string[];
  kpis: ModuleKPI[];
  records: ModuleRecord[];
  workflows: ModuleWorkflow[];
  options?: Record<string, string[]>;
}

export interface StudentRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  program: string;
  cohort: string;
  semester: string;
  gpa: number;
  attendanceRate: number;
  feeStatus: 'paid' | 'partial' | 'overdue';
  outstandingAmount: number;
  admissionsStage: 'inquiry' | 'contacted' | 'interview' | 'enrolled';
  advisor: string;
  guardianName: string;
  guardianPhone: string;
  status: 'active' | 'leave' | 'graduated';
}

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  avatar: string;
  joiningDate: string;
  status: 'active' | 'on_leave';
  salaryBand: string;
  coursesCount: number;
}

export interface CourseRecord {
  id: string;
  code: string;
  title: string;
  category: string;
  instructorId: string;
  instructorName: string;
  enrolledStudents: number;
  rating: number;
  modulesCount: number;
  status: 'published' | 'draft';
}

export interface FeeInvoiceRecord {
  id: string;
  studentId: string;
  studentName: string;
  feeType: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'paid' | 'partial' | 'overdue';
}
