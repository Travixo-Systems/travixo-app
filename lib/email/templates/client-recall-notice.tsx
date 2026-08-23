// =============================================================================
// Client Recall Notice - sent TO THE CLIENT (external recipient)
//
// Distinct from client-recall-30day / client-recall-14day, which are INTERNAL
// work-lists sent to org staff ("nous organisons le rappel", CTA into the app).
// This template addresses the renting client directly and never links into the
// TraviXO app, which the client has no account for.
// =============================================================================

import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
} from '@react-email/components';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  mediumGray: '#6b7280',
  warning: '#f59e0b',
  red: '#dc2626',
};

export interface ClientRecallNoticeItem {
  assetName: string;
  serialNumber: string;
  vgpDueDate: string;
  daysUntilDue: number;
}

export interface ClientRecallNoticeProps {
  /** The rental company sending the notice (not TraviXO). */
  organizationName: string;
  /** The client contact being addressed. */
  clientName: string;
  items: ClientRecallNoticeItem[];
  /** Reply-to address of the rental company, shown in the body. */
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export function ClientRecallNotice({
  organizationName,
  clientName,
  items,
  contactEmail,
  contactPhone,
}: ClientRecallNoticeProps) {
  const count = items.length;
  const plural = count > 1;
  const soonest = items.reduce(
    (min, i) => (i.daysUntilDue < min ? i.daysUntilDue : min),
    items[0]?.daysUntilDue ?? 0
  );
  const isUrgent = soonest <= 14;

  return (
    <Html>
      <Head />
      <Preview>
        {`${organizationName} : ${count} équipement${plural ? 's' : ''} à restituer pour vérification VGP`}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={brandBarStyle}>
            <Text style={brandTextStyle}>{organizationName}</Text>
          </Section>

          <Section style={contentStyle}>
            <Text style={greetingStyle}>Bonjour {clientName},</Text>

            <Text style={summaryStyle}>
              {plural
                ? `${count} équipements que vous avez actuellement en location doivent faire l'objet d'une`
                : `Un équipement que vous avez actuellement en location doit faire l'objet d'une`}{' '}
              <strong>Vérification Générale Périodique (VGP)</strong>.
            </Text>

            <Section style={isUrgent ? urgentBannerStyle : infoBannerStyle}>
              <Text style={isUrgent ? urgentBannerTextStyle : infoBannerTextStyle}>
                {isUrgent
                  ? `Échéance proche : ${soonest <= 0 ? "l'échéance est dépassée" : `dans ${soonest} jour${soonest > 1 ? 's' : ''}`}. Merci de nous contacter rapidement pour convenir de la restitution ou d'une inspection sur site.`
                  : `La VGP est obligatoire (art. R4323-23 et suivants du Code du travail). Un équipement dont la VGP n'est pas à jour ne peut pas être maintenu en service.`}
              </Text>
            </Section>

            <Text style={sectionTitleStyle}>Équipement concerné</Text>

            <Section style={tableStyle}>
              {items.map((item, idx) => (
                <Section
                  key={`${item.serialNumber}-${idx}`}
                  style={idx === 0 ? firstRowStyle : rowStyle}
                >
                  <Text style={assetNameStyle}>{item.assetName}</Text>
                  <Text style={assetMetaStyle}>
                    {item.serialNumber && item.serialNumber !== '-'
                      ? `N/S ${item.serialNumber} - `
                      : ''}
                    Échéance VGP : {item.vgpDueDate}
                    {item.daysUntilDue <= 0
                      ? ' (dépassée)'
                      : ` (dans ${item.daysUntilDue} jour${item.daysUntilDue > 1 ? 's' : ''})`}
                  </Text>
                </Section>
              ))}
            </Section>

            <Text style={nextStepsTitleStyle}>Prochaines étapes</Text>
            <Text style={bodyTextStyle}>
              Merci de prendre contact avec nous afin de convenir soit de la
              restitution de l&apos;équipement, soit d&apos;une intervention de
              vérification sur votre site.
            </Text>

            {(contactEmail || contactPhone) && (
              <Section style={contactBoxStyle}>
                <Text style={contactTitleStyle}>Nous contacter</Text>
                {contactEmail && <Text style={contactLineStyle}>{contactEmail}</Text>}
                {contactPhone && <Text style={contactLineStyle}>{contactPhone}</Text>}
              </Section>
            )}

            <Text style={signOffStyle}>
              Cordialement,
              <br />
              {organizationName}
            </Text>
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Cet email vous est adressé par {organizationName} concernant du
              matériel qui vous est actuellement loué.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ClientRecallNotice;

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

const brandBarStyle: React.CSSProperties = {
  backgroundColor: BRAND.navy,
  padding: '20px 32px',
  borderRadius: '6px 6px 0 0',
};

const brandTextStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
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

const urgentBannerStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  borderLeft: `4px solid ${BRAND.red}`,
  padding: '12px 16px',
  margin: '0 0 24px 0',
  borderRadius: '0 4px 4px 0',
};

const urgentBannerTextStyle: React.CSSProperties = {
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

const tableStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  margin: '0 0 24px 0',
};

const rowStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid #e5e7eb',
};

const firstRowStyle: React.CSSProperties = {
  padding: '12px 16px',
};

const assetNameStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const assetMetaStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '12px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
};

const nextStepsTitleStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const bodyTextStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0 0 20px 0',
};

const contactBoxStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  padding: '16px',
  borderRadius: '6px',
  margin: '0 0 24px 0',
};

const contactTitleStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 8px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
};

const contactLineStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '13px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0 0 4px 0',
};

const signOffStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '14px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.6',
  margin: '0',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 32px',
};

const footerTextStyle: React.CSSProperties = {
  color: BRAND.mediumGray,
  fontSize: '11px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  lineHeight: '1.5',
  margin: '0',
  textAlign: 'center' as const,
};
