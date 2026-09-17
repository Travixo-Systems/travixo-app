# Conducteur minuté : webinaire DLR, catégorie technique

**Titre** : La machine n'a pas d'historique.
**Format** : 40 minutes d'exposé, 15 minutes de questions.
**Support** : `TraviXO_Webinaire_DLR_Technique.pdf`, 26 diapositives, 16:9.
**Généré par** : `scripts/deck/build_webinar_dlr.py`

Les minutages sont des cibles, pas des contraintes. La seule qui compte vraiment :
**être sur la diapositive 21 à la 33e minute**. Si vous y êtes en retard, coupez dans
le bloc 04, jamais dans le bloc 01.

---

## Vue d'ensemble

| Bloc | Diapos | Durée | Minute de fin |
|---|---|---|---|
| 00 · Cadrage | 1 à 2 | 3 min | 03 |
| 01 · Le problème | 3 à 9 | 12 min | 15 |
| 02 · Le calendrier | 10 à 13 | 8 min | 23 |
| 03 · Les familles | 14 à 16 | 6 min | 29 |
| 04 · Les décisions | 17 à 20 | 6 min | 35 |
| 05 · Un exemple | 21 à 23 | 4 min | 39 |
| Lundi matin | 24 | 1 min | 40 |
| Questions | 25 à 26 | 15 min | 55 |

---

## Bloc 00 · Cadrage (3 min)

### Diapo 01 · Couverture (45 s)

Ne lisez pas le titre, il est écrit. Dites d'où vient la question.

> « Bonjour. Le titre est volontairement sec : la machine n'a pas d'historique.
> Pas votre machine en particulier. La machine, comme objet informatique, dans la
> plupart des architectures que j'ai regardées, y compris les bonnes. Je vais
> essayer de vous montrer pourquoi, et ce que la réglementation en dit, parce
> qu'elle en dit plus qu'on ne le croit. »

Annoncez le déroulé en une phrase : diagnostic, calendrier réglementaire, familles
de solutions, décisions de construction, un exemple, et six choses à faire lundi.

### Diapo 02 · Déclaration d'intérêt (2 min 15)

**C'est la diapositive la plus importante pour votre crédibilité.** Ne la survolez pas.

Dites-le dans cet ordre exact :
1. Je construis un logiciel dans cette catégorie.
2. Je le dis maintenant, à la deuxième diapositive, pas à la vingt-deuxième.
3. Il apparaît quatre minutes, à la fin, avec ce qu'il ne fait pas.
4. Tout le reste est utilisable sans moi.

> « Si à la fin vous trouvez que l'exposé a penché, la faute sera la mienne, et vous
> aurez eu de quoi la repérer dès le début. »

**Ne dites pas** : « je ne suis pas là pour vendre ». Tout le monde dit ça. Montrez-le
par la structure, ne le promettez pas par la parole.

---

## Bloc 01 · Le problème (12 min)

### Diapo 03 · Intertitre (10 s)

Enchaînez. Ne commentez pas les intertitres, jamais, de tout l'exposé.

### Diapo 04 · La thèse que je ne vais pas défendre (2 min 30)

**C'est la diapositive qui vous achète la salle.** Elle dit : je connais votre marché,
pas une caricature de votre marché.

Citez les quatre portails par leur nom, lentement. Apogée One, BV-Link, Sherlok,
Avantage. Mentionnez les puces NFC d'Apave. Une partie de la salle va reconnaître
son propre fournisseur, et à ce moment-là vous cessez d'être « le gars qui vend un
logiciel » pour devenir « quelqu'un qui a fait ses devoirs ».

Puis la phrase de prévalence :

> « Je n'ai trouvé aucune étude sur l'état réel des parcs français. Je ne dirai donc
> jamais « la plupart des loueurs ». Je décris un mécanisme, pas une proportion. »

**Ne dites jamais** « la plupart des loueurs », « en général les loueurs », « on sait
que ». Quelqu'un dans cette salle a la donnée, vous non.

### Diapo 05 · Cinq systèmes (2 min)

Parcourez les cinq boîtes vite. Insistez sur une seule chose : les deux boîtes
orange, organisme A et organisme B. Le changement de prestataire en 2023 est
l'exemple le plus parlant, parce que tout le monde dans la salle l'a vécu.

