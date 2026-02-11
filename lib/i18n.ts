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
      past_due: {
        en: "Payment Overdue",
        fr: "Paiement en retard",
      },
      cancelled: {
        en: "Cancelled",
        fr: "Annulé",
      },
    },

    // Stripe billing
    manageBilling: {
      en: "Manage Billing",
      fr: "Gérer la facturation",
    },
    subscribe: {
      en: "Subscribe",
      fr: "S'abonner",
    },
    changePlan: {
      en: "Change Plan",
      fr: "Changer de forfait",
    },
    checkoutSuccess: {
      en: "Subscription activated successfully!",
      fr: "Abonnement activé avec succès !",
    },
    checkoutCanceled: {
      en: "Payment canceled",
      fr: "Paiement annulé",
    },
    pastDueWarning: {
      en: "Your payment has failed. Please update your payment method to avoid service suspension.",
      fr: "Votre paiement a échoué. Veuillez mettre à jour votre moyen de paiement pour éviter la suspension du service.",
    },
    renewalDate: {
      en: "Renewal",
      fr: "Renouvellement",
    },
    securePayment: {
      en: "Secure payment via Stripe. Bank card and SEPA accepted.",
      fr: "Paiement sécurisé par Stripe. Carte bancaire et prélèvement SEPA acceptés.",
    },
    cancelAnytime: {
      en: "Cancel anytime from the billing portal.",
      fr: "Annulation possible à tout moment depuis le portail de facturation.",
    },
    loading: {
      en: "Loading...",
      fr: "Chargement...",
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
    detailsModal: {
      title: {
        en: "Schedule Details",
        fr: "Détails du calendrier",
      },
      overdueBy: {
        en: "Overdue by {days} days",
        fr: "En retard de {days} jours",
      },
      daysUntil: {
        en: "{days} days until due",
        fr: "{days} jours avant l'échéance",
      },
      inspectionSchedule: {
        en: "Inspection Schedule",
        fr: "Calendrier d'inspection",
      },
      interval: {
        en: "Interval",
        fr: "Intervalle",
      },
      months: {
        en: "months",
        fr: "mois",
      },
      nextInspection: {
        en: "Next Inspection",
        fr: "Prochaine inspection",
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
      qrCode: {
        en: "QR Code",
        fr: "Code QR",
      },
      close: {
        en: "Close",
        fr: "Fermer",
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
      fr: 'Le champ "Créé par" est requis',
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
    tableHeaderCategory: {
      en: "Category",
      fr: "Catégorie",
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
      en: 'We automatically detect columns like "Name", "Serial Number", "Location", etc. Even if your headers are different, we\'ll figure it out!',
      fr: 'Nous détectons automatiquement les colonnes comme "Nom", "Numéro de Série", "Emplacement", etc. Même si vos en-têtes sont différents, nous nous en chargeons !',
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
      en: 'Click "Generate PDF" to download a printable PDF (30 QR codes per A4 page)',
      fr: 'Cliquez sur "Générer PDF" pour télécharger un PDF imprimable (30 QR codes par page A4)',
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
      en: 'Use "Export CSV" to get a spreadsheet of all selected equipment with URLs',
      fr: 'Utilisez "Exporter CSV" pour obtenir un tableur de tous les équipements sélectionnés avec URLs',
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
  // SETTINGS
  // ============================================================================
  settings: {
    // Page Header
    pageTitle: {
      en: "Settings",
      fr: "Paramètres",
    },
    pageSubtitle: {
      en: "Manage your organization settings",
      fr: "Gérez les paramètres de votre organisation",
    },

    // Tabs
    tabs: {
      organization: {
        en: "Organization",
        fr: "Organisation",
      },
      branding: {
        en: "Branding",
        fr: "Identité Visuelle",
      },
      notifications: {
        en: "Notifications",
        fr: "Notifications",
      },
      subscription: {
        en: "Subscription",
        fr: "Abonnement",
      },
    },

    // Organization Profile
    organization: {
      title: {
        en: "Organization Profile",
        fr: "Profil de l'Organisation",
      },
      subtitle: {
        en: "Basic information about your company",
        fr: "Informations de base de votre entreprise",
      },
      // Form Fields
      companyName: {
        en: "Company Name",
        fr: "Nom de l'entreprise",
      },
      companyNamePlaceholder: {
        en: "TraviXO Systems",
        fr: "TraviXO Systems",
      },
      logo: {
        en: "Company Logo",
        fr: "Logo de l'entreprise",
      },
      logoUpload: {
        en: "Upload Logo",
        fr: "Télécharger un logo",
      },
      logoRemove: {
        en: "Remove Logo",
        fr: "Supprimer le logo",
      },
      logoHelp: {
        en: "Used in reports and emails. PNG or JPG format, max 2MB",
        fr: "Utilisé dans les rapports et les emails. Format PNG ou JPG, max 2Mo",
      },
      website: {
        en: "Website",
        fr: "Site web",
      },
      websitePlaceholder: {
        en: "https://www.yourcompany.com",
        fr: "https://www.votreentreprise.fr",
      },
      phone: {
        en: "Phone",
        fr: "Téléphone",
      },
      phonePlaceholder: {
        en: "+33 1 23 45 67 89",
        fr: "+33 1 23 45 67 89",
      },
      address: {
        en: "Address",
        fr: "Adresse",
      },
      addressPlaceholder: {
        en: "123 Main Street",
        fr: "123 Rue de la République",
      },
      city: {
        en: "City",
        fr: "Ville",
      },
      cityPlaceholder: {
        en: "Paris",
        fr: "Paris",
      },
      postalCode: {
        en: "Postal Code",
        fr: "Code postal",
      },
      postalCodePlaceholder: {
        en: "75001",
        fr: "75001",
      },
      // Countries
      country: {
        en: "Country",
        fr: "Pays",
      },
      countryFrance: {
        en: "France",
        fr: "France",
      },
      countryBelgium: {
        en: "Belgium",
        fr: "Belgique",
      },
      countrySwitzerland: {
        en: "Switzerland",
        fr: "Suisse",
      },
      countryLuxembourg: {
        en: "Luxembourg",
        fr: "Luxembourg",
      },
      // Timezones
      timezone: {
        en: "Timezone",
        fr: "Fuseau horaire",
      },
      timezoneParis: {
        en: "Europe/Paris (GMT+1)",
        fr: "Europe/Paris (GMT+1)",
      },
      timezoneBrussels: {
        en: "Europe/Brussels (GMT+1)",
        fr: "Europe/Bruxelles (GMT+1)",
      },
      timezoneZurich: {
        en: "Europe/Zurich (GMT+1)",
        fr: "Europe/Zurich (GMT+1)",
      },
      // Currencies
      currency: {
        en: "Currency",
        fr: "Devise",
      },
      currencyEUR: {
        en: "Euro (EUR)",
        fr: "Euro (EUR)",
      },
      currencyUSD: {
        en: "US Dollar (USD)",
        fr: "Dollar US (USD)",
      },
      currencyGBP: {
        en: "Pound Sterling (GBP)",
        fr: "Livre Sterling (GBP)",
      },
      // Industry Sectors
      industrySector: {
        en: "Industry Sector",
        fr: "Secteur d'activité",
      },
      industrySectorPlaceholder: {
        en: "Equipment Rental",
        fr: "Location d'équipements",
      },
      industrySectorConstruction: {
        en: "Construction",
        fr: "Construction",
      },
      industrySectorRental: {
        en: "Equipment Rental",
        fr: "Location d'équipements",
      },
      industrySectorLogistics: {
        en: "Logistics",
        fr: "Logistique",
      },
      industrySectorManufacturing: {
        en: "Manufacturing",
        fr: "Fabrication",
      },
      industrySectorOther: {
        en: "Other",
        fr: "Autre",
      },
      // Company Sizes
      companySize: {
        en: "Company Size",
        fr: "Taille de l'entreprise",
      },
      companySizeSmall: {
        en: "1-10 employees",
        fr: "1-10 employés",
      },
      companySizeMedium: {
        en: "11-50 employees",
        fr: "11-50 employés",
      },
      companySizeLarge: {
        en: "51-200 employees",
        fr: "51-200 employés",
      },
      companySizeEnterprise: {
        en: "200+ employees",
        fr: "200+ employés",
      },
      // Actions
      save: {
        en: "Save Changes",
        fr: "Enregistrer les modifications",
      },
      cancel: {
        en: "Cancel",
        fr: "Annuler",
      },
      saving: {
        en: "Saving...",
        fr: "Enregistrement...",
      },
      // Messages
      saveSuccess: {
        en: "Organization settings saved successfully",
        fr: "Paramètres de l'organisation enregistrés avec succès",
      },
      saveError: {
        en: "Error saving settings",
        fr: "Erreur lors de l'enregistrement des paramètres",
      },
      uploadError: {
        en: "Error uploading logo",
        fr: "Erreur lors du téléchargement du logo",
      },
    },

    // Branding
    branding: {
      title: {
        en: "Branding",
        fr: "Identité Visuelle",
      },
      subtitle: {
        en: "Customize your interface colors",
        fr: "Personnalisez les couleurs de votre interface",
      },
      // Preview
      previewTitle: {
        en: "Preview",
        fr: "Aperçu",
      },
      previewSubtitle: {
        en: "Visualize your custom colors",
        fr: "Visualisez vos couleurs personnalisées",
      },
      previewCompliant: {
        en: "Compliant",
        fr: "Conforme",
      },
      previewWarning: {
        en: "Warning",
        fr: "Attention",
      },
      previewCritical: {
        en: "Critical",
        fr: "Critique",
      },
      // Colors
      colorsTitle: {
        en: "Color Palette",
        fr: "Palette de Couleurs",
      },
      colorsSubtitle: {
        en: "Professional industrial colors",
        fr: "Couleurs industrielles professionnelles",
      },
      colorPrimary: {
        en: "Primary Color",
        fr: "Couleur Principale",
      },
      colorPrimaryHelp: {
        en: "Used for headers and main elements",
        fr: "Utilisée pour les en-têtes et éléments principaux",
      },
      colorSecondary: {
        en: "Secondary Color",
        fr: "Couleur Secondaire",
      },
      colorSecondaryHelp: {
        en: "Used for supporting elements",
        fr: "Utilisée pour les éléments de support",
      },
      colorAccent: {
        en: "Accent Color",
        fr: "Couleur d'Accent",
      },
      colorAccentHelp: {
        en: "Used for buttons and interactive elements",
        fr: "Utilisée pour les boutons et éléments interactifs",
      },
      colorSuccess: {
        en: "Success Color",
        fr: "Couleur de Succès",
      },
      colorSuccessHelp: {
        en: "Used for compliant status",
        fr: "Utilisée pour les statuts conformes",
      },
      colorWarning: {
        en: "Warning Color",
        fr: "Couleur d'Avertissement",
      },
      colorWarningHelp: {
        en: "Used for alerts and attention",
        fr: "Utilisée pour les alertes et attention",
      },
      colorDanger: {
        en: "Danger Color",
        fr: "Couleur de Danger",
      },
      colorDangerHelp: {
        en: "Used for critical status",
        fr: "Utilisée pour les statuts critiques",
      },
      // Presets
      presetsTitle: {
        en: "Preset Palettes",
        fr: "Palettes Prédéfinies",
      },
      presetHeavyEquipment: {
        en: "Heavy Equipment",
        fr: "Équipement Lourd",
      },
      presetConstructionSite: {
        en: "Construction Site",
        fr: "Chantier",
      },
      presetWarehouseLogistics: {
        en: "Warehouse Logistics",
        fr: "Logistique",
      },
      presetApply: {
        en: "Apply",
        fr: "Appliquer",
      },
      // Actions
      save: {
        en: "Save Colors",
        fr: "Enregistrer les couleurs",
      },
      reset: {
        en: "Reset to Default",
        fr: "Réinitialiser aux valeurs par défaut",
      },
      cancel: {
        en: "Cancel",
        fr: "Annuler",
      },
      saving: {
        en: "Saving...",
        fr: "Enregistrement...",
      },
      // Messages
      saveSuccess: {
        en: "Branding saved successfully",
        fr: "Identité visuelle enregistrée avec succès",
      },
      saveError: {
        en: "Error saving branding",
        fr: "Erreur lors de l'enregistrement de l'identité visuelle",
      },
      resetSuccess: {
        en: "Branding reset to default",
        fr: "Identité visuelle réinitialisée",
      },
      resetConfirm: {
        en: "Are you sure you want to reset colors?",
        fr: "Êtes-vous sûr de vouloir réinitialiser les couleurs ?",
      },
    },

    // Notifications
    notifications: {
      title: {
        en: "Notifications",
        fr: "Notifications",
      },
      subtitle: {
        en: "Configure your notification preferences",
        fr: "Configurez vos préférences de notifications",
      },
      // Email
      emailTitle: {
        en: "Email Notifications",
        fr: "Notifications Email",
      },
      emailEnabled: {
        en: "Enable email notifications",
        fr: "Activer les notifications email",
      },
      emailEnabledHelp: {
        en: "Receive emails for important alerts",
        fr: "Recevoir des emails pour les alertes importantes",
      },
      // VGP Alerts
      vgpTitle: {
        en: "VGP Alerts",
        fr: "Alertes VGP",
      },
      vgpEnabled: {
        en: "Enable VGP alerts",
        fr: "Activer les alertes VGP",
      },
      vgpEnabledHelp: {
        en: "Receive reminders before inspection deadlines",
        fr: "Recevoir des rappels avant les échéances d'inspection",
      },
      vgpTimingTitle: {
        en: "Alert Timing",
        fr: "Timing des Alertes",
      },
      vgpTimingHelp: {
        en: "Number of days before deadline to receive alert",
        fr: "Nombre de jours avant l'échéance pour recevoir une alerte",
      },
      vgpTiming30: {
        en: "30 days before",
        fr: "30 jours avant",
      },
      vgpTiming15: {
        en: "15 days before",
        fr: "15 jours avant",
      },
      vgpTiming7: {
        en: "7 days before",
        fr: "7 jours avant",
      },
      vgpTiming1: {
        en: "1 day before",
        fr: "1 jour avant",
      },
      vgpRecipientsTitle: {
        en: "Recipients",
        fr: "Destinataires",
      },
      vgpRecipientsHelp: {
        en: "Who should receive VGP alerts",
        fr: "Qui doit recevoir les alertes VGP",
      },
      vgpRecipientsOwner: {
        en: "Owner only",
        fr: "Propriétaire uniquement",
      },
      vgpRecipientsAdmin: {
        en: "Owner and admins",
        fr: "Propriétaire et administrateurs",
      },
      vgpRecipientsAll: {
        en: "All team members",
        fr: "Tous les membres de l'équipe",
      },
      // Digest
      digestTitle: {
        en: "Digest Mode",
        fr: "Mode Résumé",
      },
      digestHelp: {
        en: "Frequency of activity summary emails",
        fr: "Fréquence de réception des résumés d'activité",
      },
      digestImmediate: {
        en: "Immediate (each alert)",
        fr: "Immédiat (chaque alerte)",
      },
      digestDaily: {
        en: "Daily (daily summary)",
        fr: "Quotidien (résumé journalier)",
      },
      digestWeekly: {
        en: "Weekly (weekly summary)",
        fr: "Hebdomadaire (résumé hebdomadaire)",
      },
      digestNever: {
        en: "Never (no summaries)",
        fr: "Jamais (aucun résumé)",
      },
      // Other Alerts
      otherTitle: {
        en: "Other Alerts",
        fr: "Autres Alertes",
      },
      assetAlerts: {
        en: "Asset Alerts",
        fr: "Alertes d'équipements",
      },
      assetAlertsHelp: {
        en: "Notifications for asset status changes",
        fr: "Notifications pour les changements d'état des équipements",
      },
      auditAlerts: {
        en: "Audit Alerts",
        fr: "Alertes d'audits",
      },
      auditAlertsHelp: {
        en: "Notifications for scheduled and completed audits",
        fr: "Notifications pour les audits programmés et terminés",
      },
      // Actions
      save: {
        en: "Save Preferences",
        fr: "Enregistrer les préférences",
      },
      reset: {
        en: "Reset to Default",
        fr: "Réinitialiser aux valeurs par défaut",
      },
      cancel: {
        en: "Cancel",
        fr: "Annuler",
      },
      saving: {
        en: "Saving...",
        fr: "Enregistrement...",
      },
      // Messages
      saveSuccess: {
        en: "Notification preferences saved",
        fr: "Préférences de notifications enregistrées",
      },
      saveError: {
        en: "Error saving preferences",
        fr: "Erreur lors de l'enregistrement des préférences",
      },
      resetSuccess: {
        en: "Preferences reset",
        fr: "Préférences réinitialisées",
      },
      resetConfirm: {
        en: "Reset notification preferences?",
        fr: "Réinitialiser les préférences de notifications ?",
      },
    },

    // Common
    common: {
      required: {
        en: "Required field",
        fr: "Champ obligatoire",
      },
      optional: {
        en: "Optional",
        fr: "Optionnel",
      },
      loading: {
        en: "Loading...",
        fr: "Chargement...",
      },
      error: {
        en: "An error occurred",
        fr: "Une erreur est survenue",
      },
      permissionDenied: {
        en: "Permission denied. Only owners and admins can modify these settings.",
        fr: "Permission refusée. Seuls les propriétaires et administrateurs peuvent modifier ces paramètres.",
      },
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
  // AUDITS MODULE
  // ============================================================================
  audits: {
    pageTitle: {
      en: "Inventory Audits",
      fr: "Audits d'Inventaire",
    },
    pageSubtitle: {
      en: "Manage and track your equipment audits",
      fr: "Gérez et suivez vos audits d'équipement",
    },
    createAudit: {
      en: "Create Audit",
      fr: "Créer un Audit",
    },
    searchPlaceholder: {
      en: "Search audits...",
      fr: "Rechercher des audits...",
    },
    totalAudits: {
      en: "Total Audits",
      fr: "Total Audits",
    },
    allTime: {
      en: "All time",
      fr: "Historique complet",
    },
    planned: {
      en: "Planned",
      fr: "Planifiés",
    },
    scheduledAudits: {
      en: "Scheduled audits",
      fr: "Audits planifiés",
    },
    inProgress: {
      en: "In Progress",
      fr: "En Cours",
    },
    activeAudits: {
      en: "Active audits",
      fr: "Audits actifs",
    },
    completed: {
      en: "Completed",
      fr: "Terminés",
    },
    finishedAudits: {
      en: "Finished audits",
      fr: "Audits terminés",
    },
    auditName: {
      en: "Audit Name",
      fr: "Nom de l'Audit",
    },
    status: {
      en: "Status",
      fr: "Statut",
    },
    progress: {
      en: "Progress",
      fr: "Progression",
    },
    scheduledDate: {
      en: "Scheduled Date",
      fr: "Date Prévue",
    },
    createdBy: {
      en: "Created By",
      fr: "Créé Par",
    },
    actions: {
      en: "Actions",
      fr: "Actions",
    },
    noAudits: {
      en: "No audits found",
      fr: "Aucun audit trouvé",
    },
    noAuditsDesc: {
      en: "Create your first audit to start tracking inventory",
      fr: "Créez votre premier audit pour commencer le suivi",
    },
    statusPlanned: {
      en: "Planned",
      fr: "Planifié",
    },
    statusInProgress: {
      en: "In Progress",
      fr: "En Cours",
    },
    statusCompleted: {
      en: "Completed",
      fr: "Terminé",
    },
    start: {
      en: "Start",
      fr: "Démarrer",
    },
    continue: {
      en: "Continue",
      fr: "Continuer",
    },
    viewReport: {
      en: "View Report",
      fr: "Voir Rapport",
    },
    viewDetails: {
      en: "View Details",
      fr: "Voir Détails",
    },
    newAudit: {
      en: "New Audit",
      fr: "Nouvel Audit",
    },
    auditNameLabel: {
      en: "Audit Name",
      fr: "Nom de l'Audit",
    },
    auditNamePlaceholder: {
      en: "e.g., Q4 2025 Inventory Check",
      fr: "ex: Inventaire T4 2025",
    },
    scheduledDateLabel: {
      en: "Scheduled Date",
      fr: "Date Prévue",
    },
    auditScope: {
      en: "Audit Scope",
      fr: "Périmètre de l'Audit",
    },
    allAssets: {
      en: "All Assets",
      fr: "Tous les Équipements",
    },
    byLocation: {
      en: "By Location",
      fr: "Par Emplacement",
    },
    byCategory: {
      en: "By Category",
      fr: "Par Catégorie",
    },
    selectLocation: {
      en: "Select Location",
      fr: "Sélectionner Emplacement",
    },
    selectCategory: {
      en: "Select Category",
      fr: "Sélectionner Catégorie",
    },
    creating: {
      en: "Creating...",
      fr: "Création...",
    },
    assetsFound: {
      en: "assets found",
      fr: "équipements trouvés",
    },
    // Audit Detail Page
    backToAudits: {
      en: "Back to Audits",
      fr: "Retour aux Audits",
    },
    auditNotStarted: {
      en: "Audit Not Started",
      fr: "Audit Non Démarré",
    },
    auditNotStartedDesc: {
      en: "Click the button below to begin this audit",
      fr: "Cliquez sur le bouton ci-dessous pour démarrer cet audit",
    },
    startAudit: {
      en: "Start Audit",
      fr: "Démarrer l'Audit",
    },
    completeAudit: {
      en: "Complete Audit",
      fr: "Terminer l'Audit",
    },
    exportResults: {
      en: "Export Results",
      fr: "Exporter les Résultats",
    },
    totalAssets: {
      en: "Total Assets",
      fr: "Total Équipements",
    },
    verified: {
      en: "Verified",
      fr: "Vérifiés",
    },
    pending: {
      en: "Pending",
      fr: "En Attente",
    },
    missing: {
      en: "Missing",
      fr: "Manquants",
    },
    asset: {
      en: "Asset",
      fr: "Équipement",
    },
    category: {
      en: "Category",
      fr: "Catégorie",
    },
    serialNumber: {
      en: "Serial Number",
      fr: "Numéro de Série",
    },
    location: {
      en: "Location",
      fr: "Emplacement",
    },
    markVerified: {
      en: "Mark Verified",
      fr: "Marquer Vérifié",
    },
    markMissing: {
      en: "Mark Missing",
      fr: "Marquer Manquant",
    },
    completedOn: {
      en: "Completed on",
      fr: "Terminé le",
    },
    confirmComplete: {
      en: "Confirm Complete",
      fr: "Confirmer la Fin",
    },
    confirmCompleteDesc: {
      en: "Are you sure you want to complete this audit? All pending items will be marked as missing.",
      fr: "Êtes-vous sûr de vouloir terminer cet audit ? Tous les éléments en attente seront marqués comme manquants.",
    },
    auditSummary: {
      en: "Audit Summary",
      fr: "Résumé de l'Audit",
    },
    itemsVerified: {
      en: "items verified",
      fr: "éléments vérifiés",
    },
    itemsMissing: {
      en: "items missing",
      fr: "éléments manquants",
    },
    itemsPending: {
      en: "items pending",
      fr: "éléments en attente",
    },
    confirm: {
      en: "Confirm",
      fr: "Confirmer",
    },
    noAssetsFound: {
      en: "No assets found",
      fr: "Aucun équipement trouvé",
    },
    auditNotFound: {
      en: "Audit not found",
      fr: "Audit non trouvé",
    },
    searchAssets: {
      en: "Search assets...",
      fr: "Rechercher des équipements...",
    },
    filterAll: {
      en: "All",
      fr: "Tous",
    },
  },

  // ============================================================================
  // SETTINGS - NOTIFICATIONS
  // ============================================================================
  notifications: {
    pageTitle: {
      en: "Notifications",
      fr: "Notifications",
    },
    pageSubtitle: {
      en: "Manage email alerts and preferences",
      fr: "Gérez les alertes email et préférences",
    },
    back: {
      en: "Back to Settings",
      fr: "Retour aux Paramètres",
    },
    edit: {
      en: "Edit",
      fr: "Modifier",
    },
    save: {
      en: "Save Changes",
      fr: "Enregistrer",
    },
    cancel: {
      en: "Cancel",
      fr: "Annuler",
    },
    saving: {
      en: "Saving...",
      fr: "Enregistrement...",
    },
    saveSuccess: {
      en: "Notification preferences updated",
      fr: "Préférences de notifications mises à jour",
    },
    saveError: {
      en: "Error updating preferences",
      fr: "Erreur lors de la mise à jour",
    },
    emailNotifications: {
      en: "Email Notifications",
      fr: "Notifications Email",
    },
    emailEnabled: {
      en: "Enable email notifications",
      fr: "Activer les notifications email",
    },
    vgpAlerts: {
      en: "VGP Compliance Alerts",
      fr: "Alertes de Conformité VGP",
    },
    vgpAlertsDesc: {
      en: "Receive email alerts for upcoming inspections",
      fr: "Recevez des alertes email pour les inspections à venir",
    },
    vgpEnabled: {
      en: "Enable VGP alerts",
      fr: "Activer les alertes VGP",
    },
    alertTiming: {
      en: "Alert Timing",
      fr: "Calendrier des Alertes",
    },
    alertTimingDesc: {
      en: "Days before due date",
      fr: "Jours avant l'échéance",
    },
    daysInAdvance: {
      en: "days in advance",
      fr: "jours à l'avance",
    },
    recipients: {
      en: "Alert Recipients",
      fr: "Destinataires des Alertes",
    },
    recipientsOwner: {
      en: "Organization owner only",
      fr: "Propriétaire uniquement",
    },
    recipientsAll: {
      en: "All team members",
      fr: "Tous les membres",
    },
    digestMode: {
      en: "Digest Mode",
      fr: "Mode Résumé",
    },
    digestModeDesc: {
      en: "Frequency of summary emails",
      fr: "Fréquence des emails récapitulatifs",
    },
    daily: {
      en: "Daily (8:00 AM)",
      fr: "Quotidien (8h00)",
    },
    weekly: {
      en: "Weekly (Monday 8:00 AM)",
      fr: "Hebdomadaire (Lundi 8h00)",
    },
    realtime: {
      en: "Real-time (immediate)",
      fr: "Temps réel (immédiat)",
    },
    otherAlerts: {
      en: "Other Alerts",
      fr: "Autres Alertes",
    },
    assetAlerts: {
      en: "Asset movement alerts",
      fr: "Alertes de mouvement d'actifs",
    },
    auditAlerts: {
      en: "Audit reminders",
      fr: "Rappels d'audit",
    },
    enabled: {
      en: "Enabled",
      fr: "Activé",
    },
    disabled: {
      en: "Disabled",
      fr: "Désactivé",
    },
    yes: {
      en: "Yes",
      fr: "Oui",
    },
    no: {
      en: "No",
      fr: "Non",
    },
  },







  // ============================================================================
  // TEAM MODULE
  // ============================================================================
  team: {
    pageTitle: {
      en: "Team Management",
      fr: "Gestion de l'Équipe",
    },
    pageSubtitle: {
      en: "Manage team members and permissions",
      fr: "Gérez les membres de l'équipe et leurs permissions",
    },
    inviteMember: {
      en: "Invite Member",
      fr: "Inviter un Membre",
    },
    searchPlaceholder: {
      en: "Search by name or email...",
      fr: "Rechercher par nom ou email...",
    },
    totalMembers: {
      en: "Total Members",
      fr: "Total Membres",
    },
    teamSize: {
      en: "Team size",
      fr: "Taille de l'équipe",
    },
    administrators: {
      en: "Administrators",
      fr: "Administrateurs",
    },
    fullAccess: {
      en: "Full access",
      fr: "Accès complet",
    },
    teamMembers: {
      en: "Team Members",
      fr: "Membres",
    },
    changeRoleFor: {
      en: "Change role for",
      fr: "Changer le rôle de",
    },
    updateRole: {
      en: "Update Role",
      fr: "Mettre à jour",
    },
    standardAccess: {
      en: "Standard access",
      fr: "Accès standard",
    },
    pendingInvites: {
      en: "Pending Invites",
      fr: "Invitations en Attente",
    },
    awaitingResponse: {
      en: "Awaiting response",
      fr: "En attente de réponse",
    },
    member: {
      en: "Member",
      fr: "Membre",
    },
    role: {
      en: "Role",
      fr: "Rôle",
    },
    joined: {
      en: "Joined",
      fr: "Rejoint",
    },
    lastActive: {
      en: "Last Active",
      fr: "Dernière Activité",
    },
    actions: {
      en: "Actions",
      fr: "Actions",
    },
    noMembers: {
      en: "No team members yet",
      fr: "Aucun membre pour l'instant",
    },
    noMembersDesc: {
      en: "Invite your first team member to get started",
      fr: "Invitez votre premier membre pour commencer",
    },
    // Roles
    roleOwner: {
      en: "Owner",
      fr: "Propriétaire",
    },
    roleOwnerDesc: {
      en: "Full control including billing and settings",
      fr: "Contrôle total y compris facturation et paramètres",
    },
    roleAdmin: {
      en: "Admin",
      fr: "Admin",
    },
    roleAdminDesc: {
      en: "Manage assets, VGP, audits, and team",
      fr: "Gérer les équipements, VGP, audits et équipe",
    },
    roleMember: {
      en: "Member",
      fr: "Membre",
    },
    roleMemberDesc: {
      en: "View and edit assets, record inspections",
      fr: "Voir et modifier les équipements, enregistrer les inspections",
    },
    roleViewer: {
      en: "Viewer",
      fr: "Lecteur",
    },
    roleViewerDesc: {
      en: "Read-only access to dashboard and reports",
      fr: "Accès en lecture seule au tableau de bord et rapports",
    },
    // Actions
    changeRole: {
      en: "Change Role",
      fr: "Changer le Rôle",
    },
    removeMember: {
      en: "Remove Member",
      fr: "Retirer le Membre",
    },
    resendInvite: {
      en: "Resend Invite",
      fr: "Renvoyer l'Invitation",
    },
    cancelInvite: {
      en: "Cancel Invite",
      fr: "Annuler l'Invitation",
    },
    // Modals
    inviteMemberTitle: {
      en: "Invite Team Member",
      fr: "Inviter un Membre",
    },
    emailAddress: {
      en: "Email Address",
      fr: "Adresse Email",
    },
    emailPlaceholder: {
      en: "colleague@company.com",
      fr: "collegue@entreprise.com",
    },
    selectRole: {
      en: "Select Role",
      fr: "Sélectionner un Rôle",
    },
    sendInvite: {
      en: "Send Invite",
      fr: "Envoyer l'Invitation",
    },
    sending: {
      en: "Sending...",
      fr: "Envoi...",
    },
    changeRoleTitle: {
      en: "Change Member Role",
      fr: "Changer le Rôle du Membre",
    },
    currentRole: {
      en: "Current role",
      fr: "Rôle actuel",
    },
    selectNewRole: {
      en: "Select new role",
      fr: "Sélectionner le nouveau rôle",
    },
    saveChanges: {
      en: "Save Changes",
      fr: "Enregistrer",
    },
    removeMemberTitle: {
      en: "Remove Team Member",
      fr: "Retirer le Membre",
    },
    removeMemberDesc: {
      en: "Are you sure you want to remove this member? They will lose access to the organization immediately.",
      fr: "Êtes-vous sûr de vouloir retirer ce membre ? Il perdra immédiatement l'accès à l'organisation.",
    },
    removeConfirm: {
      en: "Remove Member",
      fr: "Retirer",
    },
    // Time
    today: {
      en: "Today",
      fr: "Aujourd'hui",
    },
    yesterday: {
      en: "Yesterday",
      fr: "Hier",
    },
    daysAgo: {
      en: "days ago",
      fr: "jours",
    },
    weeksAgo: {
      en: "weeks ago",
      fr: "semaines",
    },
    // Invitations
    pendingInvitations: {
      en: "Pending Invitations",
      fr: "Invitations en Attente",
    },
    email: {
      en: "Email",
      fr: "Email",
    },
    invitedRole: {
      en: "Invited Role",
      fr: "Rôle Invité",
    },
    statusPending: {
      en: "Pending",
      fr: "En Attente",
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
    create: {
      // ← AJOUTE CECI
      en: "Create",
      fr: "Créer",
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