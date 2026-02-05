// =============================================================================
// Email Footer Component - TraviXO
// Shared across all VGP alert email templates
// =============================================================================

import {
  Section,
  Text,
  Link,
  Hr,
} from '@react-email/components';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  mediumGray: '#6b7280',
  lightGray: '#f3f4f6',
};

interface EmailFooterProps {
  appUrl: string;
}

export function EmailFooter({ appUrl }: EmailFooterProps) {
  return (
    <Section style={footerContainerStyle}>
      <Hr style={dividerStyle} />

      <Text style={footerTextStyle}>
        TraviXO Systems - Suivi QR et conformite VGP pour la location de materiel
      </Text>

      <Text style={footerLinksStyle}>
        <Link href={`${appUrl}/dashboard`} style={linkStyle}>
          Tableau de bord
        </Link>
        {' | '}
        <Link href={`${appUrl}/vgp/schedules`} style={linkStyle}>
          Inspections VGP
        </Link>
        {' | '}
        <Link href={`${appUrl}/settings/notifications`} style={linkStyle}>
          Preferences de notification
        </Link>
      </Text>

      <Text style={unsubscribeStyle}>
        Vous recevez cet email car les alertes VGP sont activees pour votre organisation.{' '}
        <Link href={`${appUrl}/settings/notifications`} style={unsubscribeLinkStyle}>
          Gerer les preferences
        </Link>
      </Text>

      <Text style={addressStyle}>
        noreply@travixosystems.com
      </Text>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const footerContainerStyle: React.CSSProperties = {
  padding: '0 32px 24px 32px',
  backgroundColor: '#ffffff',
  borderRadius: '0 0 8px 8px',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const footerTextStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 12px 0',
  textAlign: 'center' as const,
};

const footerLinksStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '12px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 16px 0',
  textAlign: 'center' as const,
};

const linkStyle: React.CSSProperties = {
  color: BRAND.orange,
  textDecoration: 'none',
};

const unsubscribeStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textAlign: 'center' as const,
};

const unsubscribeLinkStyle: React.CSSProperties = {
  color: '#9ca3af',
  textDecoration: 'underline',
};

const addressStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  textAlign: 'center' as const,
};