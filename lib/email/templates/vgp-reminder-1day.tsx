// =============================================================================
// VGP Reminder - 1 Day Before Due Date (CRITICAL)
// "CRITICAL: Inspection due TOMORROW"
// Includes DIRECCTE fine warning
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

import { EmailHeader } from '@/components/email-header';
import { EmailFooter } from '@/components/email-footer';
import { ScheduleTable } from '@/components/schedule-table';
import type { VGPAlertEmailProps } from '@/types/vgp-alerts';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  danger: '#ef4444',
};

export function VGPReminder1Day({
  organizationName,
  schedules,
  appUrl,
}: VGPAlertEmailProps) {
  const count = schedules.length;

  return (
    <Html>
      <Head />
      <Preview>
        CRITIQUE : {count} inspection{count > 1 ? 's' : ''} VGP due{count > 1 ? 's' : ''}{' '}
        DEMAIN - {organizationName}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            {/* Critical Badge */}
            <Section style={criticalBadgeStyle}>
              <Text style={criticalBadgeTextStyle}>CRITIQUE</Text>
            </Section>

            {/* Greeting */}
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            {/* Summary */}
            <Text style={summaryStyle}>
              <strong>
                {count} inspection{count > 1 ? 's' : ''} VGP
              </strong>{' '}
              pour <strong>{organizationName}</strong>{' '}
              {count > 1 ? 'arrivent' : 'arrive'} a echeance{' '}
              <strong>demain</strong>.
            </Text>

            {/* Critical Banner */}
            <Section style={criticalBannerStyle}>
              <Text style={criticalBannerTitleStyle}>
                Dernier delai pour agir
              </Text>
              <Text style={criticalBannerTextStyle}>
                Si une inspection n'a pas encore ete planifiee, vous risquez de
                depasser la date d'echeance reglementaire. Contactez votre
                organisme de controle immediatement.
              </Text>
            </Section>

            {/* Equipment Table */}
            <Text style={sectionTitleStyle}>
              Equipements concernes
            </Text>
            <ScheduleTable
              schedules={schedules}
              alertType="reminder_1day"
            />

            {/* DIRECCTE Fine Warning */}
            <Section style={fineWarningStyle}>
              <Text style={fineWarningTitleStyle}>
                Risque d'amende DIRECCTE
              </Text>
              <Text style={fineWarningTextStyle}>
                Rappel : Les amendes DIRECCTE pour non-conformite VGP vont de
                3 000 EUR a 10 000 EUR par infraction. A compter de demain,
                chaque equipement non inspecte sera en infraction.
              </Text>
            </Section>

            {/* CTA Button */}
            <Section style={ctaContainerStyle}>
              <Button
                href={`${appUrl}/vgp/schedules?status=upcoming`}
                style={ctaButtonStyle}
              >
                Voir les inspections critiques
              </Button>
            </Section>

            {/* English Summary */}
            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                CRITICAL: {count} VGP inspection{count > 1 ? 's' : ''} for{' '}
                {organizationName} {count > 1 ? 'are' : 'is'} due TOMORROW.
                Contact your inspection body immediately if not yet scheduled.
                DIRECCTE fines for VGP non-compliance range from EUR 3,000 to
                EUR 10,000 per violation.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default VGPReminder1Day;

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

const criticalBadgeStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const criticalBadgeTextStyle: React.CSSProperties = {
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

const criticalBannerStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.danger}`,
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const criticalBannerTitleStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const criticalBannerTextStyle: React.CSSProperties = {
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

const fineWarningStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.danger}`,
  padding: '12px 16px',
  margin: '24px 0 0 0',
  borderRadius: '0 4px 4px 0',
};

const fineWarningTitleStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const fineWarningTextStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
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
  padding: '12px 28px',
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