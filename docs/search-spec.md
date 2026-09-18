# TraviXO — Cahier des charges final du système de recherche

## 1. Objet

La recherche TraviXO ne doit pas être conçue comme un simple filtre appliqué aux lignes actuellement visibles dans une page.

Elle doit devenir un **mécanisme serveur de récupération de l’information opérationnelle**, capable de retrouver un matériel, une inspection, un scan, un client, un audit ou un autre enregistrement à partir :

- de ses propres champs ;
- des informations visibles sur l’écran ;
- de ses identifiants métier ;
- des informations appartenant à des objets directement liés ;
- des événements appartenant à son historique.

Une donnée déjà connue de TraviXO ne doit pas devenir introuvable simplement parce qu’elle appartient à une autre table, à une autre page ou à une ligne qui n’a pas encore été chargée dans le navigateur.

---

# 2. Correction fondamentale : pagination ≠ périmètre de recherche

La pagination peut rester à 50 résultats.

Ce qui doit disparaître est :

```text
fetch 50 records
↓
store them in React state
↓
search inside those 50 records
```

Le comportement obligatoire est :

```text
user enters search
↓
query sent to server/database
↓
database searches the complete authorized dataset
↓
database sorts and filters the complete result set
↓
database returns only the first 50 matches
↓
next 50 matches can be requested
```

Autrement dit :

```text
SEARCH SCOPE ≠ PAGE SIZE
```

Une page peut afficher :

```text
50 résultats sur 3 482
```

mais la requête ayant produit ces 50 résultats doit avoir interrogé les 3 482 enregistrements auxquels l’organisation a accès.

Aujourd’hui, les scans violent précisément cette règle : `PAGE_SIZE = 50`, puis la recherche filtre le tableau `scans` déjà chargé. En plus, « Load more » disparaît pendant une recherche.

Ce comportement doit être supprimé partout.

---

# 3. Principe fonctionnel : trois niveaux de recherche

## Niveau A — recherche directe

Recherche dans les propriétés de l’objet affiché.

Exemple Fleet :

```text
Nacelle
HA20PX
SN-45821
Bobigny
En location
```

Exemple inspection :

```text
Berger
Norma Contrôle
VGP-2026-487
Défavorable
RAS
```

---

## Niveau B — recherche relationnelle implicite

Une valeur appartenant à un enregistrement lié doit permettre de retrouver l’objet principal.

Exemple :

```text
Fleet
Recherche : VGP-2026-487
```

`VGP-2026-487` n’est pas nécessairement une colonne de `assets`.

La recherche doit néanmoins pouvoir suivre :

```text
vgp_inspections.certification_number
        ↓
vgp_inspections.asset_id
        ↓
assets.id
```

et retourner la machine correspondante.

Inversement :

```text
Historique des inspections
Recherche : SN-45821
```

doit suivre :

```text
assets.serial_number
        ↓
assets.id
        ↓
vgp_inspections.asset_id
```

et retourner toutes les inspections de cette machine.

---

## Niveau C — recherche historique

La recherche doit également interroger les événements historiques associés à une machine.

Exemple Fleet :

```text
Recherche : Norma Contrôle
```

doit pouvoir retourner les matériels ayant été contrôlés par Norma Contrôle.

```text
Recherche : Berger
```

doit retourner les matériels possédant une inspection réalisée par Berger.

```text
Recherche : client Dupont
```

doit pouvoir retrouver une machine ayant été liée à ce client dans son historique lorsque cette relation est disponible dans TraviXO.

Le fait qu’un événement ne soit plus « courant » ne doit pas le rendre invisible à la recherche.

---

# 4. Règle de portée serveur

Toutes les surfaces nécessitant une recherche métier doivent interroger PostgreSQL/Supabase directement.

Interdiction de considérer comme recherche complète :

```ts
const filtered = loadedRows.filter(...)
```

lorsque `loadedRows` n’est qu’une page du dataset.

Un filtrage React local peut rester utilisé uniquement pour :

- une petite collection explicitement intégralement chargée ;
- un filtre purement visuel ;
- un état temporaire dont le backend a déjà fourni le dataset exhaustif.

Il ne doit plus représenter la recherche métier principale des écrans Fleet, inspections, scans, clients, audits ou autres historiques importants.

---

# 5. Fleet — contrat de recherche complet

La recherche Fleet doit rechercher directement ou indirectement au minimum dans les familles suivantes.

## Identité du matériel

- nom ;
- numéro de série ;
- description ;
- catégorie ;
- emplacement courant ;
- statut ;
- QR code / identifiant QR lorsque pertinent ;
- tout identifiant métier visible dans la fiche matériel.

