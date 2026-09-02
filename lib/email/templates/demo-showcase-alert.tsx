// =============================================================================
// Demo Showcase Alert - one-time, sent right after signup
//
// This is deliberately NOT a VGP alert. It is a worked example of one, shown
// against the seeded demo equipment so a new customer can see the format
// before their own parc exists. Every visual cue that signals urgency in the
// real overdue template is softened here, and the demo framing appears above
// the specimen, inside it, and again in the footer -- an email that looks like
// a compliance warning but is not must never be mistaken for one.
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

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  mediumGray: '#6b7280',
};

export interface DemoShowcaseSpecimen {
  assetName: string;
  serialNumber: string;
  daysOverdue: number;
  actionRequired: string;
}

export interface DemoShowcaseAlertProps {
  organizationName: string;
  specimen: DemoShowcaseSpecimen;
  appUrl: string;
}

export function DemoShowcaseAlert({
  organizationName,
  specimen,
  appUrl,
}: DemoShowcaseAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Exemple d'alerte VGP - ${organizationName} (email de démonstration)`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            {/* Demo badge - neutral grey, never the red urgency badge */}
            <Section style={demoBadgeStyle}>
              <Text style={demoBadgeTextStyle}>EXEMPLE</Text>
            </Section>

            <Text style={greetingStyle}>Bonjour,</Text>

            <Text style={summaryStyle}>
              Voici un exemple du type d&apos;alerte que TraviXO enverra pour
              votre parc.
            </Text>

            <Text style={bodyTextStyle}>
              Nous avons ajouté quelques équipements de démonstration à votre
              compte <strong>{organizationName}</strong>. L&apos;un d&apos;eux
              est volontairement en retard de VGP, pour vous montrer à quoi
              ressemble une alerte de non-conformité.
            </Text>

            {/* The specimen */}
            <Text style={sectionTitleStyle}>Exemple d&apos;équipement</Text>

            <Section style={specimenCardStyle}>
              <Text style={specimenNameStyle}>{specimen.assetName}</Text>

              <Section style={specimenRowStyle}>
                <Text style={specimenLabelStyle}>Numéro de série</Text>
                <Text style={specimenValueStyle}>{specimen.serialNumber}</Text>
              </Section>

              <Section style={specimenRowStyle}>
                <Text style={specimenLabelStyle}>Retard</Text>
                {/* Built as one string. Splitting the plural into its own JSX
                    expression makes React Email emit a separate text node, and
                    the delivered mail reads "10 jour s". */}
                <Text style={specimenValueStyle}>
                  {`${specimen.daysOverdue} jour${specimen.daysOverdue > 1 ? 's' : ''}`}
                </Text>
              </Section>

              <Section style={specimenRowStyle}>
                <Text style={specimenLabelStyle}>Action attendue</Text>
                <Text style={specimenValueStyle}>{specimen.actionRequired}</Text>
              </Section>
            </Section>

            <Text style={bodyTextStyle}>
              Pour un équipement réel, cette alerte partirait automatiquement
              vers les destinataires configurés, et se répéterait jusqu&apos;à
              ce que l&apos;inspection soit enregistrée.
            </Text>

            <Section style={ctaContainerStyle}>
              <Button href={`${appUrl}/assets/import`} style={ctaButtonStyle}>
                Importer mon parc
              </Button>
            </Section>

            {/* Required disclaimer */}
            <Section style={disclaimerStyle}>
              <Text style={disclaimerTextStyle}>
                Cet email est un exemple. Les vraies alertes commenceront quand
                vous importerez votre parc.
              </Text>
            </Section>

            <Section style={enSectionStyle}>
              <Text style={enTitleStyle}>English Summary</Text>
              <Text style={enTextStyle}>
                This is a one-off SAMPLE alert for {organizationName}, shown
                against demo equipment added to your account. It is not a real
                compliance notice and requires no action. Real VGP alerts begin
                once you import your own fleet.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export default DemoShowcaseAlert;

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

const demoBadgeStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const demoBadgeTextStyle: React.CSSProperties = {
  backgroundColor: BRAND.mediumGray,
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
  margin: '0 0 16px 0',
  fontWeight: 600,
};

const bodyTextStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
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

const specimenCardStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderLeft: `4px solid ${BRAND.orange}`,
  padding: '16px 20px',
  margin: '0 0 20px 0',
  borderRadius: '0 6px 6px 0',
};

const specimenNameStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '15px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 12px 0',
};

const specimenRowStyle: React.CSSProperties = {
  margin: '0 0 8px 0',
};

const specimenLabelStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '11px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const specimenValueStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '2px 0 0 0',
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
  padding: '14px 32px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
};

const disclaimerStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  borderLeft: '4px solid #eab308',
  padding: '12px 16px',
  margin: '0 0 20px 0',
  borderRadius: '0 4px 4px 0',
};

const disclaimerTextStyle: React.CSSProperties = {
  color: '#854d0e',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.5',
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
