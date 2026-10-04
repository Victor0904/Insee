import { describe, expect, it } from "vitest";
import type { Effect } from "../../src/engine/types";
import { totalPop } from "../../src/engine/indicators";
import { simulate } from "../../src/engine/simulate";
import { catalogFor } from "../../src/events/catalog";
import { EXAMPLES, parseEvent, toEventDef } from "../../src/lab/parse";
import { emptyScenario, loadAll } from "../engine/load";

const { data } = loadAll();
const ctx = {
  departments: data.departments,
  regions: data.regions,
  startYear: data.startYear,
  endYear: data.endYear,
  defaultStart: 2026,
};
const parse = (t: string) => parseEvent(t, ctx);
const kinds = (e: Effect[]) => e.map((x) => x.kind).sort();
const get = <K extends Effect["kind"]>(e: Effect[], k: K) =>
  e.find((x) => x.kind === k) as Extract<Effect, { kind: K }>;

describe("mode test : événement décrit en une phrase", () => {
  it("l’exemple de l’utilisateur : immigration arrêtée, vote ignoré, variante Insee reconnue", () => {
    const r = parse(
      "L’immigration devient très régulée et il n’est plus possible pour un étranger de venir en France et de voter",
    );
    expect(r.effects).toEqual([{ kind: "externalMult", mult: 0 }]);
    expect(r.libraryMatch).toBe("insee-solde-nul");
    expect(r.zone.level).toBe("france");
    expect(r.understood).toHaveLength(1);
    expect(r.ignored.map((i) => i.text)).toEqual(["de voter"]);
    expect(r.ignored[0].reason).toMatch(/élections/);
    // « plus possible » : la mesure dure jusqu'à la fin de la simulation
    expect(r.start + r.duration).toBe(data.endYear);
  });

  const cases: [string, (r: ReturnType<typeof parse>) => void][] = [
    [
      "Les naissances augmentent de 20 %",
      (r) => expect(get(r.effects, "fertility").mult).toBeCloseTo(1.2),
    ],
    [
      "La natalité baisse fortement",
      (r) => expect(get(r.effects, "fertility").mult).toBeCloseTo(0.8),
    ],
    [
      "Les femmes font 2,1 enfants par femme dès 2028",
      (r) => {
        expect(get(r.effects, "fertility").mult).toBeCloseTo(2.1 / 1.45);
        expect(r.start).toBe(2028);
      },
    ],
    [
      "Politique nataliste à partir de 2030",
      (r) => {
        expect(get(r.effects, "fertility").mult).toBeGreaterThan(1);
        expect(r.start).toBe(2030);
        expect(r.ignored).toHaveLength(0);
      },
    ],
    [
      "Une épidémie frappe fortement les personnes âgées en 2035",
      (r) => {
        const m = get(r.effects, "mortality");
        expect(m.mult).toBeGreaterThan(1.1);
        expect(m.ages).toEqual([65, 100]);
        expect(r.start).toBe(2035);
        expect(r.duration).toBe(2);
      },
    ],
    [
      "L’espérance de vie progresse grâce aux progrès médicaux",
      (r) => expect(get(r.effects, "mortality").mult).toBeLessThan(1),
    ],
    [
      "La mortalité des hommes baisse de 10 %",
      (r) => {
        expect(get(r.effects, "mortality").mult).toBeCloseTo(0.9);
        expect(get(r.effects, "mortality").sex).toBe(0);
      },
    ],
    [
      "Les naissances et les décès baissent de 10 % entre 2030 et 2040",
      (r) => {
        expect(kinds(r.effects)).toEqual(["fertility", "mortality"]);
        expect(r.start).toBe(2030);
        expect(r.duration).toBe(10);
      },
    ],
    [
      "L’immigration double",
      (r) => expect(get(r.effects, "externalMult").mult).toBe(2),
    ],
    [
      "L’immigration baisse de moitié",
      (r) => expect(get(r.effects, "externalMult").mult).toBe(0.5),
    ],
    [
      "Les frontières sont fermées",
      (r) => expect(get(r.effects, "externalMult").mult).toBe(0),
    ],
    [
      "La France accueille beaucoup plus de réfugiés",
      (r) => expect(get(r.effects, "externalMult").mult).toBeGreaterThan(1.4),
    ],
    [
      "Fuite des cerveaux : les jeunes diplômés partent à l’étranger",
      (r) => {
        expect(r.effects).toHaveLength(1);
        const e = get(r.effects, "external");
        expect(e.rate).toBeLessThan(0);
        expect(e.ages).toEqual([18, 34]);
      },
    ],
    [
      "Les jeunes quittent Paris pour la Bretagne pendant 15 ans",
      (r) => {
        const m = get(r.effects, "move");
        expect(m.to).toEqual({ level: "region", codes: ["53"] });
        expect(m.ages).toEqual([18, 34]);
        expect(r.zone).toEqual({ level: "dep", codes: ["75"] });
        expect(r.duration).toBe(15);
      },
    ],
    [
      "Exode urbain massif vers la campagne grâce au télétravail",
      (r) => {
        expect(get(r.effects, "move").rate).toBeGreaterThan(0.004);
        expect(r.zoneLabel).toBe("Grandes métropoles");
      },
    ],
    [
      "La Creuse devient très attractive pour les retraités",
      (r) => {
        expect(get(r.effects, "attract").mult).toBeGreaterThan(1.4);
        expect(r.zone).toEqual({ level: "dep", codes: ["23"] });
      },
    ],
    [
      "Les habitants quittent la Seine-Saint-Denis",
      (r) => {
        expect(kinds(r.effects)).toEqual(["leave"]);
        expect(r.zone).toEqual({ level: "dep", codes: ["93"] });
      },
    ],
    [
      "Les seniors partent vivre sur le littoral",
      (r) => {
        expect(get(r.effects, "attract").ages).toEqual([65, 100]);
        expect(r.zoneLabel).toBe("Littoral");
      },
    ],
    [
      "La Guyane voit arriver beaucoup d’immigrés",
      (r) => {
        expect(get(r.effects, "external").rate).toBeGreaterThan(0);
        expect(r.zone).toEqual({ level: "dep", codes: ["973"] });
      },
    ],
    [
      "La retraite passe à 67 ans en 2030",
      (r) => expect(get(r.effects, "retirementAge").age).toBe(67),
    ],
    [
      "Le chômage explose",
      (r) => {
        expect(r.effects).toHaveLength(0);
        expect(r.ignored[0].reason).toMatch(/économie/);
      },
    ],
    [
      "Les loyers deviennent trop chers",
      (r) => {
        expect(r.effects).toHaveLength(0);
        expect(r.ignored[0].reason).toMatch(/logement/);
      },
    ],
    // villes, noms d'habitants, « la métropole »
    [
      "Les Parisiens partent s’installer à Bordeaux",
      (r) => {
        expect(get(r.effects, "move").to).toEqual({
          level: "dep",
          codes: ["33"],
        });
        expect(r.zone).toEqual({ level: "dep", codes: ["75"] });
      },
    ],
    [
      "Marseille attire les jeunes actifs",
      (r) => {
        expect(get(r.effects, "attract").ages).toEqual([18, 34]);
        expect(r.zone).toEqual({ level: "dep", codes: ["13"] });
      },
    ],
    [
      "Les Antillais partent en métropole",
      (r) => {
        expect(r.zone).toEqual({ level: "dep", codes: ["971", "972"] });
        expect(get(r.effects, "move").to.codes).toHaveLength(96);
      },
    ],
    [
      "La Lozère se repeuple grâce au télétravail",
      (r) => {
        expect(kinds(r.effects)).toEqual(["attract"]);
        expect(r.zone).toEqual({ level: "dep", codes: ["48"] });
      },
    ],
    [
      "Le réchauffement climatique pousse les gens vers le nord",
      (r) => expect(r.zoneLabel).toBe("Nord"),
    ],
    [
      "La vie devient trop chère en Île-de-France et les familles partent",
      (r) => {
        expect(kinds(r.effects)).toEqual(["leave"]);
        expect(r.zoneLabel).toBe("Île-de-France");
      },
    ],
    [
      "Les naissances doublent en Guyane",
      (r) => expect(r.zone).toEqual({ level: "dep", codes: ["973"] }),
    ],
    // nombres absolus et sens
    [
      "On accueille 300 000 immigrés par an",
      (r) => expect(get(r.effects, "externalMult").mult).toBe(2),
    ],
    [
      "Moins de Français partent vivre à l’étranger",
      (r) => expect(get(r.effects, "external").rate).toBeGreaterThan(0),
    ],
    [
      "Les étrangers ne peuvent plus voter",
      (r) => {
        expect(r.effects).toHaveLength(0);
        expect(r.ignored[0].reason).toMatch(/élections/);
      },
    ],
    [
      "L’immigration change",
      (r) => {
        expect(r.effects).toHaveLength(0);
        expect(r.ignored[0].reason).toMatch(/augmente ou baisse/);
      },
    ],
    [
      "Le gouvernement interdit l’immigration en 2027",
      (r) => {
        expect(r.libraryMatch).toBe("insee-solde-nul");
        expect(r.start + r.duration).toBe(data.endYear);
      },
    ],
    // santé
    [
      "Une guerre éclate en 2045",
      (r) => expect(get(r.effects, "mortality").mult).toBeGreaterThan(1),
    ],
    [
      "On guérit le cancer en 2050",
      (r) => expect(get(r.effects, "mortality").mult).toBeLessThan(1),
    ],
    [
      "Les hôpitaux sont saturés et la mortalité augmente de 5 %",
      (r) => {
        expect(r.effects).toEqual([{ kind: "mortality", mult: 1.05 }]);
      },
    ],
    [
      "Les seniors vivent plus longtemps",
      (r) => expect(get(r.effects, "mortality").mult).toBeLessThan(1),
    ],
    [
      "Les femmes vivent 5 ans de plus",
      (r) => {
        expect(get(r.effects, "mortality").mult).toBeCloseTo(Math.exp(-0.5));
        expect(get(r.effects, "mortality").sex).toBe(1);
      },
    ],
    // épisodes calés sur l'histoire : l'événement de la bibliothèque est réutilisé
    [
      "La canicule devient fréquente dans le sud",
      (r) => {
        expect(r.libraryMatch).toBe("canicules-repetees");
        expect(r.evidence).not.toBe("insee");
        expect(r.zoneLabel).toBe("Sud");
      },
    ],
    [
      "Une pandémie en 2040",
      (r) => {
        expect(r.libraryMatch).toBe("pandemie");
        expect(r.evidence).toBe("historique");
      },
    ],
    ["Bonjour", (r) => expect(r.effects).toHaveLength(0)],
    ["", (r) => expect(r.effects).toHaveLength(0)],
  ];
  for (const [text, check] of cases)
    it(`« ${text} »`, () => check(parse(text)));

  it("chaque exemple affiché produit au moins un effet", () => {
    for (const ex of EXAMPLES)
      expect(parse(ex).effects.length, ex).toBeGreaterThan(0);
  });

  it("une même phrase donne toujours le même résultat", () => {
    for (const ex of EXAMPLES) expect(parse(ex)).toEqual(parse(ex));
  });

  it("les valeurs restent bornées, même pour des phrases extrêmes", () => {
    for (const t of [
      "Les naissances augmentent de 900 %",
      "Les décès baissent de 99 %",
      "L’immigration augmente de 5000 %",
      "La retraite à 99 ans",
    ]) {
      for (const e of parse(t).effects) {
        if (e.kind === "fertility") expect(e.mult).toBeLessThanOrEqual(2.5);
        if (e.kind === "mortality") expect(e.mult).toBeGreaterThanOrEqual(0.3);
        if (e.kind === "externalMult") expect(e.mult).toBeLessThanOrEqual(4);
        if (e.kind === "retirementAge") expect(e.age).toBeLessThanOrEqual(75);
      }
    }
  });

  it("l’événement traduit se simule : moins de naissances et frontières fermées font moins d’habitants", () => {
    const r = parse(
      "Les naissances baissent fortement et les frontières sont fermées à partir de 2030",
    );
    expect(kinds(r.effects)).toEqual(["externalMult", "fertility"]);
    const def = toEventDef(r, "texte-test", "phrase");
    const scenario = emptyScenario({
      custom: [def],
      events: [
        {
          uid: "a",
          type: def.id,
          start: r.start,
          duration: r.duration,
          intensity: 1,
          zone: r.zone,
        },
      ],
    });
    const all = data.departments.map((_, i) => i);
    const yi = 2050 - data.startYear;
    const base = simulate(data, emptyScenario(), catalogFor({ custom: [] }));
    const res = simulate(data, scenario, catalogFor(scenario));
    expect(totalPop(res, all, yi)).toBeLessThan(
      totalPop(base, all, yi) - 1_000_000,
    );
  });
});
