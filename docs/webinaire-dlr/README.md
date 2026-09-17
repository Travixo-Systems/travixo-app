# Webinaire DLR, catégorie technique

**La machine n'a pas d'historique.**
40 minutes d'exposé, 15 minutes de questions.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `conducteur.md` | Script minuté, bloc par bloc, avec ce qu'il faut dire et ne pas dire. |
| `questions-reponses.md` | Les douze questions dangereuses et leurs réponses préparées. |
| `sources.md` | Chaque affirmation réglementaire avec sa référence, et ce qui a été écarté faute de vérification. |
| `../../scripts/deck/build_webinar_dlr.py` | Générateur du deck PDF. |

## Régénérer le deck

```bash
python3 scripts/deck/build_webinar_dlr.py TraviXO_Webinaire_DLR_Technique.pdf
```

Dépendances : `reportlab`, et les polices dans `assets/fonts/` (Poppins et IBM Plex
Mono, licence OFL).

## Pourquoi cette structure, et pas la structure demandée au départ

La demande initiale était : problème technique, solutions existantes en restant vague
sur les concurrents, puis TraviXO comme une des solutions qui arrive. Trois raisons
de s'en écarter.

**1. C'est la structure d'un webinaire commercial, et la salle la connaît.**
Problème, marché, produit : c'est l'entonnoir standard. DLR a placé l'intervention en
catégorie technique. Une salle qui voit arriver l'entonnoir décroche, et le mal est
fait pour les interventions suivantes.

**2. La thèse « le VGP est encore du papier » est fausse en 2026.** Apave, Bureau
Veritas, Dekra et Socotec livrent leurs rapports par portail client, Apave pose des
puces NFC sur les équipements. Les ERP de location gèrent des documents attachés.
Plusieurs logiciels de parc font déjà QR plus documents réglementaires. Construire
l'exposé sur ce diagnostic aurait été démontable par n'importe qui dans la salle.

La thèse retenue résiste à cette objection, parce qu'elle l'intègre : le document est
déjà numérique, et la machine n'a quand même pas d'historique continu.

**3. L'argument juridique est plus fort que l'argument commercial.** L'article 15 de
l'arrêté du 1er mars 2004, qui vise spécifiquement les appareils loués, exige que
l'historique des vérifications accompagne la machine, et conditionne le régime allégé
de remise en location à la régularité des vérifications depuis la première location.
Dans le même temps, l'article R4323-26 autorise expressément le rapport à être
archivé ailleurs. Le texte permet la dispersion et exige la continuité. Cet écart est
un fait vérifiable, pas une opinion d'éditeur, et c'est ce qui permet de faire un
exposé technique honnête sans vendre quoi que ce soit.

## Le choix sur les concurrents

Le deck reste au niveau des **familles**, jamais des marques. Deux raisons : ne pas
offrir de publicité gratuite, et ne pas s'exposer à une contestation factuelle sur le
périmètre d'un produit précis.

Les marques sont en revanche nommées dans `questions-reponses.md` et `sources.md`,
parce qu'il faut pouvoir répondre sans hésiter si la question vient. Rester vague en
préparation est le seul vrai risque.
