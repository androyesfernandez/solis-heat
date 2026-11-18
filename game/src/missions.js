// Tia Carmen's story missions, plus the generated side jobs that follow
// them. Data only — the world module interprets each step:
//   goto / pickup / deliver : reach the landmark front (pickup/deliver end
//                             or arm the job; deliver pays out)
//   enterMarkedCar          : get into the gold-ringed car the world marks
//   hold                    : stay in the zone while the meter fills
//   goDark                  : drop heat to zero before moving on
// A step may carry `timer` (seconds, fail on zero) and `heatFloor`.

export const STORY_MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    payout: 350,
    respect: 5,
    intro: 'Tia Carmen: Rafi, I need wheels. The Comet by the Mercado — bring it to the Chop Shop.',
    steps: [
      { kind: 'enterMarkedCar', label: 'Take the marked Vela Comet' },
      { kind: 'deliver', at: 'chopshop', label: 'Deliver it to the Solis Chop Shop' },
    ],
  },
  {
    id: 'the-cold-box',
    title: 'The Cold Box',
    payout: 600,
    respect: 8,
    intro: 'Tia Carmen: A cold box waits at the Docks. Careful — the pickup is watched.',
    ambushHeat: 85, // two stars and change, sprung at the pickup
    steps: [
      { kind: 'pickup', at: 'docks', label: 'Pick up the cold box at the Docks' },
      { kind: 'deliver', at: 'crashpad', timer: 150, label: 'Get it to the Crash Pad — fast' },
    ],
  },
  {
    id: 'sunset-pawn',
    title: 'Sunset Pawn',
    payout: 900,
    respect: 12,
    intro: 'Tia Carmen: Sunset Pawn owes me. Hold the place up, then go dark and come home.',
    steps: [
      { kind: 'goto', at: 'pawn', label: 'Go to Sunset Pawn' },
      { kind: 'hold', at: 'pawn', holdTime: 12, label: 'Hold up Sunset Pawn' },
      { kind: 'goDark', label: 'Lose the heat — go dark' },
      { kind: 'deliver', at: 'crashpad', label: 'Slip back to the Crash Pad' },
    ],
  },
  {
    id: 'the-neon-heat-run',
    title: 'The Neon Heat Run',
    payout: 1500,
    respect: 20,
    intro: 'Tia Carmen: Last one, mijo. A Luxe at the Airfield, the Docks by nightfall — and the whole PD will know.',
    steps: [
      { kind: 'goto', at: 'airfield', label: 'Go to Solis Airfield' },
      { kind: 'enterMarkedCar', label: 'Take the marked Miramar Luxe' },
      { kind: 'deliver', at: 'docks', timer: 210, heatFloor: 102, label: 'Run it to the Docks — heat is on' },
    ],
  },
];

// After the story: endless generated courier work between landmarks.
export function makeSideJob(rng, n, landmarkIds) {
  const a = landmarkIds[Math.floor(rng() * landmarkIds.length) % landmarkIds.length];
  let b = landmarkIds[Math.floor(rng() * landmarkIds.length) % landmarkIds.length];
  if (b === a) b = landmarkIds[(landmarkIds.indexOf(a) + 3) % landmarkIds.length];
  return {
    id: 'side-job-' + n,
    title: 'Side Job #' + n,
    payout: 240 + Math.floor(rng() * 160),
    respect: 3,
    intro: 'Tia Carmen: Another run, if you want it.',
    steps: [
      { kind: 'pickup', at: a, label: 'Pick up the package' },
      { kind: 'deliver', at: b, timer: 170, label: 'Deliver it across town' },
    ],
  };
}
