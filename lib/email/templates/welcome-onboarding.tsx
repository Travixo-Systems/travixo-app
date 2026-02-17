// lib/email/templates/welcome-onboarding.tsx
// Welcome email sent after email confirmation + demo data seeding.
// Includes demo Excel as attachment (handled by send function, not template).

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';

import { EmailHeader } from './components/email-header';
import { EmailFooter } from './components/email-footer';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  white: '#ffffff',
};

interface WelcomeOnboardingEmailProps {
  fullName: string;
  companyName: string;
  appUrl: string;
}

export function WelcomeOnboardingEmail({
  fullName,
  companyName,
  appUrl,
}: WelcomeOnboardingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Bienvenue sur TraviXO — Votre compte ${companyName} est pret`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            <Text style={greetingStyle}>
              Bonjour {fullName},
            </Text>

            <Text style={paragraphStyle}>
              Votre compte TraviXO est active pour <strong>{companyName}</strong>.
            </Text>

            <Text style={paragraphStyle}>
              Votre evaluation gratuite de 15 jours commence aujourd'hui. Pendant
              cette periode, vous avez acces a l'ensemble des fonctionnalites, y
              compris la gestion de conformite VGP.
            </Text>

            {/* What's waiting */}
            <Section style={highlightBoxStyle}>
              <Text style={highlightTitleStyle}>
                CE QUI VOUS ATTEND
              </Text>
              <Text style={highlightTextStyle}>
                Nous avons prepare votre espace de travail avec des equipements de
                demonstration pour que vous puissiez decouvrir la plateforme
                immediatement.
              </Text>
              <Text style={highlightTextStyle}>
                Votre prochaine etape : importez le fichier Excel ci-joint pour voir
                la detection automatique des colonnes en action.
              </Text>
            </Section>

            {/* CTA Button */}
            <Section style={ctaContainerStyle}>
              <Button style={ctaButtonStyle} href={`${appUrl}/login`}>
                Acceder a mon espace TraviXO
              </Button>
            </Section>

            <Hr style={dividerStyle} />

            {/* Excel instructions */}
            <Text style={sectionTitleStyle}>
              VOTRE FICHIER DE DEMONSTRATION
            </Text>

            <Text style={paragraphStyle}>
              En piece jointe, vous trouverez un fichier Excel avec 20 equipements
              types. Pour l'importer :
            </Text>

            <Text style={stepsStyle}>
              1. Connectez-vous a TraviXO{'\n'}
              2. Allez dans Equipements {'>'} Importer{'\n'}
              3. Glissez-deposez le fichier Excel{'\n'}
              4. Verifiez la detection automatique des colonnes{'\n'}
              5. Cliquez sur Importer
            </Text>

            <Text style={detailStyle}>
              La detection intelligente reconnait automatiquement vos colonnes, meme
              si elles sont nommees differemment (Designation, Description, Nom,
              Equipement...).
            </Text>

            <Hr style={dividerStyle} />

            {/* Help */}
            <Text style={helpStyle}>
              Besoin d'aide ? Repondez directement a cet email ou
              contactez-nous a contact@travixosystems.com.
            </Text>

            {/* English summary */}
            <Section style={englishSectionStyle}>
              <Text style={englishTitleStyle}>English Summary</Text>
              <Text style={englishTextStyle}>
                Your TraviXO account for <strong>{companyName}</strong> is active.
                Your 15-day free evaluation starts today with full VGP compliance
                access. We've pre-loaded demo equipment in your dashboard. Import the
                attached Excel file to experience smart column detection.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

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
  maxWidth: '600px',
  margin: '40px auto',
  backgroundColor: BRAND.white,
  borderRadius: '8px',
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

const contentStyle: React.CSSProperties = {
  padding: '32px',
};

const greetingStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '16px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 16px 0',
};

const paragraphStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const highlightBoxStyle: React.CSSProperties = {
  backgroundColor: '#f0f4f8',
  padding: '20px 24px',
  borderRadius: '6px',
  borderLeft: `4px solid ${BRAND.navy}`,
  margin: '24px 0',
};

const highlightTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  letterSpacing: '1px',
};

const highlightTextStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 8px 0',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: BRAND.orange,
  color: BRAND.white,
  padding: '14px 32px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '16px',
  textDecoration: 'none',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  display: 'inline-block',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const sectionTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 12px 0',
  letterSpacing: '1px',
};

const stepsStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '2',
  margin: '0 0 16px 0',
  whiteSpace: 'pre-line' as const,
};

const detailStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const helpStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 24px 0',
};

const englishSectionStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  padding: '16px 20px',
  borderRadius: '6px',
  borderLeft: `3px solid ${BRAND.navy}`,
  marginTop: '24px',
};

const englishTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const englishTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.5',
  margin: '0',
};
