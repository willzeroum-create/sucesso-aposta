"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image, { getImageProps } from "next/image";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Gauge,
  Heart,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import type { CatalogData, Vehicle } from "@/lib/contracts";
import { InquiryForm } from "@/components/inquiry-form";
import photoCredits from "@/data/photo-credits.json";
import "./showroom-modern.css";

const photoReferenceIds: Record<string, string> = {
  "demo-mustang-red": "mustang-mach-e-red",
  "demo-mustang-silver": "mustang-mach-e-silver",
  "demo-peugeot-3008": "peugeot-3008-grey",
  "demo-peugeot-2008": "peugeot-2008-blue",
  "demo-nissan-qashqai": "nissan-qashqai-white",
  "demo-polestar-2": "polestar-2-thunder",
};

function HeroPhotograph({
  desktop,
  mobile,
  alt,
}: {
  desktop: string;
  mobile: string;
  alt: string;
}) {
  const shared = {
    alt,
    sizes: "100vw",
    loading: "eager" as const,
    fetchPriority: "high" as const,
  };
  const { props: desktopProps } = getImageProps({
    ...shared,
    src: desktop,
    width: 1920,
    height: 1080,
  });
  const { props: mobileProps } = getImageProps({
    ...shared,
    src: mobile,
    width: 900,
    height: 1200,
  });
  return (
    <picture>
      <source
        media="(max-width: 800px)"
        srcSet={mobileProps.srcSet}
        sizes="100vw"
      />
      <img {...desktopProps} className="hero-image" />
    </picture>
  );
}

const currency = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("pt-PT");
const fuels: Record<string, string> = {
  petrol: "Gasolina",
  diesel: "Diesel",
  hybrid: "Híbrido",
  electric: "Elétrico",
};
const categories: Record<string, string> = {
  coupe: "Desportivo",
  saloon: "Berlina",
  suv: "SUV",
  estate: "Carrinha",
};
const nav = [
  { href: "#colecao", label: "A coleção" },
  { href: "#essencia", label: "A nossa essência" },
  { href: "#a-sua-medida", label: "À sua medida" },
];

function Wordmark({ name, light = false }: { name: string; light?: boolean }) {
  return (
    <a
      className={`wordmark ${light ? "wordmark-light" : ""}`}
      href="#inicio"
      aria-label={`${name} — início`}
    >
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 40 44">
          <path d="M5 34 20 6l15 28M12 24h16M5 40h30" />
        </svg>
      </span>
      <span className="brand-type">
        {name}
        <span>AUTOMÓVEIS COM PRESENÇA</span>
      </span>
    </a>
  );
}

function Dialog({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <X size={21} />
        </button>
        {children}
      </div>
    </dialog>
  );
}

