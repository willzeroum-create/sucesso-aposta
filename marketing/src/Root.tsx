import React from 'react';
import {Composition, Still} from 'remotion';
import data from './data/cars.json';
import {CarPost, CarReel, ConditionsPost, ConditionsStory} from './compositions';
import type {Car} from './theme';

const cars = data as Car[];
export const RemotionRoot: React.FC = () => <React.Fragment>
  {cars.map((car) => <React.Fragment key={car.slug}>
    <Still id={'Post-' + car.slug} component={CarPost} width={1080} height={1350} defaultProps={{car}} />
    <Composition id={'Reel-' + car.slug} component={CarReel} width={1080} height={1920} fps={30} durationInFrames={420} defaultProps={{car}} />
  </React.Fragment>)}
  <Still id="Post-Condicoes" component={ConditionsPost} width={1080} height={1350} defaultProps={{cars}} />
  <Composition id="Story-Condicoes" component={ConditionsStory} width={1080} height={1920} fps={30} durationInFrames={300} defaultProps={{cars}} />
</React.Fragment>;
