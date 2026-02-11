// =============================================================================
// Client Recall - 30 Days Before VGP Due
// "Equipment rented to clients will need VGP inspection within 30 days"
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
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  warning: '#f59e0b',
};

export interface ClientRecallEmailProps {
  organizationName: string;
  items: RecallTableRow[];
  appUrl: string;
}

export function ClientRecall30Day({
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
        {`${count} equipement${count > 1 ? 's' : ''} en location necessitent un rappel VGP - ${organizationName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            <Text style={summaryStyle}>
              <strong>{count} equipement{count > 1 ? 's' : ''}</strong> actuellement en location
              {clientNames.length === 1
                ? ` chez <strong>${clientNames[0]}</strong>`
                : ` chez ${clientNames.length} clients`
              }{' '}
              {count > 1 ? 'auront' : 'aura'} besoin d&apos;une{' '}
              <strong>inspection VGP dans les 30 prochains jours</strong>.
            </Text>

            <Section style={infoBannerStyle}>
              <Text style={infoBannerTextStyle}>
                Planifiez le rappel de ces equipements pour assurer la conformite VGP
                avant l&apos;echeance. Le non-respect peut entrainer des amendes de 15 000 a 75 000 EUR.
              </Text>
            </Section>

            <Text style={sectionTitleStyle}>
              Equipements a rappeler
            </Text>
            <RentalRecallTable items={items} alertType="recall_30day" />

            <Section style={ctaContainerStyle}>
              <Button
                href={`${appUrl}/clients`}
                style={ctaButtonStyle}
              >
                Voir le tableau des clients
              </Button>
            </Section>

            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                {count} equipment item{count > 1 ? 's' : ''} currently rented to{' '}
                {clientNames.length === 1 ? clientNames[0] : `${clientNames.length} clients`}{' '}
                will need VGP inspection within the next 30 days. Plan recalls to ensure
                compliance before the deadline.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default ClientRecall30Day;

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

const summaryStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '16px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
};

const infoBannerStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  borderLeft: `4px solid ${BRAND.warning}`,
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const infoBannerTextStyle: React.CSSProperties = {
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
