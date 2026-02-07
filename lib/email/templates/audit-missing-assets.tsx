// =============================================================================
// Audit Missing Assets Email Template
// Sent to org admins when audit is completed with missing assets
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
  danger: '#b91c1c',
  darkGray: '#2d3a39',
  white: '#ffffff',
};

interface MissingAsset {
  name: string;
  serialNumber: string | null;
  category: string | null;
  lastLocation: string | null;
}

interface AuditMissingAssetsEmailProps {
  organizationName: string;
  auditName: string;
  completedDate: string;
  totalAssets: number;
  verifiedAssets: number;
  missingAssets: MissingAsset[];
  auditUrl: string;
  appUrl: string;
}

export function AuditMissingAssetsEmail({
  organizationName,
  auditName,
  completedDate,
  totalAssets,
  verifiedAssets,
  missingAssets,
  auditUrl,
  appUrl,
}: AuditMissingAssetsEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {`Audit termine: ${missingAssets.length} equipement(s) manquant(s) - ${auditName}`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <EmailHeader />

          <Section style={contentStyle}>
            {/* Alert banner */}
            <Section style={alertBannerStyle}>
              <Text style={alertTextStyle}>
                EQUIPEMENTS MANQUANTS
              </Text>
            </Section>

            <Text style={greetingStyle}>
              Bonjour,
            </Text>

            <Text style={summaryStyle}>
              L'audit <strong>"{auditName}"</strong> pour <strong>{organizationName}</strong> a
              ete termine le {completedDate}.
            </Text>

            {/* Stats */}
            <Section style={statsContainerStyle}>
              <table style={statsTableStyle}>
                <tbody>
                  <tr>
                    <td style={statCellStyle}>
                      <Text style={statValueStyle}>{totalAssets}</Text>
                      <Text style={statLabelStyle}>Total</Text>
                    </td>
                    <td style={statCellStyle}>
                      <Text style={{ ...statValueStyle, color: '#047857' }}>{verifiedAssets}</Text>
                      <Text style={statLabelStyle}>Verifies</Text>
                    </td>
                    <td style={statCellStyle}>
                      <Text style={{ ...statValueStyle, color: BRAND.danger }}>{missingAssets.length}</Text>
                      <Text style={statLabelStyle}>Manquants</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* Missing assets table */}
            <Text style={sectionTitleStyle}>
              Equipements manquants ({missingAssets.length})
            </Text>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Equipement</th>
                  <th style={thStyle}>N. Serie</th>
                  <th style={thStyle}>Categorie</th>
                  <th style={thStyle}>Dernier emplacement</th>
                </tr>
              </thead>
              <tbody>
                {missingAssets.map((asset, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>{asset.name}</td>
                    <td style={tdStyle}>{asset.serialNumber || '-'}</td>
                    <td style={tdStyle}>{asset.category || '-'}</td>
                    <td style={tdStyle}>{asset.lastLocation || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* CTA */}
            <Section style={ctaContainerStyle}>
              <Button style={ctaButtonStyle} href={auditUrl}>
                Voir le detail de l'audit
              </Button>
            </Section>

            <Text style={noteStyle}>
              Ces equipements necessitent une action corrective. Veuillez verifier
              leur emplacement et mettre a jour le systeme en consequence.
            </Text>

            {/* English summary */}
            <Section style={englishSectionStyle}>
              <Text style={englishTitleStyle}>English Summary</Text>
              <Text style={englishTextStyle}>
                Audit "{auditName}" completed on {completedDate}. {missingAssets.length} asset(s)
                could not be located. Total: {totalAssets}, Verified: {verifiedAssets},
                Missing: {missingAssets.length}. Review the audit for details.
              </Text>
            </Section>
          </Section>

          <EmailFooter appUrl={appUrl} />
        </Container>
      </Body>
    </Html>
  );
}

// Styles
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
};

const contentStyle: React.CSSProperties = { padding: '32px' };

const alertBannerStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.danger}`,
  padding: '12px 16px',
  borderRadius: '4px',
  marginBottom: '20px',
};

const alertTextStyle: React.CSSProperties = {
  color: BRAND.danger,
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '1px',
  margin: 0,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const greetingStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '16px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 16px 0',
};

const summaryStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '15px',
  lineHeight: '1.6',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 20px 0',
};

const statsContainerStyle: React.CSSProperties = {
  margin: '20px 0',
};

const statsTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
};

const statCellStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '12px',
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
};

const statValueStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  margin: '0',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  color: BRAND.darkGray,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '4px 0 0 0',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: BRAND.danger,
  margin: '24px 0 12px 0',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  fontSize: '13px',
};

const thStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  color: BRAND.danger,
  padding: '8px 10px',
  textAlign: 'left' as const,
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
  color: BRAND.darkGray,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const ctaContainerStyle: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '28px 0',
};

const ctaButtonStyle: React.CSSProperties = {
  backgroundColor: BRAND.orange,
  color: BRAND.white,
  padding: '12px 28px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  textDecoration: 'none',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
};

const noteStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.5',
  margin: '0 0 24px 0',
};

const englishSectionStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  padding: '16px 20px',
  borderRadius: '6px',
  borderLeft: `3px solid ${BRAND.navy}`,
};

const englishTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
};

const englishTextStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.5',
  margin: '0',
};
