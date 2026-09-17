# -*- coding: utf-8 -*-
"""
Deck generator: webinaire DLR, categorie technique.
"La machine n'a pas d'historique" - 40 min + 15 min de questions.

Visual system inherited from the TraviXO / Kobo portfolio:
  ink #12202a, mid #45565e, light #79868e, accent #e2571f, paper #ffffff
  Poppins for prose, IBM Plex Mono tracked-out for labels.

Usage: python3 scripts/deck/build_webinar_dlr.py [output.pdf]
"""
import os
import sys

from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ---------------------------------------------------------------- design system

W, H = 960.0, 540.0                     # 16:9, the right shape for a webinar
ML, MR, MT, MB = 58.0, 58.0, 46.0, 40.0
CW = W - ML - MR

INK = HexColor("#12202a")
MID = HexColor("#45565e")
LIGHT = HexColor("#79868e")
ACCENT = HexColor("#e2571f")
RULE = HexColor("#dfe3e5")
PANEL = HexColor("#f4f6f7")
PANEL_WARM = HexColor("#fdf1ea")
PAPER = HexColor("#ffffff")

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "fonts")

FACES = {
    "P": ("Poppins-Regular.ttf", "Poppins"),
    "PM": ("Poppins-Medium.ttf", "Poppins-Md"),
    "PS": ("Poppins-SemiBold.ttf", "Poppins-Sb"),
    "PB": ("Poppins-Bold.ttf", "Poppins-Bd"),
    "M": ("IBMPlexMono-Regular.ttf", "Plex-Rg"),
    "MM": ("IBMPlexMono-Medium.ttf", "Plex-Md"),
    "MS": ("IBMPlexMono-SemiBold.ttf", "Plex-Sb"),
}
F = {}


def register_fonts():
    for key, (filename, name) in FACES.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, filename)))
        F[key] = name


# ---------------------------------------------------------------- primitives

def tracked(c, text, x, y, font, size, tracking, color, upper=True):
    """Letter-spaced label, the signature of the house style.

    Drawn glyph by glyph rather than via setCharSpace, which is not exposed on
    the Canvas in every ReportLab release.
    """
    if upper:
        text = text.upper()
    c.setFillColor(color)
    c.setFont(font, size)
    cursor = x
    for ch in text:
        c.drawString(cursor, y, ch)
        cursor += pdfmetrics.stringWidth(ch, font, size) + tracking
    return cursor - x


def tracked_width(text, font, size, tracking, upper=True):
    if upper:
        text = text.upper()
    return pdfmetrics.stringWidth(text, font, size) + tracking * len(text)


def wrap(text, font, size, maxw):
    """Greedy wrap. Honours an explicit \n as a hard break."""
    out = []
    for hard in text.split("\n"):
        words, line = hard.split(), ""
        for word in words:
            probe = word if not line else line + " " + word
            if pdfmetrics.stringWidth(probe, font, size) <= maxw:
                line = probe
            else:
                if line:
                    out.append(line)
                line = word
        out.append(line)
    return out


def para(c, text, x, y, font, size, leading, maxw, color, align="left"):
    """Draw a wrapped paragraph downward from y. Returns the next free baseline."""
    c.setFillColor(color)
    c.setFont(font, size)
    for line in wrap(text, font, size, maxw):
        if align == "right":
            c.drawRightString(x + maxw, y, line)
        elif align == "center":
            c.drawCentredString(x + maxw / 2.0, y, line)
        else:
            c.drawString(x, y, line)
        y -= leading
    return y


def para_height(text, font, size, leading, maxw):
    return len(wrap(text, font, size, maxw)) * leading


def rule(c, x, y, w, color=RULE, weight=0.6):
    c.setStrokeColor(color)
    c.setLineWidth(weight)
    c.line(x, y, x + w, y)


# ---------------------------------------------------------------- chrome

STATE = {"n": 0, "section": ""}


def footer(c, section=None):
    y = MB - 8
    tracked(c, "TraviXO Systems  ·  Webinaire DLR  ·  Catégorie technique",
            ML, y, F["M"], 6.2, 0.7, LIGHT)
    label = section if section is not None else STATE["section"]
    if label:
        txt = ("%s  ·  %02d" % (label, STATE["n"])).upper()
    else:
        txt = "%02d" % STATE["n"]
    w = tracked_width(txt, F["M"], 6.2, 0.7)
    tracked(c, txt, W - MR - w, y, F["M"], 6.2, 0.7, LIGHT)


def page(c, bg=PAPER):
    STATE["n"] += 1
    c.setFillColor(bg)
    c.rect(0, 0, W, H, fill=1, stroke=0)


def header(c, eyebrow, title, deck=None, deckw=None, title_size=27):
    """Standard slide head. Returns the baseline where body content may start."""
    y = H - MT
    tracked(c, eyebrow, ML, y, F["MM"], 7.4, 2.1, ACCENT)
    y -= 27
    c.setFillColor(INK)
    c.setFont(F["PS"], title_size)
    for line in wrap(title, F["PS"], title_size, CW):
        c.drawString(ML, y, line)
        y -= title_size * 1.22
    y -= 4
    if deck:
        y = para(c, deck, ML, y, F["P"], 10.4, 15.4, deckw or (CW * 0.74), MID)
        y -= 6
    rule(c, ML, y, CW)
    return y - 30


# ---------------------------------------------------------------- blocks

def block(c, x, y, w, label, body, label_color=INK, body_size=10.0, leading=14.6,
          bar=True, bar_color=ACCENT):
    """Labelled text block with the signature left bar."""
    top = y
    if bar:
        c.setFillColor(bar_color)
        c.rect(x, y - 1.5, 15, 1.6, fill=1, stroke=0)
        y -= 14
    tracked(c, label, x, y, F["MM"], 7.0, 1.55, label_color)
    y -= 14
    y = para(c, body, x, y, F["P"], body_size, leading, w, MID)
    return top - y


KICKER_BOTTOM = MB + 30


def block_height(w, body, body_size=10.0, leading=14.6, bar=True, **_):
    return (14 if bar else 0) + 14 + para_height(body, F["P"], body_size, leading, w)


def grid(c, items, y, cols=4, gap=26, row_gap=26, bottom=None, **kw):
    """Lay labelled blocks out in a grid, vertically centred in the free space.

    items = [(label, body), ...]. `bottom` is the first y the grid must not
    cross; it defaults to the top of an average two-line closing band, so most
    slides balance without the call site having to measure anything.
    """
    colw = (CW - gap * (cols - 1)) / cols
    rows = (len(items) + cols - 1) // cols
    heights = []
    for r in range(rows):
        chunk = items[r * cols:(r + 1) * cols]
        heights.append(max(block_height(colw, body, **kw) for _, body in chunk))
    total = sum(heights) + row_gap * (rows - 1)

    floor = KICKER_BOTTOM + 64 if bottom is None else bottom
    slack = (y - floor) - total
    if slack > 0:
        y -= slack / 2.0

    top = y
    for r in range(rows):
        chunk = items[r * cols:(r + 1) * cols]
        for i, (label, body) in enumerate(chunk):
            block(c, ML + i * (colw + gap), top, colw, label, body, **kw)
        top -= heights[r] + row_gap
    return top + row_gap


def stat(c, x, y, figure, label, figure_size=30, color=INK):
    c.setFillColor(color)
    c.setFont(F["PS"], figure_size)
    c.drawString(x, y, figure)
    tracked(c, label, x, y - 14, F["MM"], 6.6, 1.5, LIGHT)
    return max(pdfmetrics.stringWidth(figure, F["PS"], figure_size),
               tracked_width(label, F["MM"], 6.6, 1.5))


