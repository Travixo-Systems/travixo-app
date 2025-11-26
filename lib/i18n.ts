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
    current: {
      en: "Current",
      fr: "Actuel",
    },
    recommended: {
      en: "Recommended",
      fr: "Recommandé",
    },
    selectPlan: {
      en: "Select Plan",
      fr: "Sélectionner le Plan",
    },
    updating: {
      en: "Updating...",
      fr: "Mise à jour...",
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
      en: "Assets Used",
      fr: "Équipements Utilisés",
    },
    trialEndsIn: {
      en: "Trial Ends In",
      fr: "Fin d'Essai Dans",
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
      en: "per year",
      fr: "par an",
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
      contactEnterprise: {
        en: "Please contact sales for Enterprise pricing: contact@travixosystems.com",
        fr: "Veuillez contacter les ventes pour les tarifs Entreprise : contact@travixosystems.com",
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
    noPlan: {
      en: "No Plan",
      fr: "Aucun Plan",
    },
    forMidSizeOps: {
      en: "For mid-size operations",
      fr: "Pour opérations moyennes",
    },
    forMidSizeOperations: {
      en: "For mid-size operations",
      fr: "Pour les opérations de taille moyenne",
    },
    customPricing: {
      en: "Custom pricing",
      fr: "Tarif sur mesure",
    },
    contactForQuote: {
      en: "Contact us for a quote",
      fr: "Contactez-nous pour un devis",
    },
    perYear: {
      en: "per year",
      fr: "par an",
    },
    or: {
      en: "or",
      fr: "ou",
    },
    orMonthly: {
      en: "or",
      fr: "ou",
    },
    month: {
      en: "month",
      fr: "mois",
    },
    loyaltyDiscount: {
      en: "-10% loyalty",
      fr: "-10% fidélité",
    },
    contactSales: {
      en: "Contact Sales",
      fr: "Contacter les Ventes",
    },
    unlimitedAssets: {
      en: "UNLIMITED ASSETS",
      fr: "ÉQUIPEMENTS ILLIMITÉS",
    },
    assetsLabel: {
      en: "ASSETS",
      fr: "ÉQUIPEMENTS",
    },
    onDemand: {
      en: "On-demand",
      fr: "Sur demande",
    },
    comingSoon: {
      en: "Coming Soon",
      fr: "Bientôt disponible",
    },
    enterpriseContactError: {
      en: "Please contact sales for Enterprise pricing: contact@travixosystems.com",
      fr: "Veuillez contacter les ventes pour les tarifs Enterprise : contact@travixosystems.com",
    },

    // Status badges
    status: {
      trialing: {
        en: "Trial",
        fr: "Essai",
      },
      active: {
        en: "Active",
        fr: "Actif",
      },
    },

    // Feature labels (all plan features)
    featureLabels: {
      qr_tracking: {
        en: "QR Code Tracking",
        fr: "Suivi par QR Code",
      },
      excel_import: {
        en: "Excel Import",
        fr: "Import Excel",
      },
      public_scanning: {
        en: "Public Scanning",
        fr: "Scan Public",
      },
      basic_reporting: {
        en: "Basic Reporting",
        fr: "Rapports de Base",
      },
      csv_export: {
        en: "CSV Export",
        fr: "Export CSV",
      },
      email_support: {
        en: "Email Support",
        fr: "Support Email",
      },
      vgp_compliance: {
        en: "VGP Compliance Automation",
        fr: "Automatisation de la Conformité VGP",
      },
      vgp_email_alerts: {
        en: "VGP Email Alerts",
        fr: "Alertes Email VGP",
      },
      multi_location: {
        en: "Multi-location Support",
        fr: "Support Multi-sites",
      },
      priority_support: {
        en: "Priority Support",
        fr: "Support Prioritaire",
      },
      dedicated_support: {
        en: "Dedicated Account Manager",
        fr: "Gestionnaire de Compte Dédié",
      },
      team_management: {
        en: "Team Management",
        fr: "Gestion d'Équipe",
      },
      digital_audits: {
        en: "Digital Inventory Audits",
        fr: "Audits d'Inventaire Numériques",
      },
      api_access: {
        en: "API Access",
        fr: "Accès API",
      },
      custom_branding: {
        en: "Custom Branding",
        fr: "Marque Personnalisée",
      },
      white_label: {
        en: "White-Label Branding",
        fr: "Marque Blanche",
      },
      custom_integrations: {
        en: "Custom Integrations",
        fr: "Intégrations Personnalisées",
      },
    },

    // On-demand feature tooltips
    tooltips: {
      digital_audits: {
        en: "Quarterly audits digitized. Contact us to enable - setup takes 1-2 weeks.",
        fr: "Audits trimestriels numérisés. Contactez-nous pour activer - configuration en 1-2 semaines.",
      },
      api_access: {
        en: "REST API for custom integrations. Contact us for API documentation and access.",
        fr: "API REST pour intégrations personnalisées. Contactez-nous pour la documentation API et l'accès.",
      },
      custom_branding: {
        en: "Custom logos and colors in reports. Contact us to configure.",
        fr: "Logos et couleurs personnalisés dans les rapports. Contactez-nous pour configurer.",
      },
      white_label: {
        en: "Full white-label branding. Contact us for setup.",
        fr: "Marque blanche complète. Contactez-nous pour la configuration.",
      },
      custom_integrations: {
        en: "ServiceNow, SAP, or custom ERP integrations. Built during implementation.",
        fr: "Intégrations ServiceNow, SAP ou ERP personnalisées. Construites pendant la mise en œuvre.",
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
  // ASSETS PAGE
  // ============================================================================
assets: {
  // Page Header
  pageTitle: {
    en: "Equipment",
    fr: "Équipements",
  },
  pageSubtitle: {
    en: "Manage and track your equipment inventory",
    fr: "Gérez et suivez votre parc d'équipements",
  },
  bulkQrCodes: {
    en: "Bulk QR Codes",
    fr: "QR Codes en Masse",
  },

  // Empty State
  noAssets: {
    en: "No equipment",
    fr: "Aucun équipement",
  },
  noAssetsDescription: {
    en: "Get started by adding your first piece of equipment.",
    fr: "Commencez par ajouter votre premier équipement.",
  },

  // Search & Filters
  searchPlaceholder: {
    en: "Search by name, serial, location...",
    fr: "Rechercher par nom, série, emplacement...",
  },
  allStatus: {
    en: "All Status",
    fr: "Tous les Statuts",
  },
  allCategories: {
    en: "All Categories",
    fr: "Toutes les Catégories",
  },
  noAssetsFound: {
    en: "No equipment found",
    fr: "Aucun équipement trouvé",
  },
  adjustFilters: {
    en: "Try adjusting your search or filters",
    fr: "Essayez d'ajuster votre recherche ou vos filtres",
  },

  // Pagination
  showing: {
    en: "Showing",
    fr: "Affichage",
  },
  to: {
    en: "to",
    fr: "à",
  },
  of: {
    en: "of",
    fr: "sur",
  },
  results: {
    en: "results",
    fr: "résultats",
  },
  previous: {
    en: "Previous",
    fr: "Précédent",
  },
  next: {
    en: "Next",
    fr: "Suivant",
  },

  // Table Headers
  tableHeaderName: {
    en: "Name",
    fr: "Nom",
  },
  tableHeaderSerial: {
    en: "Serial",
    fr: "N° Série",
  },
  tableHeaderStatus: {
    en: "Status",
    fr: "Statut",
  },
  tableHeaderLocation: {
    en: "Location",
    fr: "Emplacement",
  },
  tableHeaderActions: {
    en: "Actions",
    fr: "Actions",
  },

  // Status Values
  statusAvailable: {
    en: "Available",
    fr: "Disponible",
  },
  statusInUse: {
    en: "In Use",
    fr: "En Utilisation",
  },
  statusMaintenance: {
    en: "Maintenance",
    fr: "Maintenance",
  },
  statusRetired: {
    en: "Retired",
    fr: "Retiré",
  },

  // Action Tooltips
  tooltipAddVgp: {
    en: "Add VGP Schedule",
    fr: "Ajouter Planning VGP",
  },
  tooltipViewQr: {
    en: "View QR Code",
    fr: "Voir QR Code",
  },
  tooltipEdit: {
    en: "Edit",
    fr: "Modifier",
  },
  tooltipDelete: {
    en: "Delete",
    fr: "Supprimer",
  },

  // Add Equipment Modal
  addAssetTitle: {
    en: "Add New Equipment",
    fr: "Ajouter un Équipement",
  },
  labelAssetName: {
    en: "Equipment Name",
    fr: "Nom de l'Équipement",
  },
  labelSerialNumber: {
    en: "Serial Number",
    fr: "Numéro de Série",
  },
  labelCurrentLocation: {
    en: "Current Location",
    fr: "Emplacement Actuel",
  },
  labelStatus: {
    en: "Status",
    fr: "Statut",
  },
  labelPurchaseDate: {
    en: "Purchase Date",
    fr: "Date d'Achat",
  },
  labelPurchasePrice: {
    en: "Purchase Price",
    fr: "Prix d'Achat",
  },
  labelCurrentValue: {
    en: "Current Value",
    fr: "Valeur Actuelle",
  },
  labelDescription: {
    en: "Description",
    fr: "Description",
  },

  // Placeholders
  placeholderAssetName: {
    en: "e.g., Excavator CAT 320",
    fr: "ex: Pelleteuse CAT 320",
  },
  placeholderSerial: {
    en: "e.g., SN123456",
    fr: "ex: SN123456",
  },
  placeholderLocation: {
    en: "e.g., Warehouse A",
    fr: "ex: Entrepôt A",
  },
  placeholderDescription: {
    en: "Additional information about this equipment...",
    fr: "Informations supplémentaires sur cet équipement...",
  },
  placeholderPrice: {
    en: "0.00",
    fr: "0,00",
  },

  // Buttons
  buttonCancel: {
    en: "Cancel",
    fr: "Annuler",
  },
  buttonAdding: {
    en: "Adding...",
    fr: "Ajout...",
  },
  buttonAddAsset: {
    en: "Add Equipment",
    fr: "Ajouter",
  },
  buttonSaving: {
    en: "Saving...",
    fr: "Enregistrement...",
  },
  buttonSaveChanges: {
    en: "Save Changes",
    fr: "Enregistrer",
  },

  // Edit Equipment Modal
  editAssetTitle: {
    en: "Edit Equipment",
    fr: "Modifier l'Équipement",
  },

  // Import Modal
  importFromExcel: {
    en: "Import from Excel",
    fr: "Importer depuis Excel",
  },
  importTitle: {
    en: "Import Equipment from Excel/CSV",
    fr: "Importer des Équipements depuis Excel/CSV",
  },
  importDropzone: {
    en: "Drop your file here or click to browse",
    fr: "Déposez votre fichier ici ou cliquez pour parcourir",
  },
  importSupportedFormats: {
    en: "Supports .xlsx, .xls, .csv",
    fr: "Formats supportés : .xlsx, .xls, .csv",
  },
  importProcessing: {
    en: "Processing...",
    fr: "Traitement...",
  },
  importPreview: {
    en: "Preview Import",
    fr: "Prévisualiser l'Import",
  },
  importSmartDetection: {
    en: "Smart Column Detection",
    fr: "Détection Intelligente des Colonnes",
  },
  importSmartDetectionDesc: {
    en: "We automatically detect columns like \"Name\", \"Serial Number\", \"Location\", etc. Even if your headers are different, we'll figure it out!",
    fr: "Nous détectons automatiquement les colonnes comme \"Nom\", \"Numéro de Série\", \"Emplacement\", etc. Même si vos en-têtes sont différents, nous nous en chargeons !",
  },
  importValidRows: {
    en: "Valid Rows",
    fr: "Lignes Valides",
  },
  importInvalidRows: {
    en: "Invalid Rows",
    fr: "Lignes Invalides",
  },
  importTotalRows: {
    en: "Total Rows",
    fr: "Total Lignes",
  },
  importDetectedColumns: {
    en: "Detected Columns:",
    fr: "Colonnes Détectées :",
  },
  importChooseDifferent: {
    en: "Choose Different File",
    fr: "Choisir un Autre Fichier",
  },
  importImporting: {
    en: "Importing...",
    fr: "Import en cours...",
  },
  importCount: {
    en: "Import",
    fr: "Importer",
  },
  importEquipmentUnit: {
    en: "items",
    fr: "équipements",
  },

  // Toast Messages
  toastAssetAdded: {
    en: "Equipment added successfully!",
    fr: "Équipement ajouté avec succès !",
  },
  toastAssetUpdated: {
    en: "Equipment updated successfully!",
    fr: "Équipement mis à jour avec succès !",
  },
  toastImportSuccess: {
    en: "items imported successfully!",
    fr: "équipements importés avec succès !",
  },
  toastVgpScheduleCreated: {
    en: "VGP schedule created! Check the VGP Compliance dashboard.",
    fr: "Planning VGP créé ! Consultez le tableau de bord Conformité VGP.",
  },

  // Error Messages
  errorNotAuthenticated: {
    en: "Not authenticated",
    fr: "Non authentifié",
  },
  errorNoOrganization: {
    en: "No organization found. Please complete your profile setup.",
    fr: "Aucune organisation trouvée. Veuillez compléter la configuration de votre profil.",
  },
  errorAddFailed: {
    en: "Failed to add equipment",
    fr: "Échec de l'ajout de l'équipement",
  },
  errorUpdateFailed: {
    en: "Failed to update equipment",
    fr: "Échec de la mise à jour de l'équipement",
  },
  errorImportFailed: {
    en: "Failed to import equipment",
    fr: "Échec de l'import des équipements",
  },
  errorProcessFailed: {
    en: "Failed to process file",
    fr: "Échec du traitement du fichier",
  },
  errorFileEmpty: {
    en: "File is empty",
    fr: "Le fichier est vide",
  },
  errorNameRequired: {
    en: "Name is required",
    fr: "Le nom est requis",
  },
  errorInvalidData: {
    en: "Invalid data",
    fr: "Données invalides",
  },
  errorDeleteFailed: {
    en: "Failed to delete equipment",
    fr: "Échec de la suppression de l'équipement",
  },
  errorSelectAtLeastOne: {
    en: "Please select at least one item",
    fr: "Veuillez sélectionner au moins un élément",
  },
  errorQrGenerationFailed: {
    en: "Failed to generate QR codes",
    fr: "Échec de la génération des QR codes",
  },

  // Delete Dialog
  deleteTitle: {
    en: "Delete Equipment",
    fr: "Supprimer l'Équipement",
  },
  deleteWarning: {
    en: "This action cannot be undone.",
    fr: "Cette action est irréversible.",
  },
  deleteConfirmation: {
    en: "Are you sure you want to delete",
    fr: "Êtes-vous sûr de vouloir supprimer",
  },
  deleteConsequence: {
    en: "This will permanently remove the equipment and its QR code.",
    fr: "Cela supprimera définitivement l'équipement et son QR code.",
  },
  buttonDelete: {
    en: "Delete",
    fr: "Supprimer",
  },
  buttonDeleting: {
    en: "Deleting...",
    fr: "Suppression...",
  },
  toastDeleted: {
    en: "Equipment deleted successfully",
    fr: "Équipement supprimé avec succès",
  },

  // QR Code Modal
  qrCodeTitle: {
    en: "QR Code",
    fr: "QR Code",
  },
  qrScanInstruction: {
    en: "Scan this code to view equipment details",
    fr: "Scannez ce code pour voir les détails de l'équipement",
  },
  qrDownload: {
    en: "Download QR Code",
    fr: "Télécharger le QR Code",
  },

  // QR Codes Page
  qrGeneratorTitle: {
    en: "QR Code Generator",
    fr: "Générateur de QR Codes",
  },
  qrGeneratorSubtitle: {
    en: "Generate and print QR code labels for your equipment",
    fr: "Générez et imprimez des étiquettes QR pour vos équipements",
  },
  backToEquipment: {
    en: "Back to Equipment",
    fr: "Retour aux Équipements",
  },
  addEquipmentFirst: {
    en: "Add some equipment first to generate QR codes.",
    fr: "Ajoutez d'abord des équipements pour générer des QR codes.",
  },

  // Bulk QR Generator
  bulkQrTitle: {
    en: "Bulk QR Code Generator",
    fr: "Générateur de QR Codes en Masse",
  },
  bulkQrSubtitle: {
    en: "Select equipment to generate printable QR codes (30 per page)",
    fr: "Sélectionnez les équipements pour générer des QR codes imprimables (30 par page)",
  },
  selectAll: {
    en: "Select All",
    fr: "Tout Sélectionner",
  },
  clearSelection: {
    en: "Clear",
    fr: "Effacer",
  },
  exportCsv: {
    en: "Export CSV",
    fr: "Exporter CSV",
  },
  itemSelected: {
    en: "item selected",
    fr: "élément sélectionné",
  },
  itemsSelected: {
    en: "items selected",
    fr: "éléments sélectionnés",
  },
  pages: {
    en: "pages",
    fr: "pages",
  },
  generating: {
    en: "Generating...",
    fr: "Génération...",
  },
  generatePdf: {
    en: "Generate PDF",
    fr: "Générer PDF",
  },
  qrCategory: {
    en: "Category",
    fr: "Catégorie",
  },
  toastCsvExported: {
    en: "CSV exported successfully!",
    fr: "CSV exporté avec succès !",
  },
  toastQrGenerated: {
    en: "QR codes generated!",
    fr: "QR codes générés !",
  },

  // Print Instructions
  printInstructionsTitle: {
    en: "Print Instructions",
    fr: "Instructions d'Impression",
  },
  printStep1: {
    en: "Select the equipment you want to print QR codes for",
    fr: "Sélectionnez les équipements pour lesquels vous voulez imprimer des QR codes",
  },
  printStep2: {
    en: "Click \"Generate PDF\" to download a printable PDF (30 QR codes per A4 page)",
    fr: "Cliquez sur \"Générer PDF\" pour télécharger un PDF imprimable (30 QR codes par page A4)",
  },
  printStep3: {
    en: "Print on adhesive label sheets (recommended: Avery 5160 or equivalent)",
    fr: "Imprimez sur des feuilles d'étiquettes adhésives (recommandé : Avery 5160 ou équivalent)",
  },
  printStep4: {
    en: "Cut and stick labels on your equipment",
    fr: "Découpez et collez les étiquettes sur vos équipements",
  },
  printStep5: {
    en: "Use \"Export CSV\" to get a spreadsheet of all selected equipment with URLs",
    fr: "Utilisez \"Exporter CSV\" pour obtenir un tableur de tous les équipements sélectionnés avec URLs",
  },
  proTip: {
    en: "Pro Tip",
    fr: "Astuce",
  },
  proTipText: {
    en: "Each QR code links directly to the equipment tracking page",
    fr: "Chaque QR code renvoie directement vers la page de suivi de l'équipement",
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