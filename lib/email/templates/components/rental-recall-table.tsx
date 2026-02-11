// =============================================================================
// Rental Recall Table Component
// Shows equipment currently rented to a client with upcoming VGP due dates
// =============================================================================

import {
  Section,
  Row,
  Column,
  Text,
} from '@react-email/components';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  red: '#dc2626',
  amber: '#d97706',
};

export interface RecallTableRow {
  assetName: string;
  serialNumber: string;
  category: string;
  clientName: string;
  checkoutDate: string;
  vgpDueDate: string;
  daysUntilDue: number;
}

interface RentalRecallTableProps {
  items: RecallTableRow[];
  alertType: 'recall_30day' | 'recall_14day';
}

export function RentalRecallTable({ items, alertType }: RentalRecallTableProps) {
  const isUrgent = alertType === 'recall_14day';

  return (
    <Section style={tableContainerStyle}>
      {/* Header Row */}
      <Row style={headerRowStyle}>
        <Column style={{ ...headerCellStyle, width: '30%' }}>Equipement</Column>
        <Column style={{ ...headerCellStyle, width: '20%' }}>Client</Column>
        <Column style={{ ...headerCellStyle, width: '20%' }}>Sorti le</Column>
        <Column style={{ ...headerCellStyle, width: '20%' }}>VGP due</Column>
        <Column style={{ ...headerCellStyle, width: '10%', textAlign: 'center' as const }}>Jours</Column>
      </Row>

      {/* Data Rows */}
      {items.map((item, index) => (
        <Row key={index} style={index % 2 === 0 ? evenRowStyle : oddRowStyle}>
          <Column style={{ ...cellStyle, width: '30%' }}>
            <Text style={assetNameStyle}>{item.assetName}</Text>
            {item.serialNumber !== '-' && (
              <Text style={serialStyle}>S/N: {item.serialNumber}</Text>
            )}
          </Column>
          <Column style={{ ...cellStyle, width: '20%' }}>
            <Text style={cellTextStyle}>{item.clientName}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '20%' }}>
            <Text style={cellTextStyle}>{item.checkoutDate}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '20%' }}>
            <Text style={cellTextStyle}>{item.vgpDueDate}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '10%', textAlign: 'center' as const }}>
            <Text style={{
              ...daysStyle,
              color: isUrgent ? BRAND.red : BRAND.amber,
            }}>
              {item.daysUntilDue}j
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const tableContainerStyle: React.CSSProperties = {
  width: '100%',
  margin: '0 0 20px 0',
  borderCollapse: 'collapse' as const,
};

const headerRowStyle: React.CSSProperties = {
  backgroundColor: '#00252b',
};

const headerCellStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  padding: '10px 8px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const evenRowStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
};

const oddRowStyle: React.CSSProperties = {
  backgroundColor: '#f9fafb',
};

const cellStyle: React.CSSProperties = {
  padding: '10px 8px',
  verticalAlign: 'top' as const,
  borderBottom: '1px solid #e5e7eb',
};

const cellTextStyle: React.CSSProperties = {
  color: '#374151',
  fontSize: '12px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.4',
};

const assetNameStyle: React.CSSProperties = {
  color: BRAND.navy,
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.4',
};

const serialStyle: React.CSSProperties = {
  color: '#9ca3af',
  fontSize: '10px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '2px 0 0 0',
  lineHeight: '1',
};

const daysStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
};