def kicker(c, text, y=None, color=INK, size=12.2, panel=True, fill=PANEL_WARM):
    """The punchline strip that closes most slides.

    With no y, the strip is anchored near the foot of the slide so every slide
    carries its conclusion at the same height. Passing y pins the strip's top
    instead, for the few slides whose body runs long.
    """
    h = para_height(text, F["PM"], size, size * 1.44, CW - 44) + 30
    top = (KICKER_BOTTOM + h) if y is None else y
    c.setFillColor(fill)
    c.rect(ML, top - h, CW, h, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(ML, top - h, 2.6, h, fill=1, stroke=0)
    para(c, text, ML + 24, top - 20, F["PM"], size, size * 1.44, CW - 48, color)
    return top - h


def source(c, text, y=None):
    y = y if y is not None else MB + 16
    para(c, text, ML, y, F["M"], 6.4, 9.0, CW, LIGHT)


# ---------------------------------------------------------------- slide types

def slide_cover(c):
    page(c)
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, H - 4, W, 4, fill=1, stroke=0)

    y = H - 118
    c.setFillColor(PAPER)
    c.setFont(F["PB"], 30)
    c.drawString(ML, y + 74, "TraviXO")
    tracked(c, "S y s t e m s", ML + 2, y + 58, F["MM"], 7.6, 3.4, ACCENT)

    tracked(c, "Webinaire DLR  ·  Catégorie technique", ML, y + 10, F["MM"], 7.6, 2.2,
            HexColor("#8fa0a9"))
    y -= 26
    c.setFillColor(PAPER)
    c.setFont(F["PB"], 46)
    c.drawString(ML, y, "La machine n'a pas d'historique.")
    y -= 40
    c.setFont(F["P"], 15.5)
    c.setFillColor(HexColor("#b3c0c7"))
    for line in wrap("Ce que l'arrêté du 1er mars 2004 exige d'un appareil loué, "
                     "et pourquoi cinq systèmes numériques ne le produisent toujours pas.",
                     F["P"], 15.5, CW * 0.82):
        c.drawString(ML, y, line)
        y -= 22

    ys = MB + 74
    rule(c, ML, ys + 30, CW, HexColor("#2c3c46"), 0.8)
    x = ML
    for figure, label in [("40", "minutes d'exposé"),
                          ("15", "minutes de questions"),
                          ("05", "familles de solutions passées en revue"),
                          ("04", "minutes sur mon produit, à la fin")]:
        c.setFillColor(ACCENT)
        c.setFont(F["PS"], 27)
        c.drawString(x, ys, figure)
        tracked(c, label, x, ys - 14, F["MM"], 6.4, 1.4, HexColor("#8fa0a9"))
        x += max(tracked_width(label, F["MM"], 6.4, 1.4), 40) + 30

    tracked(c, "Uwa Chidera Ugboaja  ·  TraviXO Systems  ·  app.travixosystems.com",
            ML, MB - 6, F["M"], 6.6, 1.2, HexColor("#6d7f88"))


def slide_section(c, number, title, thesis):
    page(c)
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(ML, H / 2 + 62, 52, 2.6, fill=1, stroke=0)

    c.setFillColor(HexColor("#2f414c"))
    c.setFont(F["PB"], 132)
    c.drawRightString(W - MR, MB + 26, number)

    y = H / 2 + 30
    c.setFillColor(PAPER)
    c.setFont(F["PS"], 38)
    for line in wrap(title, F["PS"], 38, CW * 0.72):
        c.drawString(ML, y, line)
        y -= 46
    y -= 10
    c.setFillColor(HexColor("#9fb0b8"))
    c.setFont(F["P"], 13.2)
    for line in wrap(thesis, F["P"], 13.2, CW * 0.6):
        c.drawString(ML, y, line)
        y -= 19
    STATE["section"] = title


# ---------------------------------------------------------------- content

SLIDES = []
DARK_SLIDES = {"s_cover", "s_sec1", "s_sec2", "s_sec3", "s_sec4", "s_sec5", "s_questions"}


def slide(fn):
    SLIDES.append(fn)
    return fn


def build(path):
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setTitle("La machine n'a pas d'historique - Webinaire DLR, categorie technique")
    c.setAuthor("Uwa Chidera Ugboaja - TraviXO Systems")
    c.setSubject("Identite machine, preuve reglementaire et historique continu chez le loueur")

    for fn in SLIDES:
        fn(c)
        if fn.__name__ not in DARK_SLIDES:
            footer(c)
        c.showPage()
    c.save()
    return path




# ================================================================ 00 · CADRAGE

@slide
def s_cover(c):
    slide_cover(c)


@slide
def s_disclosure(c):
    page(c)
    STATE["section"] = "Cadrage"
    y = header(
        c,
        "Cadrage  ·  déclaration d'intérêt",
        "Je construis un logiciel dans la catégorie dont je vais parler",
        "Je le dis maintenant, à la deuxième diapositive, pour que vous lisiez tout le reste "
        "en connaissance de cause. Si à la fin vous trouvez que l'exposé a penché, la faute "
        "sera la mienne et vous aurez eu de quoi la repérer.",
    )
    y = grid(c, [
        ("Ce que c'est",
         "Un exposé technique sur un problème de modélisation de données que tout loueur "
         "rencontre, quelle que soit la solution qu'il finit par choisir. Le sujet est la "
         "continuité de l'historique d'une machine, pas un produit."),
        ("Ce que ce n'est pas",
         "Une démonstration. Mon produit apparaît en fin de parcours, pendant quatre minutes, "
         "comme un exemple d'implémentation parmi d'autres, avec ce qu'il ne fait pas."),
        ("D'où je parle",
         "J'ai travaillé en exploitation chez Loxam avant d'écrire du logiciel. Les deux "
         "moitiés de cet exposé viennent de là : ce que j'ai vu sur un parc, et ce que j'ai "
         "cassé en essayant de le modéliser."),
        ("Ce que vous en repartez avec",
         "Six vérifications à faire sur votre parc lundi matin, sans rien acheter. Elles "
         "restent valables si vous ne me recontactez jamais, ce qui est l'hypothèse la plus "
         "probable et très bien ainsi."),
    ], y, cols=4)

    kicker(c, "Une règle pour les 40 minutes : tout ce que j'avance sur la réglementation est "
              "sourcé en dernière diapositive, avec l'article et la date de consultation. "
              "Si un chiffre n'a pas de source, je ne le dis pas.")


# ================================================================ 01 · PROBLÈME

@slide
def s_sec1(c):
    slide_section(c, "01", "Le problème",
                  "Le problème n'est pas le support. Le support est déjà numérique. "
                  "Le problème est la continuité.")


