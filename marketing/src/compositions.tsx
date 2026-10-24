import React from 'react';
import {AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Car, C, details, PHONE, sans, serif, title} from './theme';

type CP = {car: Car};
type GP = {cars: Car[]};
type Photo = Car['photos'][number];
const Logo: React.FC<{dark?: boolean; width?: number}> = ({dark = false, width = 440}) =>
  <Img src={staticFile('brand/logo-wordmark' + (dark ? '-dark' : '') + '.webp')} style={{width, height: 'auto'}} />;

const PhotoBox: React.FC<{photo: Photo; zoom?: number; style: React.CSSProperties}> = ({photo, zoom = 1, style}) => {
  const portrait = photo.height > photo.width;
  return <div style={{background: C.ink, position: 'relative', overflow: 'hidden', ...style}}>
    <Img src={staticFile(photo.src)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', objectPosition: portrait ? 'center 70%' : 'center 55%', transform: 'scale(' + zoom + ')'}} />
  </div>;
};

const caption: React.CSSProperties = {fontFamily: sans, fontSize: 34, fontWeight: 700, letterSpacing: 2, color: C.deep};

export const CarPost: React.FC<CP> = ({car}) => <AbsoluteFill style={{background: C.paper, color: C.ink, fontFamily: sans}}>
  <div style={{position: 'absolute', left: 60, top: 48}}><Logo /></div>
  <div style={{position: 'absolute', right: 60, top: 77, ...caption, fontSize: 32}}>FAMÕES · ODIVELAS</div>
  <div style={{position: 'absolute', left: 60, right: 60, top: 164}}>
    <div style={{fontSize: 86, fontWeight: 800, lineHeight: 0.99, letterSpacing: -3.5}}>{title(car)}</div>
    <div style={{fontFamily: serif, fontSize: 52, fontStyle: 'italic', color: C.red, marginTop: 6}}>{car.subtitle}</div>
  </div>
  <PhotoBox photo={car.photos[car.pick.cover]} style={{position: 'absolute', left: 60, top: 380, width: 960, height: 656, borderRadius: 10}} />
  <div style={{position: 'absolute', left: 60, right: 60, top: 1064, borderTop: '2px solid ' + C.line, paddingTop: 18}}>
    <div style={{fontSize: 40, fontWeight: 700, lineHeight: 1.18}}>{details(car)}</div>
    <div style={{display: 'flex', gap: 18, marginTop: 20, color: C.deep, fontSize: 34, fontWeight: 700}}>
      <span>Entrada facilitada</span><span>·</span><span>Condições especiais</span>
    </div>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 23}}>
      <span style={{fontSize: 39, fontWeight: 800}}>Preço sob consulta</span>
      <span style={{fontSize: 36, fontWeight: 800, color: C.red}}>WhatsApp {PHONE}</span>
    </div>
  </div>
</AbsoluteFill>;

const PhotoShot: React.FC<{photo: Photo; first: boolean; last: boolean}> = ({photo, first, last}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 69, 77], [first ? 1 : 0, 1, 1, last ? 1 : 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const zoom = interpolate(frame, [0, 77], [1, 1.08], {extrapolateRight: 'clamp'});
  return <PhotoBox photo={photo} zoom={zoom} style={{position: 'absolute', left: 60, top: 550, width: 960, height: 760, borderRadius: 10, opacity}} />;
};

const ReelBody: React.FC<CP> = ({car}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame, fps, config: {damping: 17, stiffness: 125}});
  const opening = interpolate(frame, [90, 112], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const offers = interpolate(frame, [126, 145, 272, 290], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const price = interpolate(frame, [280, 300], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const picks = Array.from({length: 5}, (_, i) => car.pick.reel[i % car.pick.reel.length]);
  return <AbsoluteFill style={{background: C.paper, color: C.ink, fontFamily: sans}}>
    <div style={{position: 'absolute', left: 60, top: 255, ...caption}}>SUCESSO PROMISSOR · FAMÕES</div>
    <div style={{position: 'absolute', left: 60, right: 60, top: 320, opacity: opening * entrance, transform: 'translateY(' + (1 - entrance) * 50 + 'px)'}}>
      <div style={{fontSize: 84, fontWeight: 800, lineHeight: 0.98, letterSpacing: -4}}>{title(car)}</div>
      <div style={{fontFamily: serif, fontSize: 54, fontStyle: 'italic', color: C.red, marginTop: 6}}>{car.subtitle}</div>
    </div>
    <div style={{position: 'absolute', left: 60, top: 324, opacity: offers}}>
      <div style={{fontSize: 80, fontWeight: 800, lineHeight: 1}}>Compre o seu carro</div>
      <div style={{fontFamily: serif, fontSize: 62, fontStyle: 'italic', color: C.red}}>com confiança.</div>
    </div>
    <div style={{position: 'absolute', left: 60, top: 355, fontSize: 86, fontWeight: 800, opacity: price}}>Preço sob consulta</div>
    {picks.map((photoIndex, i) => <Sequence key={i} from={i * 69} durationInFrames={i === 4 ? 69 : 77} premountFor={8}>
      <PhotoShot photo={car.photos[photoIndex]} first={i === 0} last={i === 4} />
    </Sequence>)}
    <div style={{position: 'absolute', left: 60, right: 60, top: 1336, fontSize: 40, fontWeight: 700, lineHeight: 1.2}}>{details(car)}</div>
    <div style={{position: 'absolute', left: 60, top: 1410, display: 'flex', gap: 14, opacity: offers}}>
      {['Entrada facilitada', 'Condições especiais'].map((s) => <div key={s} style={{background: C.red, color: C.white, borderRadius: 6, padding: '16px 20px', fontSize: 34, fontWeight: 700}}>{s}</div>)}
    </div>
    <div style={{position: 'absolute', left: 60, top: 1430, fontSize: 39, fontWeight: 800, color: C.red, opacity: price}}>WhatsApp {PHONE}</div>
  </AbsoluteFill>;
};

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame, fps, config: {damping: 16, stiffness: 100}});
  return <AbsoluteFill style={{background: C.ink, color: C.white, fontFamily: sans}}>
    <div style={{position: 'absolute', left: 60, right: 60, top: 330, textAlign: 'center', opacity: s, transform: 'scale(' + (0.9 + 0.1 * s) + ')'}}>
      <Img src={staticFile('brand/logo-emblem-dark.webp')} style={{width: 520, height: 'auto'}} />
      <div style={{marginTop: 44}}><Logo dark width={760} /></div>
      <div style={{width: 260, height: 2, background: C.deep, margin: '64px auto 56px'}} />
      <div style={{fontSize: 90, fontWeight: 800}}>Fale connosco</div>
      <div style={{fontSize: 64, fontWeight: 800, color: C.red, marginTop: 24}}>WhatsApp {PHONE}</div>
      <div style={{fontSize: 34, fontWeight: 700, letterSpacing: 3, marginTop: 56}}>FAMÕES · ODIVELAS</div>
    </div>
  </AbsoluteFill>;
};
export const CarReel: React.FC<CP> = ({car}) => <AbsoluteFill>
  <Sequence durationInFrames={345} premountFor={8}><ReelBody car={car} /></Sequence>
  <Sequence from={345} durationInFrames={75} premountFor={8}><EndCard /></Sequence>
