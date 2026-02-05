// =============================================================================
// VGP Overdue Alert
// "OVERDUE: X inspections past due date - risk of fines"
// Strongest urgency level. Includes DIRECCTE fine warning.
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
import type { VGPAlertEmailProps } from '@/types/vgp-alerts';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  danger: '#ef4444',
};

export function VGPOverdue({
  organizationName,
  schedules,
  appUrl,
}: VGPAlertEmailProps) {
  const count = schedules.length;

  return (
    <Html>
      <Head />
      <Preview>
        EN RETARD : {count} inspection{count > 1 ? 's' : ''} VGP depassee
        {count > 1 ? 's' : ''} - Risque d'amende - {organizationName}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            {/* Overdue Badge */}
            <Section style={overdueBadgeStyle}>
              <Text style={overdueBadgeTextStyle}>EN RETARD</Text>
            </Section>

            {/* Greeting */}
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            {/* Summary */}
            <Text style={summaryStyle}>
              <strong>{organizationName}</strong> a{' '}
              <strong>
                {count} inspection{count > 1 ? 's' : ''} VGP en retard
              </strong>
              . Ces equipements ne sont plus en conformite reglementaire.
            </Text>

            {/* Overdue Banner */}
            <Section style={overdueBannerStyle}>
              <Text style={overdueBannerTitleStyle}>
                Non-conformite active
              </Text>
              <Text style={overdueBannerTextStyle}>
                Les equipements listes ci-dessous ont depasse leur date
                d'echeance VGP. Ils ne doivent pas etre mis en service tant que
                l'inspection n'a pas ete realisee. Planifiez les inspections
                immediatement pour revenir en conformite.
              </Text>
            </Section>

            {/* DIRECCTE Fine Warning - Prominent at top for overdue */}
            <Section style={fineWarningStyle}>
              <Text style={fineWarningTitleStyle}>
                Amendes DIRECCTE applicables
              </Text>
              <Text style={fineWarningTextStyle}>
                Rappel : Les amendes DIRECCTE pour non-conformite VGP vont de
                3 000 EUR a 10 000 EUR par infraction. Avec {count} equipement
                {count > 1 ? 's' : ''} en retard, l'amende potentielle totale
                est de {(3000 * count).toLocaleString('fr-FR')} EUR a{' '}
                {(10000 * count).toLocaleString('fr-FR')} EUR.
              </Text>
            </Section>

            {/* Equipment Table */}
            <Text style={sectionTitleStyle}>
              Equipements en retard
            </Text>
            <ScheduleTable schedules={schedules} alertType="overdue" />

            {/* CTA Button */}
            <Section style={ctaContainerStyle}>
              <Button
                href={`${appUrl}/vgp/schedules?status=overdue`}
                style={ctaButtonStyle}
              >
                Voir les inspections en retard
              </Button>
            </Section>

            {/* English Summary */}
            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                OVERDUE: {organizationName} has {count} VGP inspection
                {count > 1 ? 's' : ''} past their due date. These assets are
                non-compliant and should not be put into service until
                inspected. DIRECCTE fines range from EUR 3,000 to EUR 10,000
                per violation. Total potential fine: EUR{' '}
                {(3000 * count).toLocaleString()} to EUR{' '}
                {(10000 * count).toLocaleString()}.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default VGPOverdue;

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

const overdueBadgeStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const overdueBadgeTextStyle: React.CSSProperties = {
  backgroundColor: BRAND.danger,
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
  margin: '0 0 16px 0',
  borderRadius: '0 4px 4px 0',
};

const overdueBannerTitleStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const overdueBannerTextStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
};

const fineWarningStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  border: `2px solid ${BRAND.danger}`,
  padding: '16px',
  margin: '0 0 24px 0',
  borderRadius: '6px',
};

const fineWarningTitleStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '14px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
};

const fineWarningTextStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
};

const sectionTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 12px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '28px 0 24px 0',
};

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: BRAND.danger,
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