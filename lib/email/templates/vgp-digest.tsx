// =============================================================================
// VGP Digest - one email covering several urgency bands
//
// Serves both the daily digest (sent by the 07:00 cron to users on
// 'daily_digest') and the weekly digest (sent Mondays to users on
// 'weekly_digest'). The two differ only in period wording and subject, so they
// share a template rather than drifting apart.
//
// Sections are ordered most urgent first: someone skimming on a phone sees
// overdue equipment before 30-day planning items.
// =============================================================================

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
} from '@react-email/components';

import { EmailHeader } from './components/email-header';
import { EmailFooter } from './components/email-footer';
import { ScheduleTable } from './components/schedule-table';
import type { ScheduleTableRow, VGPAlertType } from '@/types/vgp-alerts';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  mediumGray: '#6b7280',
  danger: '#ef4444',
};

export interface DigestSection {
  alertType: string;
  urgencyLevel: string;
  schedules: ScheduleTableRow[];
}

export interface VGPDigestProps {
  organizationName: string;
  sections: DigestSection[];
  totalCount: number;
  appUrl: string;
  period: 'daily' | 'weekly';
}

/** Most urgent first. Anything unrecognised sorts last rather than crashing. */
const URGENCY_ORDER: Record<string, number> = {
  overdue: 0,
  critical: 1,
  urgent: 2,
  attention: 3,
  planning: 4,
};

const SECTION_TITLES: Record<string, string> = {
  overdue: 'En retard',
  critical: 'Échéance imminente',
  urgent: 'Urgent',
  attention: 'À prévoir',
  planning: 'À planifier',
};

const SECTION_BLURBS: Record<string, string> = {
  overdue:
    "Ces équipements ont dépassé leur date d'échéance VGP et ne doivent pas être mis en service.",
  critical: "Ces inspections arrivent à échéance dans moins d'une semaine.",
  urgent: 'Ces inspections sont à réaliser sous deux semaines.',
  attention: 'Ces inspections arrivent à échéance ce mois-ci.',
  planning: 'Ces inspections sont à planifier dans les prochaines semaines.',
};

export function VGPDigest({
  organizationName,
  sections,
  totalCount,
  appUrl,
  period,
}: VGPDigestProps) {
  const ordered = [...sections].sort(
    (a, b) => (URGENCY_ORDER[a.urgencyLevel] ?? 99) - (URGENCY_ORDER[b.urgencyLevel] ?? 99)
  );

  const periodLabel = period === 'daily' ? 'quotidien' : 'hebdomadaire';
  const periodPhrase =
    period === 'daily'
      ? "Voici le récapitulatif de vos échéances VGP pour aujourd'hui."
      : 'Voici le récapitulatif de vos échéances VGP pour la semaine.';

  const hasOverdue = ordered.some((s) => s.urgencyLevel === 'overdue');

  return (
    <Html>
      <Head />
      <Preview>
        {`Résumé VGP ${periodLabel} - ${totalCount} inspection${totalCount > 1 ? 's' : ''} - ${organizationName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            <Section style={badgeStyle}>
              <Text style={badgeTextStyle}>RÉSUMÉ {periodLabel.toUpperCase()}</Text>
            </Section>

            <Text style={greetingStyle}>Bonjour,</Text>

            <Text style={summaryStyle}>
              <strong>{organizationName}</strong> a{' '}
              <strong>
                {totalCount} inspection{totalCount > 1 ? 's' : ''} VGP
              </strong>{' '}
              à traiter. {periodPhrase}
            </Text>

            {hasOverdue && (
              <Section style={overdueBannerStyle}>
                <Text style={overdueBannerTextStyle}>
                  Certains équipements sont en retard de VGP. Le défaut de VGP est
                  pénalement sanctionné (art. L4741-1 du Code du travail).
                </Text>
              </Section>
            )}

            {ordered.map((section) => (
              <Section key={`${section.urgencyLevel}-${section.alertType}`} style={sectionStyle}>
                <Text
                  style={
                    section.urgencyLevel === 'overdue'
                      ? sectionTitleDangerStyle
                      : sectionTitleStyle
                  }
                >
                  {SECTION_TITLES[section.urgencyLevel] ?? section.urgencyLevel} (
                  {section.schedules.length})
                </Text>
                <Text style={sectionBlurbStyle}>
                  {SECTION_BLURBS[section.urgencyLevel] ?? ''}
                </Text>
                <ScheduleTable
                  schedules={section.schedules}
                  alertType={section.alertType as VGPAlertType}
                />
              </Section>
            ))}

            <Section style={ctaContainerStyle}>
              <Button href={`${appUrl}/vgp/schedules`} style={ctaButtonStyle}>
                Voir toutes les inspections
              </Button>
            </Section>

            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                {period === 'daily' ? 'Daily' : 'Weekly'} VGP summary for{' '}
                {organizationName}: {totalCount} inspection
                {totalCount > 1 ? 's' : ''} require attention, grouped by urgency
                above. Missing VGP inspections carries criminal penalties (art.
                L4741-1, French Labor Code).
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default VGPDigest;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  padding: '0',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '680px',
  margin: '0 auto',
  padding: '24px 16px',
};

const contentStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '24px 32px',
};

const badgeStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const badgeTextStyle: React.CSSProperties = {
  backgroundColor: BRAND.navy,
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  padding: '4px 12px',
  borderRadius: '4px',
  margin: '0',
  display: 'inline-block',
  letterSpacing: '1px',
};

const greetingStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '15px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 16px 0',
};

const summaryStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '16px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
};

const overdueBannerStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.danger}`,
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const overdueBannerTextStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
};

const sectionStyle: React.CSSProperties = {
  margin: '0 0 28px 0',
};

const sectionTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const sectionTitleDangerStyle: React.CSSProperties = {
  ...sectionTitleStyle,
  color: '#991b1b',
};

const sectionBlurbStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 10px 0',
  lineHeight: '1.5',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '8px 0 24px 0',
};

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: BRAND.orange,
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  padding: '14px 32px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
};

const enSectionStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  padding: '16px',
  borderRadius: '6px',
  margin: '0',
};

const enTitleStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
};

const enTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '12px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
};
