// Spyfall. Everyone at the table is somewhere together and knows their job
// there -- everyone except one, who has no idea where they are and has to work
// it out from the questions without giving themselves away.
//
// The list of places is public on purpose: it is what lets the spy bluff and
// what lets everybody else narrow it down.

export interface Place {
  name: string;
  roles: string[];
}

export type Pack = "en" | "pt";

export const MIN_SEATS = 3;
export const MAX_SEATS = 12;
/** How long a round runs before the spy has got away with it. */
export const DEFAULT_SECONDS = 8 * 60;

export const PLACES: Record<Pack, Place[]> = {
  en: [
    {
      name: "aeroplane",
      roles: [
        "pilot",
        "co-pilot",
        "flight attendant",
        "first class passenger",
        "air marshal",
        "mechanic",
        "tourist",
      ],
    },
    {
      name: "bank",
      roles: [
        "manager",
        "teller",
        "armoured car driver",
        "customer",
        "robber",
        "security guard",
        "consultant",
      ],
    },
    {
      name: "beach",
      roles: [
        "lifeguard",
        "surfer",
        "thief",
        "ice cream seller",
        "photographer",
        "sunbather",
        "kite surfer",
      ],
    },
    {
      name: "casino",
      roles: [
        "dealer",
        "bouncer",
        "gambler",
        "bartender",
        "hustler",
        "head of security",
        "waiter",
      ],
    },
    {
      name: "hospital",
      roles: ["nurse", "doctor", "patient", "surgeon", "therapist", "intern", "receptionist"],
    },
    {
      name: "hotel",
      roles: ["doorman", "manager", "housekeeper", "bartender", "guest", "bellhop", "security"],
    },
    {
      name: "school",
      roles: ["student", "head teacher", "caretaker", "gym teacher", "cook", "librarian", "parent"],
    },
    {
      name: "space station",
      roles: [
        "commander",
        "scientist",
        "engineer",
        "alien",
        "space tourist",
        "pilot",
        "doctor",
      ],
    },
    {
      name: "submarine",
      roles: [
        "commander",
        "sonar operator",
        "cook",
        "navigator",
        "radio operator",
        "mechanic",
        "sailor",
      ],
    },
    {
      name: "supermarket",
      roles: [
        "customer",
        "cashier",
        "butcher",
        "cleaner",
        "security guard",
        "sample handout",
        "shelf stacker",
      ],
    },
    {
      name: "theatre",
      roles: ["actor", "director", "prompter", "crew", "usher", "coat check", "audience member"],
    },
    {
      name: "train",
      roles: [
        "driver",
        "ticket inspector",
        "passenger",
        "border guard",
        "restaurant car chef",
        "mechanic",
        "stowaway",
      ],
    },
    {
      name: "circus",
      roles: [
        "acrobat",
        "animal trainer",
        "magician",
        "fire eater",
        "clown",
        "juggler",
        "ringmaster",
      ],
    },
    {
      name: "film studio",
      roles: [
        "director",
        "actor",
        "stunt double",
        "camera operator",
        "producer",
        "costume designer",
        "extra",
      ],
    },
    {
      name: "police station",
      roles: [
        "detective",
        "patrol officer",
        "lawyer",
        "journalist",
        "criminal",
        "archivist",
        "caretaker",
      ],
    },
    {
      name: "museum",
      roles: [
        "curator",
        "security guard",
        "restorer",
        "tour guide",
        "visitor",
        "ticket seller",
        "art student",
      ],
    },
  ],
  pt: [
    {
      name: "aviao",
      roles: [
        "piloto",
        "copiloto",
        "comissario de bordo",
        "passageiro da primeira classe",
        "agente federal",
        "mecanico",
        "turista",
      ],
    },
    {
      name: "banco",
      roles: [
        "gerente",
        "caixa",
        "motorista do carro forte",
        "cliente",
        "assaltante",
        "seguranca",
        "consultor",
      ],
    },
    {
      name: "praia",
      roles: [
        "salva-vidas",
        "surfista",
        "ladrao",
        "vendedor de sorvete",
        "fotografo",
        "banhista",
        "kitesurfista",
      ],
    },
    {
      name: "cassino",
      roles: [
        "crupie",
        "leao de chacara",
        "apostador",
        "barman",
        "trapaceiro",
        "chefe de seguranca",
        "garcom",
      ],
    },
    {
      name: "hospital",
      roles: [
        "enfermeira",
        "medico",
        "paciente",
        "cirurgiao",
        "terapeuta",
        "estagiario",
        "recepcionista",
      ],
    },
    {
      name: "hotel",
      roles: [
        "porteiro",
        "gerente",
        "camareira",
        "barman",
        "hospede",
        "mensageiro",
        "seguranca",
      ],
    },
    {
      name: "escola",
      roles: [
        "aluno",
        "diretor",
        "faxineiro",
        "professor de educacao fisica",
        "merendeira",
        "bibliotecaria",
        "responsavel",
      ],
    },
    {
      name: "estacao espacial",
      roles: [
        "comandante",
        "cientista",
        "engenheiro",
        "alienigena",
        "turista espacial",
        "piloto",
        "medico",
      ],
    },
    {
      name: "submarino",
      roles: [
        "comandante",
        "operador de sonar",
        "cozinheiro",
        "navegador",
        "radioperador",
        "mecanico",
        "marinheiro",
      ],
    },
    {
      name: "supermercado",
      roles: [
        "cliente",
        "operador de caixa",
        "acougueiro",
        "faxineiro",
        "seguranca",
        "promotor de degustacao",
        "repositor",
      ],
    },
    {
      name: "teatro",
      roles: ["ator", "diretor", "ponto", "contrarregra", "lanterninha", "chapelaria", "espectador"],
    },
    {
      name: "trem",
      roles: [
        "maquinista",
        "comissario",
        "passageiro",
        "policial de fronteira",
        "chef do vagao-restaurante",
        "mecanico",
        "clandestino",
      ],
    },
    {
      name: "circo",
      roles: [
        "acrobata",
        "adestrador",
        "magico",
        "engolidor de fogo",
        "palhaco",
        "malabarista",
        "apresentador",
      ],
    },
    {
      name: "estudio de cinema",
      roles: [
        "diretor",
        "ator",
        "duble",
        "operador de camera",
        "produtor",
        "figurinista",
        "figurante",
      ],
    },
    {
      name: "delegacia",
      roles: [
        "detetive",
        "policial",
        "advogado",
        "jornalista",
        "criminoso",
        "arquivista",
        "zelador",
      ],
    },
    {
      name: "museu",
      roles: [
        "curador",
        "seguranca",
        "restaurador",
        "guia",
        "visitante",
        "bilheteiro",
        "estudante de artes",
      ],
    },
  ],
};