Le moteur actuel ne cherche directement que `name`, `serial_number`, `description` et `current_location`.

Ce périmètre doit être élargi.

## Inspections VGP liées au matériel

Fleet doit pouvoir retrouver une machine à partir d’informations contenues dans ses inspections :

- nom ou référence de l’organisme de contrôle ;
- inspecteur ;
- numéro de certificat / numéro de contrôle ;
- type de vérification ;
- observations ;
- findings lorsque ce champ est réellement utilisé ;
- résultat/statut de l’inspection ;
- date d’inspection lorsqu’une recherche textuelle ou un filtre de date est proposé ;
- référence réglementaire lorsqu’elle est reliée à l’inspection ou à l’échéancier.

Exemple obligatoire :

```text
Recherche Fleet :
VGP-2026-00481
```

Résultat :

```text
Nacelle Haulotte HA20PX
SN 184736

Correspondance :
Inspection VGP
Certificat : VGP-2026-00481
Norma Contrôle
```

## Historique de location

Lorsque les données existent :

- client ;
- société cliente ;
- référence de location ;
- lieu associé ;
- informations métier identifiantes de la location.

Une machine ne doit pas être recherchable uniquement par son client actuel si TraviXO possède aussi l’historique de ses locations.

## Scans

Une machine doit pouvoir être retrouvée via des informations significatives appartenant à ses scans lorsque cela représente un usage opérationnel utile :

- utilisateur ayant scanné ;
- éventuellement emplacement du scan ;
- type/action du scan si cette information existe.

## Audits

Lorsque l’historique d’audit est relié au matériel :

- nom/référence de l’audit ;
- informations d’identification pertinentes de l’événement ;
- éventuellement notes d’exclusion lorsqu’elles sont présentées comme donnée métier.

## Documents

Aucun moteur ne doit prétendre rechercher des documents qui n’existent pas dans le modèle de données.

En revanche, dès qu’un document possède dans TraviXO :

- un numéro ;
- un type ;
- un titre ;
- une référence ;
- un nom de fichier pertinent ;
- une association à un matériel ;

ces métadonnées devront être intégrées au contrat de recherche.

---

# 6. Provenance obligatoire des résultats indirects

Une machine trouvée indirectement ne doit pas apparaître sans explication.

L’API doit pouvoir retourner la raison de la correspondance.

Exemple :

```json
{
  "asset_id": "...",
  "name": "Nacelle Haulotte HA20PX",
  "serial_number": "184736",
  "matches": [
    {
      "source_type": "vgp_inspection",
      "source_id": "...",
      "matched_fields": ["certification_number"],
      "label": "Inspection VGP VGP-2026-00481"
    }
  ]
}
```

L’UI peut afficher :

```text
Trouvé via :
Inspection VGP · VGP-2026-00481
```

ou :

```text
Correspondance historique :
Inspecteur · M. Berger
```

ou :

```text
Correspondance :
Ancienne location · Dupont BTP
```

La provenance est importante parce qu’une recherche relationnelle peut sinon sembler produire des résultats arbitraires.

---

# 7. Historique des inspections — recherche complète

L’historique des inspections doit devenir une vraie surface d’interrogation de la base.

L’audit constate actuellement que cette page recherche seulement quelques champs tandis que numéro de série, catégorie, société, observations et type de vérification restent visibles mais non recherchables.

Le champ principal doit rechercher au minimum :

### Données de l’inspection

- inspecteur ;
- société / organisme de contrôle ;
- numéro de certificat ;
- type de vérification ;
- résultat ;
- observations ;
- findings si conservé comme champ distinct ;
- autres références métier visibles.

### Données du matériel lié

- nom du matériel ;
- numéro de série ;
- catégorie ;
- emplacement pertinent ;
- QR / identifiant matériel lorsque pertinent.

### Références liées

- référence réglementaire lorsque disponible ;
- informations métier associées à l’échéancier VGP lorsqu’elles identifient clairement l’inspection ou le matériel.

Exemples obligatoires :

```text
Norma Controle
```

doit retrouver les inspections de :

```text
Norma Contrôle
```

```text
Berger
```

doit retourner toutes les inspections réalisées par Berger, pas uniquement celles présentes dans les 50 lignes déjà chargées.

```text
SN-847492
```

doit retourner les inspections du matériel possédant ce numéro de série.

```text
VGP-2026-00841
```

doit retrouver directement l’inspection correspondante.

```text
défavorable
```

doit pouvoir retrouver les inspections portant cette valeur si le résultat est une information visible et métier.

---

# 8. Recherche, filtres et tri sont trois fonctions différentes

