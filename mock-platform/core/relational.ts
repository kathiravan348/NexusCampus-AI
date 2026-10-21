// Central relational mock entities for NexusCampus AI

import { StudentRecord, StaffRecord, CourseRecord, FeeInvoiceRecord } from './types';

export const MOCK_STUDENTS: StudentRecord[] = [
  {
    id: 'STU-1001',
    name: 'Emma Watson',
    email: 'emma.w@nexuscampus.edu',
    phone: '+1 (555) 234-5678',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    program: 'B.Sc. Computer Science & AI',
    cohort: '2024-2028',
    semester: 'Semester 3',
    gpa: 3.92,
    attendanceRate: 96.5,
    feeStatus: 'paid',
    outstandingAmount: 0,
    admissionsStage: 'enrolled',
    advisor: 'Dr. Alan Turing',
    guardianName: 'Chris Watson',
    guardianPhone: '+1 (555) 234-9999',
    status: 'active'
  },
  {
    id: 'STU-1002',
    name: 'Liam Smith',
    email: 'liam.s@nexuscampus.edu',
    phone: '+1 (555) 345-6789',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    program: 'B.BA. Digital Business',
    cohort: '2024-2028',
    semester: 'Semester 3',
    gpa: 3.45,
    attendanceRate: 88.0,
    feeStatus: 'partial',
    outstandingAmount: 1250,
    admissionsStage: 'enrolled',
    advisor: 'Prof. Margaret Hamilton',
    guardianName: 'Sarah Smith',
    guardianPhone: '+1 (555) 345-8888',
    status: 'active'
  },
  {
    id: 'STU-1003',
    name: 'Noah Johnson',
    email: 'noah.j@nexuscampus.edu',
    phone: '+1 (555) 456-7890',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    program: 'B.Eng. Robotics & Autonomous Systems',
    cohort: '2023-2027',
    semester: 'Semester 5',
    gpa: 3.78,
    attendanceRate: 94.2,
    feeStatus: 'paid',
    outstandingAmount: 0,
    admissionsStage: 'enrolled',
    advisor: 'Dr. Alan Turing',
    guardianName: 'Michael Johnson',
    guardianPhone: '+1 (555) 456-1111',
    status: 'active'
  },
  {
    id: 'STU-1004',
    name: 'Olivia Williams',
    email: 'olivia.w@nexuscampus.edu',
    phone: '+1 (555) 567-8901',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    program: 'B.Sc. Cognitive Psychology',
    cohort: '2024-2028',
    semester: 'Semester 3',
    gpa: 3.85,
    attendanceRate: 92.1,
    feeStatus: 'overdue',
    outstandingAmount: 3400,
    admissionsStage: 'enrolled',
    advisor: 'Dr. Katherine Johnson',
    guardianName: 'David Williams',
    guardianPhone: '+1 (555) 567-2222',
    status: 'active'
  },
  {
    id: 'STU-1005',
    name: 'William Brown',
    email: 'william.b@nexuscampus.edu',
    phone: '+1 (555) 678-9012',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    program: 'B.Sc. Computer Science & AI',
    cohort: '2024-2028',
    semester: 'Semester 3',
    gpa: 3.60,
    attendanceRate: 85.4,
    feeStatus: 'paid',
    outstandingAmount: 0,
    admissionsStage: 'enrolled',
    advisor: 'Prof. Margaret Hamilton',
    guardianName: 'Robert Brown',
    guardianPhone: '+1 (555) 678-3333',
    status: 'active'
  }
];

export const MOCK_STAFF: StaffRecord[] = [
  {
    id: 'FAC-01',
    name: 'Dr. Alan Turing',
    email: 'a.turing@nexuscampus.edu',
    role: 'Professor & Dean of Computing',
    department: 'Computer Science',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    joiningDate: '2021-08-15',
    status: 'active',
    salaryBand: 'Tier 1 ($145,000)',
    coursesCount: 3
  },
  {
    id: 'FAC-02',
    name: 'Prof. Margaret Hamilton',
    email: 'm.hamilton@nexuscampus.edu',
    role: 'Associate Professor',
    department: 'Software Engineering',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    joiningDate: '2022-01-10',
    status: 'active',
    salaryBand: 'Tier 2 ($120,000)',
    coursesCount: 2
  },
  {
    id: 'FAC-03',
    name: 'Dr. Katherine Johnson',
    email: 'k.johnson@nexuscampus.edu',
    role: 'Head of Mathematics',
    department: 'Applied Mathematics',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    joiningDate: '2020-07-01',
    status: 'active',
    salaryBand: 'Tier 1 ($140,000)',
    coursesCount: 4
  }
];

export const MOCK_COURSES: CourseRecord[] = [
  {
    id: 'CRS-101',
    code: 'CS-301',
    title: 'Advanced Machine Learning & Neural Networks',
    category: 'Computer Science',
    instructorId: 'FAC-01',
    instructorName: 'Dr. Alan Turing',
    enrolledStudents: 142,
    rating: 4.9,
    modulesCount: 8,
    status: 'published'
  },
  {
    id: 'CRS-102',
    code: 'SE-204',
    title: 'Cloud Distributed Systems Architecture',
    category: 'Software Engineering',
    instructorId: 'FAC-02',
    instructorName: 'Prof. Margaret Hamilton',
    enrolledStudents: 98,
    rating: 4.8,
    modulesCount: 6,
    status: 'published'
  },
  {
    id: 'CRS-103',
    code: 'MTH-310',
    title: 'Discrete Mathematics & Cryptography',
    category: 'Mathematics',
    instructorId: 'FAC-03',
    instructorName: 'Dr. Katherine Johnson',
    enrolledStudents: 110,
    rating: 4.7,
    modulesCount: 10,
    status: 'published'
  }
];

export const MOCK_INVOICES: FeeInvoiceRecord[] = [
  {
    id: 'INV-2026-001',
    studentId: 'STU-1001',
    studentName: 'Emma Watson',
    feeType: 'Tuition Fee — Term 1',
    amount: 6500,
    paidAmount: 6500,
    dueDate: '2026-09-30',
    status: 'paid'
  },
  {
    id: 'INV-2026-002',
    studentId: 'STU-1002',
    studentName: 'Liam Smith',
    feeType: 'Tuition Fee — Term 1',
    amount: 6500,
    paidAmount: 5250,
    dueDate: '2026-09-30',
    status: 'partial'
  },
  {
    id: 'INV-2026-003',
    studentId: 'STU-1004',
    studentName: 'Olivia Williams',
    feeType: 'Hostel & Lab Fee',
    amount: 3400,
    paidAmount: 0,
    dueDate: '2026-08-15',
    status: 'overdue'
  }
];