export interface Deal {
  /** Index into the pack. */
  location: number;
  /** Chair id of the one who was told nothing. */
  spy: string;
  /** Chair id to the job they hold there. The spy is not in here. */
  roles: Record<string, string>;
}

/**
 * Picks a place, picks a spy, and hands everyone else a job. With more players
 * than the place has jobs the list simply comes round again -- two waiters at
 * the same restaurant is a smaller problem than someone holding nothing.
 */
export function deal(chairs: string[], pack: Pack, random: () => number = Math.random): Deal {
  const places = PLACES[pack];
  const location = Math.floor(random() * places.length);
  const spy = chairs[Math.floor(random() * chairs.length)];

  const jobs = [...places[location].roles];
  for (let i = jobs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }

  const roles: Record<string, string> = {};
  let next = 0;
  for (const chair of chairs) {
    if (chair === spy) continue;
    roles[chair] = jobs[next % jobs.length];
    next += 1;
  }

  return { location, spy, roles };
}

/**
 * Seconds left, floored at zero. A stopped clock is simply the number it was
 * stopped on, which is why the round carries seconds rather than minutes: a
 * pause should hand back exactly what it took.
 */
export function remaining(startedAt: number | null, seconds: number, now: number): number {
  if (startedAt === null) return seconds;
  return Math.max(0, seconds - Math.floor((now - startedAt) / 1000));
}

/** mm:ss, the way a clock reads. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Private briefings
//
// Nobody deals Spyfall by hand, because whoever did would know where everyone
// is and who the spy is. So the table offers the database one possible deck
// per place -- a "spy" card and a job card for each agent -- and the database
// picks one without saying which, shuffles it and deals it. Each player can
// read only their own card. At the end, everyone turns theirs over.
// ---------------------------------------------------------------------------

export const BRIEFINGS = "briefings";

export function roleSlot(chair: string): string {
  return `role:${chair}`;
}

/** A card that says you are the spy. */
export const SPY_CARD = "spy";

/**
 * Every deck the database may choose from: for each place, one spy card and a
 * job card per agent, written "place:job" by index into the pack.
 */
export function briefingChoices(pack: Pack, players: number): string[][] {
  return PLACES[pack].map((place, p) => [
    SPY_CARD,
    ...Array.from({ length: Math.max(0, players - 1) }, (_, j) => `${p}:${j % place.roles.length}`),
  ]);
}

export type Briefing = { spy: true } | { spy: false; place: number; placeName: string; role: string };

export function readBriefing(card: string | undefined, pack: Pack): Briefing | null {
  if (!card) return null;
  if (card === SPY_CARD) return { spy: true };
  const [p, j] = card.split(":").map(Number);
  const place = PLACES[pack][p];
  if (!place) return null;
  return { spy: false, place: p, placeName: place.name, role: place.roles[j] ?? place.roles[0] };
}

/** What the table knows once the briefings are turned over. */
export function unmasked(
  revealed: Record<string, unknown[]> | undefined,
  chairs: string[],
  pack: Pack,
): { spy: string | null; place: string | null; roles: Record<string, string>; waitingOn: string[] } {
  let spy: string | null = null;
  let place: string | null = null;
  const roles: Record<string, string> = {};
  const waitingOn: string[] = [];
  for (const chair of chairs) {
    const card = revealed?.[roleSlot(chair)]?.[0] as string | undefined;
    const read = readBriefing(card, pack);
    if (!read) {
      waitingOn.push(chair);
      continue;
    }
    if (read.spy) spy = chair;
    else {
      place = read.placeName;
      roles[chair] = read.role;
    }
  }
  return { spy, place, roles, waitingOn };
}