@slide
def s_strawman(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  01",
        "La thèse que je ne vais pas défendre",
        "On attend d'un intervenant comme moi qu'il ouvre par : « le suivi réglementaire, "
        "c'est encore du papier et des tableurs ». Je ne vais pas dire ça, parce qu'en 2026 "
        "c'est faux, et parce que vous le sauriez.",
    )

    colw = (CW - 30) / 2
    body_l = ("Les organismes de contrôle livrent leurs rapports par portail client : "
              "Apogée One chez Apave, BV-Link chez Bureau Veritas, Sherlok chez Dekra, "
              "Avantage chez Socotec.\n"
              "Apave pose par ailleurs des puces NFC sur l'équipement pendant l'intervention, "
              "pour que le rapport s'ouvre depuis un téléphone, devant la machine.\n"
              "Les ERP de location gèrent des documents attachés à la fiche matériel. "
              "Plusieurs logiciels de parc font déjà QR plus documents réglementaires.")
    body_r = ("Si je construisais l'exposé sur « il faut numériser vos VGP », je vendrais une "
              "solution à un problème que votre organisme a déjà résolu, et une partie de la "
              "salle décrocherait à la troisième diapositive.\n\n"
              "Je n'ai trouvé aucune étude de prévalence sur l'état réel des parcs français. "
              "Je ne dirai donc jamais « la plupart des loueurs ». Je décris un mécanisme, "
              "pas une proportion.")
    ph = max(para_height(body_l, F["P"], 9.4, 13.6, colw - 36),
             para_height(body_r, F["P"], 9.4, 13.6, colw - 36)) + 52
    c.setFillColor(PANEL)
    c.rect(ML, y + 12 - ph, colw, ph, fill=1, stroke=0)
    yy = y - 14
    tracked(c, "Le document est déjà numérique", ML + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 17
    para(c, body_l, ML + 18, yy, F["P"], 9.4, 13.6, colw - 36, MID)

    x2 = ML + colw + 30
    c.setFillColor(PANEL)
    c.rect(x2, y + 12 - ph, colw, ph, fill=1, stroke=0)
    yy = y - 14
    tracked(c, "Donc le problème est ailleurs", x2 + 18, yy, F["MM"], 7.0, 1.55, ACCENT)
    yy -= 17
    para(c, body_r, x2 + 18, yy, F["P"], 9.4, 13.6, colw - 36, MID)

    kicker(c, "Le VGP est numérique. La location est numérique. La maintenance est numérique. "
              "Et la machine n'a toujours pas un historique continu.")


@slide
def s_fragmentation(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  02",
        "Cinq systèmes, tous numériques, tous corrects, et aucune ligne continue",
        "Voici une entreprise très correctement outillée. Rien n'y est mal géré. "
        "Posez-lui pourtant une seule question.",
    )

    boxes = [
        ("ERP de location", "Machine\nClient\nContrat\nDates de sortie et de retour"),
        ("Portail organisme A", "Rapports VGP\n2019 à 2022\nRéserves émises"),
        ("Portail organisme B", "Rapports VGP\n2023 à 2026\nAppel d'offres gagné en 2023"),
        ("GED ou disque partagé", "Certificat CE\nNotice constructeur\nAnciens rapports"),
        ("La machine elle-même", "N° de série\nÉtiquette\nPochette de documents"),
    ]
    bw = (CW - 4 * 16) / 5
    top = y - 6
    for i, (title, body) in enumerate(boxes):
        x = ML + i * (bw + 16)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.8)
        c.rect(x, top - 116, bw, 116, fill=0, stroke=1)
        c.setFillColor(ACCENT if i in (1, 2) else INK)
        c.rect(x, top - 2.2, bw, 2.2, fill=1, stroke=0)
        yy = top - 20
        yy = para(c, title, x + 12, yy, F["PS"], 9.6, 13.0, bw - 24, INK)
        yy -= 3
        para(c, body, x + 12, yy, F["P"], 8.2, 12.0, bw - 24, MID)

    yq = top - 138
    tracked(c, "La question", ML, yq, F["MM"], 7.0, 1.55, ACCENT)
    yq -= 20
    c.setFillColor(INK)
    c.setFont(F["PS"], 17)
    c.drawString(ML, yq, "« Donnez-moi tout ce qui concerne la machine SN-82491, maintenant. »")

    kicker(c, "Aucun de ces cinq systèmes n'est en faute. Et répondre oblige quand même à "
              "traverser quatre d'entre eux, à la main, pendant que le client attend.")


