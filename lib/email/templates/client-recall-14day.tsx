// =============================================================================
// Client Recall - 14 Days Before VGP Due (URGENT)
// "Equipment rented to clients needs VGP inspection within 14 days"
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
import { RentalRecallTable } from './components/rental-recall-table';
import type { RecallTableRow } from './components/rental-recall-table';

const BRAND = {
  navy: '#1A1A1A',
  orange: '#E30613',
  darkGray: '#2d3a39',
  red: '#dc2626',
};

export interface ClientRecallEmailProps {
  organizationName: string;
  items: RecallTableRow[];
  appUrl: string;
}

export function ClientRecall14Day({
  organizationName,
  items,
  appUrl,
}: ClientRecallEmailProps) {
  const count = items.length;
  const clientNames = [...new Set(items.map(i => i.clientName))];

  return (
    <Html>
      <Head />
      <Preview>
        {`URGENT: ${count} equipement${count > 1 ? 's' : ''} en location - VGP dans 14 jours - ${organizationName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            <Section style={urgentBannerStyle}>
              <Text style={urgentBannerTitleStyle}>
                ACTION URGENTE REQUISE
              </Text>
              <Text style={urgentBannerTextStyle}>
                <strong>{count} equipement{count > 1 ? 's' : ''}</strong> actuellement en location
                {clientNames.length === 1
                  ? ` chez <strong>${clientNames[0]}</strong>`
                  : ` chez ${clientNames.length} clients`
                }{' '}
                {count > 1 ? 'necessitent' : 'necessite'} une{' '}
                <strong>inspection VGP dans les 14 prochains jours</strong>.
              </Text>
            </Section>

            <Section style={warningBoxStyle}>
              <Text style={warningBoxTextStyle}>
                Ces equipements doivent etre rappeles immediatement pour inspection.
                Sans inspection VGP valide, les sorties seront bloquees automatiquement
                par le systeme LOXAM.
              </Text>
            </Section>

            <Text style={sectionTitleStyle}>
              Equipements a rappeler en urgence
            </Text>
            <RentalRecallTable items={items} alertType="recall_14day" />

            <Section style={ctaContainerStyle}>
              <Button
                href={`${appUrl}/clients`}
                style={ctaButtonStyle}
              >
                Organiser les rappels maintenant
              </Button>
            </Section>

            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                URGENT: {count} equipment item{count > 1 ? 's' : ''} currently rented to{' '}
                {clientNames.length === 1 ? clientNames[0] : `${clientNames.length} clients`}{' '}
                need VGP inspection within the next 14 days. These must be recalled immediately.
                Without valid VGP inspection, equipment checkouts will be blocked automatically.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default ClientRecall14Day;

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

const greetingStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '15px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 16px 0',
};

const urgentBannerStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.red}`,
  padding: '16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const urgentBannerTitleStyle: React.CSSProperties = {
  color: BRAND.red,
  fontSize: '14px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  letterSpacing: '1px',
};

const urgentBannerTextStyle: React.CSSProperties = {
  color: '#991b1b',
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.6',
};

const warningBoxStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fbbf24',
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '6px',
};

const warningBoxTextStyle: React.CSSProperties = {
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
  backgroundColor: BRAND.red,
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
