"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { InquiryForm } from "@/components/inquiry-form";
import { BrandLogo } from "@/components/brand-logo";
import type { CatalogData, Vehicle } from "@/lib/contracts";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource-variable/space-grotesk";
import s from "./drive-showroom.module.css";

const euro = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const numeric = new Intl.NumberFormat("pt-PT");
const fuels: Record<string, string> = {
  petrol: "Gasolina",
  diesel: "Diesel",
  hybrid: "Híbrido",
  electric: "Elétrico",
};
const categoryNames: Record<string, string> = {
  coupe: "Desportivos",
  saloon: "Berlinas",
  suv: "SUV",
  estate: "Carrinhas",
};
const vehicleName = (v: Vehicle) => `${v.make} ${v.model}`;
const transmission = (v: Vehicle) =>
  v.transmission === "automatic" ? "Automática" : "Manual";

function DriveMark() {
  return (
    <span className={s.mark} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function DriveDialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const dialog = ref.current;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      before?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={`${s.dialog} ${wide ? s.wideDialog : ""}`}
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={s.dialogInner}>
        <button
          className={s.closeDialog}
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <X size={22} />
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function DriveShowroom({ catalog }: { catalog: CatalogData }) {
  const { site, source, vehicles } = catalog;
  // The live dashboard owns the ordering. This proposal opens the demo with BMW.
  const slides =
    source === "demo"
      ? [...catalog.heroSlides].sort(
          (a, b) =>
            Number(b.vehicleId.includes("bmw")) -
            Number(a.vehicleId.includes("bmw")),
        )
      : catalog.heroSlides;
  const [active, setActive] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("all");
  const [sort, setSort] = useState("selection");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [comparison, setComparison] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [detail, setDetail] = useState<Vehicle | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string }>();
  const [principle, setPrinciple] = useState(0);
  const [privacy, setPrivacy] = useState(false);
  const slide = slides[active] ?? slides[0];
  const featured = vehicles.find((v) => v.id === slide?.vehicleId);
  const compared = vehicles.filter((v) => comparison.includes(v.id));
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-PT");
  const matching = vehicles.filter(
    (v) =>
      (category === "all" || v.category === category) &&
      (budget === "all" || v.priceEur <= Number(budget)) &&
      (!favoritesOnly || favorites.includes(v.id)) &&
      `${v.make} ${v.model} ${v.version}`
        .toLocaleLowerCase("pt-PT")
        .includes(normalizedQuery),
  );
  const filtered = [...matching].sort((a, b) =>
    sort === "price-up"
      ? a.priceEur - b.priceEur
      : sort === "price-down"
        ? b.priceEur - a.priceEur
        : sort === "newest"
          ? b.year - a.year
          : 0,
  );

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("sucesso-aposta:favorites") ?? "[]",
      );
      if (Array.isArray(saved))
        setFavorites(
          saved.filter(
            (id): id is string =>
              typeof id === "string" && vehicles.some((v) => v.id === id),
          ),
        );
    } catch {
      /* Favorites continue to work in memory when storage is unavailable. */
    }
    setFavoritesReady(true);
  }, [vehicles]);
  useEffect(() => {
    if (favoritesReady) {
      try {
        localStorage.setItem(
          "sucesso-aposta:favorites",
          JSON.stringify(favorites),
        );
      } catch {
        /* Optional browser storage. */
      }
    }
  }, [favorites, favoritesReady]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  function resetFilters() {
    setCategory("all");
    setQuery("");
    setBudget("all");
    setFavoritesOnly(false);
    setSort("selection");
  }
  function favorite(id: string) {
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function compare(id: string) {
    setComparison((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  }
  function enquire(vehicle?: Vehicle) {
    setDetail(null);
    setCompareOpen(false);
    setSelected(
      vehicle ? { id: vehicle.id, name: vehicleName(vehicle) } : undefined,
    );
    requestAnimationFrame(() => {
      document.getElementById("contacto-b")?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      document
        .querySelector<HTMLInputElement>('#contacto-b input[name="fullName"]')
        ?.focus({ preventScroll: true });
    });
  }
  const principles = [
    {
      title: "Veja além da fotografia.",
      text: "Um bom primeiro olhar é só o início. Conheça os materiais, os equipamentos e os detalhes que tornam cada automóvel diferente.",
      image: "/images/interior.jpg",
      alt: "Detalhe de um interior Bentley com pele clara e consola central",
      label: "01 / OLHAR DE PERTO",
      caption: "Os detalhes dizem mais.",
    },
    {
      title: "Ponha tudo na mesma página.",
      text: "Compare características, preço e quilometragem. Reúna as suas questões e confirme histórico, estado e condições diretamente com o stand.",
      image: "/images/hero-bmw.jpg",
      alt: "BMW Série 3 cinzento numa envolvente de arquitetura em betão",
      label: "02 / ESCOLHER COM CRITÉRIO",
      caption: "Informação antes da decisão.",
    },
    {
      title: "Faça espaço para sentir.",
      text: "Peça uma visita. Sente-se ao volante. Perceba se aquele automóvel faz sentido na sua vida, antes de pensar na próxima viagem.",
      image: "/images/road.jpg",
      alt: "Vista aérea de uma estrada junto ao mar",
      label: "03 / O SEU PRÓPRIO CAMINHO",
      caption: "A última palavra é sua.",
    },
  ];
  const currentPrinciple = principles[principle];

  return (
    <div className={s.root} id="topo-b" data-comparing={comparison.length > 0}>
      <a className={s.skipLink} href="#garagem">
        Saltar para as viaturas
      </a>
      <div className={s.conceptBar}>
        <span>
          PROPOSTA 02 <span>/</span> DRIVE STUDIO
        </span>
        <a href="/conceito-a">
          VER PROPOSTA 01 <ArrowUpRight size={13} />
        </a>
      </div>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a
            href="#topo-b"
            className={s.brand}
            aria-label={`${site.name} — início`}
          >
            <BrandLogo variant="compact" animated name={site.name} />
          </a>
          <nav
            className={`${s.navigation} ${mobileMenu ? s.navigationOpen : ""}`}
            id="drive-navigation"
            aria-label="Navegação principal"
          >
            {[
              { href: "#garagem", text: "01. Viaturas" },
              { href: "#criterio", text: "02. O nosso olhar" },
              { href: "#encontrar", text: "03. À sua medida" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenu(false)}
              >
                {link.text}
              </a>
            ))}
          </nav>
          <a href="#contacto-b" className={s.headerCta}>
            Vamos falar <ArrowUpRight size={18} />
          </a>
          <button
            className={s.menuButton}
            aria-label={mobileMenu ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenu}
            aria-controls="drive-navigation"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section className={s.hero} aria-label="Viatura em destaque">
          <div className={s.heroIntro}>
            <div className={s.heroTitle}>
              <span className={s.eyebrow}>
                <span className={s.signal} /> PARA QUEM GOSTA DO CAMINHO
              </span>
              <h1>
                ESCOLHA
                <br />
                <span>O QUE O MOVE.</span>
              </h1>
            </div>
            <div className={s.heroAside}>
              <span className={s.crosshair} aria-hidden="true">
                +
              </span>
              <p>
                Não é só sobre o próximo carro.
                <br />É sobre encontrar <strong>o seu.</strong>
              </p>
              <a className={s.actionLink} href="#garagem">
                ENTRAR NA GARAGEM <ArrowDown size={18} />
              </a>
            </div>
          </div>
          {slide && featured && (
            <>
              <div
                className={s.heroStage}
                style={
                  {
                    "--position": slide.objectPositionDesktop,
                    "--mobile-position": slide.objectPositionMobile,
                  } as CSSProperties
                }
              >
                <picture key={slide.id}>
                  <source
                    media="(max-width: 700px)"
                    srcSet={slide.imageMobile}
                  />
                  <img
                    className={s.stageImage}
                    src={slide.imageDesktop}
                    alt={featured.imageAlt}
                    fetchPriority="high"
                  />
                </picture>
                <div className={s.stageTop}>
                  <span>
                    <span className={s.signal} /> EM FOCO
                  </span>
                  <span>
                    {String(active + 1).padStart(2, "0")} /{" "}
                    {String(slides.length).padStart(2, "0")}
                  </span>
                </div>
                <div className={s.stageCaption}>
                  <span>{featured.make}</span>
                  <strong>{featured.model}</strong>
                  <span>{featured.version}</span>
                </div>
                <button
                  className={s.stageExplore}
                  onClick={() => setDetail(featured)}
                  aria-label={`Explorar ${vehicleName(featured)}`}
                >
                  <Plus size={25} />
                  <span>VER DE PERTO</span>
                </button>
                {source === "demo" && (
                  <small className={s.imageDisclaimer}>
                    IMAGEM ILUSTRATIVA
                  </small>
                )}
              </div>
              <div className={s.heroDashboard}>
                <div
                  className={s.heroSelector}
                  aria-label="Selecionar destaque"
                >
                  {slides.map((item, index) => {
                    const vehicle = vehicles.find(
                      (v) => v.id === item.vehicleId,
                    );
                    return (
                      <button
                        key={item.id}
                        aria-pressed={active === index}
                        onClick={() => setActive(index)}
                        className={active === index ? s.heroSelected : ""}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{vehicle?.make ?? "Viatura"}</strong>
                        <ArrowUpRight size={15} />
                      </button>
                    );
                  })}
                </div>
                <div className={s.heroNumbers}>
                  <span>
                    <small>ANO</small>
                    {featured.year}
                  </span>
                  <span>
                    <small>POTÊNCIA</small>
                    {featured.powerHp} <i>cv</i>
                  </span>
                  <span>
                    <small>
                      PREÇO{source === "demo" ? " ILUSTRATIVO" : ""}
                    </small>
                    {euro.format(featured.priceEur)}
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        <div className={s.statementStrip}>
          <DriveMark />
          <span>PERSONALIDADE AO VOLANTE.</span>
          <span className={s.stripPlus}>+</span>
          <span>CRITÉRIO NA ESCOLHA.</span>
          <span className={s.stripPlus}>+</span>
          <span>PRAZER NO CAMINHO.</span>
        </div>

        <section className={s.garage} id="garagem">
          <div className={s.container}>
            <div className={s.sectionHeader}>
              <div>
                <span className={s.eyebrow}>
                  01 / ENCONTRE A SUA COMBINAÇÃO
                </span>
                <h2>
                  A GARAGEM<span className={s.orange}>.</span>
                </h2>
              </div>
              <p>
                Explore. Guarde. Compare.
                <br />O próximo passo é consigo.
              </p>
            </div>
            <div className={s.searchPanel}>
              <label className={s.searchInput}>
                <Search size={19} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Marca, modelo ou versão"
                  aria-label="Pesquisar marca, modelo ou versão"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Limpar pesquisa"
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
              <label className={s.budgetSelect}>
                <span>O SEU ORÇAMENTO</span>
                <select
                  aria-label="Preço máximo"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                >
                  <option value="all">Todos os preços</option>
                  <option value="40000">Até 40 000 €</option>
                  <option value="50000">Até 50 000 €</option>
                  <option value="75000">Até 75 000 €</option>
                  <option value="150000">Até 150 000 €</option>
                </select>
                <ChevronDown size={17} />
              </label>
              <button
                className={`${s.favoritesToggle} ${favoritesOnly ? s.pressed : ""}`}
                aria-label={`Favoritos, ${favorites.length} guardados`}
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly(!favoritesOnly)}
              >
                <Heart
                  size={19}
                  fill={favoritesOnly ? "currentColor" : "none"}
                />
                <span>A minha seleção</span>
                <b>{favorites.length}</b>
              </button>
            </div>
            <div className={s.filterRow}>
              <div className={s.categories} aria-label="Tipo de viatura">
                <button
                  aria-pressed={category === "all"}
                  onClick={() => setCategory("all")}
                >
                  TODAS{" "}
                  <span>{vehicles.length.toString().padStart(2, "0")}</span>
                </button>
                {Object.entries(categoryNames)
                  .filter(([id]) => vehicles.some((v) => v.category === id))
                  .map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={category === id}
                      onClick={() => setCategory(id)}
                    >
                      {label.toUpperCase()}
                    </button>
                  ))}
              </div>
              <label className={s.sort}>
                <SlidersHorizontal size={15} />
                <select
                  aria-label="Ordenar viaturas"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="selection">A nossa seleção</option>
                  <option value="price-up">Preço crescente</option>
                  <option value="price-down">Preço decrescente</option>
                  <option value="newest">Ano mais recente</option>
                </select>
              </label>
            </div>
            <div className={s.resultLine}>
              <span aria-live="polite">
                {String(filtered.length).padStart(2, "0")} VIATURAS
                {source === "demo" ? " / CATÁLOGO DEMONSTRATIVO" : ""}
              </span>
              <span>COMPARE ATÉ 3 MODELOS</span>
            </div>
            <div className={s.vehicleGrid}>
              {filtered.map((vehicle, index) => (
                <article key={vehicle.id} className={s.vehicleCard}>
                  <div className={s.vehiclePhoto}>
                    <button
                      className={s.photoButton}
                      onClick={() => setDetail(vehicle)}
                      aria-label={`Conhecer ${vehicleName(vehicle)}`}
                    >
                      <Image
                        src={vehicle.image}
                        alt={vehicle.imageAlt}
                        fill
                        sizes="(max-width: 700px) 94vw, 46vw"
                      />
                    </button>
                    <span className={s.carNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <button
                      className={s.favorite}
                      aria-pressed={favorites.includes(vehicle.id)}
                      aria-label={`${favorites.includes(vehicle.id) ? "Retirar" : "Guardar"} ${vehicleName(vehicle)} ${favorites.includes(vehicle.id) ? "dos" : "nos"} favoritos`}
                      onClick={() => favorite(vehicle.id)}
                    >
                      <Heart
                        size={19}
                        fill={
                          favorites.includes(vehicle.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                    {source === "remote" && vehicle.status !== "available" && (
                      <span className={s.stockState}>
                        {vehicle.status === "sold" ? "VENDIDO" : "RESERVADO"}
                      </span>
                    )}
                  </div>
                  <div className={s.carInfo}>
                    <div className={s.carHeading}>
                      <div>
                        <span>{vehicle.make.toUpperCase()}</span>
                        <h3>
                          <button onClick={() => setDetail(vehicle)}>
                            {vehicle.model}
                          </button>
                        </h3>
                      </div>
                      <strong>{euro.format(vehicle.priceEur)}</strong>
                    </div>
                    <p className={s.carVersion}>{vehicle.version}</p>
                    <dl className={s.carSpecs}>
                      <div>
                        <dt>ANO</dt>
                        <dd>{vehicle.year}</dd>
                      </div>
                      <div>
                        <dt>QUILÓMETROS</dt>
                        <dd>{numeric.format(vehicle.mileageKm)}</dd>
                      </div>
                      <div>
                        <dt>MOTOR</dt>
                        <dd>{fuels[vehicle.fuel]}</dd>
                      </div>
                      <div>
                        <dt>CAIXA</dt>
                        <dd>{transmission(vehicle)}</dd>
                      </div>
                    </dl>
                    <div className={s.carActions}>
                      <button
                        onClick={() => compare(vehicle.id)}
                        aria-label={`Comparar ${vehicleName(vehicle)}`}
                        aria-pressed={comparison.includes(vehicle.id)}
                        disabled={
                          !comparison.includes(vehicle.id) &&
                          comparison.length >= 3
                        }
                      >
                        <span>
                          {comparison.includes(vehicle.id) ? (
                            <Check size={13} />
                          ) : (
                            <Plus size={13} />
                          )}
                        </span>
                        {comparison.includes(vehicle.id)
                          ? "Na comparação"
                          : "Comparar"}
                      </button>
                      <button onClick={() => setDetail(vehicle)}>
                        EXPLORAR <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className={s.empty}>
                <Search size={34} />
                <h3>OUTRA COMBINAÇÃO?</h3>
                <p>
                  {favoritesOnly
                    ? "Guarde os modelos que mais gosta no coração de cada viatura."
                    : "Não há modelos nesta combinação. Experimente ajustar o orçamento ou a pesquisa."}
                </p>
                <button className={s.orangeButton} onClick={resetFilters}>
                  REPOR FILTROS <ArrowRight size={17} />
                </button>
              </div>
            )}
            <div className={s.garageFoot}>
              <p>
                {source === "demo"
                  ? "Fotografias e dados ilustrativos. Preços, anos e quilometragens são exemplos, sem oferta comercial."
                  : "Confirme a disponibilidade e as características junto da equipa."}
              </p>
              <a href="#encontrar">
                O QUE PROCURA NÃO ESTÁ AQUI? <ArrowDown size={17} />
              </a>
            </div>
          </div>
        </section>

        <section className={s.principles} id="criterio">
          <div className={s.container}>
            <div className={s.principleTop}>
              <span className={s.eyebrow}>02 / O NOSSO OLHAR</span>
              <span>UM AUTOMÓVEL NÃO SE ESCOLHE NO PILOTO AUTOMÁTICO.</span>
            </div>
            <h2>
              UM BOM CARRO.
              <br />
              <span>UMA ESCOLHA SUA.</span>
            </h2>
            <div className={s.principleGrid}>
              <div className={s.principleTabs}>
                {principles.map((item, index) => (
                  <div className={s.principleItem} key={item.title}>
                    <button
                      onClick={() => setPrinciple(index)}
                      aria-expanded={principle === index}
                      aria-controls={`principle-${index}`}
                    >
                      <span>0{index + 1}</span>
                      <strong>{item.title}</strong>
                      {principle === index ? (
                        <ArrowUpRight size={22} />
                      ) : (
                        <Plus size={22} />
                      )}
                    </button>
                    <div id={`principle-${index}`} hidden={principle !== index}>
                      <p>{item.text}</p>
                    </div>
                  </div>
                ))}
                <a className={s.actionLink} href="#contacto-b">
                  A CONVERSA COMEÇA AQUI <ArrowUpRight size={17} />
                </a>
              </div>
              <div className={s.principleImage}>
                <Image
                  key={currentPrinciple.image}
                  src={currentPrinciple.image}
                  alt={currentPrinciple.alt}
                  fill
                  sizes="(max-width: 800px) 92vw, 50vw"
                />
                <div>
                  <span>{currentPrinciple.label}</span>
                  <strong>{currentPrinciple.caption}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={s.sourcing} id="encontrar">
          <div className={s.sourcingCopy}>
            <span className={s.eyebrow}>03 / FORA DA GARAGEM</span>
            <h2>
              TEM OUTRO
              <br />
              CARRO
              <br />
              <span>EM MENTE?</span>
            </h2>
            <div>
              <p>
                O modelo. A cor. Aquela configuração.
                <br />
                Conte-nos o que procura. Começamos por aí.
              </p>
              <button className={s.darkButton} onClick={() => enquire()}>
                ENCONTRAR A MINHA VIATURA <ArrowUpRight size={19} />
              </button>
            </div>
          </div>
          <div className={s.sourcingImage}>
            <Image
              src="/images/road.jpg"
              alt="Uma estrada costeira entre o mar azul e a vegetação"
              fill
              sizes="(max-width: 700px) 100vw, 40vw"
            />
            <span className={s.roadWord}>
              GO
              <br />
              YOUR
              <br />
              WAY.
            </span>
            <span className={s.roadCaption}>O CAMINHO É SEU.</span>
          </div>
        </section>

        <section className={s.questions}>
          <div className={s.container}>
            <div>
              <span className={s.eyebrow}>SEM PONTAS SOLTAS</span>
              <h2>
                ANTES DE
                <br />
                DAR À CHAVE.
              </h2>
            </div>
            <div className={s.faqList}>
              {[
                {
                  q: "Posso visitar e conhecer uma viatura?",
                  a: `Abra uma ficha e selecione “Tenho interesse”. O modelo fica associado ao formulário, onde pode pedir uma visita.${source === "demo" ? " Nesta demonstração, nenhum pedido é enviado." : " O agendamento fica sujeito à confirmação da equipa."}`,
                },
                {
                  q: "Como funciona a comparação de modelos?",
                  a: "Selecione “Comparar” em duas ou três viaturas. Na barra de comparação, abra a tabela para ver lado a lado preço, ano, quilometragem, potência, combustível e caixa. Pode combinar modelos de diferentes categorias.",
                },
                {
                  q: "Posso apresentar o meu carro para retoma?",
                  a: "Indique a marca, modelo, ano e quilometragem no pedido. A possibilidade de retoma e a avaliação dependem de análise e confirmação pelo stand.",
                },
                {
                  q: "As viaturas apresentadas estão à venda?",
                  a:
                    source === "demo"
                      ? "Esta versão apresenta um catálogo demonstrativo. As fotografias são ilustrativas; os preços e características são exemplos. O stock real será ligado ao sistema de gestão."
                      : "O catálogo é fornecido pelo stand. Confirme disponibilidade, preço e equipamentos diretamente com a equipa antes de tomar uma decisão.",
                },
              ].map((item, index) => (
                <details key={item.q}>
                  <summary>
                    <span>0{index + 1}</span>
                    {item.q}
                    <Plus size={19} />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className={s.contact} id="contacto-b">
          <div className={s.container}>
            <div className={s.contactHeading}>
              <span className={s.eyebrow}>
                <span className={s.signal} /> O SEU PRÓXIMO PASSO
              </span>
              <h2>
                VAMOS
                <br />
                PÔR ISTO
                <br />
                <span>EM ANDAMENTO.</span>
              </h2>
              <p>
                Uma pergunta ou um carro em mente.
                <br />
                Dê-nos o ponto de partida.
              </p>
              {site.contacts?.email && (
                <a href={`mailto:${site.contacts.email}`}>
                  {site.contacts.email} <ArrowUpRight size={17} />
                </a>
              )}
              {site.contacts?.phone && (
                <a href={`tel:${site.contacts.phone}`}>{site.contacts.phone}</a>
              )}
              <div className={s.contactStamp}>
                <DriveMark />
                <span>
                  SUCESSO É<br />
                  ENCONTRAR O SEU.
                </span>
              </div>
            </div>
            <div className={s.formPanel}>
              <span className={s.formKicker}>
                FALE CONNOSCO <ArrowDown size={17} />
              </span>
              <InquiryForm
                source={source}
                selectedVehicle={selected}
                onClearVehicle={() => setSelected(undefined)}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.container}>
          <div className={s.footerTop}>
            <a href="#topo-b" className={s.brand}>
              <BrandLogo variant="compact" animated dark name={site.name} />
            </a>
            <nav aria-label="Navegação do rodapé">
              <a href="#garagem">Viaturas</a>
              <a href="#criterio">O nosso olhar</a>
              <a href="#encontrar">À sua medida</a>
              <a href="#contacto-b">Contacto</a>
            </nav>
            <a href="#topo-b" className={s.toTop} aria-label="Voltar ao topo">
              <ArrowUpRight size={25} />
            </a>
          </div>
          <div className={s.footerWord} aria-hidden="true">
            DRIVE YOUR WAY<span>↗</span>
          </div>
          <div className={s.footerBottom}>
            <span>
              © {new Date().getFullYear()} {site.name}.
              {source === "demo" && " Nome provisório · demonstração."}
            </span>
            <a href="/conceito-a">VER PROPOSTA 01</a>
            <button onClick={() => setPrivacy(true)}>
              PRIVACIDADE & INFORMAÇÕES
            </button>
          </div>
        </div>
      </footer>

      {comparison.length > 0 && (
        <aside className={s.compareTray} aria-label="Viaturas para comparar">
          <div>
            <span className={s.compareCount}>
              {comparison.length}
              <small>/ 3</small>
            </span>
            <span>
              <strong>A SUA COMPARAÇÃO</strong>
              <small aria-live="polite">
                {compared.map((v) => v.make).join(" + ")}
              </small>
            </span>
          </div>
          <button
            className={s.trayClear}
            onClick={() => setComparison([])}
            aria-label="Limpar comparação"
          >
            <X size={19} />
          </button>
          <button
            className={s.orangeButton}
            disabled={compared.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            {compared.length < 2 ? "ESCOLHA MAIS 1" : "COMPARAR AGORA"}
            <ArrowUpRight size={17} />
          </button>
        </aside>
      )}

      {detail && (
        <DriveDialog
          title={vehicleName(detail)}
          onClose={() => setDetail(null)}
          wide
        >
          <div className={s.detailPhoto}>
            <Image
              src={detail.image}
              alt={detail.imageAlt}
              fill
              sizes="(max-width: 700px) 95vw, 1000px"
            />
            <span>
              {source === "demo"
                ? "MODELO DEMONSTRATIVO"
                : detail.status === "available"
                  ? "CONHEÇA A VIATURA"
                  : detail.status === "reserved"
                    ? "RESERVADO"
                    : "VENDIDO"}
            </span>
          </div>
          <div className={s.detailBody}>
            <div className={s.detailTitle}>
              <div>
                <span className={s.eyebrow}>{detail.make}</span>
                <h2>{detail.model}</h2>
                <p>{detail.version}</p>
              </div>
              <strong>{euro.format(detail.priceEur)}</strong>
            </div>
            <dl className={s.detailFacts}>
              {[
                { label: "ANO", value: detail.year },
                {
                  label: "QUILÓMETROS",
                  value: `${numeric.format(detail.mileageKm)} km`,
                },
                { label: "MOTOR", value: fuels[detail.fuel] },
                { label: "POTÊNCIA", value: `${detail.powerHp} cv` },
                { label: "CAIXA", value: transmission(detail) },
              ].map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {source === "demo" && (
              <p className={s.detailNote}>
                Fotografia e dados demonstrativos. Não representam uma viatura
                disponível para venda.
              </p>
            )}
            <div className={s.detailActions}>
              <button
                className={s.orangeButton}
                onClick={() =>
                  enquire(
                    source === "remote" && detail.status === "sold"
                      ? undefined
                      : detail,
                  )
                }
              >
                {source === "remote" && detail.status === "sold"
                  ? "PROCURAR UMA ALTERNATIVA"
                  : source === "remote" && detail.status === "reserved"
                    ? "CONSULTAR DISPONIBILIDADE"
                    : "TENHO INTERESSE"}
                <ArrowUpRight size={19} />
              </button>
              <button
                className={s.actionLink}
                onClick={() => favorite(detail.id)}
              >
                <Heart
                  size={18}
                  fill={favorites.includes(detail.id) ? "currentColor" : "none"}
                />
                {favorites.includes(detail.id)
                  ? "GUARDADO"
                  : "GUARDAR NOS FAVORITOS"}
              </button>
            </div>
          </div>
        </DriveDialog>
      )}

      {compareOpen && compared.length >= 2 && (
        <DriveDialog
          title="Comparar viaturas"
          onClose={() => setCompareOpen(false)}
          wide
        >
          <div className={s.compareContent}>
            <span className={s.eyebrow}>LADO A LADO</span>
            <h2>QUAL É O SEU?</h2>
            <p>
              {source === "demo"
                ? "Dados demonstrativos. Compare os exemplos para explorar a experiência."
                : "Compare os dados do catálogo. Confirme as condições com a equipa."}
            </p>
            <span className={s.comparisonHint}>
              Deslize para ver as outras viaturas{" "}
              <span aria-hidden="true">↔</span>
            </span>
            <div
              className={s.comparisonScroll}
              tabIndex={0}
              aria-label="Tabela comparativa, deslize horizontalmente em ecrãs pequenos"
            >
              <table>
                <caption className={s.srOnly}>
                  Comparação das características das viaturas selecionadas
                </caption>
                <thead>
                  <tr>
                    <th scope="col">VIATURA</th>
                    {compared.map((v) => (
                      <th scope="col" key={v.id}>
                        <div className={s.comparePhoto}>
                          <Image
                            src={v.image}
                            alt={v.imageAlt}
                            fill
                            sizes="260px"
                          />
                        </div>
                        <span>{v.make}</span>
                        <strong>{v.model}</strong>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Preço",
                      value: (v: Vehicle) => euro.format(v.priceEur),
                    },
                    { label: "Ano", value: (v: Vehicle) => v.year },
                    {
                      label: "Quilómetros",
                      value: (v: Vehicle) =>
                        `${numeric.format(v.mileageKm)} km`,
                    },
                    {
                      label: "Combustível",
                      value: (v: Vehicle) => fuels[v.fuel],
                    },
                    {
                      label: "Potência",
                      value: (v: Vehicle) => `${v.powerHp} cv`,
                    },
                    { label: "Caixa", value: transmission },
                    {
                      label: "Estado",
                      value: (v: Vehicle) =>
                        source === "demo"
                          ? "Demonstrativo"
                          : v.status === "available"
                            ? "Disponível"
                            : v.status === "reserved"
                              ? "Reservado"
                              : "Vendido",
                    },
                  ].map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {compared.map((v) => (
                        <td key={v.id}>{row.value(v)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Próximo passo</th>
                    {compared.map((v) => (
                      <td key={v.id}>
                        <button
                          onClick={() =>
                            enquire(
                              source === "remote" && v.status === "sold"
                                ? undefined
                                : v,
                            )
                          }
                          className={s.compareEnquire}
                        >
                          {source === "remote" && v.status === "sold"
                            ? "Ver alternativas"
                            : "Saber mais"}
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </DriveDialog>
      )}

      {privacy && (
        <DriveDialog
          title="Privacidade e informações"
          onClose={() => setPrivacy(false)}
        >
          <div className={s.privacyContent}>
            <span className={s.eyebrow}>INFORMAÇÕES DO PROJETO</span>
            <h2>TUDO ÀS CLARAS.</h2>
            <h3>Uma proposta em desenvolvimento</h3>
            <p>
              {site.name} é um nome provisório.{" "}
              {source === "demo"
                ? "O catálogo, os valores e as características são demonstrativos e não constituem uma oferta comercial."
                : "Confirme disponibilidade e condições diretamente com a equipa."}
            </p>
            <h3>Dados e preferências</h3>
            <p>
              {source === "demo"
                ? "O formulário de demonstração não envia nem guarda os dados preenchidos."
                : "Os pedidos são enviados ao sistema do stand. Os dados do responsável e a política definitiva devem ser confirmados antes do lançamento."}{" "}
              Os favoritos ficam apenas neste navegador. A seleção de comparação
              é temporária e termina ao recarregar a página.
            </p>
            <h3>Antes do lançamento</h3>
            <p>
              A identificação legal, os contactos, a política de privacidade e
              os serviços comerciais serão completados com os dados reais do
              stand.
            </p>
            <button
              className={s.orangeButton}
              onClick={() => setPrivacy(false)}
            >
              COMPREENDIDO <Check size={18} />
            </button>
          </div>
        </DriveDialog>
      )}
    </div>
  );
}
