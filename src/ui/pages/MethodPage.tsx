import { useEffect, useState } from 'react'
import { fetchSources, type SourceEntry } from '../../data/load'
import { RATIOS } from '../../engine/indicators'
import { EVENT_LIBRARY, LIBRARY_VISIBLE } from '../../events/library'
import { useApp } from '../../state/appStore'
import { ThemeButton } from '../layout/AppShell'
import { Validation } from './Validation'
import './MethodPage.css'

const SECTIONS = [
  { id: 'modele', title: 'Le modèle en quatre gestes' },
  { id: 'reference', title: 'Le futur de référence' },
  { id: 'donnees', title: 'D’où viennent les données' },
  { id: 'estime', title: 'Ce qui est estimé' },
  { id: 'evenements', title: 'Les événements : trois niveaux de preuve' },
  { id: 'verifications', title: 'Les vérifications' },
  { id: 'indicateurs', title: 'Les indicateurs' },
  { id: 'limites', title: 'Les limites, sans les cacher' },
  { id: 'technique', title: 'Sous le capot' },
]

/** Page « Comment ça marche » : le modèle, les sources et les limites, en langage clair. */
export function MethodPage() {
  const data = useApp((s) => s.data)
  const baseline = useApp((s) => s.baseline)
  const reference = useApp((s) => s.reference)
  const horizon = useApp((s) => s.officialHorizon)
  const [sources, setSources] = useState<SourceEntry[]>([])
  useEffect(() => {
    fetchSources().then(setSources, () => setSources([]))
  }, [])
  const go = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    el?.focus({ preventScroll: true })
  }

  return (
    <div className="page method">
      <header className="masthead">
        <div className="method__top">
          <a href="#/" className="link-back">
            ← Retour à la carte
          </a>
          <ThemeButton />
        </div>
        <p className="masthead__kicker">Comment ça marche</p>
        <h1 className="masthead__title">Le modèle, ses sources et ses limites</h1>
        <p className="masthead__lede">
          « Et si… ? » projette la population de chaque département, année après année, jusqu’en 2100. Sans événement, il
          suit les projections officielles de l’Insee. Vos événements modifient les naissances, les décès ou les
          déménagements, et on mesure l’écart.
        </p>
      </header>

      <nav className="method__toc" aria-label="Sommaire">
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button type="button" className="btn-ghost" onClick={() => go(s.id)}>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="method__body">
        <section id="modele" tabIndex={-1} className="method__section">
          <h2>Le modèle en quatre gestes</h2>
          <p>Chaque année, pour chacun des 101 départements (outre-mer compris), pour les hommes et les femmes, et pour chaque âge de 0 à 100 ans :</p>
          <ol className="method__steps">
            <li>
              <strong>On vieillit d’un an.</strong> Une petite partie des habitants décède, selon les risques de décès de
              l’Insee pour leur âge et leur sexe, corrigés pour le département.
            </li>
            <li>
              <strong>Des bébés naissent</strong>, selon le nombre d’enfants que les femmes ont à chaque âge.
            </li>
            <li>
              <strong>Des habitants déménagent</strong> vers d’autres départements, comme on l’observe au recensement :
              environ 1,7 million de personnes par an.
            </li>
            <li>
              <strong>Des personnes arrivent de l’étranger ou partent</strong>, selon le solde migratoire de l’Insee.
            </li>
          </ol>
          <p>
            C’est la <em>méthode des composantes</em>, celle des démographes : population de l’année suivante = survivants
            vieillis + naissances − décès ± déménagements ± migrations avec l’étranger.
          </p>
        </section>

        <section id="reference" tabIndex={-1} className="method__section">
          <h2>Le futur de référence</h2>
          <p>Sans événement, le jeu reprend les hypothèses du scénario central des projections de l’Insee publiées en 2026 :</p>
          <ul>
            <li>fécondité : 1,61 enfant par femme en 2024, puis 1,45 à partir de 2028 ;</li>
            <li>espérance de vie : elle continue de progresser selon les hypothèses de mortalité de l’Insee, publiées jusqu’en 2125 ;</li>
            <li>solde migratoire avec l’étranger : +150 000 personnes par an.</li>
          </ul>
          <p>
            L’Insee ne publie pas d’hypothèses de fécondité et de migration après {horizon}. <strong>Au-delà, le jeu les prolonge au niveau de {horizon}</strong>{' '}
            : c’est pourquoi les graphiques hachurent cette période.
          </p>
        </section>

        <section id="donnees" tabIndex={-1} className="method__section">
          <h2>D’où viennent les données</h2>
          <p>Toutes les données viennent de l’Insee et de l’IGN, sous Licence Ouverte (Etalab 2.0).</p>
          <div className="method__table-wrap">
            <table className="checks">
              <thead>
                <tr>
                  <th scope="col">Données</th>
                  <th scope="col">Producteur, date</th>
                  <th scope="col">Usage dans le jeu</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">
                      <a href={s.page}>{s.title}</a>
                    </th>
                    <td>
                      {s.producer}, {s.date}
                    </td>
                    <td>{s.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="estime" tabIndex={-1} className="method__section">
          <h2>Ce qui est estimé</h2>
          <p>
            Certaines valeurs n’existent pas telles quelles dans les publications. Le jeu les reconstruit, et le dit :
          </p>
          <ul>
            <li>
              <strong>L’âge exact par département.</strong> L’Insee publie les départements par tranches de 5 ans ; chaque
              tranche est répartie par âge selon le profil national.
            </li>
            <li>
              <strong>La mortalité propre à chaque département</strong>, calée sur ses décès réels de 2023-2024 et sur son
              espérance de vie.
            </li>
            <li>
              <strong>La fécondité propre à chaque département</strong>, calée sur ses naissances de 2024 (écart moyen avec
              l’indicateur publié : 0,008 enfant par femme).
            </li>
            <li>
              <strong>La répartition des migrations avec l’étranger</strong> entre départements, déduite du solde apparent
              publié par l’Insee moins les déménagements internes.
            </li>
            <li>
              <strong>Les besoins en places d’école et en EHPAD</strong> et la « pression sur les retraites » : des ratios
              simples (voir les indicateurs), marqués « estimé » dans l’interface.
            </li>
          </ul>
        </section>

        <section id="evenements" tabIndex={-1} className="method__section">
          <h2>Les événements : trois niveaux de preuve</h2>
          <p>
            La bibliothèque compte {LIBRARY_VISIBLE.length} événements, plus {EVENT_LIBRARY.length - LIBRARY_VISIBLE.length} qui
            n’arrivent qu’en conséquence d’un autre. Chaque fiche affiche son niveau de preuve :
          </p>
          <ul>
            <li>
              <strong>Variante Insee ({EVENT_LIBRARY.filter((e) => e.evidence === 'insee').length}).</strong> L’événement reproduit
              une variante officielle des projections 2026 : fécondité haute ou basse, espérance de vie haute ou basse,
              migrations hautes ou basses, solde migratoire nul. Un test vérifie que l’écart du jeu au futur de référence
              reste à moins de 10 % de celui publié par l’Insee, de 2030 à 2070.
            </li>
            <li>
              <strong>Calé sur l’histoire ({EVENT_LIBRARY.filter((e) => e.evidence === 'historique').length}).</strong> À
              intensité forte, la pandémie a l’ampleur de 2020 (+9 % de décès) et la canicule celle de 2003 (+2,7 % de décès
              sur l’année). Vérifié par des tests.
            </li>
            <li>
              <strong>Hypothèse de jeu ({EVENT_LIBRARY.filter((e) => !e.evidence || e.evidence === 'hypothese').length}).</strong>{' '}
              Télétravail, exode urbain, montée des eaux… : des effets plausibles mais non calés, qui servent à explorer un
              mécanisme, pas à prévoir.
            </li>
          </ul>
          <ul>
            <li>L’intensité met les effets à l’échelle : faible (30 %), moyenne (60 %), forte (100 %), extrême (150 %).</li>
            <li>
              Les <strong>cascades</strong> sont des règles visibles : par exemple, des canicules à répétition pendant plus de
              4 ans déclenchent une crise agricole, qui pousse des familles vers le nord, ce qui tend le logement.
            </li>
            <li>
              « D’où vient cet écart ? » mesure la part de chaque événement en recalculant le scénario sans lui ; ce qui
              reste vient des événements qui agissent ensemble.
            </li>
          </ul>
        </section>

        <section id="verifications" tabIndex={-1} className="method__section">
          <h2>Les vérifications</h2>
          <p>
            Ces contrôles sont recalculés ici à partir du moteur, et des tests automatiques échouent si les écarts
            dépassent les seuils.
          </p>
          {data && baseline && reference && <Validation data={data} baseline={baseline} reference={reference} sources={[]} officialHorizon={horizon} />}
        </section>

        <section id="indicateurs" tabIndex={-1} className="method__section">
          <h2>Les indicateurs</h2>
          <div className="method__table-wrap">
            <table className="checks">
              <thead>
                <tr>
                  <th scope="col">Dans le jeu</th>
                  <th scope="col">Définition</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Seniors pour 100 actifs</th>
                  <td>Personnes de 65 ans et plus pour 100 personnes de 20 à 64 ans (rapport de dépendance des âgés).</td>
                </tr>
                <tr>
                  <th scope="row">Retraités pour 100 cotisants (estimé)</th>
                  <td>
                    Personnes ayant l’âge de la retraite ({RATIOS.retirementAge} ans sans réforme) pour 100 personnes de 20 ans
                    à cet âge. Ratio démographique : il ignore le taux d’emploi et les règles des pensions.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Places d’école (estimé)</th>
                  <td>Enfants de 3 à 10 ans : une place par enfant en maternelle et en élémentaire.</td>
                </tr>
                <tr>
                  <th scope="row">Places en EHPAD (estimé)</th>
                  <td>
                    Personnes de 85 ans et plus × {Math.round(RATIOS.ehpadRate * 100)} % : ordre de grandeur retenu comme
                    hypothèse de jeu, à rapprocher des enquêtes de la DREES.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Âge médian</th>
                  <td>La moitié des habitants a moins que cet âge.</td>
                </tr>
                <tr>
                  <th scope="row">Habitants au km²</th>
                  <td>Superficie calculée sur des contours simplifiés : valeur approchée.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="limites" tabIndex={-1} className="method__section">
          <h2>Les limites, sans les cacher</h2>
          <ul>
            <li>Les déménagements entre départements gardent les habitudes observées vers 2022 ; seuls les événements les changent.</li>
            <li>Chaque département garde le même écart de fécondité et de mortalité avec la moyenne nationale jusqu’en 2100.</li>
            <li>
              Le futur de référence s’écarte un peu de la projection officielle (moins d’un point d’écart d’ici 2070 sur
              l’évolution de la population : voir les vérifications).
            </li>
            <li>Hors variantes Insee et épisodes historiques, les effets des événements sont des hypothèses de jeu : ils servent à comprendre des mécanismes, pas à prédire.</li>
            <li>Les petits départements sont les plus sensibles aux hypothèses ; un écart de quelques milliers d’habitants n’est pas significatif.</li>
            <li>À Mayotte, le recensement n’entre pas dans le fichier national des migrations : les déménagements entre Mayotte et le reste de la France sont donc ignorés (le solde avec l’étranger, lui, est pris en compte).</li>
          </ul>
        </section>

        <section id="technique" tabIndex={-1} className="method__section">
          <h2>Sous le capot</h2>
          <ul>
            <li>
              Une simulation complète (101 départements × 2 sexes × 101 âges × 75 ans) tourne dans un Web Worker, sans
              bloquer l’interface : {baseline ? <strong>{Math.round(baseline.elapsedMs)} ms</strong> : '—'} sur cet appareil
              pour le futur de référence.
            </li>
            <li>Le moteur est une fonction pure : même scénario, même résultat ; l’option « aléa » utilise un tirage reproductible.</li>
            <li>Le code, les hypothèses détaillées et les mesures d’écart sont décrits dans les fichiers DECISIONS.md et DATA_SOURCES.md du projet.</li>
          </ul>
          <p className="note">Données : Insee et IGN, Licence Ouverte / Etalab 2.0.</p>
        </section>
      </main>
    </div>
  )
}
