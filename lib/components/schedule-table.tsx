// =============================================================================
// Schedule Table Component - Equipment List for Email Templates
// Displays the list of equipment with VGP deadlines
// =============================================================================

import {
  Section,
  Row,
  Column,
  Text,
} from '@react-email/components';

import type { ScheduleTableRow, VGPAlertType } from '@/types/vgp-alerts';

const BRAND = {
  navy: '#00252b',
  orange: '#f26f00',
  darkGray: '#2d3a39',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

interface ScheduleTableProps {
  schedules: ScheduleTableRow[];
  alertType: VGPAlertType;
}

function getDaysColor(days: number): string {
  if (days <= 0) return BRAND.danger;
  if (days <= 7) return BRAND.warning;
  return BRAND.darkGray;
}

function formatDaysRemaining(days: number): string {
  if (days < 0) return `${Math.abs(days)}j en retard`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `${days}j restants`;
}

export function ScheduleTable({ schedules, alertType }: ScheduleTableProps) {
  return (
    <Section style={tableContainerStyle}>
      {/* Table Header */}
      <Row style={tableHeaderRowStyle}>
        <Column style={{ ...headerCellStyle, width: '25%' }}>
          <Text style={headerTextStyle}>Equipement</Text>
        </Column>
        <Column style={{ ...headerCellStyle, width: '18%' }}>
          <Text style={headerTextStyle}>N. Serie</Text>
        </Column>
        <Column style={{ ...headerCellStyle, width: '17%' }}>
          <Text style={headerTextStyle}>Categorie</Text>
        </Column>
        <Column style={{ ...headerCellStyle, width: '15%' }}>
          <Text style={headerTextStyle}>Lieu</Text>
        </Column>
        <Column style={{ ...headerCellStyle, width: '13%' }}>
          <Text style={headerTextStyle}>Echeance</Text>
        </Column>
        <Column style={{ ...headerCellStyle, width: '12%' }}>
          <Text style={headerTextStyle}>Delai</Text>
        </Column>
      </Row>

      {/* Table Rows */}
      {schedules.map((schedule, index) => (
        <Row
          key={index}
          style={{
            ...tableRowStyle,
            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
          }}
        >
          <Column style={{ ...cellStyle, width: '25%' }}>
            <Text style={cellTextStyle}>{schedule.assetName}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '18%' }}>
            <Text style={cellTextMonoStyle}>
              {schedule.serialNumber || '-'}
            </Text>
          </Column>
          <Column style={{ ...cellStyle, width: '17%' }}>
            <Text style={cellTextStyle}>{schedule.category || '-'}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '15%' }}>
            <Text style={cellTextStyle}>{schedule.location || '-'}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '13%' }}>
            <Text style={cellTextStyle}>{schedule.dueDate}</Text>
          </Column>
          <Column style={{ ...cellStyle, width: '12%' }}>
            <Text
              style={{
                ...cellTextBoldStyle,
                color: getDaysColor(schedule.daysRemaining),
              }}
            >
              {formatDaysRemaining(schedule.daysRemaining)}
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
  margin: '0',
  borderRadius: '6px',
  border: '1px solid #e5e7eb',
  overflow: 'hidden',
};

const tableHeaderRowStyle: React.CSSProperties = {
  backgroundColor: BRAND.navy,
};

const headerCellStyle: React.CSSProperties = {
  padding: '10px 8px',
};

const headerTextStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 600,
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f3f4f6',
};

const cellStyle: React.CSSProperties = {
  padding: '8px 8px',
  verticalAlign: 'middle' as const,
};

const cellTextStyle: React.CSSProperties = {
  color: BRAND.darkGray,
  fontSize: '12px',
  fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  margin: '0',
  lineHeight: '1.4',
};

const cellTextMonoStyle: React.CSSProperties = {
  ...cellTextStyle,
  fontFamily: 'monospace, Courier New, Courier',
  fontSize: '11px',
};

const cellTextBoldStyle: React.CSSProperties = {
  ...cellTextStyle,
  fontWeight: 600,
  fontSize: '11px',
};