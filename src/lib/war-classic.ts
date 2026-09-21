// The classic WAR board (Grow): 42 territories on six continents and who
// borders whom. The game itself no longer depends on this -- it reads the map
// it is being played on (see war-world.ts) -- but this is the map a new game
// starts with, and the one the official objectives are written for.

export type Continent = "na" | "sa" | "eu" | "af" | "as" | "oc";

export const CONTINENTS: Record<Continent, { name: string; bonus: number; tint: string }> = {
  na: { name: "North America", bonus: 5, tint: "#e8913f" },
  sa: { name: "South America", bonus: 2, tint: "#4fae6a" },
  eu: { name: "Europe", bonus: 5, tint: "#5b8fd6" },
  af: { name: "Africa", bonus: 3, tint: "#d56aa0" },
  as: { name: "Asia", bonus: 7, tint: "#d9b23f" },
  oc: { name: "Oceania", bonus: 2, tint: "#b0714c" },
};

export const CONTINENT_IDS = Object.keys(CONTINENTS) as Continent[];

export interface TerritoryInfo {
  name: string;
  continent: Continent;
  /** Where it sits on the board, in a 1000 x 560 box. */
  x: number;
  y: number;
}

export const TERRITORIES = {
  alaska: { name: "Alaska", continent: "na", x: 60, y: 95 },
  mackenzie: { name: "Mackenzie", continent: "na", x: 150, y: 80 },
  greenland: { name: "Greenland", continent: "na", x: 300, y: 50 },
  vancouver: { name: "Vancouver", continent: "na", x: 110, y: 160 },
  ottawa: { name: "Ottawa", continent: "na", x: 195, y: 165 },
  labrador: { name: "Labrador", continent: "na", x: 275, y: 135 },
  california: { name: "California", continent: "na", x: 115, y: 235 },
  newyork: { name: "New York", continent: "na", x: 205, y: 245 },
  mexico: { name: "Mexico", continent: "na", x: 150, y: 315 },

  venezuela: { name: "Venezuela", continent: "sa", x: 230, y: 340 },
  peru: { name: "Peru", continent: "sa", x: 215, y: 420 },
  brazil: { name: "Brazil", continent: "sa", x: 300, y: 405 },
  argentina: { name: "Argentina", continent: "sa", x: 250, y: 500 },

  iceland: { name: "Iceland", continent: "eu", x: 395, y: 75 },
  england: { name: "England", continent: "eu", x: 410, y: 150 },
  sweden: { name: "Sweden", continent: "eu", x: 495, y: 70 },
  moscow: { name: "Moscow", continent: "eu", x: 585, y: 110 },
  germany: { name: "Germany", continent: "eu", x: 480, y: 165 },
  portugal: { name: "Portugal", continent: "eu", x: 420, y: 225 },
  poland: { name: "Poland", continent: "eu", x: 530, y: 210 },

  algeria: { name: "Algeria", continent: "af", x: 450, y: 305 },
  egypt: { name: "Egypt", continent: "af", x: 540, y: 290 },
  sudan: { name: "Sudan", continent: "af", x: 575, y: 370 },
  congo: { name: "Congo", continent: "af", x: 505, y: 395 },
  southafrica: { name: "South Africa", continent: "af", x: 540, y: 480 },
  madagascar: { name: "Madagascar", continent: "af", x: 630, y: 455 },

  middleeast: { name: "Middle East", continent: "as", x: 625, y: 250 },
  aral: { name: "Aral", continent: "as", x: 660, y: 175 },
  omsk: { name: "Omsk", continent: "as", x: 720, y: 105 },
  dudinka: { name: "Dudinka", continent: "as", x: 790, y: 55 },
  siberia: { name: "Siberia", continent: "as", x: 875, y: 45 },
  tchita: { name: "Tchita", continent: "as", x: 820, y: 125 },
  mongolia: { name: "Mongolia", continent: "as", x: 810, y: 195 },
  vladivostok: { name: "Vladivostok", continent: "as", x: 930, y: 120 },
  china: { name: "China", continent: "as", x: 740, y: 245 },
  india: { name: "India", continent: "as", x: 690, y: 320 },
  japan: { name: "Japan", continent: "as", x: 935, y: 210 },
  vietnam: { name: "Vietnam", continent: "as", x: 790, y: 320 },

  sumatra: { name: "Sumatra", continent: "oc", x: 765, y: 405 },
  borneo: { name: "Borneo", continent: "oc", x: 860, y: 385 },
  newguinea: { name: "New Guinea", continent: "oc", x: 945, y: 400 },
  australia: { name: "Australia", continent: "oc", x: 880, y: 480 },
} satisfies Record<string, TerritoryInfo>;

