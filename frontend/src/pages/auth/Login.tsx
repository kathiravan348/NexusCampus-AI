import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Mail, 
  Lock, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  Sparkles, 
  GraduationCap, 
  BookOpen, 
  Users, 
  Briefcase, 
  FileCheck, 
  ShieldAlert, 
  HeartHandshake,
  Database
} from 'lucide-react';
import { useAuth, DEMO_PERSONAS, UserRole } from '../../core/auth/AuthContext';
import { getActiveTenant } from '../../api/client';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activePersonaLoading, setActivePersonaLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  const { login, quickLogin } = useAuth();
  const activeTenant = getActiveTenant();

  const roleIcons: Record<UserRole, React.ComponentType<{ className?: string }>> = {
    student: GraduationCap,
    teacher: BookOpen,
    hr: Users,
    placement: Briefcase,
    examiner: FileCheck,
    admin: ShieldAlert,
    parent: HeartHandshake
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickRoleLogin = async (roleKey: UserRole) => {
    setErrorMessage('');
    setActivePersonaLoading(roleKey);

    try {
      await quickLogin(roleKey);
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to log in as ${roleKey}`);
    } finally {
      setActivePersonaLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-0 text-fg-0 relative overflow-hidden py-12 px-4">
      {/* Background Gradients */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-60 dark:opacity-100 transition-opacity"
        style={{
          background: 'radial-gradient(1100px 600px at 12% -10%, rgba(88, 166, 255, .15), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(210, 168, 255, .12), transparent 55%)'
        }}
      />
      
      <div className="z-10 w-full max-w-2xl p-6 sm:p-8 rounded-2xl bg-bg-1/90 backdrop-blur-xl border border-line shadow-2xl relative overflow-hidden">
        {/* Top border gradient */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary" />

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3 border border-primary/20">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary via-fg-0 to-secondary">
            NexusCampus AI
          </h1>
          <p className="text-fg-2 mt-1 text-xs sm:text-sm">
            Unified Institutional Operating System • Enterprise Multi-Role Authentication
          </p>

          {/* Active Tenant Context Pill */}
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-bg-2 border border-line text-[11px] text-fg-2">
            <Database className="w-3 h-3 text-primary" />
            <span>Active Tenant: <strong className="text-fg-0">{activeTenant.name}</strong></span>
          </div>
        </div>

        {/* 1-Click Instant Persona Switcher Bar */}
        <div className="mb-6 p-4 rounded-xl bg-bg-2 border border-line-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-fg-0 uppercase tracking-wider">
                Instant 1-Click Role Logins (Demo Personas)
              </span>
            </div>
            <span className="text-[10px] text-fg-2 font-mono">Password: demo123</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {DEMO_PERSONAS.map((p) => {
              const Icon = roleIcons[p.role_key] || GraduationCap;
              const isThisLoading = activePersonaLoading === p.role_key;

              return (
                <button
                  key={p.role_key}
                  type="button"
                  disabled={isLoading || !!activePersonaLoading}
                  onClick={() => handleQuickRoleLogin(p.role_key)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    isThisLoading
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-bg-1 hover:bg-bg-3 border-line text-fg-1 hover:text-fg-0'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="p-1 rounded-lg bg-primary/10 text-primary">
                      {isThisLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-bg-3 text-fg-2">
                      {p.role_key}
                    </span>
                  </div>
                  <span className="text-xs font-semibold truncate w-full">{p.title}</span>
                  <span className="text-[10px] text-fg-2 truncate w-full">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/30 text-error text-xs">
            {errorMessage}
          </div>
        )}

        {/* Manual Credentials Form */}
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-line-soft"></div>
            <span className="flex-shrink-0 mx-4 text-fg-2 text-[11px] uppercase tracking-wider">
              Or Sign In with Email Credentials
            </span>
            <div className="flex-grow border-t border-line-soft"></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-1 ml-1">Institutional Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg-2 border border-line-soft rounded-lg pl-10 pr-4 py-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-fg-0"
                  placeholder="e.g. examiner@nexuscampus.edu"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-1 ml-1 flex justify-between">
                <span>Password</span>
                <span className="text-[10px] text-fg-2">Default: demo123</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-2 border border-line-soft rounded-lg pl-10 pr-4 py-2 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-fg-0"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading || !!activePersonaLoading}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg py-2.5 text-xs font-semibold transition-colors flex justify-center items-center gap-2 shadow-sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {isLoading ? 'Verifying Credentials...' : 'Sign In with Institutional Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