Le champ texte ne doit pas devenir un substitut aux filtres structurés.

## Recherche

Exemple :

```text
Berger
```

cherche la chaîne dans les champs autorisés.

## Filtres

L’historique des inspections doit permettre, selon les champs réellement disponibles :

```text
Inspecteur
Organisme de contrôle
Type de vérification
Résultat / statut
Catégorie de matériel
Date de début
Date de fin
Emplacement
```

## Tri

Le serveur doit également supporter les tris métier pertinents :

```text
Date : plus récente
Date : plus ancienne
Machine : A → Z
Machine : Z → A
Numéro de série
Inspecteur
Organisme
Type de vérification
Résultat
Numéro de certificat
```

Les tris ne doivent pas être appliqués uniquement aux 50 résultats reçus.

Mauvais :

```text
DB → 50 lignes
JS → tri des 50 lignes
```

Correct :

```text
DB → filtre complet
DB → tri complet
DB → pagination
→ 50 premières lignes
```

---

# 9. VGP Schedules

Les schedules constituent déjà l’une des surfaces les mieux construites d’après l’audit.

Ils doivent néanmoins adopter le contrat commun.

Recherche minimale :

- nom du matériel ;
- numéro de série ;
- emplacement ;
- catégorie ;
- notes ;
- inspecteur lorsque présent ;
- QR ;
- référence réglementaire ;
- tout champ métier visible dans la ligne ou le détail.

Le placeholder et les véritables champs interrogés doivent toujours correspondre.

---

# 10. Scans

Le fonctionnement actuel est explicitement à remplacer.

Aujourd’hui, la recherche porte sur les 50 scans chargés, et le chargement supplémentaire est même masqué quand une recherche est active.

Le nouveau comportement doit être :

```text
GET/RPC search scans
query = "Berger"
limit = 50
cursor = null
```

PostgreSQL recherche tous les scans autorisés.

Il renvoie uniquement les 50 premiers résultats.

La page suivante récupère les 50 suivants.

Recherche au minimum :

- nom du matériel ;
- numéro de série ;
- emplacement ;
- personne ayant scanné ;
- informations de scan visibles pertinentes.

Le rapport avait déjà identifié que « who scanned it » était visible mais non recherchable.

---

# 11. Clients

Recherche :

- nom ;
- société ;
- email ;
- téléphone ;
- notes lorsque présentées comme information métier.

Email et téléphone sont actuellement affichés mais non recherchables.

Il faut également supprimer le comportement qui détruit actuellement certains caractères de la requête.

Par exemple :

```text
Dupont (SARL)
TP_Loc
Martin, Jean
100% Béton
```

ne doivent plus être transformés en chaînes différentes avant recherche. L’audit reproduit actuellement ces échecs.

---

# 12. Audits

## Liste d’audits

Recherche :

- nom ;
- créateur ;
- statut ;
- date lorsque pertinent.

Les champs visibles ne doivent plus rester exclus de la recherche sans décision explicite.

## Détail d’un audit

Recherche :

- nom du matériel ;
- numéro de série ;
- emplacement ;
- catégorie ;
- informations d’exclusion pertinentes ;
- autres données métier visibles de la ligne.

La création d’un audit ne doit jamais dépendre d’un dataset tronqué à 500 ou 1 000 lignes. L’audit actuel montre précisément un aperçu plafonné à 500 et une création susceptible de s’arrêter au plafond serveur.

Le moteur de recherche et le moteur de constitution d’un audit doivent tous les deux travailler sur le dataset complet.

---

# 13. Team

Recherche :

- display name ;
- first name ;
- last name ;
- full_name ;
- email ;
- rôle.

`full_name` doit être interrogé systématiquement et non uniquement lorsque les autres propriétés sont absentes.

L’audit a déjà identifié le cas où :

```text
first_name = Jean
last_name = null
full_name = Jean-Pierre Dubois
```

affiche Jean mais rend `Dubois` introuvable.

Ce comportement doit disparaître.

---

# 14. QR Codes

La page QR ne doit plus rester une exception sans recherche.

L’audit constate qu’elle charge tous les assets sans moteur de recherche et peut inclure des matériels archivés.

Elle doit au minimum permettre :

- recherche nom ;
- numéro de série ;
- catégorie ;
- emplacement ;
- QR ;
- statut ;
- exclusion/inclusion explicite des archivés.

La sélection doit porter sur le résultat filtré choisi, pas arbitrairement sur toute la flotte chargée.

---

# 15. Normalisation commune de toutes les recherches

Une seule fonction de normalisation doit être utilisée.

Proposition :

