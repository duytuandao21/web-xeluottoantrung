"use client";
import Markup from './Markup';
import type {Car} from '@/types/car';

export default function LegacyContent({html,cars}:{html:string;cars:Record<string,Car>}) {
  return <Markup html={html} cars={cars}/>;
}
