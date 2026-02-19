'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Sparkles, Upload, BarChart3, X } from 'lucide-react';

const BRAND = {
  primary: '#E30613',
  orange: '#E30613',
};

interface OnboardingBannerProps {
  organizationId: string;
  onboardingCompleted: boolean;
}

export default function OnboardingBanner({
  organizationId,
  onboardingCompleted,
}: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(onboardingCompleted);

  if (dismissed) return null;

  async function handleDismiss() {
    setDismissed(true);
    const supabase = createClient();
    await supabase
      .from('organizations')
      .update({ onboarding_completed: true })
      .eq('id', organizationId);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Fermer"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5" style={{ color: BRAND.orange }} />
        <h3 className="text-base font-semibold text-slate-900">
          Bienvenue sur LOXAM !
        </h3>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        Nous avons ajoute 10 equipements de demonstration pour vous montrer comment
        la plateforme fonctionne. Voici vos prochaines etapes :
      </p>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-red-600">!</span>
          </div>
          <span>Explorez le tableau de bord — vous avez une inspection VGP en retard</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Upload className="w-4 h-4 text-slate-400 flex-shrink-0 ml-0.5" />
          <span>Importez vos propres equipements via Excel (.xlsx, .csv)</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <BarChart3 className="w-4 h-4 text-slate-400 flex-shrink-0 ml-0.5" />
          <span>Generez des QR codes pour votre parc materiel</span>
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Consultez votre boite mail pour un fichier Excel de demonstration que vous pouvez importer immediatement.
      </p>

      <div className="flex items-center gap-3">
        <Link
          href="/assets"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: BRAND.orange }}
        >
          <Upload className="w-4 h-4" />
          Importer un fichier Excel
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Explorer le tableau de bord
        </Link>
        <button
          onClick={handleDismiss}
          className="text-sm text-slate-500 hover:text-slate-700 ml-auto"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