```ts
// lib/search/fold.ts

export function foldSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}
```

Le codebase possède déjà cette logique sous plusieurs formes.

Elle doit être centralisée.

En PostgreSQL, créer l’équivalent immutable :

```sql
search_fold(text) returns text
```

avec le même comportement.

Ainsi :

```text
Sécurité
securite
SECURITE
sécurité
```

appartiennent au même espace de recherche.

Même exigence pour :

```text
Élévateur / elevateur
Télescopique / telescopique
Dépôt / depot
Contrôle / controle
```

Les défaillances correspondantes ont déjà été reproduites dans l’audit.

---

# 16. Caractères spéciaux

Les caractères saisis par l’utilisateur ne doivent :

- ni être supprimés arbitrairement ;
- ni modifier involontairement la sémantique SQL `LIKE`.

Créer une primitive commune :

```sql
search_escape_like(text)
```

ou appliquer une stratégie équivalente dans chaque RPC.

Elle doit protéger :

```text
%
_
\
```

quand ils doivent être traités littéralement.

Une recherche :

```text
100%
```

doit rechercher `100%`.

Une recherche :

```text
TP_01
```

doit rechercher le caractère `_` littéral et non « n’importe quel caractère ».

Le bug actuel est documenté dans Fleet.

---

# 17. Architecture SQL recommandée

Ne pas multiplier les recherches client-side spécifiques.

Créer des fonctions serveur dédiées aux surfaces importantes.

Minimum :

```text
search_assets(...)
search_vgp_inspections(...)
search_vgp_schedules(...)
search_scans(...)
search_clients(...)
search_audits(...)
search_audit_items(...)
search_team(...)
```

Le contexte organisation doit venir de l’utilisateur authentifié / des règles RLS appropriées, pas d’un `organization_id` arbitraire fourni par le navigateur lorsque cela peut être évité.

---

# 18. Exemple technique : Fleet

Conceptuellement :

```sql
create function search_assets(
  p_query text,
  p_status text default null,
  p_category text default null,
  p_show_archived boolean default false,
  p_sort text default 'name_asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns ...
```

La requête doit travailler sur l’ensemble autorisé puis appliquer `LIMIT`.

Schéma conceptuel :

```sql
WITH eligible_assets AS (
  SELECT a.*
  FROM assets a
  WHERE
    -- tenant/RLS
    ...
    AND (
      p_show_archived = true
      OR a.archived_at IS NULL
    )
    AND (
      p_status IS NULL
      OR a.status = p_status
    )
    AND (
      p_category IS NULL
      OR a.category = p_category
    )
),

matched_assets AS (
  SELECT DISTINCT a.id
  FROM eligible_assets a
  WHERE

    -- Direct asset fields
    asset_matches(a, p_query)

    OR EXISTS (
      SELECT 1
      FROM vgp_inspections vi
      WHERE vi.asset_id = a.id
        AND inspection_matches(vi, p_query)
    )

    OR EXISTS (
      SELECT 1
      FROM vgp_schedules vs
      WHERE vs.asset_id = a.id
        AND schedule_matches(vs, p_query)
    )

    OR EXISTS (
      SELECT 1
      FROM rentals r
      LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.asset_id = a.id
        AND rental_or_client_matches(r, c, p_query)
    )

    OR EXISTS (
      SELECT 1
      FROM scans s
      WHERE s.asset_id = a.id
        AND scan_matches(s, p_query)
    )

    OR EXISTS (
      SELECT 1
      FROM audit_items ai
      JOIN audits au ON au.id = ai.audit_id
      WHERE ai.asset_id = a.id
        AND audit_matches(ai, au, p_query)
    )
)

SELECT ...
FROM eligible_assets a
JOIN matched_assets m ON m.id = a.id
ORDER BY ...
LIMIT p_limit
OFFSET p_offset;
```

L’implémentation exacte peut être adaptée au schéma réel, mais le comportement ne doit pas être réduit.

---

# 19. Exemple technique : inspections

```sql
search_vgp_inspections(
  p_query,
  p_inspector,
  p_company,
  p_verification_type,
  p_result,
  p_category,
  p_date_from,
  p_date_to,
  p_sort,
  p_limit,
  p_offset
)
```

La recherche doit joindre l’asset avant d’appliquer le texte :

```sql
FROM vgp_inspections vi
JOIN assets a ON a.id = vi.asset_id
```

puis interroger un ensemble correspondant conceptuellement à :

```text
vi.inspector
vi.company / organisme
vi.certification_number
vi.verification_type
vi.observations
vi.findings
vi.result/status
a.name
a.serial_number
a.category
a.current_location
a.qr_code
```

