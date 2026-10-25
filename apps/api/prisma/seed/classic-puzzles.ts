import { gridSlots, type ClueSource } from '@crossverse/crossword-core'
import type { SeedPuzzle } from './puzzles.ts'

/** Définition éditoriale : texte seul, ou texte et explication affichée en indice. */
type Definition = string | { readonly text: string; readonly explanation: string }

interface ClassicSource extends Omit<SeedPuzzle, 'clues' | 'format'> {
  /** Une entrée par ligne (I, II…) : les définitions de ses mots, de gauche à droite. */
  readonly across: readonly (readonly Definition[])[]
  /** Une entrée par colonne (1, 2…) : les définitions de ses mots, de haut en bas. */
  readonly down: readonly (readonly Definition[])[]
}

/**
 * Écrit une grille de mots croisés classiques comme dans un journal (définitions rangées par
 * ligne et par colonne) puis la traduit dans le format du moteur (définitions numérotées).
 * Lève une erreur au chargement si une ligne ou une colonne n'a pas autant de définitions que
 * de mots : le décalage d'une définition serait sinon silencieux.
 */
export function classicPuzzle(source: ClassicSource): SeedPuzzle {
  const { across, down, ...rest } = source
  const slots = gridSlots(source.grid)
  const clues: ClueSource[] = []
  for (const [direction, lines] of [
    ['across', across],
    ['down', down],
  ] as const) {
    const size = direction === 'across' ? source.grid.length : (source.grid[0]?.length ?? 0)
    if (lines.length !== size) {
      throw new Error(`${source.slug} : ${String(size)} entrées attendues en ${direction}.`)
    }
    lines.forEach((definitions, index) => {
      const words = slots
        .filter((slot) => slot.direction === direction)
        .filter((slot) => (direction === 'across' ? slot.row : slot.col) === index)
        .sort((a, b) => (direction === 'across' ? a.col - b.col : a.row - b.row))
      if (words.length !== definitions.length) {
        throw new Error(
          `${source.slug} : ${direction} ${String(index + 1)} compte ${String(words.length)} mot(s) (${words.map((w) => w.answer).join(', ')}) pour ${String(definitions.length)} définition(s).`,
        )
      }
      words.forEach((word, i) => {
        const definition = definitions[i] ?? ''
        clues.push({
          direction,
          number: word.number,
          ...(typeof definition === 'string' ? { text: definition } : definition),
        })
      })
    })
  }
  return { ...rest, format: 'classic', clues }
}

/**
 * Mots croisés classiques : grilles denses à cases noires, remplies à partir d'un lexique
 * courant puis relues à la main ; définitions rédigées et vérifiées à la main. Validées par
 * le moteur dans `catalog.test.ts`, comme le reste du catalogue.
 */