Posez la question à voix haute, puis **taisez-vous trois secondes**. C'est le seul
silence volontaire de l'exposé, utilisez-le.

### Diapo 06 · Ce que le texte permet et exige (3 min)

Colonne gauche d'abord, lentement, article par article. Le point à faire passer :
**la dispersion n'est pas une faute, elle est explicitement autorisée par R4323-26.**

Puis colonne droite. Lisez les quatre puces. Marquez sur la dernière.

> « L'article 15 ne demande pas le dernier rapport. Il demande le dernier rapport
> **et l'historique**. C'est un mot, et c'est tout l'écart. »

### Diapo 07 · L'article 15 va plus loin (2 min 30)

**C'est le sommet technique de l'exposé.** Lisez l'encadré presque mot pour mot, en
insistant sur « à la condition qu'il ait subi régulièrement les vérifications
périodiques depuis la date de la première opération de location ».

Puis la traduction, qui est votre phrase la plus importante des 40 minutes :

> « Le régime allégé que vous appliquez à chaque sortie repose sur une chaîne que
> vous devez pouvoir produire. Pas sur la dernière vérification. Sur la chaîne. »

**Précaution à dire à voix haute** : « J'ai resserré la formulation de l'article pour
qu'elle tienne sur une diapositive. Le texte intégral est sur Légifrance et je vous
invite à le lire, il est court. » Cela vous protège d'un juriste dans la salle.

### Diapo 08 · L'identité (2 min)

Le schéma se lit tout seul. Faites la démonstration par le numéro de parc : une
machine qui change d'agence change de numéro, donc l'historique indexé sur le
numéro de parc se coupe au transfert. Tout le monde a vécu ça.

### Diapo 09 · Deux plans de données (1 min 45)

Allez vite, c'est un tableau. Retenez-en une ligne : « si on le perd ». Le plan A se
reconstitue au relevé suivant, le plan B ne se reconstitue pas. C'est toute la
différence de traitement.

---

## Bloc 02 · Le calendrier (8 min)

### Diapo 10 · Intertitre (10 s)

### Diapo 11 · La frise (2 min 30)

Attaquez par le 12 septembre 2026, marqué en orange. **Vérifiez la date du jour avant
le webinaire et ajustez la formule.** Si vous présentez plus de trois semaines après
le 12 septembre 2026, remplacez « il y a cinq jours » par la formulation exacte, et
corrigez la diapositive dans le script de génération.

### Diapo 12 · Data Act (2 min 30)

Le point qui intéresse vraiment la salle : **c'est le loueur qui est l'utilisateur**,
donc c'est lui qui a le droit d'accès. Beaucoup l'ignorent.

Puis le piège, que vous devez formuler comme un avertissement et pas comme une
vente :

> « Vous allez obtenir des flux. Sans clé d'identité, un droit d'accès produit un
> deuxième silo, pas une intégration. Et celui-là aura l'air d'un succès. »

### Diapo 13 · ISO 15143-3 et Règlement Machines (3 min)

Gauche : ce que le standard donne et ce qu'il ne donne pas. Ne dénigrez jamais la
télématique, dites qu'elle fait très bien ce pour quoi elle est faite.

Droite : le lien avec l'article 15. La même étiquette doit résoudre vers la notice à
jour **et** vers l'historique. C'est la convergence, et elle est dans quatre mois.

---

## Bloc 03 · Les familles (6 min)

### Diapo 14 · Intertitre (10 s)

### Diapo 15 · Le tableau (3 min 30)

Annoncez d'emblée que vous restez au niveau des familles.

> « Je ne cite pas de marques dans ce tableau. Elles existent, elles sont bonnes dans
> leur famille, et plusieurs d'entre elles sont probablement dans cette salle. Si
> vous voulez des noms, posez la question, j'y répondrai. »

Cela transforme une esquive en offre, et vous garde la main.

Ne lisez pas les quinze cellules. Faites trois lignes seulement :
- télématique : ne produit aucune preuve, et le coût par machine exclut les élingues et les manilles, qui sont pourtant soumises à vérification ;
- portails des organismes : chaque portail ne détient que sa propre période ;
- tenue interne : le risque n'est pas la non-conformité, c'est le départ de la personne qui tient le fichier.