Uniquement les colonnes qui existent réellement dans le schéma doivent être utilisées.

Il ne faut inventer aucun champ pour satisfaire cette liste : lorsqu’un concept n’existe pas encore dans le modèle de données, il doit être signalé comme tel.

---

# 20. 50 résultats doit signifier « 50 résultats de la requête complète »

Exemple :

Base :

```text
8 400 inspections
```

Recherche :

```text
Berger
```

Correspondances réelles :

```text
327 inspections
```

Premier appel :

```text
327 résultats totaux
50 retournés
```

Deuxième appel :

```text
50 suivants
```

etc.

Il est interdit d’obtenir :

```text
50 dernières inspections chargées
↓
3 contiennent Berger
↓
UI affiche « 3 résultats »
```

si 327 existent réellement.

---

# 21. Count exact

Chaque endpoint de recherche doit différencier :

```text
returned_count
total_count
```

Exemple :

```json
{
  "items": [...50 rows...],
  "returned_count": 50,
  "total_count": 327,
  "has_more": true
}
```

Un compteur intitulé :

```text
327 inspections
```

ne doit jamais être dérivé de :

```ts
rows.length
```

lorsque `rows` représente seulement une page.

L’audit identifie déjà plusieurs compteurs calculés depuis des ensembles partiels ou non filtrés.

---

# 22. Manifest de champs : empêcher le retour du problème

Le problème actuel est aussi organisationnel : chaque page choisit manuellement quelques champs à rechercher.

Pour éviter une nouvelle dérive, chaque surface doit posséder une déclaration de ses champs.

Exemple :

```ts
const inspectionFields = {
  assetName: {
    visible: true,
    searchable: true,
    filterable: false,
    sortable: true,
  },

  serialNumber: {
    visible: true,
    searchable: true,
    filterable: false,
    sortable: true,
  },

  inspector: {
    visible: true,
    searchable: true,
    filterable: true,
    sortable: true,
  },

  company: {
    visible: true,
    searchable: true,
    filterable: true,
    sortable: true,
  },

  observations: {
    visible: true,
    searchable: true,
    filterable: false,
    sortable: false,
  }
}
```

Toute nouvelle donnée métier affichée doit donc recevoir explicitement une décision :

```text
searchable: true/false
filterable: true/false
sortable: true/false
```

`false` doit être intentionnel, pas le résultat de l’oubli du développeur.

---

# 23. Règle spécifique sur les champs visibles

Par défaut, lorsqu’une valeur métier textuelle est affichée à l’utilisateur, elle doit être considérée comme candidate à la recherche.

Exemples :

```text
Nom machine
Numéro de série
Inspecteur
Organisme
Email
Téléphone
Numéro de certificat
Type de vérification
Référence
Catégorie
Emplacement
Observation
Nom d'audit
Créateur
```

Les exceptions possibles sont principalement :

- texte de présentation ;
- label UI ;
- bouton/action ;
- valeur calculée ne possédant aucune utilité de récupération ;
- donnée volontairement exclue pour une raison documentée.

Il ne doit plus exister de champ métier affiché mais oublié du moteur simplement parce que le prédicat `.filter()` n’a jamais été mis à jour.

---

# 24. Recherche multi-termes

La recherche doit gérer proprement plusieurs termes.

Exemple :

```text
Norma Berger
```

doit pouvoir trouver une inspection contenant :

```text
company = Norma Contrôle
inspector = Berger
```

Les termes normalisés doivent être recherchés dans le même enregistrement métier ou son contexte relationnel pertinent.

On évitera qu’un terme corresponde à une inspection de 2024 et l’autre à une location totalement différente simplement pour faire apparaître artificiellement une machine.

La provenance doit permettre de comprendre le match.

---

# 25. URL et état

Pour les écrans importants, recherche, filtres et tri doivent idéalement pouvoir être représentés dans l’URL :

```text
?search=berger
&company=norma
&result=unfavorable
&sort=date_desc
&page=2
```

ou équivalent avec curseur.

Objectifs :

- refresh sans perdre le contexte ;
- bouton précédent/suivant cohérent ;
- possibilité de partager une vue ;
- comportement uniforme entre surfaces.

Aujourd’hui cette cohérence n’existe pas.

---

# 26. Performance

La nouvelle recherche relationnelle ne doit pas transformer chaque frappe clavier en scan complet coûteux.

Conserver un debounce partagé :

```text
300 ms
```

ou valeur commune décidée pour l’application.

Créer :

```text
lib/search/useDebounce.ts
lib/search/fold.ts
```

et ne plus recopier ces primitives dans chaque page.

