// ============================================================================
// CORE VGP TYPES (DIRECCTE Compliant)
// ============================================================================

/**
 * VGP Verification Types (Article R.4323-23)
 * PERIODIQUE: Regular periodic verification
 * INITIALE: Initial verification before first use
 * REMISE_SERVICE: Return-to-service verification after major repair/incident
 */
export type VGPVerificationType = 'PERIODIQUE' | 'INITIALE' | 'REMISE_SERVICE';

/**
 * VGP Inspection Result Status
 * CONFORME: Compliant - no issues, authorized for use
 * CONDITIONNEL: Conditional - authorized with reservations, corrective actions required
 * NON_CONFORME: Non-compliant - use prohibited until issues resolved
 */
export type VGPResultStatus = 'CONFORME' | 'CONDITIONNEL' | 'NON_CONFORME';

/**
 * Legacy result status mapping (for backward compatibility with DB)
 */
export type VGPResultStatusLegacy = 'passed' | 'conditional' | 'failed';

/**
 * VGP Equipment Categories (French regulatory categories)
 */
export type VGPEquipmentCategory =
  | 'Engins de Chantier'
  | 'Équipements de Levage'
  | 'Échafaudages'
  | 'Nacelles et Plateformes Élévatrices'
  | 'Appareils de Levage de Personnes'
  | 'Chariots Automoteurs de Manutention';

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * VGP Inspection record from database
 */
export interface VGPInspection {
  id: string;
  organization_id: string;
  asset_id: string;
  schedule_id?: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
  inspector_accreditation?: string;
  verification_type: VGPVerificationType; // NEW: MANDATORY field
  result: VGPResultStatusLegacy;
  observations: string; // NEW: MANDATORY field (use "RAS" if empty)
  certification_number?: string;
  certificate_url?: string;
  next_inspection_date: string;
  created_at: string;
  updated_at: string;
  
  // Relations
  assets?: {
    id: string;
    name: string;
    serial_number?: string;
    internal_id?: string;
    asset_categories?: {
      id: string;
      name: string;
    };
  };
}

/**
 * VGP Schedule record from database
 */
export interface VGPSchedule {
  id: string;
  organization_id: string;
  asset_id: string;
  last_inspection_date?: string;
  next_due_date: string;
  interval_months: number;
  status: 'upcoming' | 'overdue' | 'completed';
  archived: boolean;
  created_at: string;
  updated_at: string;
  
  // Relations
  assets?: {
    id: string;
    name: string;
    serial_number?: string;
    internal_id?: string;
    asset_categories?: {
      id: string;
      name: string;
    };
  };
}

// ============================================================================
// DIRECCTE REPORT TYPES
// ============================================================================

/**
 * Complete VGP DIRECCTE Report structure
 */
export interface VGPDIRECCTEReport {
  rapportId: string;
  entreprise: {
    nom: string;
    siret: string;
    adresse: string;
    contact: string;
  };
  periode: {
    debut: string; // ISO date
    fin: string;   // ISO date
  };
  dateGeneration: string; // ISO date
  statistiques: VGPReportStatistics;
  definitionsStatuts: VGPStatusDefinitions;
  definitionsTypesVerification: VGPVerificationTypeDefinitions;
  inspections: VGPReportInspection[];
  equipementsEnRetard: VGPOverdueEquipment[];
  mentionsLegales: VGPLegalNotice;
}

/**
 * Report statistics summary
 */
export interface VGPReportStatistics {
  equipementsSuivis: number;      // Total VGP-tracked equipment
  inspectionsRealisees: number;   // Total inspections in period
  conformes: number;               // CONFORME count
  conditionnels: number;           // CONDITIONNEL count
  nonConformes: number;            // NON_CONFORME count
  enRetard: number;                // Overdue equipment count (MUST be accurate!)
  tauxConformite: number;          // Compliance rate (0-100)
}

/**
 * Status definitions (for report legend)
 */
export interface VGPStatusDefinitions {
  CONFORME: string;
  CONDITIONNEL: string;
  NON_CONFORME: string;
}

/**
 * Verification type definitions (for report legend)
 */
export interface VGPVerificationTypeDefinitions {
  PERIODIQUE: string;
  INITIALE: string;
  REMISE_SERVICE: string;
}

/**
 * Single inspection in DIRECCTE report
 */
export interface VGPReportInspection {
  date: string; // ISO date
  equipement: {
    idInterne: string;
    nom: string;
    numeroSerie: string;
    categorieReglementaire: VGPEquipmentCategory;
  };
  typeVerification: VGPVerificationType; // MANDATORY
  inspecteur: {
    nom: string;
    organisme: string;
    numeroAccreditation: string;
  };
  resultat: VGPResultStatus;
  observations: string; // MANDATORY (use "RAS" if empty)
  dateProchaine: string; // ISO date
  certificat?: {
    numeroCertificat: string;
    lienCertificatPdf: string;
  };
}

