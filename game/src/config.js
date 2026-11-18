// Solis Heat — shared tuning constants and world geometry.
// Every module imports from here so the whole game agrees on sizes,
// speeds and prices. No logic lives in this file, only numbers and tables.

export const WORLD_W = 3600;
export const WORLD_H = 2700;

// Road grid: 7 avenues run north-south, 5 streets run east-west.
export const AVENUE_XS = [420, 900, 1380, 1860, 2340, 2820, 3300];
export const STREET_YS = [300, 840, 1380, 1920, 2460];
export const ROAD_HALF = 48; // half the road width in px

// West edge: open sea, then a sand strip, then the promenade avenue.
export const SEA_EDGE = 190;  // water west of this x
export const SAND_EDGE = 344; // sand between SEA_EDGE and here; cars stay east of it

// Wanted system: heat runs 0..170, one star per 34 heat.
export const HEAT_MAX = 170;
export const HEAT_PER_STAR = 34;

export const PLAYER_RADIUS = 11;
export const PLAYER_WALK_SPEED = 168;
export const PLAYER_HP = 100;

export const SAVE_KEY = 'solis-heat-save-v1';

// Car catalogue: w/h body size in px, speeds in px/s, cruise = traffic pace.
export const CAR_MODELS = {
  comet:       { label: 'Vela Comet',           w: 46, h: 22, topSpeed: 342, accel: 265, cruise: 150, colors: ['#e2483d', '#f2f2f2', '#30343c'] },
  burro:       { label: 'Solis Burro',          w: 48, h: 24, topSpeed: 252, accel: 185, cruise: 118, colors: ['#8a6f4d', '#5d7351', '#74584f'] },
  breeze:      { label: 'Palma Breeze',         w: 44, h: 22, topSpeed: 276, accel: 205, cruise: 128, colors: ['#7fd1c0', '#f4e3b2', '#e8a2bf'] },
  taxi:        { label: 'Coral Taxi',           w: 46, h: 22, topSpeed: 288, accel: 215, cruise: 138, colors: ['#f5b921'] },
  luxe:        { label: 'Miramar Luxe',         w: 48, h: 23, topSpeed: 318, accel: 238, cruise: 142, colors: ['#20242c', '#5b2a86', '#c0c6ce'] },
  pickup:      { label: 'Duna Pickup',          w: 50, h: 25, topSpeed: 264, accel: 198, cruise: 122, colors: ['#b0562f', '#4d6b8a', '#777d84'] },
  interceptor: { label: 'Solis PD Interceptor', w: 47, h: 23, topSpeed: 356, accel: 278, cruise: 168, colors: ['#f4f6f8'] },
};
export const TRAFFIC_MODELS = ['comet', 'burro', 'breeze', 'taxi', 'luxe', 'pickup'];