export const CLASSIC_PUZZLES: readonly SeedPuzzle[] = [
  classicPuzzle({
    slug: 'mots-croises-premiers-pas',
    title: 'Premiers pas',
    theme: 'mots-croises',
    difficulty: 'easy',
    estimatedMinutes: 5,
    grid: ['SALUER', 'E#ANGE', 'ARC#AU', 'NE#ILS', 'CIEL#S', 'ENNEMI'],
    across: [
      ['Dire bonjour'],
      ['Il a des ailes et une auréole'],
      ['Arme de Robin des Bois', 'Contraction de « à le »'],
      ['Accompagne souvent « pas »', 'Pronom personnel pluriel'],
      ['Il est bleu quand il fait beau'],
      ['Adversaire'],
    ],
    down: [
      ['Projection au cinéma'],
      ['Organe qui filtre le sang'],
      ['Étendue d’eau douce', 'Préposition de lieu'],
      ['Premier nombre', 'Terre entourée d’eau'],
      ['Ni plus ni moins'],
      ['Couronné de succès'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-de-la-tete-aux-pieds',
    title: 'De la tête aux pieds',
    theme: 'mots-croises',
    difficulty: 'easy',
    estimatedMinutes: 5,
    grid: ['MOELLE', 'E#SEIN', 'TOT#ET', 'TE#MUR', 'RIME#E', 'ALARME'],
    across: [
      [
        {
          text: 'Substance au cœur des os',
          explanation: 'La moelle osseuse fabrique les cellules du sang.',
        },
      ],
      ['Au ___ de : à l’intérieur de'],
      ['Contraire de tard', 'Conjonction de coordination'],
      ['Pronom de la deuxième personne', 'Paroi de briques ou de pierres'],
      ['Écho de fin de vers'],
      ['Signal d’alerte'],
    ],
    down: [
      ['Placera (au futur)'],
      ['Organe de la vue'],
      ['Point cardinal', 'Adjectif possessif'],
      ['Article défini', 'La Méditerranée en est une'],
      ['Endroit'],
      ['Premier plat du repas'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-bon-accueil',
    title: 'Bon accueil',
    theme: 'mots-croises',
    difficulty: 'easy',
    estimatedMinutes: 7,
    grid: ['ACCUEIL', 'P#ONCLE', 'PEU#LES', 'R#VIA#S', 'ETE#TOI', 'TONNE#V', 'ENTERRE'],
    across: [
      ['Manière de recevoir ses invités'],
      ['Frère du père ou de la mère'],
      ['Pas beaucoup', 'Article pluriel'],
      ['En passant par'],
      ['Saison des vacances', 'Pronom tonique de la deuxième personne'],
      ['Mille kilos'],
      ['Mis sous terre'],
    ],
    down: [
      ['Préparé, paré'],
      ['Hauteur de la voix'],
      ['Maison de religieuses'],
      ['Article indéfini', 'Venu au monde'],
      ['Exploser'],
      ['La Corse en est une'],
      ['Elle lave le linge'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-a-table',
    title: 'À table !',
    theme: 'mots-croises',
    difficulty: 'intermediate',
    estimatedMinutes: 8,
    grid: ['RECLAME', 'E#REPAS', 'VIA#PIS', 'I#QUE#E', 'EAU#LIN', 'NIECE#C', 'STRESSE'],
    across: [
      ['Demande avec insistance'],
      ['Déjeuner ou dîner'],
      ['Par la voie de', 'Mamelle de la vache'],
      ['Pronom relatif'],
      [
        {
          text: 'H₂O',
          explanation: 'Deux atomes d’hydrogène et un d’oxygène : la formule de l’eau.',
        },
        'Plante dont on tisse les fibres',
      ],
      ['Fille du frère ou de la sœur'],
      ['Tendu, angoissé'],
    ],
    down: [
      ['Fais demi-tour'],
      ['Qu’il ___ : subjonctif d’avoir'],
      ['Céder à la tentation'],
      ['Article masculin', 'Adjectif démonstratif'],
      ['Nommés'],
      ['Mois du muguet'],
      ['On en fait le plein à la pompe'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-place-forte',
    title: 'Place forte',
    theme: 'mots-croises',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    grid: [
      'ENCEINTE',
      'N#ONCE#X',
      'TAN#IRAI',
      'RUSE#VIS',
      'ETE#SERT',
      'PORT#USE',
      'O#VOUS#N',
      'TIENNENT',
    ],
    across: [
      [
        {
          text: 'Muraille… ou future maman',
          explanation:
            'Une enceinte entoure une ville fortifiée ; une femme enceinte attend un enfant.',
        },
      ],
      [
        {
          text: 'Panthère des neiges',
          explanation:
            'L’once vit dans les montagnes d’Asie centrale. C’est aussi une ancienne unité de poids.',
        },
      ],
      ['Écorce de chêne qui sert à tanner les peaux', 'Me rendrai'],
      ['Arme du renard', 'Elle se serre au tournevis'],
      ['Il précède l’automne', 'Remplit les assiettes'],
      ['Abri des bateaux', 'Fatigué par le temps'],
      ['Pronom de politesse'],
      ['Ne lâchent pas prise'],
    ],
    down: [
      ['Lieu de stockage'],
      ['Voiture, en abrégé'],
      ['Boîte de petits pois, par exemple'],
      ['Préposition', 'Manière de parler'],
      ['En ce lieu', 'Le premier'],
      ['Qui a les nerfs à vif'],
      ['Mélodies'],
      ['Sont bien réels'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-au-fond-du-tonneau',
    title: 'Au fond du tonneau',
    theme: 'mots-croises',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    grid: [
      'REALISES',
      'A#MES#LA',
      'MOI#SEUL',
      'AS#FUT#A',
      'S#NIE#AI',
      'SOUL#SUR',
      'ES#LIE#E',
      'REBELLES',
    ],
    across: [
      ['Menés à bien'],
      ['Possessif pluriel', 'Note donnée par le diapason'],
      ['Le ___ : l’ego', 'Sans compagnie'],
      ['Carte maîtresse', 'Tonneau'],
      [
        'Refuse d’avouer',
        {
          text: 'Paresseux d’Amérique du Sud',
          explanation: 'L’aï est un paresseux à trois doigts, grand habitué des mots croisés.',
        },
      ],
      ['Ivre', { text: 'Aigre', explanation: 'Sur (sans accent) : acide, comme la pomme verte.' }],
      ['Tu ___ : deuxième personne d’être', 'Dépôt au fond du tonneau'],
      ['Insoumis'],
    ],
    down: [
      ['Cueillir au sol'],
      ['Il fait la joie du chien', 'Audacieux'],
      ['Copain', 'Sans vêtement'],
      ['Article défini', 'Enfant de sexe féminin'],
      ['Sortie', 'Pronom masculin'],
      ['Conjonction', 'Il relève les plats'],
      ['Choisi par les urnes', 'Contraction de « à le »'],
      ['Paies'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-grand-evenement',
    title: 'Grand événement',
    theme: 'mots-croises',
    difficulty: 'hard',
    estimatedMinutes: 15,
    grid: [
      'EVENEMENT',
      'M#LES#SIR',
      'ILE#TAC#O',
      'SEPT#VALU',
      'S#HOTEL#V',
      'AVAL#CAVE',
      'I#NET#DUR',
      'RAT#OSE#A',
      'ESSAIERAI',
    ],
    across: [
      ['Fait marquant'],
      ['Article pluriel', 'Titre d’outre-Manche'],
      ['Belle-Île en est une', 'Il répond au tic'],
      ['Nombre des merveilles du monde', 'Coûté'],
      ['Il collectionne les étoiles'],
      [
        {
          text: 'Du côté de l’embouchure',
          explanation: 'En aval : vers la mer, dans le sens du courant (contraire d’amont).',
        },
        'On y garde le vin',
      ],
      ['Sans bavure', 'Pas commode'],
      ['Petit danseur de l’Opéra', 'Prend le risque'],
      ['Tenterai'],
    ],
    down: [
      ['Envoyé en mission'],
      ['Article défini', 'Champion'],
      ['Ils ont, dit-on, une mémoire infaillible'],
      ['Adverbe de négation', 'Plaque de métal'],
      ['Levant', 'Pronom tonique'],
      ['En compagnie de', 'Pronom réfléchi'],
      ['Grimper'],
      ['___ oui ___ non', 'Remarqué'],
      ['Découvrirai'],
    ],
  }),
  classicPuzzle({
    slug: 'mots-croises-tirelire',
    title: 'Tirelire',
    theme: 'mots-croises',
    difficulty: 'hard',
    estimatedMinutes: 15,
    grid: [
      'ECONOMIES',
      'C#BEN#NUE',
      'LAS#TIC#C',
      'AIES#DECU',
      'I#RIVER#R',
      'REVE#ETUI',
      'C#ANE#ANS',
      'ICI#LOI#E',
      'RETOURNER',
    ],
    across: [
      [
        {
          text: 'Ce que l’on garde dans un bas de laine',
          explanation: 'Autrefois, on cachait ses économies dans un bas de laine.',
        },
      ],
      ['Eh ___ ! (familier)', 'Sans vêtement'],
      ['Fatigué', 'Geste répétitif'],
      ['Que tu ___ : subjonctif d’avoir', 'Désappointé'],
      ['Fixer avec des rivets'],
      ['Il vient la nuit', 'Boîte à lunettes'],
      [
        {
          text: 'Son bonnet punissait les cancres',
          explanation: 'Le bonnet d’âne coiffait autrefois les mauvais élèves.',
        },
        'Années',
      ],
      ['En ce lieu', 'Elle est votée au Parlement'],
      ['Renvoyer à l’expéditeur'],
    ],
    down: [
      ['Rendre plus clair'],
      ['J’___ : première personne d’avoir', 'Adjectif démonstratif'],
      ['Regardait attentivement'],
      ['Venu au monde', 'Le ___ : ce qui est à lui'],
      ['Possèdent', 'Député, par exemple'],
      ['Elle germe dans la tête', 'Métal précieux'],
      ['Douteux'],
      ['Avoir, au participe passé', 'Premier nombre'],
      ['Mettre à l’abri'],
    ],
  }),
]