export type Territory = keyof typeof TERRITORIES;

export const TERRITORY_IDS = Object.keys(TERRITORIES) as Territory[];

/** Every border once. A line on the board counts the same as a shared frontier. */
const BORDERS: Array<[Territory, Territory]> = [
  ["alaska", "mackenzie"],
  ["alaska", "vancouver"],
  ["alaska", "vladivostok"],
  ["mackenzie", "vancouver"],
  ["mackenzie", "ottawa"],
  ["mackenzie", "greenland"],
  ["greenland", "labrador"],
  ["greenland", "iceland"],
  ["vancouver", "ottawa"],
  ["vancouver", "california"],
  ["ottawa", "labrador"],
  ["ottawa", "california"],
  ["ottawa", "newyork"],
  ["labrador", "newyork"],
  ["california", "newyork"],
  ["california", "mexico"],
  ["newyork", "mexico"],
  ["mexico", "venezuela"],

  ["venezuela", "peru"],
  ["venezuela", "brazil"],
  ["peru", "brazil"],
  ["peru", "argentina"],
  ["brazil", "argentina"],
  ["brazil", "algeria"],

  ["iceland", "england"],
  ["england", "sweden"],
  ["england", "germany"],
  ["england", "portugal"],
  ["sweden", "poland"],
  ["sweden", "moscow"],
  ["germany", "portugal"],
  ["germany", "poland"],
  ["portugal", "algeria"],
  ["portugal", "egypt"],
  ["poland", "moscow"],
  ["poland", "middleeast"],
  ["poland", "egypt"],
  ["moscow", "middleeast"],
  ["moscow", "aral"],
  ["moscow", "omsk"],

  ["algeria", "egypt"],
  ["algeria", "sudan"],
  ["algeria", "congo"],
  ["egypt", "sudan"],
  ["egypt", "middleeast"],
  ["sudan", "congo"],
  ["sudan", "southafrica"],
  ["sudan", "madagascar"],
  ["congo", "southafrica"],
  ["southafrica", "madagascar"],

  ["middleeast", "aral"],
  ["middleeast", "india"],
  ["aral", "omsk"],
  ["aral", "china"],
  ["aral", "india"],
  ["omsk", "dudinka"],
  ["omsk", "tchita"],
  ["omsk", "mongolia"],
  ["omsk", "china"],
  ["dudinka", "tchita"],
  ["dudinka", "siberia"],
  ["siberia", "tchita"],
  ["siberia", "vladivostok"],
  ["tchita", "vladivostok"],
  ["tchita", "mongolia"],
  ["tchita", "china"],
  ["vladivostok", "japan"],
  ["vladivostok", "china"],
  ["mongolia", "china"],
  ["mongolia", "japan"],
  ["china", "japan"],
  ["china", "india"],
  ["china", "vietnam"],
  ["india", "vietnam"],
  ["india", "sumatra"],
  ["vietnam", "borneo"],

  ["sumatra", "australia"],
  ["borneo", "australia"],
  ["borneo", "newguinea"],
  ["newguinea", "australia"],
];

export const EDGES: ReadonlyArray<readonly [Territory, Territory]> = BORDERS;

export const NEIGHBORS: Record<Territory, Territory[]> = (() => {
  const out = Object.fromEntries(TERRITORY_IDS.map((t) => [t, [] as Territory[]])) as Record<Territory, Territory[]>;
  for (const [a, b] of BORDERS) {
    out[a].push(b);
    out[b].push(a);
  }
  return out;
})();

export const adjacent = (a: Territory, b: Territory) => NEIGHBORS[a].includes(b);

export const territoriesIn = (continent: Continent) => TERRITORY_IDS.filter((t) => TERRITORIES[t].continent === continent);