Pour les recherches substring accent-insensitive, ajouter les index appropriés.

L’audit constate actuellement que Fleet fait des `ILIKE '%...%'` non indexés sur plusieurs colonnes.

La migration doit donc inclure, après validation de l’environnement :

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

puis des indexes GIN/trigram adaptés aux expressions réellement utilisées par la recherche.

Chaque optimisation doit être vérifiée avec :

```sql
EXPLAIN ANALYZE
```

avant/après.

---

# 27. Recherche et sécurité multi-tenant

Élargir la recherche ne doit jamais élargir la visibilité inter-organisation.

Toutes les relations traversées doivent conserver la même frontière organisationnelle que l’entité racine.

Exemple :

```text
asset org A
inspection org A
client org A
```

Un `EXISTS`, `JOIN`, RPC ou index de recherche ne doit jamais permettre à un terme appartenant à l’organisation B de provoquer un résultat dans A.

Les politiques RLS et/ou conditions tenant doivent être testées sur chaque nouvelle fonction serveur.

---

# 28. Inspections : aucune troncature silencieuse

L’historique VGP et son export sont actuellement exposés au plafond implicite d’environ 1 000 lignes selon la configuration observée dans le dépôt.

La recherche ne doit pas hériter de cette limite.

Même principe pour :

- écran ;
- recherche ;
- filtres ;
- compteurs ;
- export.

Une organisation possédant 4 700 inspections doit pouvoir rechercher les 4 700.

Le serveur peut les renvoyer par pages de 50.

Il ne peut pas agir comme si les 1 000 premières constituaient l’historique complet.

---

# 29. Export depuis une recherche

Lorsqu’un utilisateur filtre/recherche :

```text
Norma Contrôle
+
2025-01-01 → 2026-01-01
+
Défavorable
```

puis exporte, l’export doit être construit à partir de **la même définition serveur de la requête**, et non à partir des 50 lignes affichées.

Architecture :

```text
search parameters
       ↓
shared query builder / SQL function
       ↓
UI paginated result

same parameters
       ↓
same query semantics
       ↓
complete CSV export
```

Cela évite qu’écran et CSV divergent.

Ce point est particulièrement important puisque l’audit a déjà trouvé des colonnes différentes entre écran et export VGP, notamment `observations` vs `findings`.

---

# 30. Tests d’acceptation obligatoires

## Dataset de test

Créer suffisamment de données pour dépasser chaque limite historique :

```text
> 50 scans
> 50 assets
> 1 000 inspections
> 500 assets d’audit
> 1 000 assets d’audit
```

## Test pagination

Créer :

```text
120 scans
```

Placer le seul scan de `Berger` en position 93.

Sans charger la deuxième page dans l’UI :

```text
search "Berger"
```

Résultat attendu :

```text
le scan #93 est immédiatement retourné
```

## Test inspection par série

Inspection liée à :

```text
asset.serial_number = ABC-93847
```

Recherche inspection :

```text
ABC-93847
```

Résultat attendu :

```text
inspection trouvée
```

## Test Fleet par certificat

Inspection :

```text
certification_number = VGP-2026-482
asset = Nacelle A
```

Recherche Fleet :

```text
VGP-2026-482
```

Résultat attendu :

```text
Nacelle A
```

avec provenance :

```text
Inspection VGP · VGP-2026-482
```

## Test organisme

Créer 73 inspections Norma Contrôle distribuées dans un historique supérieur à 1 000 inspections.

Recherche :

```text
Norma Controle
```

Résultat attendu :

```text
total_count = 73
```

avec pagination correcte.

## Test inspecteur

Créer plusieurs inspections :

```text
Berger
```

sur plusieurs matériels.

Recherche :

```text
Berger
```

Résultat attendu :

```text
toutes les inspections de Berger
```

et Fleet doit également pouvoir retrouver les matériels concernés lorsque la recherche relationnelle Fleet est utilisée.

## Test accents

```text
securite → Sécurité
controle → Contrôle
elevateur → Élévateur
depot → Dépôt
```

Tous doivent correspondre.

## Test caractères spéciaux

```text
100%
TP_01
Dupont (SARL)
Martin, Jean
```

doivent rester recherchables sans suppression destructive de caractères.

## Test tenant

Créer le même certificat ou inspecteur dans deux organisations.

La recherche dans organisation A ne doit jamais retourner un objet de B.

## Test total

Si :

```text
327 correspondances
page size = 50
```

l’UI doit indiquer :

```text
327 résultats
```

et non :

```text
50 résultats
```

## Test export

Une recherche donnant :

```text
327 résultats
```