### Diapo 16 · Le trou (2 min 20)

Le test à deux questions est la partie à faire retenir. Demandez à la salle de le
noter. C'est le moment où les gens prennent leur téléphone, et c'est bon signe.

---

## Bloc 04 · Les décisions (6 min)

### Diapo 17 · Intertitre (10 s)

### Diapos 18 et 19 · Les huit décisions (4 min pour les deux)

Vous n'avez pas le temps de développer les huit. Développez-en **trois** et
mentionnez les cinq autres.

Les trois à développer :
- **01 · la clé canonique**, parce que c'est la seule qui ne se rattrape pas ;
- **05 · la preuve en ajout seul**, parce que c'est la plus forte conceptuellement ;
- **06 · une inspection, une transaction**, parce que c'est là que vous racontez votre propre erreur, et l'aveu vaut plus que la démonstration.

Sur la 06, dites-le franchement :

> « Je l'ai écrit en trois écritures séparées d'abord. Deux échecs sur trois passaient
> inaperçus. Je ne l'ai pas vu en relisant le code, je l'ai vu en écrivant le
> commentaire de la fonction qui l'a remplacée. »

### Diapo 20 · La reprise (1 min 50)

La liste des cinq anomalies de fichier fait toujours rire une salle de professionnels,
parce que tout le monde reconnaît la colonne « observations ». Laissez le rire.

Puis la décision : imposer un format et le projet meurt en réunion, ou accepter le
fichier et mettre l'intelligence dans l'import. Pas de troisième voie.

---

## Bloc 05 · Un exemple (4 min)

### Diapo 21 · Intertitre (10 s)

**Regardez l'heure ici.** Si vous êtes au-delà de la 34e minute, supprimez la diapo 23
et gardez 22 plus 24.

### Diapo 22 · État réel (2 min)

Dites « zéro client payant à ce jour » **en le lisant sur la diapositive**, pas de
mémoire. Le fait que ce soit écrit change la réception : ce n'est pas un aveu arraché,
c'est une information que vous avez préparée.

Ne vous excusez pas derrière. Enchaînez immédiatement sur ce que vous cherchez : des
parcs réels qui mettent le modèle en défaut.

### Diapo 23 · Périmètre (1 min 50)

Passez plus de temps sur la colonne droite que sur la gauche. C'est contre-intuitif
et c'est exactement pour ça que ça marche.

Terminez sur la décision 05, pas sur le produit :

> « Si vous ne retenez qu'une chose de ces quatre minutes, que ce ne soit pas mon
> produit. Que ce soit : une preuve modifiable n'est pas une preuve, quel que soit
> l'éditeur qui vous la vend. »

---

## Diapo 24 · Lundi matin (1 min)

Lisez les six titres, pas les corps de texte. Dites que la diapositive sera dans le
replay et qu'elle est faite pour être capturée en photo.

---

## Questions · 15 min

### Diapo 25

Affichez-la et laissez-la à l'écran pendant toutes les questions. Les trois questions
listées servent d'amorce si la salle est lente à démarrer : au bout de dix secondes de
silence, répondez vous-même à la première.

### Diapo 26 · Sources

Affichez-la en clôture, pendant les trente dernières secondes. Dites qu'elle est dans
le replay. Sur un webinaire technique, une diapositive de sources vaut plus qu'une
diapositive de contact.

---

## Les trois pièges de ce format

1. **Le dérapage du bloc 01.** Il est le plus intéressant à raconter et il déborde
   toujours. Si vous passez la 16e minute sur la diapo 09, sautez la diapo 13 en
   entier : le Règlement Machines peut se dire en une phrase sur la diapo 11.

2. **La tentation de répondre aux questions pendant l'exposé.** Sur un webinaire,
   les questions arrivent en écrit et en continu. Ne les lisez pas en direct.
   Annoncez à la diapo 01 que vous les prendrez toutes à la fin.

3. **La dernière minute qui glisse vers la vente.** Votre dernière phrase avant les
   questions doit être la décision 05, pas une invitation. L'invitation se fait en
   réponse à une question, jamais au micro fermé.