@slide
def s_law_permits_requires(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  03",
        "Le texte autorise la dispersion, et exige la continuité",
        "C'est le cœur de l'exposé. Deux corps de règles, tous les deux en vigueur, "
        "qui tirent dans des directions opposées.",
        title_size=26,
    )

    colw = (CW - 30) / 2
    box_h = 236

    c.setFillColor(PANEL)
    c.rect(ML, y - box_h + 12, colw, box_h, fill=1, stroke=0)
    c.setFillColor(LIGHT)
    c.rect(ML, y + 12 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "Ce que le Code du travail autorise", ML + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    for art, txt in [
        ("R4323-25", "le résultat des vérifications générales périodiques est consigné "
                     "sur le ou les registres de sécurité de l'article L. 4711-5."),
        ("R4323-26", "si le vérificateur n'appartient pas à l'établissement, les rapports "
                     "sont annexés au registre. À défaut, le registre consigne la date des "
                     "vérifications, la date de remise des rapports, et leur lieu d'archivage."),
        ("R4323-27", "le registre et les rapports peuvent être tenus et conservés sur tout "
                     "support, dans les conditions de l'article L. 8113-6."),
    ]:
        tracked(c, art, ML + 18, yy, F["MS"], 6.8, 1.2, ACCENT)
        yy -= 11
        yy = para(c, txt, ML + 18, yy, F["P"], 8.5, 12.2, colw - 36, MID)
        yy -= 5
    para(c, "Autrement dit : le texte permet explicitement que le rapport soit ailleurs, "
            "du moment qu'on sait où.", ML + 18, yy - 1, F["PM"], 8.7, 12.2, colw - 36, INK)

    x2 = ML + colw + 30
    c.setFillColor(PANEL_WARM)
    c.rect(x2, y - box_h + 12, colw, box_h, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(x2, y + 12 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "Ce que l'arrêté exige, pour un appareil loué", x2 + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 17
    yy = para(c, "Article 15 de l'arrêté du 1er mars 2004. Sur l'appareil, ou à défaut à "
                 "proximité, doivent être placés :",
              x2 + 18, yy, F["P"], 8.5, 12.2, colw - 36, MID)
    yy -= 4
    for item in ["la notice d'instructions",
                 "les copies des rapports de vérification de mise en service",
                 "le dernier rapport de vérification périodique",
                 "l'historique des vérifications générales périodiques effectuées"]:
        emphasis = item.startswith("l'historique")
        c.setFillColor(ACCENT if emphasis else LIGHT)
        c.circle(x2 + 22, yy + 3.0, 2.0, fill=1, stroke=0)
        yy = para(c, item, x2 + 32, yy, F["PM"] if emphasis else F["P"], 8.7, 12.4,
                  colw - 52, INK if emphasis else MID)
        yy -= 2
    para(c, "Pas le dernier rapport seulement. L'historique.",
         x2 + 18, yy - 3, F["PM"], 8.7, 12.2, colw - 36, INK)

    kicker(c, "La loi permet à la preuve d'être dispersée, et demande à la machine de porter "
              "sa continuité. Cet écart n'est traité par aucune des cinq boîtes de la "
              "diapositive précédente. C'est le sujet.")
    source(c, "Code du travail, art. R4323-25 à R4323-27 et L. 4711-5. Arrêté du 1er mars 2004 "
              "relatif aux vérifications des appareils et accessoires de levage, art. 15. "
              "Consultés en septembre 2026, références complètes en dernière diapositive.")


@slide
def s_article15_condition(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  04",
        "Et l'article 15 va plus loin que la pochette de documents",
        "C'est la partie que je trouve la plus intéressante techniquement, parce qu'elle "
        "transforme un confort d'exploitation en condition juridique.",
        title_size=26,
    )

    c.setFillColor(PANEL_WARM)
    c.rect(ML, y - 92, CW, 100, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(ML, y - 92, 2.6, 100, fill=1, stroke=0)
    yy = y - 10
    tracked(c, "Article 15, premier alinéa, en substance", ML + 22, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    para(c,
         "Un appareil de levage d'occasion mis en location, qui ne nécessite pas d'installation "
         "de support particulière, relève seulement de l'examen d'adéquation, le cas échéant de "
         "l'examen de montage et d'installation, et des épreuves de fonctionnement prévues, "
         "à la condition qu'il ait subi régulièrement les vérifications générales périodiques "
         "depuis la date de la première opération de location par le loueur concerné.",
         ML + 22, yy, F["P"], 10.2, 14.6, CW - 44, MID)

    y2 = y - 112
    y2 = grid(c, [
        ("Ce que la condition implique",
         "Le régime allégé que vous appliquez à chaque nouvelle sortie repose sur une chaîne "
         "de vérifications ininterrompue, remontant à la première location de cette machine "
         "par votre société. Pas à la dernière. À la première."),
        ("Ce que ça demande au système",
         "Être capable de produire, pour une machine donnée, la suite complète et ordonnée de "
         "ses vérifications depuis son entrée en location. Sur toute sa vie, à travers les "
         "changements d'organisme, d'agence et de numéro de parc."),
        ("Et la responsabilité est partagée",
         "Le même article prévoit que le chef d'établissement utilisateur s'assure avec le "
         "loueur que la vérification de mise en service et les vérifications périodiques ont "
         "été effectuées. Deux organisations, une seule chaîne."),
    ], y2, cols=3)

    kicker(c, "La continuité de l'historique n'est donc pas une commodité d'exploitation. "
              "C'est la condition du régime que vous appliquez à chaque sortie de machine. "
              "Si la chaîne n'est pas productible, la condition n'est pas démontrable.")
    source(c, "Arrêté du 1er mars 2004, art. 15, renvoyant aux art. 5 (I et II), 6 (b) et 22 "
              "du même arrêté. Formulation resserrée pour la lecture ; texte intégral sur "
              "Légifrance, consulté en septembre 2026.")


@slide
def s_identity(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  05",
        "Une chaîne continue suppose une clé continue",
        "Voici pourquoi la continuité casse en pratique, et ce n'est presque jamais sur l'API.",
    )

    c.setFillColor(INK)
    c.rect(ML, y - 64, 176, 64, fill=1, stroke=0)
    tracked(c, "Une machine", ML + 16, y - 24, F["MM"], 7.2, 1.6, ACCENT)
    c.setFillColor(PAPER)
    c.setFont(F["PS"], 15)
    c.drawString(ML + 16, y - 46, "Mini-pelle 2,8 t")

    ids = [
        ("N° de parc", "ERP de location", "change quand la machine change d'agence"),
        ("N° de série", "constructeur", "saisi à la main, donc faux une fois sur combien ?"),
        ("ID télématique", "boîtier ou portail OEM", "appartient au boîtier, pas à la machine"),
        ("Ligne 247", "fichier de suivi", "l'ordre des lignes est une donnée, en pratique"),
        ("Étiquette", "sur la machine", "arrachée, repeinte, karchérisée, remplacée"),
    ]
    x = ML + 208
    colw = (CW - 208 - 4 * 12) / 5
    for i, (name, where, note) in enumerate(ids):
        xx = x + i * (colw + 12)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.8)
        c.rect(xx, y - 64, colw, 64, fill=0, stroke=1)
        yy = y - 17
        yy = para(c, name, xx + 10, yy, F["PS"], 9.0, 12.0, colw - 20, INK)
        tracked(c, where, xx + 10, yy, F["M"], 6.0, 0.9, ACCENT)
        yy -= 12
        para(c, note, xx + 10, yy, F["P"], 7.2, 10.0, colw - 20, LIGHT)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.8)
        c.line(ML + 176, y - 32, xx, y - 32)

    y2 = y - 86
    y2 = grid(c, [
        ("Le point de rupture",
         "Les projets d'intégration ne meurent pas sur le protocole. Ils meurent sur la clé de "
         "rapprochement : deux systèmes détiennent la même machine et rien ne prouve que c'est "
         "la même."),
        ("La décision à prendre",
         "Une clé interne opaque, qui n'est ni le numéro de parc, ni le numéro de série. Tout "
         "le reste devient un alias attaché à cette clé, avec une date de début et de fin."),
        ("Pourquoi maintenant",
         "C'est la seule décision de cette présentation qui ne se rattrape pas plus tard. "
         "Après dix mille machines et trois ans d'historique, reprendre la clé est un projet, "
         "pas un correctif."),
    ], y2, cols=3)

    kicker(c, "Un historique continu suppose une identité continue. Vérification concrète : "
              "comptez chez vous combien d'identifiants différents désignent la même machine. "
              "Au-delà de trois, c'est votre premier chantier, avant tout achat de logiciel.")


@slide
def s_two_planes(c):
    page(c)
    y = header(
        c,
        "Le problème  ·  06",
        "Deux plans de données que les outils confondent",
        "Dernière pièce du diagnostic. Ces deux plans n'ont ni la même fréquence d'écriture, "
        "ni la même durée de conservation, ni le même modèle de confiance.",
        title_size=26,
    )

    colw = (CW - 30) / 2
    rows = [
        ("Ce que c'est",
         "Position, heures moteur, carburant, codes défaut, statut",
         "Rapport de vérification, réserves, levée de réserves, notice, déclaration de conformité"),
        ("Qui le produit",
         "La machine, en continu, sans intervention humaine",
         "Une personne compétente ou un organisme, à une date, avec une signature"),
        ("Rythme",
         "Haute fréquence, flux, des milliers de points par jour",
         "Basse fréquence, événementiel, quelques points par an"),
        ("Valeur",
         "Opérationnelle et commerciale : facturation à l'usage, antivol, planification",
         "Juridique et opposable : c'est la pièce qu'on produit devant un tiers"),
        ("Si on le perd",
         "Gênant. On repart du relevé suivant.",
         "Il n'existe pas de relevé suivant. La preuve ne se reconstitue pas après coup."),
    ]

    c.setFillColor(PANEL)
    c.rect(ML, y - 228, colw, 240, fill=1, stroke=0)
    c.setFillColor(PANEL_WARM)
    c.rect(ML + colw + 30, y - 228, colw, 240, fill=1, stroke=0)
    tracked(c, "Plan A  ·  état machine", ML + 18, y - 8, F["MM"], 7.2, 1.6, INK)
    tracked(c, "Plan B  ·  preuve réglementaire", ML + colw + 48, y - 8, F["MM"], 7.2, 1.6, ACCENT)

    yy = y - 30
    for label, a, b in rows:
        tracked(c, label, ML + 18, yy, F["M"], 6.2, 1.0, LIGHT)
        tracked(c, label, ML + colw + 48, yy, F["M"], 6.2, 1.0, LIGHT)
        yy -= 11
        ha = para_height(a, F["P"], 8.6, 12.2, colw - 36)
        hb = para_height(b, F["P"], 8.6, 12.2, colw - 36)
        para(c, a, ML + 18, yy, F["P"], 8.6, 12.2, colw - 36, MID)
        para(c, b, ML + colw + 48, yy, F["P"], 8.6, 12.2, colw - 36, MID)
        yy -= max(ha, hb) + 6

    kicker(c, "La télématique est excellente sur le plan A, et elle ne prétend pas faire le "
              "plan B. Un compteur d'heures ne dit pas si la vérification est faite, "
              "ni si les réserves de la dernière sont levées. L'article 15 parle du plan B.")


# ================================================================ 02 · CALENDRIER

@slide
def s_sec2(c):
    slide_section(c, "02", "Le calendrier",
                  "Trois textes, trois plans de données, une fenêtre de dix-huit mois. "
                  "Aucun ne se règle en achetant un portail de plus.")


@slide
def s_timeline(c):
    page(c)
    y = header(
        c,
        "Le calendrier",
        "Ce qui a changé, ce qui change, et dans quel ordre",
        "Quatre échéances européennes et nationales touchent directement la donnée machine "
        "chez un loueur. Deux sont déjà passées, deux sont devant.",
    )

    events = [
        ("12 sept.\n2025", "Data Act (UE) 2023/2854",
         "Applicable. L'utilisateur d'un produit connecté a le droit d'accéder aux données "
         "générées par son usage, et de les faire partager à un tiers qu'il désigne.", False),
        ("1er sept.\n2026", "Facturation électronique",
         "Réception obligatoire pour toute entreprise assujettie à la TVA, via une plateforme "
         "agréée. Émission obligatoire pour les grandes entreprises et les ETI.", False),
        ("12 sept.\n2026", "Data Act, second palier",
         "Les produits connectés mis sur le marché à partir de cette date doivent être conçus "
         "pour que les données soient accessibles par défaut, facilement, de manière sécurisée "
         "et gratuitement.", True),
        ("20 janv.\n2027", "Règlement Machines (UE) 2023/1230",
         "Applicable, en remplacement de la directive 2006/42/CE. Notice d'instructions "
         "numérique par défaut pour les utilisateurs professionnels. Papier sur demande.", False),
        ("1er sept.\n2027", "Facturation électronique",
         "Obligation d'émission étendue aux PME, TPE et micro-entreprises.", False),
    ]

    axis_y = y - 74
    rule(c, ML, axis_y, CW, RULE, 1.2)
    bw = (CW - 4 * 14) / 5
    for i, (date, title, body, is_now) in enumerate(events):
        x = ML + i * (bw + 14)
        col = ACCENT if is_now else INK
        c.setFillColor(col)
        c.circle(x + 6, axis_y, 4.2, fill=1, stroke=0)
        yy = axis_y + 44
        for line in date.split("\n"):
            c.setFillColor(col)
            c.setFont(F["PS"], 12.5)
            c.drawString(x, yy, line)
            yy -= 14
        if is_now:
            tracked(c, "il y a cinq jours", x, axis_y + 12, F["MS"], 6.2, 1.1, ACCENT)
        yy = axis_y - 18
        yy = para(c, title, x, yy, F["PS"], 9.4, 12.6, bw - 6, INK)
        yy -= 2
        para(c, body, x, yy, F["P"], 8.0, 11.4, bw - 6, MID)

    kicker(c, "Le 12 septembre 2026 est passé la semaine dernière. Le 20 janvier 2027 est dans "
              "un peu plus de quatre mois. Ce sont les deux dates qui changent quelque chose "
              "à votre modèle de données, pas seulement à vos procédures.", axis_y - 116)
    source(c, "Règlement (UE) 2023/2854 ; règlement (UE) 2023/1230 ; calendrier de la "
              "facturation électronique, impots.gouv.fr et economie.gouv.fr. "
              "Consultés le 17 septembre 2026.")


@slide
def s_data_act(c):
    page(c)
    y = header(
        c,
        "Le calendrier  ·  Data Act",
        "Le Data Act retire l'argument « la donnée est chez le constructeur »",
        "C'est la meilleure nouvelle de cet exposé, et elle arrive avec une facture technique.",
    )
    y = grid(c, [
        ("Qui est l'utilisateur",
         "Dans un modèle de location, c'est le loueur qui est l'utilisateur formel du produit "
         "connecté, donc titulaire du droit d'accès aux données qu'il génère. L'ERA a publié "
         "un guide sectoriel consacré à cette question pour les loueurs."),
        ("Ce que vous pouvez demander",
         "Les données du produit et des services connexes, aisément disponibles, y compris "
         "leur mise à disposition à un tiers que vous désignez. Le locataire n'y a de droit "
         "que si votre contrat le prévoit, ce qui est une décision à prendre."),
        ("Le palier du 12 septembre 2026",
         "Pour les produits mis sur le marché à partir de cette date, l'accessibilité par "
         "défaut devient une exigence de conception : facilement, de manière sécurisée, "
         "gratuitement, quand c'est pertinent et techniquement faisable."),
        ("La facture technique",
         "Vous allez obtenir des flux. Il faut savoir quoi demander, où ça atterrit, à quelle "
         "fréquence, et surtout avec quelle clé de rapprochement. Retour à la diapositive 07."),
    ], y, cols=4)

    kicker(c, "Un droit d'accès sans clé d'identité produit un deuxième silo, pas une "
              "intégration. C'est le piège précis dans lequel je vous vois tomber "
              "dans les dix-huit mois, et il coûtera cher parce qu'il aura l'air d'un succès.")
    source(c, "Règlement (UE) 2023/2854 (Data Act), applicable depuis le 12 septembre 2025 ; "
              "obligation de conception au 12 septembre 2026. Guide ERA sur le Data Act "
              "pour les loueurs, erarental.org. Consultés le 17 septembre 2026.")


@slide
def s_iso_machines(c):
    page(c)
    y = header(
        c,
        "Le calendrier  ·  interopérabilité et notice",
        "Un standard que peu exploitent, et une notice qui devient numérique",
        title_size=26,
    )

    colw = (CW - 30) / 2
    box_h = 246

    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.rect(ML, y - box_h + 10, colw, box_h, fill=0, stroke=1)
    c.setFillColor(INK)
    c.rect(ML, y + 10 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "ISO/TS 15143-3, dit AEMP 2.0", ML + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    yy = para(c, "Un protocole de service web pour l'échange de données télématiques en "
                 "engins de chantier. Caterpillar, Komatsu, Volvo, JCB et Hitachi exposent "
                 "des interfaces conformes.",
              ML + 18, yy, F["P"], 8.8, 12.6, colw - 36, MID)
    yy -= 8
    tracked(c, "Ce qu'il normalise", ML + 18, yy, F["M"], 6.3, 1.0, ACCENT)
    yy -= 12
    yy = para(c, "Position, heures moteur, carburant consommé et niveau, statut, distance, "
                 "relevés horodatés. Mêmes noms de champs et mêmes types chez tous ceux qui "
                 "le supportent, en JSON comme en XML.",
              ML + 18, yy, F["P"], 8.8, 12.6, colw - 36, MID)
    yy -= 8
    tracked(c, "Ce qu'il ne contient pas", ML + 18, yy, F["M"], 6.3, 1.0, ACCENT)
    yy -= 12
    para(c, "Aucune donnée réglementaire. Aucun document. Aucune échéance de vérification. "
            "Aucun état de réserve. Aucune notion de locataire. C'est une excellente réponse "
            "au plan A, et elle ne prétend pas être autre chose.",
         ML + 18, yy, F["P"], 8.8, 12.6, colw - 36, MID)

    x2 = ML + colw + 30
    c.setStrokeColor(RULE)
    c.rect(x2, y - box_h + 10, colw, box_h, fill=0, stroke=1)
    c.setFillColor(ACCENT)
    c.rect(x2, y + 10 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "Règlement Machines, 20 janvier 2027", x2 + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    yy = para(c, "Le règlement (UE) 2023/1230 remplace la directive 2006/42/CE. La notice "
                 "d'instructions peut être fournie sous forme numérique par défaut pour les "
                 "utilisateurs professionnels ; le papier reste dû si l'utilisateur le demande "
                 "au moment de l'achat. La documentation doit rester disponible au moins "
                 "dix ans.",
              x2 + 18, yy, F["P"], 8.8, 12.6, colw - 36, MID)
    yy -= 8
    tracked(c, "Le lien avec l'article 15", x2 + 18, yy, F["M"], 6.3, 1.0, ACCENT)
    yy -= 12
    para(c, "L'article 15 exige déjà la notice d'instructions sur l'appareil loué, ou à "
            "proximité. À partir du 20 janvier 2027, cette notice est un objet numérique, "
            "versionné, à servir à la demande et à conserver dix ans.\n\n"
            "Autrement dit, la même étiquette sur la machine doit résoudre vers la notice à "
            "jour et vers l'historique des vérifications. Ce sont les deux moitiés de la même "
            "exigence, et elles convergent dans quatre mois.",
         x2 + 18, yy, F["P"], 8.8, 12.6, colw - 36, MID)

    kicker(c, "Question à poser à votre fournisseur télématique cette semaine : exposez-vous "
              "ISO 15143-3, et où est la documentation ? Si la réponse est non, c'est une "
              "clause de renouvellement, pas une fatalité.")
    source(c, "ISO/TS 15143-3:2020, iso.org. Règlement (UE) 2023/1230, applicable au "
              "20 janvier 2027. Consultés le 17 septembre 2026.")


# ================================================================ 03 · FAMILLES

@slide
def s_sec3(c):
    slide_section(c, "03", "Les familles de solutions",
                  "Cinq familles. Chacune possède une tranche de l'historique. "
                  "Aucune ne possède la ligne.")


@slide
def s_families(c):
    page(c)
    y = header(
        c,
        "Les familles",
        "Ce que chaque famille résout bien, et sa limite structurelle",
        "Je reste au niveau des familles et pas des marques. Les marques existent, elles sont "
        "bonnes dans leur famille, et plusieurs d'entre elles sont probablement dans cette "
        "salle. La limite que je décris est structurelle, pas qualitative.",
    )

    cols = [0.19, 0.29, 0.34, 0.18]
    xs, acc = [], ML
    for frac in cols:
        xs.append(acc)
        acc += CW * frac
    widths = [CW * f for f in cols]

    heads = ["Famille", "Ce qu'elle résout bien", "Sa limite structurelle", "Plan couvert"]
    for i, h in enumerate(heads):
        tracked(c, h, xs[i], y, F["MM"], 6.6, 1.4, ACCENT)
    y -= 8
    rule(c, ML, y, CW, INK, 0.9)
    y -= 15

    rows = [
        ("Télématique embarquée",
         "L'état machine en temps réel : position, heures, carburant, antivol, "
         "facturation à l'usage réel.",
         "Ne produit aucune preuve réglementaire. Le coût par machine exclut de fait le petit "
         "matériel et les accessoires de levage, qui sont pourtant soumis à vérification.",
         "A"),
        ("ERP de location",
         "La vérité commerciale : contrat, disponibilité, client, logistique, facturation. "
         "C'est le système qui sait où est la machine et chez qui.",
         "Le suivi réglementaire y est le plus souvent une date dans un champ, pas une chaîne "
         "de preuve. Et la donnée n'est presque jamais exposée au locataire.",
         "A"),
        ("Portails des organismes",
         "Ils produisent la preuve elle-même, avec la compétence et la responsabilité qui vont "
         "avec, et la livrent aujourd'hui par portail client.",
         "Chaque portail détient ses propres rapports. Changez d'organisme en 2023 et "
         "l'historique de la machine est coupé en deux, réparti sur deux fournisseurs, "
         "dans deux formats.",
         "B"),
        ("Logiciels de parc et GMAO",
         "La famille la plus proche du besoin : échéances, documents attachés, QR, historique "
         "d'entretien. Plusieurs font déjà une partie de ce que je vais montrer.",
         "Souvent modélisées pour une entreprise propriétaire de son parc, pas pour un loueur "
         "face à un locataire. Le modèle à deux organisations est rare.",
         "B"),
        ("Tenue interne",
         "Registre de sécurité, GED, tableur. Coût marginal nul, flexibilité totale, aucun "
         "projet d'intégration, et c'est parfaitement légal.",
         "Pas de rappel, pas d'horodatage opposable, et une dépendance à la personne qui le "
         "tient. Le risque n'est pas la non-conformité, c'est le départ de cette personne.",
         "A + B"),
    ]

    for name, good, limit, plan in rows:
        h = max(para_height(good, F["P"], 8.4, 11.8, widths[1] - 16),
                para_height(limit, F["P"], 8.4, 11.8, widths[2] - 16))
        para(c, name, xs[0], y, F["PS"], 9.0, 12.0, widths[0] - 16, INK)
        para(c, good, xs[1], y, F["P"], 8.4, 11.8, widths[1] - 16, MID)
        para(c, limit, xs[2], y, F["P"], 8.4, 11.8, widths[2] - 16, MID)
        c.setFillColor(ACCENT if plan == "B" else (INK if plan == "A" else LIGHT))
        c.setFont(F["MS"], 9.0)
        c.drawString(xs[3], y, "Plan " + plan)
        y -= h + 10
        rule(c, ML, y + 3, CW)
        y -= 8

    source(c, "Familles établies à partir des offres publiques des acteurs du marché français "
              "et européen, consultées en septembre 2026. Aucune étude de prévalence ne m'est "
              "connue sur la répartition réelle de ces familles dans les parcs.", y - 4)


@slide
def s_the_gap(c):
    page(c)
    y = header(
        c,
        "Les familles  ·  le trou",
        "Chaque système possède une tranche. Personne ne possède la ligne.",
        title_size=26,
    )
    y = grid(c, [
        ("L'organisme",
         "possède ses propres rapports, sur la période où il était votre fournisseur. "
         "Pas ceux de son prédécesseur, et pas ceux de son successeur."),
        ("L'ERP",
         "possède le contrat, le client et les dates. Il sait où la machine était le jour où "
         "la réserve a été émise. Il ne sait pas que la réserve existe."),
        ("La GMAO",
         "possède l'entretien et les interventions. Elle connaît la machine mieux que "
         "quiconque, et ignore chez quel client elle se trouvait."),
        ("Le registre",
         "possède la trace légale, et l'article R4323-26 l'autorise expressément à ne contenir "
         "qu'un renvoi vers le lieu d'archivage."),
    ], y, cols=4, bottom=MB + 214)

    y = MB + 198
    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.rect(ML, y - 80, CW, 88, fill=0, stroke=1)
    c.setFillColor(ACCENT)
    c.rect(ML, y - 80, 2.6, 88, fill=1, stroke=0)
    yy = y - 12
    tracked(c, "Le test à deux questions, à faire chez vous cette semaine",
            ML + 24, yy, F["MM"], 7.0, 1.55, ACCENT)
    yy -= 21
    para(c, "1.  « Quel organisme a fait la vérification de cette machine en 2021 ? »  "
            "Si répondre demande d'ouvrir un autre portail, votre historique est segmenté "
            "par fournisseur.\n"
            "2.  « Cette machine était chez quel client quand la réserve a été émise ? »  "
            "Si répondre demande de croiser deux systèmes, votre historique est segmenté "
            "par domaine.",
         ML + 24, yy, F["P"], 9.6, 14.4, CW - 48, MID)

    kicker(c, "Ce n'est pas un trou de fonctionnalité, c'est un trou de propriété. "
              "Aucun achat ne le comble tout seul : il faut décider qui, chez vous, "
              "détient la ligne de vie de la machine.")


# ================================================================ 04 · DÉCISIONS

@slide
def s_sec4(c):
    slide_section(c, "04", "Les décisions",
                  "Huit décisions à trancher, que vous achetiez, que vous fassiez développer, "
                  "ou que vous construisiez.")


@slide
def s_decisions_a(c):
    page(c)
    y = header(
        c,
        "Les décisions  ·  identité et terrain",
        "Quatre décisions qui se prennent avant la première ligne de code",
    )
    y = grid(c, [
        ("01  ·  la clé canonique",
         "Une clé interne opaque, qui n'est ni le numéro de parc, ni le numéro de série. "
         "Tout le reste devient un alias daté. C'est la seule décision de cette liste qui ne "
         "se rattrape pas plus tard."),
        ("02  ·  l'étiquette est un objet",
         "QR, NFC ou Datamatrix gravé. Elle est arrachée, repeinte, karchérisée, remplacée "
         "après réparation. Elle a donc un cycle de vie propre, et une machine en porte "
         "plusieurs au fil de sa vie. Une colonne ne suffit pas."),
        ("03  ·  le scan sans réseau",
         "Sous-sol d'agence, chantier en zone blanche. Soit une file d'attente locale qui se "
         "vide au retour du réseau, soit rien ne remonte et l'opérateur cesse de scanner au "
         "bout de trois échecs. À trancher avant d'écrire quoi que ce soit."),
        ("04  ·  les gants et le soleil",
         "Cibles tactiles larges, contraste élevé, et jamais la couleur seule pour porter un "
         "état. Un opérateur daltonien, ou n'importe qui à quatorze heures en plein soleil, "
         "doit pouvoir lire le statut d'une machine."),
    ], y, cols=4)

    kicker(c, "Ces quatre-là sont des décisions de terrain. Elles ne se prennent pas dans une "
              "salle de réunion, elles se prennent en cour de dépôt, avec quelqu'un qui porte "
              "des gants.")


@slide
def s_decisions_b(c):
    page(c)
    y = header(
        c,
        "Les décisions  ·  preuve et échelle",
        "Quatre décisions qui déterminent si la preuve vaut quelque chose",
    )
    y = grid(c, [
        ("05  ·  la preuve est en ajout seul",
         "Jamais de modification, jamais de suppression d'une inspection enregistrée. "
         "Une correction est un nouvel événement qui référence l'ancien. Si un rapport peut "
         "être réécrit après coup, il n'a aucune valeur probante, et vous avez construit une "
         "base de données, pas un registre."),
        ("06  ·  une inspection, une transaction",
         "Enregistrer une vérification touche trois choses : l'inspection, l'avance de "
         "l'échéance suivante, et la mise hors service si le résultat est défavorable. "
         "En trois écritures séparées, deux échecs passent inaperçus. Je le sais parce que "
         "je l'ai écrit en trois écritures d'abord."),
        ("07  ·  l'isolation se joue en base",
         "Dès que deux organisations regardent la même machine, la politique de la base doit "
         "rejeter la ligne même si un contrôle applicatif a été oublié. Les règles "
         "applicatives sont un confort ; les règles en base sont la garantie."),
        ("08  ·  les rappels sont idempotents",
         "Une cadence qui se resserre à l'approche de l'échéance, et un traitement planifié "
         "qui, rejoué après un incident, ne renvoie pas quatre cents courriels. "
         "C'est la panne la plus embarrassante de la catégorie, et la plus fréquente."),
    ], y, cols=4)

    kicker(c, "La décision 05 est celle que je défendrais devant n'importe qui : une preuve "
              "modifiable n'est pas une preuve. Tout le reste de l'architecture en découle.")


@slide
def s_migration(c):
    page(c)
    y = header(
        c,
        "Les décisions  ·  la reprise",
        "Le projet ne meurt pas sur la fonctionnalité. Il meurt sur la reprise.",
        "Ce que contient vraiment un fichier de parc existant, et je décris ici des fichiers "
        "que j'ai eus entre les mains, pas une caricature.",
        title_size=26,
    )

    colw = (CW - 30) / 2
    yy = y
    tracked(c, "Ce qu'il y a dans le fichier", ML, yy, F["MM"], 7.0, 1.55, ACCENT)
    yy -= 18
    for item in [
        "Des en-têtes qui ne sont jamais les mêmes deux fois : « N° série », « S/N », "
        "« Num serie », « serial_number ».",
        "Des dates dans quatre formats dans la même colonne, dont deux ambiguës entre "
        "jour et mois.",
        "Des doublons qui n'en sont pas, et des non-doublons qui en sont.",
        "Des lignes fantômes : machines vendues, machines détruites, machines jamais entrées.",
        "Une colonne « observations » qui contient la moitié de l'information réelle du parc.",
    ]:
        c.setFillColor(LIGHT)
        c.circle(ML + 3, yy + 3.0, 1.9, fill=1, stroke=0)
        yy = para(c, item, ML + 14, yy, F["P"], 8.8, 12.6, colw - 20, MID)
        yy -= 4

    x2 = ML + colw + 30
    yy2 = y
    tracked(c, "La décision, et il n'y a pas de troisième voie", x2, yy2, F["MM"], 7.0, 1.55, ACCENT)
    yy2 -= 18
    yy2 = para(c,
               "Soit on impose un format d'import, et le projet s'arrête à la première "
               "réunion parce que personne n'a le temps de nettoyer huit cents lignes.\n\n"
               "Soit on accepte le fichier tel qu'il est et on met l'intelligence dans "
               "l'import : détection des colonnes, tolérance sur les formats de date, "
               "prévisualisation avant écriture, et un rapport de ce qui n'a pas pu être lu.\n\n"
               "Le deuxième choix coûte plus cher à construire et c'est le seul qui survit "
               "au contact d'un parc réel.",
               x2, yy2, F["P"], 8.8, 12.6, colw, MID)

    kicker(c, "Point voisin, et souvent oublié : le référentiel de périodicité doit être une "
              "donnée modifiable, pas du code. Sinon une évolution réglementaire devient un "
              "déploiement, et vous dépendez de votre éditeur pour rester conforme.")


# ================================================================ 05 · EXEMPLE

@slide
def s_sec5(c):
    slide_section(c, "05", "Un exemple",
                  "Une implémentation parmi d'autres, son état réel, "
                  "et ce qu'elle ne fait pas.")


@slide
def s_travixo_state(c):
    page(c)
    y = header(
        c,
        "Un exemple  ·  état réel",
        "TraviXO, et où j'en suis vraiment",
        "Quatre minutes. Je préfère vous dire l'état réel maintenant plutôt que vous laisser "
        "le découvrir en question, parce que la question viendra et qu'elle sera légitime.",
    )
    y = grid(c, [
        ("Ce que c'est",
         "Une application web multi-organisation qui applique les huit décisions précédentes. "
         "Construite depuis octobre 2025. En ligne sur app.travixosystems.com."),
        ("Où j'en suis",
         "Phase pilote. Zéro client payant à ce jour. Je le dis ici, en diapositive, "
         "pour que ce ne soit pas une révélation dans les questions."),
        ("D'où ça vient",
         "J'ai travaillé en exploitation chez Loxam. Le problème de la diapositive 06 est un "
         "problème que j'ai eu dans les mains, pas un problème que j'ai lu dans une étude."),
        ("Ce que je cherche ici",
         "Des loueurs qui acceptent de casser le modèle avant que je le fige. Pas des "
         "signatures. Un parc réel qui met le modèle en défaut vaut plus qu'un client de plus."),
    ], y, cols=4, bottom=MB + 132)

    y = MB + 116
    c.setFillColor(PANEL)
    c.rect(ML, y - 82, CW, 90, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(ML, y - 82, 2.6, 90, fill=1, stroke=0)
    yy = y - 12
    tracked(c, "La fonction qui correspond exactement à la thèse de cet exposé",
            ML + 24, yy, F["MM"], 7.0, 1.55, ACCENT)
    yy -= 19
    para(c, "L'historique unifié sur la fiche machine : les vérifications, les scans, "
            "les sorties et les retours de location, les changements de statut, sur une seule "
            "ligne de temps, attachés à la clé canonique de la machine. C'est la réponse "
            "directe à l'article 15, et c'est la dernière chose que j'ai mise en production.",
         ML + 24, yy, F["P"], 9.8, 14.4, CW - 48, MID)


@slide
def s_travixo_scope(c):
    page(c)
    y = header(
        c,
        "Un exemple  ·  périmètre",
        "Ce que ça fait, et ce que ça ne fait pas",
        title_size=26,
    )

    colw = (CW - 30) / 2
    box_h = 250

    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.rect(ML, y - box_h + 10, colw, box_h, fill=0, stroke=1)
    c.setFillColor(INK)
    c.rect(ML, y + 10 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "Ce que ça fait aujourd'hui", ML + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    for item in [
        "Import d'un fichier de parc existant, avec détection des colonnes et "
        "prévisualisation avant écriture.",
        "Une identité par machine, portée par un QR, avec une page de scan accessible "
        "sans compte.",
        "Échéancier de vérification par machine, intervalle défini par type d'équipement.",
        "Enregistrement d'inspection avec certificat joint, en ajout seul.",
        "Rappels par courriel à cadence croissante, puis relance quotidienne une fois "
        "l'échéance dépassée.",
        "Historique unifié par machine : vérifications, scans, locations, statuts.",
        "Isolation des organisations appliquée au niveau de la base de données.",
        "Interface française et anglaise, le français en premier.",
    ]:
        c.setFillColor(ACCENT)
        c.circle(ML + 22, yy + 3.0, 1.8, fill=1, stroke=0)
        yy = para(c, item, ML + 32, yy, F["P"], 8.5, 12.0, colw - 52, MID)
        yy -= 3

    x2 = ML + colw + 30
    c.setStrokeColor(RULE)
    c.rect(x2, y - box_h + 10, colw, box_h, fill=0, stroke=1)
    c.setFillColor(LIGHT)
    c.rect(x2, y + 10 - 2.4, colw, 2.4, fill=1, stroke=0)
    yy = y - 8
    tracked(c, "Ce que ça ne fait pas, et pourquoi", x2 + 18, yy, F["MM"], 7.0, 1.55, INK)
    yy -= 18
    for title, body in [
        ("Pas de télématique, pas de GPS temps réel",
         "Cela suppose du matériel embarqué et un coût par machine. Le scan donne la dernière "
         "position connue et par qui, sans matériel. Ce n'est pas la même chose, et je ne vais "
         "pas prétendre que si."),
        ("Pas d'ERP de location",
         "La facturation, la logistique et le commercial restent chez vous. Je n'ai pas "
         "l'intention d'aller sur ce terrain."),
        ("Pas de production de la vérification",
         "C'est le métier du vérificateur, avec sa compétence et sa responsabilité. "
         "Un logiciel range la preuve, il ne la produit pas."),
        ("Pas encore de connecteur ISO 15143-3",
         "C'est la bonne direction et ce n'est pas fait. Le dire est plus utile que de "
         "l'annoncer."),
    ]:
        yy = para(c, title, x2 + 18, yy, F["PM"], 8.8, 12.2, colw - 36, INK)
        yy = para(c, body, x2 + 18, yy, F["P"], 8.3, 11.8, colw - 36, MID)
        yy -= 7

    kicker(c, "Si vous retenez une seule chose de ces quatre minutes : ce n'est pas le produit, "
              "c'est la décision 05. Une preuve modifiable n'est pas une preuve, quel que soit "
              "l'éditeur qui vous la vend.")


# ================================================================ CLÔTURE

@slide
def s_monday(c):
    page(c)
    STATE["section"] = "Lundi matin"
    y = header(
        c,
        "Ce que vous pouvez faire",
        "Six vérifications sur votre parc, sans rien acheter",
        "C'est la partie que je voulais vraiment vous laisser. Elle est valable quel que soit "
        "l'outil que vous choisirez, et notamment si ce n'est pas le mien.",
    )

    items = [
        ("01", "Comptez les identités",
         "Combien d'identifiants différents désignent la même machine chez vous ? "
         "Au-delà de trois, c'est votre premier chantier, avant tout achat de logiciel."),
        ("02", "Chronométrez",
         "Prenez une machine au hasard. Mesurez le temps nécessaire pour produire son dernier "
         "rapport de vérification. Notez le chiffre. C'est votre métrique de départ."),
        ("03", "Testez la continuité",
         "Sur la même machine, demandez l'historique complet depuis sa première location. "
         "Si la réponse traverse deux portails d'organismes, vous connaissez votre écart à "
         "l'article 15."),
        ("04", "Interrogez la télématique",
         "Demandez à votre fournisseur s'il expose ISO 15143-3 et récupérez la documentation. "
         "Si la réponse est non, c'est une clause pour le prochain renouvellement."),
        ("05", "Activez le Data Act",
         "Écrivez à vos constructeurs pour demander l'accès aux données de vos machines "
         "connectées. Le guide sectoriel de l'ERA donne le cadre et les formulations."),
        ("06", "Nommez la personne",
         "Identifiez qui, nommément, tient le suivi des vérifications. Posez-vous la question "
         "de ce qui se passe s'il part la semaine prochaine. C'est souvent la vraie réponse."),
    ]
    colw = (CW - 2 * 30) / 3
    floor = MB + 26
    heights = []
    for r in range(2):
        heights.append(max(
            14 + para_height(t, F["PS"], 11.6, 15.0, colw - 40)
               + para_height(b, F["P"], 9.6, 13.8, colw - 40)
            for _, t, b in items[r * 3:(r + 1) * 3]))
    row_gap = max(30, (y - floor - sum(heights)) / 2.0)
    top = y - row_gap / 3.0
    for r in range(2):
        for i, (num, title, body) in enumerate(items[r * 3:(r + 1) * 3]):
            x = ML + i * (colw + 30)
            c.setFillColor(ACCENT)
            c.setFont(F["PS"], 22)
            c.drawString(x, top - 16, num)
            yy = para(c, title, x + 40, top - 5, F["PS"], 11.6, 15.0, colw - 40, INK)
            para(c, body, x + 40, yy - 1, F["P"], 9.6, 13.8, colw - 40, MID)
        top -= heights[r] + row_gap
    return


@slide
def s_questions(c):
    page(c)
    c.setFillColor(INK)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(ML, H - MT - 4, 52, 2.6, fill=1, stroke=0)

    y = H - MT - 40
    tracked(c, "Questions  ·  15 minutes", ML, y, F["MM"], 7.6, 2.2, ACCENT)
    y -= 44
    c.setFillColor(PAPER)
    c.setFont(F["PS"], 34)
    c.drawString(ML, y, "Les trois questions que j'aimerais qu'on me pose")
    y -= 46

    for q, a in [
        ("« En quoi c'est différent de ce que fait déjà mon ERP ? »",
         "Parce que la réponse honnête commence par : sur beaucoup de points, il n'y a pas de "
         "différence."),
        ("« Mon organisme me donne déjà le rapport sur mon téléphone, devant la machine. »",
         "C'est exact, et c'est la meilleure objection de la catégorie. Elle porte sur la "
         "propriété de l'historique, pas sur l'accès au dernier rapport."),
        ("« Qu'est-ce qui casse en premier quand on passe de cinquante à cinq mille machines ? »",
         "L'import, les rappels, et la personne qui tient le fichier. Dans cet ordre."),
    ]:
        c.setFillColor(PAPER)
        c.setFont(F["PM"], 13.2)
        for line in wrap(q, F["PM"], 13.2, CW * 0.86):
            c.drawString(ML, y, line)
            y -= 18
        y -= 2
        c.setFillColor(HexColor("#8fa0a9"))
        c.setFont(F["P"], 10.4)
        for line in wrap(a, F["P"], 10.4, CW * 0.8):
            c.drawString(ML, y, line)
            y -= 15
        y -= 14

    tracked(c, "Uwa Chidera Ugboaja  ·  TraviXO Systems  ·  app.travixosystems.com",
            ML, MB - 6, F["M"], 6.6, 1.2, HexColor("#6d7f88"))


@slide
def s_sources(c):
    page(c)
    STATE["section"] = "Sources"
    y = header(
        c,
        "Sources",
        "Références, avec date de consultation",
        "Toutes les affirmations réglementaires de cet exposé sont ici. Les chiffres que je "
        "n'ai pas pu vérifier moi-même ne figurent pas dans la présentation.",
    )

    colw = (CW - 30) / 2
    left = [
        ("Réglementation française",
         "Code du travail, art. R4323-23 à R4323-27 (vérifications périodiques) et art. "
         "L. 4711-5 (registres de sécurité), legifrance.gouv.fr.\n"
         "Arrêté du 1er mars 2004 relatif aux vérifications des appareils et accessoires de "
         "levage : art. 15 (appareils loués, documents sur l'appareil, condition de "
         "régularité des vérifications), art. 22 et 23 (périodicités), legifrance.gouv.fr.\n"
         "Circulaire DRT n° 2005-04 du 24 mars 2005, application de l'arrêté du 1er mars 2004."),
        ("Réglementation européenne",
         "Règlement (UE) 2023/2854 du 13 décembre 2023 (Data Act) : applicable depuis le "
         "12 septembre 2025 ; exigence d'accessibilité par conception au 12 septembre 2026.\n"
         "Règlement (UE) 2023/1230 du 14 juin 2023 (machines) : applicable au 20 janvier 2027, "
         "en remplacement de la directive 2006/42/CE."),
    ]
    right = [
        ("Normes et interopérabilité",
         "ISO/TS 15143-3:2020, Engins de terrassement et machines routières mobiles, "
         "échange de données de chantier, partie 3 : données télématiques. iso.org.\n"
         "Association of Equipment Manufacturers, documentation AEMP 2.0."),
        ("Secteur et marché",
         "European Rental Association, guide sur le Data Act pour les loueurs, erarental.org.\n"
         "Fédération DLR, decouvrir-dlr, dlr.fr.\n"
         "Portails clients des organismes : Apogée One (Apave), BV-Link (Bureau Veritas), "
         "Sherlok (Dekra), Avantage (Socotec). Fiches produits publiques des éditeurs."),
        ("Ce que je n'ai pas pu vérifier",
         "Aucune étude de prévalence sur l'état réel du suivi réglementaire dans les parcs "
         "français ne m'est connue. Je n'emploie donc jamais « la plupart des loueurs ». "
         "Un chiffre de gain de productivité circulant dans un rapport sectoriel a été écarté "
         "faute d'avoir pu en consulter la source primaire."),
    ]
    yy = y
    for label, body in left:
        yy -= block(c, ML, yy, colw, label, body, body_size=8.2, leading=11.6) + 14
    yy2 = y
    for label, body in right:
        yy2 -= block(c, ML + colw + 30, yy2, colw, label, body, body_size=8.2, leading=11.6) + 14

    source(c, "Ensemble des sources consultées le 17 septembre 2026. "
              "Uwa Chidera Ugboaja, TraviXO Systems.", min(yy, yy2) - 6)


if __name__ == "__main__":
    register_fonts()
    out = sys.argv[1] if len(sys.argv) > 1 else "TraviXO_Webinaire_DLR_Technique.pdf"
    build(out)
    print("written: %s (%d slides)" % (out, len(SLIDES)))