export function Showroom({ catalog }: { catalog: CatalogData }) {
  const { site, vehicles, heroSlides, source } = catalog;
  const [activeHero, setActiveHero] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("all");
  const [sort, setSort] = useState("selection");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [detail, setDetail] = useState<Vehicle | null>(null);
  const [detailImage, setDetailImage] = useState(0);
  const [selectedVehicle, setSelectedVehicle] = useState<{
    id: string;
    name: string;
  }>();
  const [legalOpen, setLegalOpen] = useState(false);
  const slide = heroSlides[activeHero] ?? heroSlides[0];
  const featured = vehicles.find((v) => v.id === slide?.vehicleId);
  const isIllustrative = (v?: Vehicle) =>
    source === "demo" || Boolean(v?.highlight?.startsWith("Demonstração"));
  const hasExamples = source === "demo" || vehicles.some(isIllustrative);
  const detailReference =
    detail && isIllustrative(detail)
      ? photoCredits.vehicles.find((p) => p.id === photoReferenceIds[detail.id])
      : undefined;
  const detailPhotos = detail
    ? [detail.image, ...(detailReference?.userImages ?? [])]
    : [];
  useEffect(() => setDetailImage(0), [detail?.id]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem("sucesso-aposta:favorites") ?? "[]",
      );
      if (Array.isArray(stored))
        setFavorites(
          stored.filter(
            (id): id is string =>
              typeof id === "string" &&
              vehicles.some((vehicle) => vehicle.id === id),
          ),
        );
    } catch {
      /* A seleção continua disponível se o armazenamento estiver bloqueado. */
    }
    setFavoritesReady(true);
  }, [vehicles]);

  useEffect(() => {
    if (!favoritesReady) return;
    try {
      localStorage.setItem(
        "sucesso-aposta:favorites",
        JSON.stringify(favorites),
      );
    } catch {
      /* Sessão sem armazenamento. */
    }
  }, [favorites, favoritesReady]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const toggleFavorite = (id: string) =>
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-PT");
  const filtered = vehicles.filter(
    (v) =>
      (category === "all" ||
        (category === "electric"
          ? v.fuel === "electric"
          : v.category === category)) &&
      (budget === "all" || v.priceEur <= Number(budget)) &&
      (!favoritesOnly || favorites.includes(v.id)) &&
      `${v.make} ${v.model} ${v.version}`
        .toLocaleLowerCase("pt-PT")
        .includes(normalizedQuery),
  );
  if (sort === "price-asc") filtered.sort((a, b) => a.priceEur - b.priceEur);
  if (sort === "price-desc") filtered.sort((a, b) => b.priceEur - a.priceEur);
  if (sort === "year") filtered.sort((a, b) => b.year - a.year);

  function enquire(vehicle?: Vehicle) {
    setDetail(null);
    setSelectedVehicle(
      vehicle
        ? { id: vehicle.id, name: `${vehicle.make} ${vehicle.model}` }
        : undefined,
    );
    requestAnimationFrame(() => {
      document.getElementById("contacto")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      document
        .querySelector<HTMLInputElement>('#contacto input[name="fullName"]')
        ?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="modern-showroom" id="inicio">
      <a className="skip-link" href="#conteudo">
        Saltar para o conteúdo
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Wordmark name={site.name} />
          <nav
            className={`main-nav ${menuOpen ? "is-open" : ""}`}
            id="main-nav"
            aria-label="Navegação principal"
          >
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              className="mobile-contact"
              href="#contacto"
              onClick={() => setMenuOpen(false)}
            >
              Vamos conversar <ArrowUpRight size={16} />
            </a>
          </nav>
          <a className="header-contact" href="#contacto">
            Vamos conversar <ArrowUpRight size={17} />
          </a>
          <button
            className="icon-button menu-toggle"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="conteudo">
        {slide && (
          <section
            className={`hero hero-${slide.textTone}`}
            aria-label="Viatura em destaque"
            style={
              {
                "--hero-position": slide.objectPositionDesktop,
                "--hero-mobile-position": slide.objectPositionMobile,
              } as CSSProperties
            }
          >
            <div className="hero-photograph" key={slide.id}>
              <HeroPhotograph
                desktop={slide.imageDesktop}
                mobile={slide.imageMobile}
                alt={
                  featured
                    ? `${featured.make} ${featured.model} — imagem de apresentação`
                    : "Automóvel em destaque"
                }
              />
            </div>
            <div className="hero-shade" />
            <div className="hero-content page-width" key={`${slide.id}-copy`}>
              <div className="eyebrow hero-eyebrow">
                <span className="tiny-square" />
                {slide.eyebrow}
              </div>
              <h1>
                {slide.headline}
                <em>{slide.headlineAccent}</em>
              </h1>
              <p className="hero-description">{slide.description}</p>
              <div className="hero-actions">
                <button
                  className={`button ${slide.textTone === "dark" ? "button-primary" : "button-light"}`}
                  onClick={() => featured && setDetail(featured)}
                  disabled={!featured}
                >
                  Conhecer a viatura <ArrowUpRight size={18} />
                </button>
                <a href="#colecao">
                  Ver coleção <ArrowDown size={16} />
                </a>
              </div>
              {featured && (
                <div className="hero-specification">
                  <span>
                    {featured.fuel === "electric" ? (
                      <Zap size={15} />
                    ) : (
                      <Gauge size={15} />
                    )}
                    {fuels[featured.fuel]}
                  </span>
                  <span>{featured.powerHp} cv</span>
                  <span>{featured.year}</span>
                </div>
              )}
            </div>
            <div className="hero-bottom page-width">
              <div
                className="hero-switcher"
                aria-label="Escolher viatura em destaque"
              >
                {heroSlides.map((item, index) => (
                  <button
                    key={item.id}
                    className={index === activeHero ? "is-active" : ""}
                    onClick={() => setActiveHero(index)}
                    aria-label={`Destaque ${index + 1}: ${vehicles.find((v) => v.id === item.vehicleId)?.make ?? "viatura"} ${vehicles.find((v) => v.id === item.vehicleId)?.model ?? ""}`}
                    aria-pressed={index === activeHero}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>
                      {vehicles.find((v) => v.id === item.vehicleId)?.make ===
                      "Polestar"
                        ? "Polestar 2"
                        : (vehicles
                            .find((v) => v.id === item.vehicleId)
                            ?.model.replace("Mustang ", "") ?? "Viatura")}
                    </strong>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
              {featured && (
                <button
                  className="hero-car"
                  onClick={() => setDetail(featured)}
                >
                  <span>
                    <small>
                      {isIllustrative(featured)
                        ? "PREÇO ILUSTRATIVO"
                        : "EM DESTAQUE"}
                    </small>
                    <strong>{currency.format(featured.priceEur)}</strong>
                    <span>
                      {featured.make} {featured.model}
                    </span>
                  </span>
                  <span className="circle-arrow">
                    <ArrowUpRight size={23} />
                  </span>
                </button>
              )}
              <a
                className="hero-scroll"
                href="#colecao"
                aria-label="Explorar a coleção"
              >
                <span>CONTINUE A VIAGEM</span>
                <ArrowDown size={16} />
              </a>
            </div>
            {isIllustrative(featured) && (
              <span className="hero-photo-note">
                Imagem de apresentação · dados fictícios
              </span>
            )}
          </section>
        )}

        <div className="editorial-strip page-width">
          <p>
            Uma escolha com presença.
            <br />
            <em>Em todos os sentidos.</em>
          </p>
          <div>
            <span>
              <Zap size={17} /> ELÉTRICOS & OUTRAS POSSIBILIDADES
            </span>
            <span>
              <Heart size={17} /> ESCOLHIDOS PARA SI
            </span>
          </div>
          <span className="edition-stamp">
            A PRIMEIRA
            <br />
            DE MUITAS VIAGENS
            <ArrowUpRight size={22} />
          </span>
        </div>

        <section className="collection section-space" id="colecao">
          <div className="page-width">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  <span className="tiny-square" /> A NOSSA SELEÇÃO
                </span>
                <h2>
                  O próximo é seu.
                  <br />
                  <em>Encontre a sua combinação.</em>
                </h2>
              </div>
              <div className="section-intro">
                <p>
                  Há um automóvel que combina com a sua forma de estar. A
                  descoberta começa aqui.
                </p>
                <span className="text-caption">
                  {hasExamples ? "COLEÇÃO DEMONSTRATIVA" : "EXPLORE A COLEÇÃO"}{" "}
                  <ArrowDown size={15} />
                </span>
              </div>
            </div>
            <div className="collection-toolbar">
              <div className="filters" aria-label="Filtrar tipo de viatura">
                {[
                  { id: "all", label: "Todos" },
                  { id: "electric", label: "Elétricos" },
                  { id: "suv", label: "SUV" },
                  ...(vehicles.some((v) => v.category === "saloon")
                    ? [{ id: "saloon", label: "Berlinas" }]
                    : []),
                  ...(vehicles.some((v) => v.category === "coupe")
                    ? [{ id: "coupe", label: "Desportivos" }]
                    : []),
                  ...(vehicles.some((v) => v.category === "estate")
                    ? [{ id: "estate", label: "Carrinhas" }]
                    : []),
                ].map((filter) => (
                  <button
                    key={filter.id}
                    aria-pressed={category === filter.id}
                    className={
                      category === filter.id ? "filter is-active" : "filter"
                    }
                    onClick={() => setCategory(filter.id)}
                  >
                    {filter.label}
                    {filter.id === "all" && (
                      <sup>{vehicles.length.toString().padStart(2, "0")}</sup>
                    )}
                  </button>
                ))}
              </div>
              <div className="collection-tools">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Pesquisar marca ou modelo"
                    placeholder="Marca ou modelo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="Limpar pesquisa"
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <button
                  className={`favorites-filter ${favoritesOnly ? "is-active" : ""}`}
                  onClick={() => setFavoritesOnly(!favoritesOnly)}
                  aria-pressed={favoritesOnly}
                  aria-label={`Ver favoritos, ${favorites.length} guardados`}
                >
                  <Heart
                    size={18}
                    fill={favoritesOnly ? "currentColor" : "none"}
                  />
                  <span>{favorites.length}</span>
                </button>
              </div>
            </div>
            <div className="collection-refinements">
              <span>
                <strong>{String(filtered.length).padStart(2, "0")}</strong>{" "}
                {filtered.length === 1
                  ? "viatura para descobrir"
                  : "viaturas para descobrir"}
              </span>
              <div>
                <label>
                  Orçamento{" "}
                  <select
                    aria-label="Preço máximo"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  >
                    <option value="all">Todos os preços</option>
                    <option value="25000">Até 25 000 €</option>
                    <option value="35000">Até 35 000 €</option>
                    <option value="45000">Até 45 000 €</option>
                  </select>
                </label>
                <label className="sort-label">
                  Ordenar{" "}
                  <select
                    aria-label="Ordenar viaturas"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="selection">A nossa seleção</option>
                    <option value="price-asc">Preço crescente</option>
                    <option value="price-desc">Preço decrescente</option>
                    <option value="year">Mais recentes</option>
                  </select>
                </label>
              </div>
            </div>
            <p className="sr-only" role="status">
              {filtered.length}{" "}
              {filtered.length === 1
                ? "viatura encontrada"
                : "viaturas encontradas"}
              {favoritesOnly ? " nos favoritos" : ""}.
            </p>
            <div className="vehicle-grid">
              {filtered.map((vehicle, index) => (
                <article className="vehicle-card" key={vehicle.id}>
                  <div className="vehicle-image-wrap">
                    <button
                      className="vehicle-image-button"
                      aria-label={`Conhecer ${vehicle.make} ${vehicle.model}`}
                      onClick={() => setDetail(vehicle)}
                    >
                      <Image
                        src={vehicle.image}
                        alt={vehicle.imageAlt}
                        fill
                        sizes="(max-width: 650px) 94vw, (max-width: 1000px) 46vw, 31vw"
                        className="vehicle-image"
                      />
                    </button>
                    <span className="vehicle-badge">
                      {source === "remote" && vehicle.status !== "available"
                        ? vehicle.status === "sold"
                          ? "Vendido"
                          : "Reservado"
                        : isIllustrative(vehicle)
                          ? "Exemplo de stock"
                          : (vehicle.highlight ?? categories[vehicle.category])}
                    </span>
                    <button
                      className={`favorite-button ${favorites.includes(vehicle.id) ? "is-favorite" : ""}`}
                      onClick={() => toggleFavorite(vehicle.id)}
                      aria-label={`${favorites.includes(vehicle.id) ? "Retirar" : "Guardar"} ${vehicle.make} ${vehicle.model} ${favorites.includes(vehicle.id) ? "dos" : "nos"} favoritos`}
                      aria-pressed={favorites.includes(vehicle.id)}
                    >
                      <Heart
                        size={18}
                        fill={
                          favorites.includes(vehicle.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                    <span className="image-index">
                      {String(index + 1).padStart(2, "0")} / SELEÇÃO
                    </span>
                  </div>
                  <div className="vehicle-info">
                    <div className="vehicle-title">
                      <div>
                        <span className="vehicle-make">{vehicle.make}</span>
                        <h3>
                          <button onClick={() => setDetail(vehicle)}>
                            {vehicle.make === "Polestar"
                              ? "Polestar 2"
                              : vehicle.model}
                          </button>
                        </h3>
                      </div>
                      <span className="vehicle-price">
                        {currency.format(vehicle.priceEur)}
                      </span>
                    </div>
                    <p className="vehicle-version">{vehicle.version}</p>
                    <div className="vehicle-specs">
                      <span>{vehicle.year}</span>
                      <span>{number.format(vehicle.mileageKm)} km</span>
                      <span>{fuels[vehicle.fuel]}</span>
                      <span>
                        {vehicle.transmission === "automatic"
                          ? "Automática"
                          : "Manual"}
                      </span>
                    </div>
                    <button
                      className="vehicle-link"
                      onClick={() => setDetail(vehicle)}
                    >
                      Conhecer a viatura <ArrowUpRight size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className="empty-state">
                <Search size={30} />
                <h3>
                  {favoritesOnly
                    ? "A sua seleção começa aqui."
                    : "Ainda não encontrámos essa combinação."}
                </h3>
                <p>
                  {favoritesOnly
                    ? "Toque no coração de uma viatura para a guardar nos favoritos."
                    : "Experimente outra marca, modelo ou tipo de viatura."}
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    setCategory("all");
                    setQuery("");
                    setFavoritesOnly(false);
                    setBudget("all");
                    setSort("selection");
                  }}
                >
                  Explorar todas as viaturas <ArrowRight size={17} />
                </button>
              </div>
            )}
            <div className="collection-footer">
              <p>
                {hasExamples
                  ? "Modelos, preços e características apresentados como exemplo. Não constituem uma oferta de venda."
                  : "Disponibilidade e características sujeitas a confirmação."}
              </p>
              <a className="text-link" href="#a-sua-medida">
                Procura algo diferente? <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
        </section>

        <section className="essence" id="essencia">
          <div className="essence-photo">
            <Image
              src="/images/interior.jpg"
              alt="Pormenor de um habitáculo automóvel, com atenção aos materiais e ao posto de condução"
              fill
              sizes="(max-width: 800px) 100vw, 50vw"
            />
            <span className="photo-caption">O DETALHE NÃO É UM PORMENOR.</span>
            <span className="photo-cross" aria-hidden="true">
              +
            </span>
          </div>
          <div className="essence-copy">
            <span className="eyebrow">
              <span className="tiny-square" /> A NOSSA ESSÊNCIA
            </span>
            <h2>
              Mais do que chegar.
              <br />
              <em>Sentir o caminho.</em>
            </h2>
            <p>
              O toque do volante. A precisão de uma linha. Aquela vontade de
              fazer o caminho mais longo.
            </p>
            <p>
              Acreditamos que escolher um automóvel é escolher parte da sua
              história. Por isso, queremos dar espaço ao que realmente importa:
              os seus gostos, o seu ritmo e os detalhes que fazem a diferença.
            </p>
            <a href="#contacto" className="text-link light-link">
              Vamos descobrir o seu <ArrowUpRight size={19} />
            </a>
            <div className="essence-signature">
              <span className="signature">Uma escolha com carácter.</span>
              <span>{site.name.toLocaleUpperCase("pt-PT")}</span>
            </div>
          </div>
        </section>

        <section
          className="experience section-space page-width"
          id="experiencia"
        >
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                <span className="tiny-square" /> DO PRIMEIRO OLHAR À PRÓXIMA
                VIAGEM
              </span>
              <h2>
                Uma escolha pessoal.
                <br />
                <em>Um processo próximo.</em>
              </h2>
            </div>
            <p className="section-intro">
              Boas decisões começam com uma conversa. O resto faz-se com
              clareza, ao seu ritmo.
            </p>
          </div>
          <div className="experience-grid">
            {[
              {
                n: "01",
                Icon: Search,
                title: "Começa em si",
                text: "O que procura, como conduz e o que valoriza. A sua próxima escolha começa pelas perguntas certas.",
              },
              {
                n: "02",
                Icon: ShieldCheck,
                title: "Os detalhes à vista",
                text: "Características, histórico e condições para analisar. Informação para conhecer a viatura antes de decidir.",
              },
              {
                n: "03",
                Icon: Gauge,
                title: "Sinta a diferença",
                text: "Peça para conhecer a viatura e combinar uma visita. Há sensações que uma fotografia não consegue contar.",
              },
            ].map(({ n, Icon, title, text }) => (
              <article className="experience-item" key={n}>
                <div>
                  <span className="step-number">{n}</span>
                  <Icon size={25} strokeWidth={1.2} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bespoke page-width" id="a-sua-medida">
          <div className="bespoke-image">
            <Image
              src="/images/road.jpg"
              alt="Estrada costeira junto ao mar, um convite à próxima viagem"
              fill
              sizes="(max-width: 800px) 100vw, 55vw"
            />
            <div className="bespoke-image-text">
              <span>O DESTINO É SEU.</span>
              <span>O CAMINHO, DESCOBRIMOS JUNTOS.</span>
            </div>
          </div>
          <div className="bespoke-copy">
            <span className="eyebrow">
              <span className="tiny-square" /> À SUA MEDIDA
            </span>
            <h2>
              O seu próximo carro
              <br />
              ainda não está aqui?
              <br />
              <em>Conte-nos o que imagina.</em>
            </h2>
            <p>
              Uma marca que sempre admirou. Uma configuração difícil de
              encontrar. Ou apenas uma ideia. Dê-nos o ponto de partida.
            </p>
            <button className="button button-primary" onClick={() => enquire()}>
              Partilhar o que procuro <ArrowUpRight size={18} />
            </button>
            <span className="bespoke-footnote">
              A SUA VISÃO. UMA NOVA POSSIBILIDADE.
            </span>
          </div>
        </section>

        <section className="faq-section section-space page-width">
          <div>
            <span className="eyebrow">
              <span className="tiny-square" /> ANTES DE COMEÇAR
            </span>
            <h2>
              Vale a pena
              <br />
              <em>saber.</em>
            </h2>
            <a href="#contacto" className="text-link">
              Ainda tem uma questão? <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="faq-list">
            {[
              {
                question: "Como posso conhecer uma viatura?",
                answer: `Abra a ficha da viatura e selecione “Tenho interesse”. O modelo fica associado ao formulário, onde pode indicar que pretende uma visita.${source === "demo" ? " Nesta versão de demonstração, o pedido não é enviado." : " A equipa poderá confirmar consigo a disponibilidade e os detalhes da visita."}`,
              },
              {
                question: "Posso procurar um modelo que não está na coleção?",
                answer:
                  "Sim. Use o formulário para indicar a marca, o modelo, a configuração e o orçamento que tem em mente. A pesquisa e as condições de aquisição deverão ser confirmadas diretamente com o stand quando o serviço estiver disponível.",
              },
              {
                question: "É possível apresentar uma retoma?",
                answer:
                  "Pode mencionar a sua viatura no pedido, incluindo marca, modelo, ano e quilometragem. A possibilidade de retoma e qualquer avaliação dependem de análise e confirmação pelo stand.",
              },
              {
                question: "Os automóveis e os preços apresentados são reais?",
                answer: hasExamples
                  ? "As viaturas marcadas como exemplo usam preços, quilometragens e características fictícios. As fotografias pesquisadas representam modelos semelhantes e as capas incluem cenários compostos. Os responsáveis pelo stand podem substituir todos estes dados e fotografias no painel antes de os apresentar como stock real."
                  : "A coleção é apresentada a partir do catálogo do stand. Confirme sempre a disponibilidade, o preço e os equipamentos da viatura com a equipa antes de tomar uma decisão.",
              },
            ].map((faq, index) => (
              <details key={faq.question}>
                <summary>
                  <span className="faq-number">0{index + 1}</span>
                  {faq.question}
                  <Plus size={20} />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="contact section-space" id="contacto">
          <div className="page-width contact-grid">
            <div className="contact-copy">
              <span className="eyebrow">
                <span className="tiny-square" /> O PRÓXIMO CAPÍTULO
              </span>
              <h2>
                Tudo começa
                <br />
                com uma
                <br />
                <em>boa conversa.</em>
              </h2>
              <p>
                Conte-nos o que o move.
                <br />
                Vamos dar forma à sua próxima escolha.
              </p>
              <div className="contact-signoff">
                <span className="contact-line" />
                {site.contacts?.email ? (
                  <a href={`mailto:${site.contacts.email}`}>
                    {site.contacts.email} <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <span>SEM PRESSA. COM ATENÇÃO A CADA DETALHE.</span>
                )}
              </div>
              {site.contacts?.phone && (
                <a className="text-link" href={`tel:${site.contacts.phone}`}>
                  {site.contacts.phone}
                </a>
              )}
            </div>
            <InquiryForm
              source={source}
              selectedVehicle={selectedVehicle}
              onClearVehicle={() => setSelectedVehicle(undefined)}
            />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width">
          <div className="footer-top">
            <Wordmark name={site.name} light />
            <p>
              Automóveis com presença.
              <br />
              <em>Viagens com significado.</em>
            </p>
            <a
              href="#inicio"
              className="back-top"
              aria-label="Voltar ao início"
            >
              <ArrowUpRight size={24} />
            </a>
          </div>
          <div className="footer-nav">
            <nav aria-label="Navegação do rodapé">
              <a href="#colecao">A coleção</a>
              <a href="#essencia">A nossa essência</a>
              <a href="#a-sua-medida">À sua medida</a>
              <a href="#contacto">Contacto</a>
            </nav>
            <span>FEITO PARA QUEM GOSTA DO CAMINHO.</span>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {site.name}.
              {source === "demo" &&
                " Nome provisório · projeto em demonstração."}
            </span>
            <div className="footer-utility">
              <a href="/creditos">Fotografias & créditos</a>
              <a href="/painel/site">
                Área do stand <ArrowUpRight size={13} />
              </a>
              <button onClick={() => setLegalOpen(true)}>
                Privacidade & informações
              </button>
            </div>
          </div>
        </div>
      </footer>

      {detail && (
        <Dialog
          title={`${detail.make} ${detail.model}`}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="vehicle-detail">
            <div className="detail-photo">
              <Image
                src={detailPhotos[detailImage] ?? detail.image}
                alt={
                  detailImage === 0
                    ? detail.imageAlt
                    : `${detail.make} ${detail.model} — referência enviada, vista ${detailImage}`
                }
                fill
                sizes="(max-width: 750px) 95vw, 540px"
              />
              {isIllustrative(detail) && <span>FOTOGRAFIA DE REFERÊNCIA</span>}
              {detailPhotos.length > 1 && (
                <div
                  className="detail-gallery"
                  aria-label="Fotografias da viatura"
                >
                  {detailPhotos.map((photo, i) => (
                    <button
                      key={photo}
                      aria-label={`Ver fotografia ${i + 1}`}
                      aria-pressed={detailImage === i}
                      onClick={() => setDetailImage(i)}
                    >
                      <Image src={photo} alt="" width={84} height={60} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-content">
              <span className="eyebrow">
                {categories[detail.category]} · {detail.make}
              </span>
              <h2>
                {detail.make === "Polestar" ? "Polestar 2" : detail.model}
              </h2>
              <p>{detail.version}</p>
              <strong className="detail-price">
                {currency.format(detail.priceEur)}
              </strong>
              <dl className="detail-specs">
                <div>
                  <dt>Ano</dt>
                  <dd>{detail.year}</dd>
                </div>
                <div>
                  <dt>Quilometragem</dt>
                  <dd>{number.format(detail.mileageKm)} km</dd>
                </div>
                <div>
                  <dt>Combustível</dt>
                  <dd>{fuels[detail.fuel]}</dd>
                </div>
                <div>
                  <dt>Transmissão</dt>
                  <dd>
                    {detail.transmission === "automatic"
                      ? "Automática"
                      : "Manual"}
                  </dd>
                </div>
                <div>
                  <dt>Potência</dt>
                  <dd>{detail.powerHp} cv</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    {isIllustrative(detail)
                      ? "Demonstrativo"
                      : detail.status === "available"
                        ? "Disponível"
                        : detail.status === "reserved"
                          ? "Reservado"
                          : "Vendido"}
                  </dd>
                </div>
              </dl>
              {isIllustrative(detail) && (
                <p className="detail-disclaimer">
                  Exemplo de apresentação. Preço e características fictícios;
                  não corresponde a uma viatura disponível para venda.
                </p>
              )}
              {detailReference && (
                <p className="detail-photo-credit">
                  Fotografia de referência:{" "}
                  <a
                    href={detailReference.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detailReference.author}
                  </a>{" "}
                  ·{" "}
                  <a
                    href={detailReference.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detailReference.license}
                  </a>
                  . Outras vistas fornecidas pelo cliente.
                </p>
              )}
              <button
                className="button button-primary"
                onClick={() =>
                  enquire(
                    source === "remote" && detail.status === "sold"
                      ? undefined
                      : detail,
                  )
                }
              >
                {source === "remote" && detail.status === "sold"
                  ? "Procurar uma alternativa"
                  : source === "remote" && detail.status === "reserved"
                    ? "Consultar disponibilidade"
                    : "Tenho interesse"}{" "}
                <ArrowUpRight size={18} />
              </button>
              <button
                className="detail-save"
                onClick={() => toggleFavorite(detail.id)}
              >
                <Heart
                  size={17}
                  fill={favorites.includes(detail.id) ? "currentColor" : "none"}
                />
                {favorites.includes(detail.id)
                  ? "Guardado nos favoritos"
                  : "Guardar para mais tarde"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {legalOpen && (
        <Dialog
          title="Privacidade e informações do projeto"
          onClose={() => setLegalOpen(false)}
        >
          <div className="legal-content">
            <span className="eyebrow">INFORMAÇÕES DO PROJETO</span>
            <h2>
              Clareza, desde
              <br />
              <em>o primeiro contacto.</em>
            </h2>
            <h3>Uma primeira edição</h3>
            <p>
              “{site.name}” é o nome provisório deste projeto.{" "}
              {source === "demo"
                ? "As viaturas, características e preços são exemplos para apresentação, sem oferta comercial."
                : "As informações comerciais e a disponibilidade devem ser confirmadas junto do stand."}
            </p>
            <h3>Os seus dados</h3>
            <p>
              {source === "demo"
                ? "Em modo de demonstração, os dados do formulário não são enviados nem guardados. Os favoritos ficam apenas no armazenamento local deste navegador e podem ser removidos através dos ícones de coração."
                : "Os pedidos de contacto são enviados ao sistema do stand. A identidade do responsável pelo tratamento, os prazos de conservação e os meios para exercer os seus direitos devem constar da política definitiva antes da abertura pública."}
            </p>
            <h3>Antes da abertura ao público</h3>
            <p>
              A identificação legal, os contactos, as condições comerciais e a
              política de privacidade definitiva serão completados com os dados
              do stand. Esta página ainda não está preparada para receber
              pedidos comerciais reais.
            </p>
            <button
              className="button button-primary"
              onClick={() => setLegalOpen(false)}
            >
              Compreendido <Check size={17} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
