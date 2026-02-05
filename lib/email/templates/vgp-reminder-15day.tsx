// =============================================================================
// VGP Reminder - 15 Days Before Due Date
// "15 days left: time to confirm your inspection bookings"
// Bridges the gap between 30-day planning and 7-day urgency
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
  warning: '#f59e0b',
};

export function VGPReminder15Day({
  organizationName,
  schedules,
  appUrl,
}: VGPAlertEmailProps) {
  const count = schedules.length;

  return (
    <Html>
      <Head />
      <Preview>
        {`${count} inspection${count > 1 ? 's' : ''} VGP dans 15 jours - ${organizationName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            {/* Badge */}
            <Section style={badgeContainerStyle}>
              <Text style={badgeTextStyle}>15 JOURS</Text>
            </Section>

            {/* Greeting */}
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            {/* Summary */}
            <Text style={summaryStyle}>
              Votre organisation <strong>{organizationName}</strong> a{' '}
              <strong>
                {count} inspection{count > 1 ? 's' : ''} VGP
              </strong>{' '}
              dont l'echeance arrive dans <strong>15 jours</strong>.
            </Text>

            {/* Action Banner */}
            <Section style={actionBannerStyle}>
              <Text style={actionBannerTitleStyle}>
                Confirmez vos rendez-vous
              </Text>
              <Text style={actionBannerTextStyle}>
                Si vous avez deja contacte un organisme de controle, assurez-vous
                que les rendez-vous sont confirmes. Sinon, il est temps de
                planifier ces inspections pour eviter tout retard.
              </Text>
            </Section>

            {/* Equipment Table */}
            <Text style={sectionTitleStyle}>
              Equipements concernes
            </Text>
            <ScheduleTable
              schedules={schedules}
              alertType="reminder_15day"
            />

            {/* CTA Button */}
            <Section style={ctaContainerStyle}>
              <Button
                href={`${appUrl}/vgp/schedules?status=upcoming`}
                style={ctaButtonStyle}
              >
                Voir les inspections a confirmer
              </Button>
            </Section>

            {/* English Summary */}
            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                Your organization {organizationName} has {count} VGP
                inspection{count > 1 ? 's' : ''} due in 15 days.
                Confirm your inspection appointments or schedule them now
                to avoid delays and potential fines.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default VGPReminder15Day;

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

const badgeContainerStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const badgeTextStyle: React.CSSProperties = {
  backgroundColor: BRAND.warning,
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

const actionBannerStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  borderLeft: `4px solid ${BRAND.warning}`,
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const actionBannerTitleStyle: React.CSSProperties = {
  color: '#92400e',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const actionBannerTextStyle: React.CSSProperties = {
  color: '#92400e',
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
  backgroundColor: BRAND.orange,
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
