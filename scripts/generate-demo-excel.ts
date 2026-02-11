// scripts/generate-demo-excel.ts
// Generates the demo import Excel file for onboarding
// Run with: npx tsx scripts/generate-demo-excel.ts

import * as XLSX from 'xlsx';
import * as path from 'path';

const DEMO_EQUIPMENT = [
  { Designation: 'Nacelle articulee Genie Z-45/25J', 'N de Serie': 'NAC-2023-0088', Marque: 'Genie', Categorie: 'Nacelle', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Chariot telescopique Merlo P40.17', 'N de Serie': 'CHA-2022-0145', Marque: 'Merlo', Categorie: 'Chariot', Emplacement: 'Chantier Batiment C', Etat: 'En location' },
  { Designation: 'Nacelle ciseaux JLG 2630ES', 'N de Serie': 'NAC-2024-0012', Marque: 'JLG', Categorie: 'Nacelle', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Chariot elevateur Linde H30D', 'N de Serie': 'CHA-2021-0098', Marque: 'Linde', Categorie: 'Chariot', Emplacement: 'Entrepot B', Etat: 'Disponible' },
  { Designation: 'Mini-pelle Volvo ECR25', 'N de Serie': 'ENG-2023-0044', Marque: 'Volvo', Categorie: 'Engin', Emplacement: 'Chantier Residence Parc', Etat: 'En location' },
  { Designation: 'Compresseur Kaeser M50', 'N de Serie': 'COMP-2022-0061', Marque: 'Kaeser', Categorie: 'Compresseur', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Groupe electrogene Caterpillar DE88', 'N de Serie': 'GE-2024-0007', Marque: 'Caterpillar', Categorie: 'Groupe electrogene', Emplacement: 'Chantier Pont Nord', Etat: 'En location' },
  { Designation: 'Nacelle telescopique Haulotte HT23RTJ', 'N de Serie': 'NAC-2022-0076', Marque: 'Haulotte', Categorie: 'Nacelle', Emplacement: 'Depot A', Etat: 'Maintenance' },
  { Designation: 'Chargeuse sur pneus Volvo L30G', 'N de Serie': 'ENG-2021-0112', Marque: 'Volvo', Categorie: 'Engin', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Rouleau compacteur Hamm HD12', 'N de Serie': 'ENG-2023-0058', Marque: 'Hamm', Categorie: 'Engin', Emplacement: 'Chantier Autoroute Sud', Etat: 'En location' },
  { Designation: 'Chariot frontal Hyster H4.0FT', 'N de Serie': 'CHA-2023-0131', Marque: 'Hyster', Categorie: 'Chariot', Emplacement: 'Entrepot B', Etat: 'Disponible' },
  { Designation: 'Nacelle articulee JLG 450AJ', 'N de Serie': 'NAC-2024-0023', Marque: 'JLG', Categorie: 'Nacelle', Emplacement: 'Chantier Batiment C', Etat: 'En location' },
  { Designation: 'Compresseur Atlas Copco XAS 137', 'N de Serie': 'COMP-2023-0039', Marque: 'Atlas Copco', Categorie: 'Compresseur', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Pelle sur chenilles Kubota KX057-5', 'N de Serie': 'ENG-2022-0087', Marque: 'Kubota', Categorie: 'Engin', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Chariot telescopique Bobcat TL43.80HF', 'N de Serie': 'CHA-2024-0005', Marque: 'Bobcat', Categorie: 'Chariot', Emplacement: 'Chantier Residence Parc', Etat: 'En location' },
  { Designation: 'Groupe electrogene SDMO J88', 'N de Serie': 'GE-2023-0021', Marque: 'SDMO', Categorie: 'Groupe electrogene', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Dumper Wacker Neuson DW60', 'N de Serie': 'ENG-2023-0093', Marque: 'Wacker Neuson', Categorie: 'Engin', Emplacement: 'Chantier Autoroute Sud', Etat: 'En location' },
  { Designation: 'Nacelle ciseaux Skyjack SJ4626', 'N de Serie': 'NAC-2023-0105', Marque: 'Skyjack', Categorie: 'Nacelle', Emplacement: 'Entrepot B', Etat: 'Disponible' },
  { Designation: 'Plaque vibrante Wacker DPU 6555', 'N de Serie': 'ENG-2024-0031', Marque: 'Wacker Neuson', Categorie: 'Engin', Emplacement: 'Depot A', Etat: 'Disponible' },
  { Designation: 'Echafaudage roulant Layher UNI-Standard', 'N de Serie': 'DIV-2022-0048', Marque: 'Layher', Categorie: 'Divers', Emplacement: 'Depot A', Etat: 'Disponible' },
];

const ws = XLSX.utils.json_to_sheet(DEMO_EQUIPMENT);

// Set column widths for readability
ws['!cols'] = [
  { wch: 42 }, // Designation
  { wch: 18 }, // N de Serie
  { wch: 16 }, // Marque
  { wch: 20 }, // Categorie
  { wch: 26 }, // Emplacement
  { wch: 14 }, // Etat
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Equipements');

const outputPath = path.join(__dirname, '..', 'public', 'files', 'demo-import-equipements.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`Demo Excel generated: ${outputPath}`);
console.log(`${DEMO_EQUIPMENT.length} rows written.`);