/**
 * Overdue equipment in DIRECCTE report
 */
export interface VGPOverdueEquipment {
  idInterne: string;
  nom: string;
  numeroSerie: string;
  categorieReglementaire: VGPEquipmentCategory;
  dateDerniereVgp: string; // ISO date
  dateProchaineTheorique: string; // ISO date
  joursDeRetard: number; // Days overdue (positive integer)
}

/**
 * Legal notice for DIRECCTE report
 */
export interface VGPLegalNotice {
  referenceCodeTravail: string;
  disclaimer: string;
  editeur: string;
  versionApplication: string;
}

// ============================================================================
// FORM INPUT TYPES
// ============================================================================

/**
 * VGP Inspection form data
 */
export interface VGPInspectionFormData {
  asset_id: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
  inspector_accreditation?: string;
  verification_type: VGPVerificationType; // NEW: Required in form
  result: VGPResultStatusLegacy;
  observations: string; // NEW: Required in form (suggest "RAS" as placeholder)
  certification_number?: string;
  certificate_url?: string;
  next_inspection_date: string;
}

/**
 * VGP Schedule form data
 */
export interface VGPScheduleFormData {
  asset_id: string;
  interval_months: number;
  next_due_date: string;
  last_inspection_date?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * API response for VGP compliance summary
 */
export interface VGPComplianceSummaryResponse {
  totalEquipment: number;
  totalInspections: number;
  complianceRate: number;
  upcomingCount: number;
  overdueCount: number;
  upcomingInspections: Array<{
    id: string;
    assetName: string;
    dueDate: string;
    daysUntilDue: number;
  }>;
  overdueInspections: Array<{
    id: string;
    assetName: string;
    dueDate: string;
    daysOverdue: number;
  }>;
}

/**
 * API response for VGP report generation
 */
export interface VGPReportGenerationResponse {
  success: boolean;
  reportId: string;
  filename: string;
  downloadUrl?: string;
  error?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Map legacy DB status to DIRECCTE status
 */
export const mapResultToStatus = (
  result: VGPResultStatusLegacy
): VGPResultStatus => {
  const mapping: Record<VGPResultStatusLegacy, VGPResultStatus> = {
    passed: 'CONFORME',
    conditional: 'CONDITIONNEL',
    failed: 'NON_CONFORME',
  };
  return mapping[result];
};

/**
 * Map DIRECCTE status to legacy DB status
 */
export const mapStatusToResult = (
  status: VGPResultStatus
): VGPResultStatusLegacy => {
  const mapping: Record<VGPResultStatus, VGPResultStatusLegacy> = {
    CONFORME: 'passed',
    CONDITIONNEL: 'conditional',
    NON_CONFORME: 'failed',
  };
  return mapping[status];
};

/**
 * Validate verification type
 */
export const isValidVerificationType = (
  type: string
): type is VGPVerificationType => {
  return ['PERIODIQUE', 'INITIALE', 'REMISE_SERVICE'].includes(type);
};

/**
 * Calculate days overdue
 */
export const calculateDaysOverdue = (dueDate: string): number => {
  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

/**
 * Calculate days until due
 */
export const calculateDaysUntilDue = (dueDate: string): number => {
  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default VGP status definitions (French)
 */
export const VGP_STATUS_DEFINITIONS: VGPStatusDefinitions = {
  CONFORME: 'Inspection sans remarque, utilisation autorisée.',
  CONDITIONNEL: 'Utilisation autorisée avec réserves et actions correctives à suivre.',
  NON_CONFORME: "Utilisation interdite tant que les non-conformités ne sont pas levées.",
};

/**
 * Default VGP verification type definitions (French)
 */
export const VGP_VERIFICATION_TYPE_DEFINITIONS: VGPVerificationTypeDefinitions = {
  PERIODIQUE: 'Vérification générale périodique conformément à la réglementation en vigueur.',
  INITIALE: 'Vérification initiale avant mise en service.',
  REMISE_SERVICE: 'Vérification après modification, réparation ou incident majeur.',
};

/**
 * Legal notice template
 */
export const VGP_LEGAL_NOTICE: VGPLegalNotice = {
  referenceCodeTravail: 'Articles R.4323-21 à R.4323-28 du Code du travail.',
  disclaimer:
    "Ce rapport est généré automatiquement par TraviXO. Il est valide uniquement accompagné des certificats individuels d'inspection et ne se substitue pas aux obligations de conservation des rapports détaillés.",
  editeur: 'TraviXO Systems',
  versionApplication: 'v1.0.0',
};






