// =============================================================================
// Accept Invitation Page - Public page for invitation acceptance flow
// =============================================================================

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const BRAND_COLORS = {
  primary: '#1e3a5f',
  orange: '#f26f00',
  success: '#047857',
  danger: '#b91c1c',
};

type AcceptState = 'loading' | 'success' | 'error' | 'expired' | 'requires_auth';

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<AcceptState>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

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
        setEmail(data.email || '');
        return;
      }

      if (data.success) {
        setState('success');
        setMessage(data.message);
        // Redirect to dashboard after 2 seconds
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

      setState('error');
      setMessage(data.error || 'An error occurred while accepting the invitation.');
    } catch {
      setState('error');
      setMessage('An unexpected error occurred. Please try again.');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: BRAND_COLORS.primary }}>
            TraviXO
          </h1>
          <p className="text-xs font-semibold tracking-widest" style={{ color: BRAND_COLORS.orange }}>
            SYSTEMS
          </p>
        </div>

        {/* Loading State */}
        {state === 'loading' && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: BRAND_COLORS.primary }} />
            <p className="text-gray-600 text-lg">Traitement de votre invitation...</p>
            <p className="text-gray-400 text-sm mt-2">Processing your invitation...</p>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: BRAND_COLORS.success }} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Bienvenue !
            </h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-gray-400 text-sm mt-4">
              Redirection vers le tableau de bord...
            </p>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="text-center py-8">
            <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: BRAND_COLORS.danger }} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Invitation invalide
            </h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2.5 text-white rounded-lg font-medium"
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              Aller a la connexion
            </button>
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
              style={{ backgroundColor: BRAND_COLORS.primary }}
            >
              Aller a la connexion
            </button>
          </div>
        )}

        {/* Requires Auth State */}
        {state === 'requires_auth' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#eef2ff' }}>
              <CheckCircle className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Connexion requise
            </h2>
            <p className="text-gray-600 mb-2">
              Pour accepter cette invitation, vous devez vous connecter ou creer un compte avec l'adresse :
            </p>
            <p className="font-medium text-gray-900 mb-6">{email}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push(`/login?redirect=/accept-invite/${token}`)}
                className="w-full px-6 py-2.5 text-white rounded-lg font-medium"
                style={{ backgroundColor: BRAND_COLORS.primary }}
              >
                Se connecter
              </button>
              <button
                onClick={() => router.push(`/signup?redirect=/accept-invite/${token}&email=${encodeURIComponent(email)}`)}
                className="w-full px-6 py-2.5 border-2 rounded-lg font-medium"
                style={{ borderColor: BRAND_COLORS.primary, color: BRAND_COLORS.primary }}
              >
                Creer un compte
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
