import { useState } from 'react';
import { Building2, MapPin, Globe, CheckCircle2, Building, Sparkles, Database, ShieldCheck, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Shell } from '../../components/layout/Shell';
import { apiClient, setActiveTenant } from '../../api/client';

export function CampusSetup() {
  const [name, setName] = useState('Greenwood International School');
  const [slug, setSlug] = useState('greenwood');
  const [email, setEmail] = useState('principal@greenwood.edu');
  const [campus, setCampus] = useState('North Lake Campus');
  const [country, setCountry] = useState('United States');

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [provisionSuccess, setProvisionSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const steps = [
    { title: 'Connecting to Master PostgreSQL Registry', desc: 'Validating tenant slug uniqueness in nexus_master' },
    { title: 'Instantaneous Native Database Cloning', desc: 'Executing CREATE DATABASE ... WITH TEMPLATE nexus_default_demo' },
    { title: 'Tenant-Isolated Schema & Branding Activation', desc: 'Customizing 64-module permissions & institution settings' },
    { title: 'Production Ready for Live Demo', desc: 'Workspace routed to isolated tenant database' }
  ];

  const handleNameChange = (val: string) => {
    setName(val);
    const suggestedSlug = val.toLowerCase().replace(/[^a-z0-9]/g, '');
    setSlug(suggestedSlug);
  };

  const handleApplyPreset = (presetName: string, presetSlug: string, presetEmail: string, presetCampus: string) => {
    setName(presetName);
    setSlug(presetSlug);
    setEmail(presetEmail);
    setCampus(presetCampus);
  };

  const handleProvisionTenant = async () => {
    if (!name.trim() || !slug.trim() || !email.trim()) {
      setErrorMsg('Please fill in Institution Name, Slug, and Admin Email.');
      return;
    }

    setErrorMsg('');
    setIsProvisioning(true);
    setProvisionStep(0);
    setStatusMessage('Initiating multi-tenant database provisioning...');

    try {
      // Step 0 -> Step 1 animation
      await new Promise(r => setTimeout(r, 600));
      setProvisionStep(1);
      setStatusMessage('Requesting native PostgreSQL template engine...');

      // Call API
      const res = await apiClient.onboardTenant({
        name,
        slug,
        admin_email: email,
        campus_name: campus
      });

      // Step 2
      await new Promise(r => setTimeout(r, 600));
      setProvisionStep(2);
      setStatusMessage(`Cloned database '${res.db_name}' generated from template in <1s!`);

      // Step 3
      await new Promise(r => setTimeout(r, 700));
      setProvisionStep(3);
      setStatusMessage('Registering active tenant context in local workspace...');

      // Save to localStorage
      setActiveTenant({
        slug: res.slug,
        name: res.name,
        db_name: res.db_name,
        isTemplate: false
      });

      await new Promise(r => setTimeout(r, 500));
      setProvisionSuccess(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to provision tenant database. Check backend logs.');
      setIsProvisioning(false);
    }
  };

  return (
    <Shell>
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-3">
              <Database className="w-3.5 h-3.5" /> Docker PostgreSQL Multi-Tenant Engine
            </div>
            <h1 className="text-3xl font-extrabold text-fg-0 tracking-tight">Customer Campus Onboarding</h1>
            <p className="text-fg-2 mt-1">Instantaneously clone the master demo database for a client demo session.</p>
          </div>

          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-3.5 py-2 rounded-xl text-xs font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Master template <strong>nexus_default_demo</strong> remains 100% pristine</span>
          </div>
        </div>

        {/* Demo Quick Presets */}
        <div className="bg-bg-2 border border-line rounded-xl p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-fg-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Demo Presets:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleApplyPreset('Greenwood International School', 'greenwood', 'principal@greenwood.edu', 'Emerald Valley Campus')}
              className="px-2.5 py-1 bg-bg-1 hover:bg-bg-3 border border-line rounded-lg text-fg-1 hover:text-fg-0 transition-colors"
            >
              Greenwood K-12
            </button>
            <button
              onClick={() => handleApplyPreset('Oxford Bay University', 'oxfordbay', 'admin@oxfordbay.ac.uk', 'Historic Quad Campus')}
              className="px-2.5 py-1 bg-bg-1 hover:bg-bg-3 border border-line rounded-lg text-fg-1 hover:text-fg-0 transition-colors"
            >
              Oxford Bay University
            </button>
            <button
              onClick={() => handleApplyPreset('Apex Global Tech Academy', 'apextech', 'director@apextech.io', 'Innovation Hub')}
              className="px-2.5 py-1 bg-bg-1 hover:bg-bg-3 border border-line rounded-lg text-fg-1 hover:text-fg-0 transition-colors"
            >
              Apex Tech Academy
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
            {errorMsg}
          </div>
        )}

        {/* Provisioning Modal / Stepper */}
        {isProvisioning && (
          <div className="mb-8 bg-bg-1 border border-primary/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary animate-pulse" />
            
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-fg-0 flex items-center gap-2">
                <Database className="w-5 h-5 text-primary animate-spin" /> Provisioning Isolated Campus Database
              </h3>
              <span className="text-xs text-primary font-mono font-semibold bg-primary/10 px-2.5 py-0.5 rounded-full">
                Step {Math.min(provisionStep + 1, 4)} of 4
              </span>
            </div>

            <div className="space-y-4 my-4">
              {steps.map((st, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                    idx < provisionStep || provisionSuccess
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : idx === provisionStep
                      ? 'bg-primary text-white animate-pulse'
                      : 'bg-bg-3 text-fg-2'
                  }`}>
                    {idx < provisionStep || provisionSuccess ? '✓' : idx + 1}
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold ${idx <= provisionStep ? 'text-fg-0' : 'text-fg-2'}`}>
                      {st.title}
                    </h4>
                    <p className="text-xs text-fg-2">{st.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-bg-2 rounded-xl text-xs text-fg-1 font-mono border border-line-soft flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
              <span>{statusMessage}</span>
            </div>

            {provisionSuccess && (
              <div className="mt-5 flex items-center justify-between pt-4 border-t border-line">
                <div className="text-xs text-emerald-500 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Ready! Active tenant switched to: <strong>nexus_tenant_{slug}</strong>
                </div>
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="px-5 py-2 text-xs font-bold bg-primary hover:bg-primary/90 text-white rounded-lg shadow-md transition-all flex items-center gap-2"
                >
                  Enter Campus Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8">
          <div className="space-y-6">
            {/* General Information */}
            <div className="bg-bg-1 border border-line rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-fg-0 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> General Information
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-fg-1">Institution Name *</label>
                    <input
                      type="text"
                      className="w-full bg-bg-2 border border-line-soft rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-fg-0"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-fg-1">Tenant ID (Subdomain) *</label>
                    <div className="flex">
                      <input
                        type="text"
                        className="w-full bg-bg-2 border border-r-0 border-line-soft rounded-l-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-fg-0 font-mono"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      />
                      <div className="bg-bg-3 border border-line-soft rounded-r-lg px-3 py-2 text-xs text-fg-2 flex items-center">
                        .nexuscampus.ai
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-fg-1">Admin Email *</label>
                    <input
                      type="email"
                      className="w-full bg-bg-2 border border-line-soft rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-fg-0"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-fg-1">Primary Campus Name</label>
                    <input
                      type="text"
                      className="w-full bg-bg-2 border border-line-soft rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-fg-0"
                      value={campus}
                      onChange={(e) => setCampus(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Location & Contact */}
            <div className="bg-bg-1 border border-line rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-fg-0 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-secondary" /> Location & Regional Settings
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-fg-1">Country</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-fg-2" />
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full bg-bg-2 border border-line-soft rounded-lg pl-10 pr-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none text-fg-0"
                    >
                      <option>United States</option>
                      <option>United Kingdom</option>
                      <option>Canada</option>
                      <option>India</option>
                      <option>Australia</option>
                      <option>Singapore</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-fg-1">Currency & Academic Cycle</label>
                  <input
                    type="text"
                    disabled
                    value="USD ($) • 2026-2027 Academic Year"
                    className="w-full bg-bg-3 border border-line-soft rounded-lg px-4 py-2 text-sm text-fg-2 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-fg-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-primary" /> Clones into: <code className="font-mono text-fg-1">nexus_tenant_{slug || 'custom'}</code>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.location.href = '/dashboard'}
                  className="px-5 py-2 text-sm font-medium text-fg-1 hover:text-fg-0 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProvisioning}
                  onClick={handleProvisionTenant}
                  className="px-6 py-2 text-sm font-semibold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg shadow-sm transition-all flex items-center gap-2"
                >
                  {isProvisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {isProvisioning ? 'Cloning Database...' : 'Clone Database & Launch'}
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar / Info */}
          <div className="space-y-6">
            <div className="bg-bg-1 border border-line rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-fg-0 mb-4">Architecture Highlights</h3>
              
              <div className="space-y-3 text-xs text-fg-2">
                <div className="p-3 bg-bg-2 rounded-lg border border-line-soft">
                  <p className="font-semibold text-fg-0 mb-1">⚡ Instant Template Cloning</p>
                  <p>Uses PostgreSQL native templating to clone all 64-module relational tables and demo datasets in &lt;1 second.</p>
                </div>

                <div className="p-3 bg-bg-2 rounded-lg border border-line-soft">
                  <p className="font-semibold text-fg-0 mb-1">🛡️ Immutable Master Demo</p>
                  <p>Customer demo data is strictly written to its own tenant database. The master template DB is never touched.</p>
                </div>

                <div className="p-3 bg-bg-2 rounded-lg border border-line-soft">
                  <p className="font-semibold text-fg-0 mb-1">🤖 AI Microservice Integration</p>
                  <p>Pre-configured with predictive applicant scoring, RAG semantic search, and retention warning models.</p>
                </div>
              </div>
            </div>

            <div className="bg-bg-1 border border-line rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-fg-0 mb-3">Institution Logo</h3>
              <div className="border-2 border-dashed border-line-soft rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-bg-2 transition-colors cursor-pointer">
                <div className="w-12 h-12 bg-bg-3 rounded-full flex items-center justify-center mb-2">
                  <Building className="w-6 h-6 text-fg-2" />
                </div>
                <p className="text-xs font-medium text-fg-0">Click or drag logo</p>
                <p className="text-[10px] text-fg-2 mt-0.5">SVG, PNG, JPG (max 2MB)</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Shell>
  );
}