doit produire, si « exporter tous les résultats » est demandé :

```text
327 lignes métier
```

et non 50.

---

# 31. Definition of Done

La refonte recherche n’est terminée que lorsque :

1. aucune surface métier importante ne cherche uniquement dans une page déjà chargée ;
2. la pagination est réalisée après recherche et filtrage serveur ;
3. Fleet peut retrouver un matériel à partir de ses données propres et des relations historiques définies ci-dessus ;
4. l’historique des inspections peut rechercher matériel, série, inspecteur, organisme, certificat, observations, type et autres champs retenus ;
5. les résultats relationnels indiquent leur provenance ;
6. les accents sont normalisés partout ;
7. `%`, `_`, parenthèses, virgules et autres caractères pertinents ne provoquent plus les comportements actuellement documentés ;
8. filtres et tris s’exécutent sur le dataset complet ;
9. les compteurs distinguent page retournée et total réel ;
10. les historiques supérieurs à 1 000 lignes restent entièrement interrogeables ;
11. les exports utilisent les mêmes critères de recherche que l’écran ;
12. chaque champ métier visible possède une décision explicite `searchable/filterable/sortable` ;
13. la recherche respecte systématiquement les frontières multi-tenant ;
14. les tests dépassant 50, 500 et 1 000 enregistrements passent ;
15. une recherche peut trouver un enregistrement qui ne faisait pas partie de la première page avant la saisie.

---

# 32. Résultat produit attendu

Après cette refonte, TraviXO ne doit plus fonctionner comme :

```text
« voici les 50 choses que j’ai chargées,
je vais chercher dedans »
```

mais comme :

```text
« dis-moi ce que tu connais de cette machine,
de cette inspection,
de cet inspecteur,
de cet organisme,
de ce certificat,
de ce client ou de cet événement,
et retrouve-moi les objets correspondants dans toute la base
à laquelle j’ai accès. »
```

Le `50` reste uniquement une décision de pagination et d’affichage.

Il ne constitue jamais une frontière de connaissance.



Oui. Ce cas doit être ajouté explicitement, et il révèle surtout que **l’inventaire initial des recherches était incomplet** : il recensait huit boîtes de recherche principales, mais pas nécessairement les recherches embarquées dans les modales, sélecteurs, combobox, dropdowns ou formulaires métier. 

Ajoute ce bloc au cahier des charges :

---

## Recherche embarquée dans les modales, sélecteurs et formulaires

Le périmètre de la refonte ne couvre pas seulement les pages disposant d’une barre de recherche principale.

**Toute interface qui permet à l’utilisateur de chercher ou sélectionner un enregistrement existant est une surface de recherche à part entière** et doit respecter exactement le même contrat serveur.

Cela inclut notamment :

* modales ;
* drawers / sheets mobiles ;
* combobox ;
* autocomplete ;
* dropdowns recherchables ;
* sélecteurs d’assets ;
* sélecteurs de clients ;
* sélecteurs d’inspecteurs ;
* sélecteurs de membres ;
* sélecteurs d’emplacements ;
* sélecteurs d’audits ;
* sélecteurs liés aux locations, sorties, retours, inspections et autres workflows ;
* toute future interface affichant « rechercher… », « sélectionner… », « existant », « choisir… » ou équivalent.

### Cas concret : sortie d’un matériel → sélectionner un client existant

Dans la modale de sortie d’un matériel, l’option :

> **Sélectionner un client**

doit réellement permettre de rechercher l’ensemble des clients existants de l’organisation.

Ce moteur ne doit pas fonctionner comme :

```text
charger N clients
→ afficher N clients
→ rechercher uniquement dans cette liste
```

Il doit fonctionner comme :

```text
saisie utilisateur
→ requête serveur
→ recherche dans tous les clients autorisés de l'organisation
→ tri
→ pagination
→ retour des premiers résultats
```

### Champs recherchables dans le sélecteur client

La recherche d’un client existant doit au minimum couvrir :

```text
Nom
Société
Email
Téléphone
```

et les autres identifiants métier pertinents présents dans la fiche client.

C’est cohérent avec un défaut déjà identifié dans la page Clients : email et téléphone sont actuellement visibles mais non recherchables. 

Exemples :

```text
Dupont
```

→ Dupont Location

```text
06 12 34 56 78
```

→ client possédant ce téléphone

```text
contact@dupont.fr
```

→ client possédant cet email

```text
100% Béton
```

→ doit fonctionner avec le nom exact, sans destruction du `%`

```text
Bouygues Ile de France
```

→ doit pouvoir retrouver `Bouygues Île-de-France`

