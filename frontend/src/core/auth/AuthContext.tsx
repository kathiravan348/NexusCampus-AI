import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'student' | 'teacher' | 'hr' | 'placement' | 'examiner' | 'admin' | 'parent';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  avatar?: string;
  permissions: string[];
  tenant_db?: string;
}

export interface DemoPersona {
  role_key: UserRole;
  title: string;
  name: string;
  email: string;
  role: UserRole;
  description: string;
  avatar: string;
  badge_color: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    role_key: 'student',
    title: 'Student',
    name: 'Emma Watson',
    email: 'student@nexuscampus.edu',
    role: 'student',
    description: 'B.Sc. Computer Science & AI (Student View)',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=EmmaWatson',
    badge_color: 'emerald'
  },
  {
    role_key: 'teacher',
    title: 'Teacher / Faculty',
    name: 'Dr. Alan Turing',
    email: 'teacher@nexuscampus.edu',
    role: 'teacher',
    description: 'Head of CS Faculty (Grading & Course Studio)',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlanTuring',
    badge_color: 'blue'
  },
  {
    role_key: 'hr',
    title: 'HR Manager',
    name: 'Sarah Jenkins',
    email: 'hr@nexuscampus.edu',
    role: 'hr',
    description: 'HR Talent Acquisition & Payroll Operations',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SarahJenkins',
    badge_color: 'purple'
  },
  {
    role_key: 'placement',
    title: 'Placement Officer',
    name: 'Marcus Vance',
    email: 'placement@nexuscampus.edu',
    role: 'placement',
    description: 'Corporate Drives & Student Placements Hub',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MarcusVance',
    badge_color: 'amber'
  },
  {
    role_key: 'examiner',
    title: 'Chief Examiner',
    name: 'Prof. Donald Knuth',
    email: 'examiner@nexuscampus.edu',
    role: 'examiner',
    description: 'Controller of Examinations & Grade Approval',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=DonaldKnuth',
    badge_color: 'rose'
  },
  {
    role_key: 'admin',
    title: 'Super Admin',
    name: 'System Administrator',
    email: 'admin@nexuscampus.edu',
    role: 'admin',
    description: 'Unrestricted Access to All 64 Modules & Portals',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSys',
    badge_color: 'indigo'
  },
  {
    role_key: 'parent',
    title: 'Parent / Guardian',
    name: 'Arthur Watson',
    email: 'parent@nexuscampus.edu',
    role: 'parent',
    description: 'Guardian of Emma Watson (Parent Portal)',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ArthurWatson',
    badge_color: 'teal'
  }
];

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  quickLogin: (roleKey: UserRole) => Promise<UserProfile>;
  logout: () => void;
  hasAccess: (portalOrModule: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_PERMISSIONS: Record<UserRole, { allowedPortals: string[]; allowedRoutes: string[] }> = {
  admin: {
    allowedPortals: ['core', 'lifecycle', 'academics', 'governance', 'finance', 'operations'],
    allowedRoutes: ['*']
  },
  student: {
    allowedPortals: ['academics', 'lifecycle', 'operations'],
    allowedRoutes: [
      '/dashboard',
      '/student/profile',
      '/students/wellbeing',
      '/lms',
      '/lms/player',
      '/lms/quiz',
      '/attendance/daily',
      '/operations/timetable',
      '/library/catalog',
      '/career/placement'
    ]
  },
  teacher: {
    allowedPortals: ['academics', 'lifecycle', 'operations'],
    allowedRoutes: [
      '/dashboard',
      '/academics/gradebook',
      '/attendance/daily',
      '/lms',
      '/lms/course-builder',
      '/lms/quiz',
      '/lms/studio',
      '/operations/timetable',
      '/students',
      '/student/profile'
    ]
  },
  hr: {
    allowedPortals: ['governance', 'core'],
    allowedRoutes: [
      '/dashboard',
      '/hr/staff',
      '/payroll/dashboard',
      '/setup',
      '/accreditation/dashboard',
      '/security/visitors'
    ]
  },
  placement: {
    allowedPortals: ['career', 'lifecycle'],
    allowedRoutes: [
      '/dashboard',
      '/career/placement',
      '/students',
      '/student/profile'
    ]
  },
  examiner: {
    allowedPortals: ['academics', 'operations'],
    allowedRoutes: [
      '/dashboard',
      '/academics/gradebook',
      '/accreditation/dashboard',
      '/operations/timetable',
      '/students'
    ]
  },
  parent: {
    allowedPortals: ['lifecycle', 'finance'],
    allowedRoutes: [
      '/dashboard',
      '/portal/parent',
      '/students/wellbeing',
      '/finance'
    ]
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const savedUser = localStorage.getItem('nexus_user');
      if (savedUser) return JSON.parse(savedUser);
    } catch (e) {
      console.error(e);
    }
    // Default fallback to Super Admin for immediate demo experience
    return {
      id: 'USR-ADM-01',
      name: 'System Administrator',
      email: 'admin@nexuscampus.edu',
      role: 'admin',
      department: 'Executive Leadership',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminSys',
      permissions: ['*'],
      tenant_db: 'nexus_default_demo'
    };
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nexus_auth_token'));

  const role: UserRole = user?.role || 'admin';
  const isAuthenticated = !!user;

  const saveAuth = (newUser: UserProfile, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('nexus_user', JSON.stringify(newUser));
    localStorage.setItem('nexus_auth_token', newToken);
    window.dispatchEvent(new CustomEvent('nexus-auth-changed', { detail: { user: newUser, token: newToken } }));
  };

  const login = async (email: string, password: string): Promise<UserProfile> => {
    const tenantId = localStorage.getItem('nexus_tenant_id') || 'default';
    const res = await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId
      },
      body: JSON.stringify({ email, password, tenant_id: tenantId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(err.detail || 'Failed to authenticate');
    }

    const data = await res.json();
    saveAuth(data.user, data.access_token);
    return data.user;
  };

  const quickLogin = async (roleKey: UserRole): Promise<UserProfile> => {
    const persona = DEMO_PERSONAS.find(p => p.role_key === roleKey);
    if (!persona) throw new Error(`Unknown persona ${roleKey}`);
    return login(persona.email, 'demo123');
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('nexus_user');
    localStorage.removeItem('nexus_auth_token');
    window.dispatchEvent(new CustomEvent('nexus-auth-changed', { detail: null }));
    window.location.href = '/login';
  };

  const hasAccess = (portalOrModule: string): boolean => {
    if (!user || user.role === 'admin') return true;
    const rules = ROLE_PERMISSIONS[user.role];
    if (!rules) return true;

    // Check if it's a portal key
    if (rules.allowedPortals.includes(portalOrModule.toLowerCase())) return true;

    // Check if it's a route
    if (rules.allowedRoutes.includes('*')) return true;
    return rules.allowedRoutes.some(r => portalOrModule.startsWith(r) || r.startsWith(portalOrModule));
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      role,
      isAuthenticated,
      login,
      quickLogin,
      logout,
      hasAccess
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
