// =============================================================================
// Accept Invitation Page - Public page for invitation acceptance flow
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CheckCircle, XCircle, Clock, Loader2, UserPlus, LogIn, LogOut, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const BRAND = {
  primary: '#1e3a5f',
  secondary: '#2d5a7b',
  orange: '#f26f00',
  success: '#047857',
  danger: '#b91c1c',
};

type AcceptState = 'loading' | 'success' | 'error' | 'expired' | 'requires_auth' | 'wrong_account';

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<AcceptState>('loading');
  const [message, setMessage] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    if (token) {
      acceptInvitation();
    }
  }, [token]);

  async function acceptInvitation() {
    try {
      const response = await fetch('/api/team/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.requiresAuth) {
        setState('requires_auth');
        setInvitedEmail(data.email || '');
        setOrgName(data.organizationName || '');
        setRole(data.role || 'member');
        return;
      }

      if (data.success) {
        setState('success');
        setMessage(data.message);
        setTimeout(() => {
          router.push(data.redirectTo || '/dashboard');
        }, 2000);
        return;
      }

      if (response.status === 410) {
        setState('expired');
        setMessage(data.error);
        return;
      }

      // Handle email mismatch (wrong account logged in)
      if (response.status === 403 && data.error === 'email_mismatch') {
        setState('wrong_account');
        setInvitedEmail(data.invitedEmail || '');
        setCurrentEmail(data.currentEmail || '');
        setOrgName(data.organizationName || '');
        return;
      }

      setState('error');
      setMessage(data.error || 'An error occurred while accepting the invitation.');
    } catch {
      setState('error');
      setMessage('An unexpected error occurred. Please try again.');
    }
  }

  function getRoleLabel(r: string): string {
    const labels: Record<string, string> = {
      admin: 'Administrateur',
      member: 'Membre',
      viewer: 'Lecteur',
    };
    return labels[r] || r;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: BRAND.primary }}>
            TraviXO
          </h1>
          <p className="text-xs font-semibold tracking-widest" style={{ color: BRAND.orange }}>
            SYSTEMS
          </p>
        </div>

        {/* Loading State */}
        {state === 'loading' && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: BRAND.primary }} />
            <p className="text-gray-600 text-lg">Traitement de votre invitation...</p>
            <p className="text-gray-400 text-sm mt-2">Processing your invitation...</p>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: BRAND.success }} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Bienvenue !
            </h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-gray-400 text-sm mt-4">
              Redirection vers le tableau de bord...
            </p>
          </div>
        )}

        {/* Requires Auth State — New user needs to create account or log in */}
        {state === 'requires_auth' && (
          <div className="text-center py-4">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#fff7ed' }}
            >
              <Mail className="w-8 h-8" style={{ color: BRAND.orange }} />
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              Vous etes invite !
            </h2>
            <p className="text-gray-500 text-sm mb-5">You've been invited to join</p>

            {/* Org + role badge */}
            <div
              className="rounded-lg p-4 mb-6"
              style={{ backgroundColor: '#f0f4f8', borderLeft: `4px solid ${BRAND.primary}` }}
            >
              <p className="font-bold text-lg" style={{ color: BRAND.primary }}>
                {orgName}
              </p>
              <span
                className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: BRAND.secondary }}
              >
                {getRoleLabel(role)}
              </span>
            </div>

            {/* Email instruction */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Important :</span> Vous devez utiliser l'adresse
              </p>
              <p className="font-bold text-amber-900 mt-1">{invitedEmail}</p>
            </div>

            {/* Two clear paths */}
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/signup?redirect=/accept-invite/${token}&email=${encodeURIComponent(invitedEmail)}`)}
                className="w-full px-6 py-3 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-90"
                style={{ backgroundColor: BRAND.orange }}
              >
                <UserPlus className="w-5 h-5" />
                Creer mon compte
              </button>
              <button
                onClick={() => router.push(`/login?redirect=/accept-invite/${token}`)}
                className="w-full px-6 py-3 border-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-gray-50"
                style={{ borderColor: BRAND.primary, color: BRAND.primary }}
              >
                <LogIn className="w-5 h-5" />
                J'ai deja un compte
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-5">
              L'invitation expire dans 7 jours / Invitation expires in 7 days
            </p>
          </div>
        )}

        {/* Wrong Account — Logged in as someone else */}
        {state === 'wrong_account' && (
          <div className="text-center py-4">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#fef2f2' }}
            >
              <LogOut className="w-8 h-8" style={{ color: BRAND.danger }} />
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Mauvais compte
            </h2>
            <p className="text-gray-500 text-sm mb-5">You're logged in with a different account</p>

            <div className="text-left space-y-3 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs text-red-600 font-semibold mb-1">Connecte en tant que / Logged in as</p>
                <p className="text-sm font-bold text-red-800">{currentEmail}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-600 font-semibold mb-1">Invitation envoyee a / Invitation sent to</p>
                <p className="text-sm font-bold text-green-800">{invitedEmail}</p>
              </div>
            </div>

            {orgName && (
              <p className="text-sm text-gray-600 mb-4">
                Organisation : <span className="font-semibold">{orgName}</span>
              </p>
            )}

            <div className="space-y-3">
              <button
                onClick={async () => {
                  const supabase = createClient();
                  await supabase.auth.signOut();
                  router.push(`/login?redirect=/accept-invite/${token}`);
                }}
                className="w-full px-6 py-3 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors hover:opacity-90"
                style={{ backgroundColor: BRAND.orange }}
              >
                <LogOut className="w-5 h-5" />
                Se deconnecter et continuer
              </button>
              <p className="text-xs text-gray-400">
                Vous serez deconnecte de {currentEmail} et redirige vers la page de connexion
              </p>
            </div>
          </div>
        )}

        {/* Expired State */}
        {state === 'expired' && (
          <div className="text-center py-8">
            <Clock className="w-16 h-16 mx-auto mb-4 text-amber-500" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Invitation expiree
            </h2>
            <p className="text-gray-600 mb-6">
              {message || "Cette invitation a expire. Veuillez contacter l'administrateur de votre organisation pour en recevoir une nouvelle."}
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND.primary }}
            >
              Aller a la connexion
            </button>
          </div>
        )}

        {/* Generic Error State */}
        {state === 'error' && (
          <div className="text-center py-8">
            <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: BRAND.danger }} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Une erreur est survenue
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND.primary }}
            >
              Aller a la connexion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