Les problèmes actuels de caractères supprimés et de recherche accent-sensitive doivent donc être corrigés également dans ces sélecteurs, pas uniquement dans `/clients`. 

---

## Aucun sélecteur ne doit dépendre de ce qui a déjà été chargé dans le navigateur

C’est une exigence générale.

Exemple :

```text
organisation = 4 200 clients
dropdown initial = 20 clients
```

L’utilisateur recherche :

```text
Martin Levage
```

et `Martin Levage` est le client n° 3 714.

Résultat attendu :

```text
Martin Levage apparaît immédiatement
```

L’utilisateur ne doit jamais avoir à :

```text
ouvrir
charger plus
charger plus
charger plus
...
puis rechercher
```

Le nombre de résultats initialement présentés dans un sélecteur est une **limite d’affichage**, jamais une limite de recherche.

---

## Recherche vide et suggestions initiales

Quand aucun texte n’est saisi, le composant peut afficher par exemple :

```text
clients récents
clients fréquemment utilisés
20 premiers clients alphabétiques
```

selon le workflow.

Mais dès qu’un caractère significatif est saisi :

```text
query.length >= seuil retenu
```

la recherche doit passer contre la base complète.

L’implémentation ne doit pas faire :

```ts
visibleClients.filter(...)
```

sur la collection préchargée.

---

## Sélection et création sont deux opérations distinctes

Dans la modale montrée :

```text
Sélectionner un client
Nouveau client
```

le premier mode doit rechercher la base existante.

Le second doit créer un véritable nouvel enregistrement.

Il ne faut jamais que l’échec de recherche pousse artificiellement l’utilisateur vers « Nouveau client ».

Exemple de bug fonctionnel à éviter :

```text
le client existe
↓
la recherche locale ne le trouve pas
↓
utilisateur pense qu'il n'existe pas
↓
crée un doublon
```

Cela transforme un simple défaut de recherche en **problème d’intégrité des données**.

Le système doit donc rendre difficile la création d’un doublon lorsqu’un client correspondant existe déjà.

Avant validation d’un nouveau client, il est pertinent de rechercher les correspondances existantes sur :

```text
nom
société
email
téléphone
```

et d’afficher une alerte non bloquante du type :

```text
Un client similaire existe déjà :
Dupont Location
06 12 34 56 78

Sélectionner ce client
Créer quand même
```

---

# Nouvelle exigence d’audit : inventorier les recherches par comportement, pas seulement par page

Le développeur doit effectuer un nouveau sweep du codebase.

Il ne faut plus rechercher uniquement :

```text
<SearchInput />
<input placeholder="Rechercher..." />
```

Il faut également identifier tous les composants et comportements correspondant à :

```text
filter()
includes()
toLowerCase().includes()
searchTerm
searchQuery
query
filteredItems
filteredClients
filteredAssets
filteredUsers
filteredInspections
Combobox
Command
CommandInput
Select
Autocomplete
Popover
Dialog
Modal
Drawer
Sheet
```

ainsi que toute requête déclenchée depuis une sélection métier.

Le but est de produire **l’inventaire exhaustif de toutes les recherches explicites et implicites du produit**, y compris celles cachées dans les workflows.

---

# Critère d'acceptation supplémentaire

La refonte Search n’est pas terminée tant que ce test n’est pas vrai :

> **Depuis n’importe quelle page, modale, dropdown ou workflow où TraviXO demande de sélectionner un objet existant, saisir un identifiant valide de cet objet doit permettre de le retrouver même s’il n’était pas présent dans les données initialement chargées dans le navigateur.**

Exemples obligatoires :

```text
Sortie matériel
→ rechercher un client non présent dans les 20/50 premiers
→ trouvé
```

```text
Créer inspection
→ rechercher une machine non présente dans la première page
→ trouvée
```

```text
Filtrer historique
→ rechercher un inspecteur présent uniquement dans de vieux enregistrements
→ trouvé
```

```text
Audit
→ rechercher une machine située au-delà de la première page
→ trouvée
```

```text
Toute future combobox
→ recherche serveur complète
→ pagination seulement après matching
```

Et j’ajouterais une règle d’implémentation très explicite au ticket développeur :

> **Do not interpret “search surfaces” as pages containing a search bar. Audit every component where a user can type text to locate an existing database record. Modal selectors, autocomplete fields, searchable dropdowns and workflow pickers are first-class search surfaces and must use server-side full-dataset search.**

Le cas de ta capture est exactement le genre de bug qui doit disparaître : **« sélectionner un client existant » avec une recherche incapable de retrouver le client existant rend la fonctionnalité contradictoire avec son propre libellé.**
