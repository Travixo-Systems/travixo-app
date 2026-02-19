// =============================================================================
// Email Header Component - LOXAM Branding
// Shared across all VGP alert email templates
// =============================================================================

import {
  Section,
  Row,
  Column,
  Text,
  Hr,
} from '@react-email/components';

const BRAND = {
  navy: '#1A1A1A',
  orange: '#E30613',
  darkGray: '#2d3a39',
  white: '#ffffff',
  lightGray: '#f8f9fa',
};

export function EmailHeader() {
  return (
    <Section style={headerStyle}>
      <Row>
        <Column>
          <Text style={logoTextStyle}>LOXAM</Text>
        </Column>
      </Row>
      <Hr style={dividerStyle} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline for email compatibility)
// ---------------------------------------------------------------------------

const headerStyle: React.CSSProperties = {
  backgroundColor: BRAND.navy,
  padding: '24px 32px 16px 32px',
  borderRadius: '8px 8px 0 0',
};

const logoTextStyle: React.CSSProperties = {
  color: BRAND.white,
  fontSize: '28px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  letterSpacing: '2px',
  lineHeight: '1',
};

const logoSubtextStyle: React.CSSProperties = {
  color: BRAND.orange,
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '2px 0 0 0',
  letterSpacing: '4px',
  lineHeight: '1',
};

const dividerStyle: React.CSSProperties = {
  borderColor: BRAND.orange,
  borderWidth: '2px',
  margin: '16px 0 0 0',
};