</AbsoluteFill>;

const selected = (cars: Car[]) => ['byd-atto-2-2025', 'jaguar-i-pace-2019', 'audi-a3-2020', 'ford-mustang-mach-e-2021']
  .map((slug) => cars.find((c) => c.slug === slug)).filter((c): c is Car => Boolean(c));

export const ConditionsPost: React.FC<GP> = ({cars}) => <AbsoluteFill style={{background: C.paper, color: C.ink, fontFamily: sans}}>
  <div style={{position: 'absolute', left: 60, top: 48}}><Logo /></div>
  <div style={{position: 'absolute', left: 60, top: 190}}>
    <div style={{fontSize: 91, fontWeight: 800, lineHeight: 0.98, letterSpacing: -4}}>Compre o seu carro</div>
    <div style={{fontFamily: serif, fontSize: 70, fontStyle: 'italic', color: C.red}}>com confiança.</div>
  </div>
  <div style={{position: 'absolute', left: 60, top: 410, display: 'grid', gridTemplateColumns: '470px 470px', gap: 20}}>
    {selected(cars).map((car) => <PhotoBox key={car.slug} photo={car.photos[car.pick.cover]} style={{width: 470, height: 350, borderRadius: 8}} />)}
  </div>
  <div style={{position: 'absolute', left: 60, right: 60, top: 1150, borderTop: '2px solid ' + C.line, paddingTop: 20}}>
    <div style={{fontSize: 38, fontWeight: 700, color: C.deep}}>Entrada facilitada · Condições especiais</div>
    <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 30}}>
      <span style={{fontSize: 36, fontWeight: 700}}>Preço sob consulta</span><span style={{fontSize: 38, fontWeight: 800, color: C.red}}>WhatsApp {PHONE}</span>
    </div>
  </div>
</AbsoluteFill>;

export const ConditionsStory: React.FC<GP> = ({cars}) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 20], [0, 1], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: C.paper, color: C.ink, fontFamily: sans}}>
    <div style={{position: 'absolute', left: 60, top: 255, ...caption}}>SUCESSO PROMISSOR · FAMÕES</div>
    <div style={{position: 'absolute', left: 60, top: 325, opacity: fade, transform: 'translateY(' + (1 - fade) * 30 + 'px)'}}>
      <div style={{fontSize: 91, fontWeight: 800, lineHeight: 1}}>Compre o seu carro</div>
      <div style={{fontFamily: serif, fontSize: 67, fontStyle: 'italic', color: C.red}}>com confiança.</div>
    </div>
    {selected(cars).map((car, i) => <Sequence key={car.slug} from={i * 58} durationInFrames={i === 3 ? 68 : 58} premountFor={8}>
      <PhotoBox photo={car.photos[car.pick.cover]} style={{position: 'absolute', left: 60, top: 580, width: 960, height: 690, borderRadius: 10}} />
    </Sequence>)}
    <div style={{position: 'absolute', left: 60, top: 1305, fontSize: 44, fontWeight: 800, color: C.deep}}>Entrada facilitada</div>
    <div style={{position: 'absolute', left: 60, top: 1370, fontSize: 44, fontWeight: 800, color: C.deep}}>Condições especiais</div>
    <div style={{position: 'absolute', left: 60, top: 1460, fontSize: 38, fontWeight: 700}}>Preço sob consulta</div>
    <Sequence from={232} durationInFrames={68} premountFor={8}><EndCard /></Sequence>
  </AbsoluteFill>;
};
