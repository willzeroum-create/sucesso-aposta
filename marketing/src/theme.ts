import {loadFont as dm} from '@remotion/google-fonts/DMSans';
import {loadFont as cg} from '@remotion/google-fonts/CormorantGaramond';
export const sans = dm('normal', {weights: ['500', '700', '800'], subsets: ['latin']}).fontFamily;
export const serif = cg('italic', {weights: ['500'], subsets: ['latin']}).fontFamily;
/** Telefone/WhatsApp para clientes (confirmado pelo dono). */
export const PHONE = '961 905 539';
export const C = {ink: '#111111', red: '#c4120f', deep: '#730a08', paper: '#f8f7f3', white: '#ffffff', line: '#d9d6d0'};
export type Car = {id: string; slug: string; make: string; model: string; subtitle: string; year: number; mileageKm: number | null; fuel: string; transmission: string; photos: {src: string; width: number; height: number}[]; pick: {cover: number; reel: number[]}};
export const title = (c: Car) => c.make + ' ' + c.model;
export const details = (c: Car) => [String(c.year), ...(c.mileageKm === null ? [] : [new Intl.NumberFormat('pt-PT').format(c.mileageKm) + ' km']), c.fuel, c.transmission].join(' · ');
