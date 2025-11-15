// lib/i18n.ts
// Centralized translation system for whole app

export type Language = "en" | "fr";

export const translations = {
  vgpDashboard: {
    pageTitle: {
      en: "VGP Compliance",
      fr: "Conformité VGP",
    },
    pageSubtitle: {
      en: "General Periodic Inspections - Article R4323-23",
      fr: "Vérifications Générales Périodiques - Article R4323-23",
    },
    generateReport: {
      en: "DIRECCTE Report",
      fr: "Rapport DIRECCTE",
    },
    complianceRate: {
      en: "Compliance Rate",
      fr: "Taux de Conformité",
    },
    compliantEquipment: {
      en: "compliant equipment",
      fr: "équipements conformes",
    },
    upcoming: {
      en: "Upcoming (30 days)",
      fr: "À venir (30 jours)",
    },
    plannedInspections: {
      en: "Planned inspections",
      fr: "Inspections prévues",
    },
    overdue: {
      en: "Overdue",
      fr: "En Retard",
    },
    immediateAction: {
      en: "Immediate action required",
      fr: "Action immédiate requise",
    },
    totalEquipment: {
      en: "Total Equipment",
      fr: "Total Équipements",
    },
    underVGPMonitoring: {
      en: "Under VGP monitoring",
      fr: "Sous surveillance VGP",
    },
    overdueSection: {
      en: "OVERDUE",
      fr: "EN RETARD",
    },
    risk: {
      en: "Risk",
      fr: "Risque",
    },
    otherEquipment: {
      en: "other equipment",
      fr: "autres équipements",
    },
    viewAll: {
      en: "View all in Tracking",
      fr: "Voir tout dans Suivi",
    },
    upcomingSection: {
      en: "UPCOMING",
      fr: "À VENIR",
    },
    next30Days: {
      en: "Next 30 days",
      fr: "Prochains 30 jours",
    },
    in: {
      en: "in",
      fr: "dans",
    },
    viewAllInTracking: {
      en: "View all in Tracking",
      fr: "Voir tout dans Suivi",
    },
  },

  // ============================================================================
  // SUBSCRIPTION PAGE
  // ============================================================================
  subscription: {
    pageTitle: {
      en: "Plans & Billing",
      fr: "Plans & Facturation",
    },
    pageSubtitle: {
      en: "Manage your subscription and usage",
      fr: "Gérez votre abonnement et votre utilisation",
    },
    currentPlan: {
      en: "Current Plan",
      fr: "Plan Actuel",
    },
    recommended: {
      en: "Recommended",
      fr: "Recommandé",
    },
    selectPlan: {
      en: "Select Plan",
      fr: "Sélectionner le Plan",
    },
    upgrading: {
      en: "Updating...",
      fr: "Mise à jour en cours...",
    },
    billingMonthly: {
      en: "Monthly",
      fr: "Mensuel",
    },
    billingYearly: {
      en: "Yearly",
      fr: "Annuel",
    },
    yearlySavings: {
      en: "-10%",
      fr: "-10%",
    },
    assetsUsed: {
      en: "Equipment in use",
      fr: "Équipements en service",
    },
    trialEndsIn: {
      en: "Trial Ends In",
      fr: "L'essai se termine dans",
    },
    days: {
      en: "days",
      fr: "jours",
    },
    pilotAccess: {
      en: "Pilot Access",
      fr: "Accès Pilote",
    },
    pilotDescription: {
      en: "Full feature access during pilot period",
      fr: "Accès complet aux fonctionnalités pendant la période pilote",
    },
    perMonth: {
      en: "per month",
      fr: "par mois",
    },
    perMonthBilledYearly: {
      en: "per month (billed yearly)",
      fr: "par mois (facturé annuellement)",
    },
    perYear: {
      en: "/ year",
      fr: "/ an",
    },
    unlimited: {
      en: "Unlimited",
      fr: "Illimité",
    },
    assets: {
      en: "Equipment",
      fr: "Équipements",
    },
    features: {
      vgpCompliance: {
        en: "VGP Compliance Automation",
        fr: "Automatisation de la Conformité VGP",
      },
      digitalAudits: {
        en: "Digital Audits",
        fr: "Audits Numériques",
      },
      apiAccess: {
        en: "API Access",
        fr: "Accès API",
      },
      customBranding: {
        en: "Custom Branding",
        fr: "Marque Personnalisée",
      },
      prioritySupport: {
        en: "Priority Support",
        fr: "Support Prioritaire",
      },
      dedicatedSupport: {
        en: "Dedicated Support",
        fr: "Support Dédié",
      },
      customIntegrations: {
        en: "Custom Integrations",
        fr: "Intégrations Personnalisées",
      },
    },
    contactSupport: {
      en: "Contact support",
      fr: "Contacter le support",
    },
    questions: {
      en: "Questions?",
      fr: "Des questions ?",
    },
    errors: {
      alreadyOnPlan: {
        en: "You are already on this plan",
        fr: "Vous êtes déjà sur ce plan",
      },
      updateFailed: {
        en: "Failed to update subscription",
        fr: "Échec de la mise à jour de l'abonnement",
      },
    },
    success: {
      updated: {
        en: "Subscription updated! Refreshing page...",
        fr: "Abonnement mis à jour ! Actualisation de la page...",
      },
    },
  },

  // ============================================================================
  // VGP SCHEDULES
  // ============================================================================
  vgpSchedules: {
    pageTitle: {
      en: "VGP Schedule",
      fr: "Suivi VGP",
    },
    pageSubtitle: {
      en: "Planning and monitoring of periodic inspections",
      fr: "Planification et suivi des inspections périodiques",
    },
    overdue: {
      en: "Overdue",
      fr: "En retard",
    },
    upcoming: {
      en: "Upcoming",
      fr: "À venir",
    },
    soon: {
      en: "Soon",
      fr: "Bientôt",
    },
    compliant: {
      en: "Compliant",
      fr: "Conforme",
    },
    all: {
      en: "All",
      fr: "Tous",
    },
    showAll: {
      en: "Show All",
      fr: "Tout afficher",
    },
    search: {
      en: "Search by name, serial number, location...",
      fr: "Rechercher par nom, numéro de série, emplacement...",
    },
    results: {
      en: "result",
      fr: "résultat",
    },
    resultsPlural: {
      en: "results",
      fr: "résultats",
    },
    loading: {
      en: "Loading...",
      fr: "Chargement...",
    },
    noResults: {
      en: "No results",
      fr: "Aucun résultat",
    },
    reset: {
      en: "Reset",
      fr: "Réinitialiser",
    },
    equipment: {
      en: "Equipment",
      fr: "Équipement",
    },
    category: {
      en: "Category",
      fr: "Catégorie",
    },
    location: {
      en: "Location",
      fr: "Emplacement",
    },
    nextInspection: {
      en: "Next Due",
      fr: "Prochaine",
    },
    status: {
      en: "Status",
      fr: "Statut",
    },
    actions: {
      en: "Actions",
      fr: "Actions",
    },
    inspection: {
      en: "Inspection",
      fr: "Inspection",
    },
    details: {
      en: "Details",
      fr: "Détails",
    },
    archive: {
      en: "Archive",
      fr: "Archiver",
    },
    archived: {
      en: "Schedule archived successfully",
      fr: "Calendrier archivé avec succès",
    },
    uncategorized: {
      en: "Uncategorized",
      fr: "Non catégorisé",
    },
    notSpecified: {
      en: "Not specified",
      fr: "Non spécifié",
    },
    serialNumber: {
      en: "Serial Number",
      fr: "Numéro de série",
    },
    interval: {
      en: "Interval",
      fr: "Intervalle",
    },
    months: {
      en: "months",
      fr: "mois",
    },
    lastInspection: {
      en: "Last Inspection",
      fr: "Dernière inspection",
    },
    assignedInspector: {
      en: "Assigned Inspector",
      fr: "Inspecteur attitré",
    },
    notes: {
      en: "Notes",
      fr: "Notes",
    },
    error: {
      loadingFailed: {
        en: "Failed to load schedules",
        fr: "Échec du chargement des calendriers",
      },
    },
  },

  // ============================================================================
  // VGP REPORT
  // ============================================================================
  vgpReport: {
    pageTitle: {
      en: "VGP DIRECCTE Report",
      fr: "Rapport VGP DIRECCTE",
    },
    pageSubtitle: {
      en: "Verify data before official report generation",
      fr: "Vérifiez les données avant génération du rapport officiel",
    },
    reportPeriod: {
      en: "Report Period",
      fr: "Période du Rapport",
    },
    quickPeriods: {
      en: "Quick Periods",
      fr: "Périodes Rapides",
    },
    lastMonth: {
      en: "Last Month",
      fr: "Dernier Mois",
    },
    lastQuarter: {
      en: "Last Quarter",
      fr: "Dernier Trimestre",
    },
    lastYear: {
      en: "Last Year",
      fr: "Dernière Année",
    },
    allData: {
      en: "All Data",
      fr: "Toutes les Données",
    },
    startDate: {
      en: "Start Date",
      fr: "Date de Début",
    },
    endDate: {
      en: "End Date",
      fr: "Date de Fin",
    },
    total: {
      en: "Total",
      fr: "Total",
    },
    compliant: {
      en: "Compliant",
      fr: "Conformes",
    },
    conditional: {
      en: "Conditional",
      fr: "Conditionnels",
    },
    nonCompliant: {
      en: "Non Compliant",
      fr: "Non Conformes",
    },
    noCertificate: {
      en: "No Certificate",
      fr: "Sans Certificat",
    },
    compliance: {
      en: "Compliance",
      fr: "Conformité",
    },
    previewData: {
      en: "Data Preview",
      fr: "Prévisualisation des Données",
    },
    inspection: {
      en: "inspection",
      fr: "inspection",
    },
    inspections: {
      en: "inspections",
      fr: "inspections",
    },
    exportCSV: {
      en: "Export CSV",
      fr: "Exporter CSV",
    },
    downloading: {
      en: "Downloading CSV...",
      fr: "Téléchargement CSV...",
    },
    loadingInspections: {
      en: "Loading inspections...",
      fr: "Chargement des inspections...",
    },
    noInspections: {
      en: "No inspections found for this period",
      fr: "Aucune inspection trouvée pour cette période",
    },
    modifyDates: {
      en: "Modify the dates or add VGP inspections",
      fr: "Modifiez les dates ou ajoutez des inspections VGP",
    },
    equipment: {
      en: "Equipment",
      fr: "Équipement",
    },
    date: {
      en: "Date",
      fr: "Date",
    },
    inspector: {
      en: "Inspector",
      fr: "Inspecteur",
    },
    company: {
      en: "Company",
      fr: "Organisme",
    },
    certificate: {
      en: "Certificate",
      fr: "Certificat",
    },
    result: {
      en: "Result",
      fr: "Résultat",
    },
    nextInspection: {
      en: "Next",
      fr: "Prochaine",
    },
    yes: {
      en: "Yes",
      fr: "Oui",
    },
    no: {
      en: "No",
      fr: "Non",
    },
    viewPDF: {
      en: "View PDF",
      fr: "Voir PDF",
    },
    pagination: {
      en: "Page",
      fr: "Page",
    },
    of: {
      en: "of",
      fr: "sur",
    },
    previous: {
      en: "Previous",
      fr: "Précédent",
    },
    next: {
      en: "Next",
      fr: "Suivant",
    },
    downloadCSV: {
      en: "Download CSV (Raw Data)",
      fr: "Télécharger CSV (Données Brutes)",
    },
    generatePDF: {
      en: "Generate PDF Report (Official)",
      fr: "Générer Rapport PDF (Officiel)",
    },
    generating: {
      en: "Generating...",
      fr: "Génération en cours...",
    },
    reportContents: {
      en: "Report Contents",
      fr: "Contenu du Rapport",
    },
    companyInfo: {
      en: "Company information (name, address, SIRET)",
      fr: "Informations de l'entreprise (nom, adresse, SIRET)",
    },
    compliancySummary: {
      en: "Compliance summary with statistics",
      fr: "Résumé de conformité avec statistiques",
    },
    detailedList: {
      en: "Detailed list of all inspections (equipment, inspector, result)",
      fr: "Liste détaillée de toutes les inspections (équipement, inspecteur, résultat)",
    },
    certificateNumbers: {
      en: "Certificate numbers and next inspection dates",
      fr: "Numéros de certificat et dates de prochaines inspections",
    },
    professionalFormat: {
      en: "Professional format compliant with DIRECCTE",
      fr: "Format professionnel conforme DIRECCTE",
    },
    errors: {
      selectDates: {
        en: "Please select start and end dates",
        fr: "Veuillez sélectionner les dates de début et de fin",
      },
      noData: {
        en: "No inspections available for this date range",
        fr: "Aucune inspection disponible pour cette plage de dates",
      },
      exportFailed: {
        en: "Export failed",
        fr: "L'export a échoué",
      },
    },
    success: {
      downloaded: {
        en: "Report generated and downloaded successfully",
        fr: "Rapport généré et téléchargé avec succès",
      },
    },
  },

  // ============================================================================
  // VGP INSPECTIONS HISTORY (EXPANDED)
  // ============================================================================
  vgpInspections: {
    pageTitle: {
      en: "VGP Inspection History",
      fr: "Historique des Inspections VGP",
    },
    inspectionsFound: {
      en: "inspection found",
      fr: "inspection trouvée",
    },
    inspectionsFoundPlural: {
      en: "inspections found",
      fr: "inspections trouvées",
    },
    search: {
      en: "Search",
      fr: "Rechercher",
    },
    searchPlaceholder: {
      en: "Equipment or inspector",
      fr: "Équipement ou inspecteur",
    },
    result: {
      en: "Result",
      fr: "Résultat",
    },
    all: {
      en: "All",
      fr: "Tous",
    },
    resultPassed: {
      en: "Passed",
      fr: "Conforme",
    },
    resultConditional: {
      en: "Conditional",
      fr: "Conditionnel",
    },
    resultFailed: {
      en: "Failed",
      fr: "Non Conforme",
    },
    startDate: {
      en: "Start date",
      fr: "Date début",
    },
    endDate: {
      en: "End date",
      fr: "Date fin",
    },
    equipment: {
      en: "Equipment",
      fr: "Équipement",
    },
    date: {
      en: "Date",
      fr: "Date",
    },
    inspector: {
      en: "Inspector",
      fr: "Inspecteur",
    },
    company: {
      en: "Company",
      fr: "Société",
    },
    certificate: {
      en: "Certificate",
      fr: "Certificat",
    },
    nextInspection: {
      en: "Next",
      fr: "Prochaine",
    },
    category: {
      en: "Category",
      fr: "Catégorie",
    },
    serialNumber: {
      en: "S/N",
      fr: "S/N",
    },
    exportCSV: {
      en: "Export CSV",
      fr: "Exporter CSV",
    },
    noResults: {
      en: "No inspections found",
      fr: "Aucune inspection trouvée",
    },
    viewPDF: {
      en: "View PDF",
      fr: "Voir PDF",
    },
    noCertificate: {
      en: "None",
      fr: "Aucun",
    },
    pageOf: {
      en: "Page {current} of {total}",
      fr: "Page {current} sur {total}",
    },
    previous: {
      en: "Previous",
      fr: "Précédent",
    },
    next: {
      en: "Next",
      fr: "Suivant",
    },
    loading: {
      en: "Loading inspections...",
      fr: "Chargement des inspections...",
    },
    exportError: {
      en: "Export error",
      fr: "Erreur lors de l'export",
    },
  },

  // ============================================================================
  // VGP SCHEDULE MODAL (Add Schedule)
  // ============================================================================
  vgpScheduleModal: {
    title: {
      en: "Add VGP Monitoring",
      fr: "Ajouter Surveillance VGP",
    },
    subtitle: {
      en: "Configure periodic inspections for this equipment",
      fr: "Configurer les vérifications périodiques pour cet équipement",
    },
    serialNumber: {
      en: "Serial No.",
      fr: "N° Série",
    },
    category: {
      en: "Category",
      fr: "Catégorie",
    },
    validationErrors: {
      en: "Validation errors:",
      fr: "Erreurs de validation:",
    },
    intervalLabel: {
      en: "Inspection Interval",
      fr: "Intervalle de Vérification",
    },
    interval6Months: {
      en: "6 months (Semi-annual)",
      fr: "6 mois (Semestriel)",
    },
    interval12Months: {
      en: "12 months (Annual)",
      fr: "12 mois (Annuel)",
    },
    interval24Months: {
      en: "24 months (Biennial)",
      fr: "24 mois (Biennal)",
    },
    intervalHelp: {
      en: "Inspection frequency according to DIRECCTE regulations",
      fr: "Fréquence des inspections selon la réglementation DIRECCTE",
    },
    lastInspectionDate: {
      en: "Last Inspection Date",
      fr: "Date de Dernière Inspection",
    },
    lastInspectionHelp: {
      en: "Date of last VGP inspection performed",
      fr: "Date de la dernière vérification VGP effectuée",
    },
    nextInspectionDue: {
      en: "Next Inspection Due:",
      fr: "Prochaine Inspection Due:",
    },
    daysFromToday: {
      en: "days from today",
      fr: "jours à partir d'aujourd'hui",
    },
    createdBy: {
      en: "Created by",
      fr: "Créé par",
    },
    createdByPlaceholder: {
      en: "Ex: Fleet Manager - John Smith",
      fr: "Ex: Chef de Parc - Jean Dupont",
    },
    createdByHelp: {
      en: "Person who configured this monitoring",
      fr: "Responsable ayant configuré cette surveillance",
    },
    notes: {
      en: "Notes",
      fr: "Notes",
    },
    notesPlaceholder: {
      en: "Context, reason for monitoring, observations...",
      fr: "Contexte, raison de la surveillance, observations...",
    },
    notesHelp: {
      en: "Additional notes about monitoring setup",
      fr: "Notes supplémentaires sur la configuration de cette surveillance",
    },
    cancel: {
      en: "Cancel",
      fr: "Annuler",
    },
    submit: {
      en: "Activate VGP Monitoring",
      fr: "Activer Surveillance VGP",
    },
    submitting: {
      en: "Saving...",
      fr: "Enregistrement...",
    },
    requiredFields: {
      en: "Required fields",
      fr: "Champs obligatoires",
    },
    errorIntervalRequired: {
      en: "Inspection interval is required",
      fr: "Intervalle de vérification est requis",
    },
    errorDateRequired: {
      en: "Last inspection date is required",
      fr: "Date de dernière inspection est requise",
    },
    errorDateFuture: {
      en: "Last inspection date cannot be in the future",
      fr: "La date de dernière inspection ne peut pas être dans le futur",
    },
    errorDateTooOld: {
      en: "Last inspection date seems too old (more than 5 years)",
      fr: "La date de dernière inspection semble trop ancienne (plus de 5 ans)",
    },
    errorCreatedByRequired: {
      en: "Created by field is required",
      fr: "Le champ \"Créé par\" est requis",
    },
    errorEquipmentInvalid: {
      en: "Invalid equipment",
      fr: "Équipement invalide",
    },
    errorCreationFailed: {
      en: "Failed to create VGP schedule",
      fr: "Échec de la création du calendrier VGP",
    },
    errorGeneric: {
      en: "An error occurred while creating the schedule",
      fr: "Une erreur est survenue lors de la création du calendrier",
    },
  },

  // ============================================================================
  // VGP EDIT MODAL (Edit Schedule)
  // ============================================================================
  vgpEditModal: {
    title: {
      en: "Edit Schedule",
      fr: "Modifier le calendrier",
    },
    equipment: {
      en: "Equipment",
      fr: "Équipement",
    },
    nextDueDate: {
      en: "Next due date",
      fr: "Prochaine échéance",
    },
    notes: {
      en: "Notes",
      fr: "Notes",
    },
    notesPlaceholder: {
      en: "Add notes...",
      fr: "Ajoutez des notes...",
    },
    reasonForChange: {
      en: "Reason for date change",
      fr: "Raison du changement de date",
    },
    reasonPlaceholder: {
      en: "Ex: Extension granted by inspector",
      fr: "Ex: Extension accordée par l'inspecteur",
    },
    reasonHelp: {
      en: "Required for DIRECCTE compliance",
      fr: "Requis pour la conformité DIRECCTE",
    },
    cancel: {
      en: "Cancel",
      fr: "Annuler",
    },
    save: {
      en: "Save",
      fr: "Enregistrer",
    },
    saving: {
      en: "Saving...",
      fr: "Enregistrement...",
    },
    errorReasonRequired: {
      en: "Reason required to change date",
      fr: "Raison requise pour modifier la date",
    },
    errorUpdateFailed: {
      en: "Update failed",
      fr: "Échec de la mise à jour",
    },
  },

  // ============================================================================
  // DASHBOARD (MAIN LANDING PAGE)
  // ============================================================================
  dashboard: {
    title: {
      en: "Real-time fleet overview",
      fr: "Aperçu en temps réel de votre parc d'équipements",
    },
    logout: {
      en: "Logout",
      fr: "Déconnexion",
    },
    // Critical VGP Alert
    vgpOverdueAlert: {
      en: "VGP Equipment Overdue",
      fr: "Équipement VGP en Retard",
    },
    vgpOverdueAlertPlural: {
      en: "VGP Equipment Overdue",
      fr: "Équipements VGP en Retard",
    },
    vgpRiskSanctions: {
      en: "Risk of DIRECCTE sanctions",
      fr: "Risque de sanctions DIRECCTE",
    },
    handleNow: {
      en: "Handle now",
      fr: "Traiter maintenant",
    },
    // Key Metrics
    equipmentLoss: {
      en: "Equipment Loss",
      fr: "Perte d'Équipements",
    },
    vsIndustry: {
      en: "vs industry",
      fr: "vs industrie",
    },
    savedThisYear: {
      en: "saved this year",
      fr: "économisés cette année",
    },
    vgpCompliance: {
      en: "VGP Compliance",
      fr: "Conformité VGP",
    },
    overdue: {
      en: "overdue",
      fr: "retard",
    },
    overduePlural: {
      en: "overdue",
      fr: "retards",
    },
    upcoming: {
      en: "upcoming",
      fr: "à venir",
    },
    utilizationRate: {
      en: "Utilization Rate",
      fr: "Taux d'Utilisation",
    },
    vsTarget: {
      en: "vs target",
      fr: "vs objectif",
    },
    inRental: {
      en: "in rental",
      fr: "en location",
    },
    // Stats Cards
    totalEquipment: {
      en: "Total Equipment",
      fr: "Total Équipements",
    },
    value: {
      en: "Value",
      fr: "Valeur",
    },
    scans7Days: {
      en: "Scans (7d)",
      fr: "Scans (7j)",
    },
    tracingActivity: {
      en: "Tracing activity",
      fr: "Activité de traçage",
    },
    utilization: {
      en: "Utilization",
      fr: "Utilisation",
    },
    // Quick Actions
    quickActions: {
      en: "Quick Actions",
      fr: "Actions Rapides",
    },
    quickActionsSubtitle: {
      en: "Common tasks to manage your fleet",
      fr: "Tâches courantes pour gérer votre parc",
    },
    addEquipment: {
      en: "Add Equipment",
      fr: "Ajouter Équipement",
    },
    generateQRCodes: {
      en: "Generate QR Codes",
      fr: "Générer QR Codes",
    },
    recordVGP: {
      en: "Record VGP",
      fr: "Enregistrer VGP",
    },
    launchAudit: {
      en: "Launch Audit",
      fr: "Lancer Audit",
    },
    // VGP Compliance Section
    vgpComplianceRegulatory: {
      en: "VGP Compliance (Regulatory)",
      fr: "Conformité VGP (Réglementaire)",
    },
    vgpComplianceSubtitle: {
      en: "Tracking mandatory inspections to avoid DIRECCTE sanctions",
      fr: "Suivi des inspections obligatoires pour éviter les sanctions DIRECCTE",
    },
    vgpOverdueLabel: {
      en: "Overdue",
      fr: "En Retard",
    },
    vgpOverdueDesc: {
      en: "Immediate sanction risk",
      fr: "Risque de sanction immédiat",
    },
    vgpUpcomingLabel: {
      en: "Upcoming (30d)",
      fr: "À venir (30j)",
    },
    vgpUpcomingDesc: {
      en: "Schedule before deadline",
      fr: "Planifier avant échéance",
    },
    schedule: {
      en: "Schedule",
      fr: "Planifier",
    },
    compliant: {
      en: "Compliant",
      fr: "Conformes",
    },
    inspectionsUpToDate: {
      en: "Inspections up to date",
      fr: "Inspections à jour",
    },
    accessVGPModule: {
      en: "Access VGP Module",
      fr: "Accéder au Module VGP",
    },
    // ROI Impact
    roiImpact: {
      en: "TraviXO ROI Impact",
      fr: "Impact ROI TraviXO",
    },
    lossesAvoided: {
      en: "Losses Avoided (vs 2%)",
      fr: "Pertes Évitées (vs 2%)",
    },
    thisYear: {
      en: "This year",
      fr: "Cette année",
    },
    auditGain: {
      en: "Audit Gain (75% faster)",
      fr: "Gain Audit (75% plus rapide)",
    },
    perQuarter: {
      en: "Per quarter",
      fr: "Par trimestre",
    },
    vgpSanctionsAvoided: {
      en: "VGP Sanctions Avoided",
      fr: "Sanctions VGP Évitées",
    },
    compliance100: {
      en: "100% compliance",
      fr: "Conformité 100%",
    },
    compliancePercent: {
      en: "compliance",
      fr: "conformité",
    },
    traviXOCost: {
      en: "TraviXO Cost",
      fr: "Coût TraviXO",
    },
    roi: {
      en: "ROI",
      fr: "ROI",
    },
    hours: {
      en: "hours",
      fr: "heures",
    },
  },

  // ============================================================================
  // NAVIGATION (SIDEBAR)
  // ============================================================================
  navigation: {
    dashboard: {
      en: "Dashboard",
      fr: "Tableau de Bord",
    },
    assets: {
      en: "Fleet",
      fr: "Parc",
    },
    vgp: {
      en: "VGP Compliance",
      fr: "VGP Compliance",
    },
    audits: {
      en: "Audits",
      fr: "Audits",
    },
    team: {
      en: "Team",
      fr: "Équipe",
    },
    settings: {
      en: "Settings",
      fr: "Paramètres",
    },
    subscription: {
      en: "Subscription",
      fr: "Abonnement",
    },
    vgpOverview: {
      en: "Overview",
      fr: "Vue d'ensemble",
    },
    vgpSchedules: {
      en: "Tracking",
      fr: "Suivi",
    },
    vgpReport: {
      en: "DIRECCTE Report",
      fr: "Rapport DIRECCTE",
    },
    vgpInspections: {
      en: "History",
      fr: "Historique",
    },
  },

  // ============================================================================
  // COMMON
  // ============================================================================
  common: {
    error: {
      en: "Error",
      fr: "Erreur",
    },
    success: {
      en: "Success",
      fr: "Succès",
    },
    loading: {
      en: "Loading",
      fr: "Chargement",
    },
    save: {
      en: "Save",
      fr: "Enregistrer",
    },
    cancel: {
      en: "Cancel",
      fr: "Annuler",
    },
    delete: {
      en: "Delete",
      fr: "Supprimer",
    },
    edit: {
      en: "Edit",
      fr: "Modifier",
    },
    close: {
      en: "Close",
      fr: "Fermer",
    },
  },
} as const;

/**
 * Get translation string safely
 * Usage: t('subscription.pageTitle')
 */
export function getTranslation(key: string, lang: Language): string {
  const keys = key.split(".");
  let current: any = translations;

  for (const k of keys) {
    current = current[k];
    if (!current) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  return current[lang] || current.en || key;
}

/**
 * Create language-scoped translation helper
 * Usage in component: const t = createTranslator('en')
 * Then: t('subscription.pageTitle')
 */
export function createTranslator(lang: Language) {
  return (key: string): string => getTranslation(key, lang);
}