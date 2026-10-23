export const classification: {
  rank: string
  name: string
  author?: string
  italic?: boolean
  note: string
}[] = [
  { rank: "Règne", name: "Plantae", note: "Les plantes : eucaryotes photosynthétiques." },
  { rank: "Clade", name: "Angiospermes", note: "Plantes à fleurs, dont les graines sont enfermées dans un fruit." },
  { rank: "Clade", name: "Eudicotylédones", note: "Plantules à deux cotylédons, pollen à trois apertures." },
  { rank: "Clade", name: "Astéridées", note: "Pétales le plus souvent soudés en une corolle d’un seul tenant." },
  { rank: "Ordre", name: "Solanales", note: "Réunit notamment les Solanacées et les Convolvulacées (liserons, patate douce)." },
  {
    rank: "Famille",
    name: "Solanaceae",
    author: "Juss.",
    note: "La famille des morelles : tomate, aubergine, piment, tabac.",
  },
  {
    rank: "Genre",
    name: "Solanum",
    author: "L.",
    italic: true,
    note: "L’un des plus vastes genres de plantes à fleurs.",
  },
]


export const photoGroups = [
  ["fougere", "mousse", "pin", "ginkgo"],
  ["magnolia", "orchidee", "nenuphar"],
  ["tournesol", "eglantier", "haricot"],
  ["paquerette", "cafeier"],
  ["ipomee", "liseron", "datura"],
  ["poivron", "petunia", "tabac"],
  ["aubergine", "tomate"],
  ["pomme-de-terre"],
]
export const photoLayouts: Record<number, [number, number][]> = {
  4: [[405, -220], [185, -170], [405, 90], [185, 100]],
  3: [[400, -230], [185, -170], [350, 60]],
  2: [[205, -150], [400, 90]],
  1: [[300, 260]],
}
