// =============================================================================
// Team Invitation Email Template
// Matches the VGP alert email style (navy header, orange CTA button)
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
  navy: '#1A1A1A',
  orange: '#E30613',
  darkGray: '#2d3a39',
  white: '#ffffff',
};

interface TeamInvitationEmailProps {
  organizationName: string;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
  appUrl: string;
}

const ROLE_LABELS: Record<string, { fr: string; en: string }> = {
  admin: { fr: 'Administrateur', en: 'Administrator' },
  member: { fr: 'Membre', en: 'Member' },
  viewer: { fr: 'Lecteur', en: 'Viewer' },
};

export function TeamInvitationEmail({
  organizationName,
  inviterEmail,
  role,
  acceptUrl,
  appUrl,
}: TeamInvitationEmailProps) {
  const roleLabel = ROLE_LABELS[role] || ROLE_LABELS.member;

  return (
    <Html>
      <Head />
      <Preview>
        {`Invitation a rejoindre ${organizationName} sur LOXAM`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            <Text style={summaryStyle}>
              Vous avez ete invite(e) a rejoindre <strong>{organizationName}</strong> sur
              LOXAM en tant que <strong>{roleLabel.fr}</strong>.
            </Text>

            <Text style={detailStyle}>
              Cette invitation a ete envoyee par <strong>{inviterEmail}</strong>.
              LOXAM est une plateforme de suivi d'equipements et de conformite VGP
              pour les entreprises de location de materiel.
            </Text>

            {/* CTA Button */}
            <Section style={ctaContainerStyle}>
              <Button style={ctaButtonStyle} href={acceptUrl}>
                Accepter l'invitation
              </Button>
            </Section>

            <Text style={expiryNoteStyle}>
              Ce lien est valable pendant 7 jours. Apres cette date, demandez a
              l'administrateur de renvoyer l'invitation.
            </Text>

            {/* English summary */}
            <Section style={englishSectionStyle}>
              <Text style={englishTitleStyle}>English Summary</Text>
              <Text style={englishTextStyle}>
                You have been invited to join <strong>{organizationName}</strong> on
                LOXAM as a <strong>{roleLabel.en}</strong>. Click the button above
                to accept. This link expires in 7 days.
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
// Styles (inline for email compatibility)
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

const summaryStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '16px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const detailStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 24px 0',
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

const expiryNoteStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  textAlign: 'center' as const,
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
