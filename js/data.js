/* Fabrik — game data: items, recipes, machines, biomes, milestones.
 * This is the single source of truth for the tech tree described in README.md. */
var FAB = window.FAB || (window.FAB = {});

// --------------------------------------------------------------------------
// ITEMS  (icon = emoji fallback, color = placeholder swatch)
// liquid items (oil) travel in pipes, never on belts.
// --------------------------------------------------------------------------
FAB.ITEMS = {
  // raw
  iron_ore:    { name: 'Iron Ore',    icon: '🪨', color: '#9aa4b0' },
  copper_ore:  { name: 'Copper Ore',  icon: '🟠', color: '#d98a4b' },
  coal:        { name: 'Coal',        icon: '⚫', color: '#3a3a42' },
  stone:       { name: 'Stone',       icon: '🪨', color: '#b8b2a6' },
  wood:        { name: 'Logs',        icon: '🪵', color: '#a9743f' },
  crude_oil:   { name: 'Crude Oil',   icon: '🛢️', color: '#2b2030', liquid: true },
  // tier 1
  iron_plate:  { name: 'Iron Plate',  icon: '▭', color: '#c4ccd6' },
  copper_plate:{ name: 'Copper Plate',icon: '▭', color: '#e0975a' },
  steel:       { name: 'Steel',       icon: '⬛', color: '#7f8a99' },
  sand:        { name: 'Sand',        icon: '⏳', color: '#e8d59a' },
  glass:       { name: 'Glass',       icon: '🔷', color: '#bfe8f0' },
  plank:       { name: 'Plank',       icon: '🟫', color: '#c79152' },
  plastic:     { name: 'Plastic',     icon: '🧊', color: '#d6d6e6' },
  rubber:      { name: 'Rubber',      icon: '⬤', color: '#2e2e34' },
  paint:       { name: 'Paint',       icon: '🎨', color: '#e85bbf' },
  // tier 2 components
  iron_gear:   { name: 'Iron Gear',   icon: '⚙️', color: '#aeb6c2' },
  copper_wire: { name: 'Copper Wire', icon: '〰️', color: '#e0975a' },
  magnet:      { name: 'Magnet',      icon: '🧲', color: '#d23b3b' },
  bolts:       { name: 'Bolts',       icon: '🔩', color: '#9aa4b0' },
  steel_beam:  { name: 'Steel Beam',  icon: '🏗️', color: '#6f7a89' },
  plastic_panel:{name: 'Plastic Panel',icon:'🟦', color: '#9fb8e6' },
  tire:        { name: 'Tire',        icon: '🛞', color: '#26262b' },
  rim:         { name: 'Rim',         icon: '⭕', color: '#c4ccd6' },
  piston:      { name: 'Piston',      icon: '🔧', color: '#8893a2' },
  cable:       { name: 'Cable',       icon: '🪢', color: '#8a5a3a' },
  claw:        { name: 'Claw',        icon: '🦾', color: '#9aa4b0' },
  windshield:  { name: 'Windshield',  icon: '🪟', color: '#bfe8f0' },
  // tier 3 car parts
  wheel:       { name: 'Wheel',       icon: '🛞', color: '#2e2e34' },
  wheel_set:   { name: 'Wheel Set',   icon: '🛞', color: '#1c1c20' },
  motor:       { name: 'Motor',       icon: '🔌', color: '#c25b2b' },
  chassis:     { name: 'Chassis',     icon: '🚙', color: '#5b6b8c' },
  spoiler:     { name: 'Spoiler',     icon: '🪂', color: '#c0392b' },
  grappler:    { name: 'Grappler',    icon: '🧲', color: '#d23b3b' },
  // tier 4
  car:         { name: 'Car',         icon: '🚗', color: '#e74c3c' }
};

// --------------------------------------------------------------------------
// RECIPES.  machine = which machine type can make this.
// inputs: list of {item, qty}.  out qty defaults to 1.  time in ticks.
// --------------------------------------------------------------------------
FAB.RECIPES = {
  // Furnace
  iron_plate:   { machine: 'furnace',  inputs: [['iron_ore', 1]], time: 12 },
  copper_plate: { machine: 'furnace',  inputs: [['copper_ore', 1]], time: 12 },
  steel:        { machine: 'furnace',  inputs: [['iron_plate', 2], ['coal', 1]], time: 22 },
  glass:        { machine: 'furnace',  inputs: [['sand', 1]], time: 12 },
  // Crusher / Sawmill
  sand:         { machine: 'crusher',  inputs: [['stone', 1]], time: 10 },
  plank:        { machine: 'sawmill',  inputs: [['wood', 1]], time: 10 },
  // Refinery (consumes liquid oil from the pipe network)
  plastic:      { machine: 'refinery', inputs: [['crude_oil', 1]], time: 14 },
  rubber:       { machine: 'refinery', inputs: [['crude_oil', 1]], time: 14 },
  paint:        { machine: 'refinery', inputs: [['crude_oil', 1]], time: 14 },
  // Assembler — components
  iron_gear:    { machine: 'assembler', inputs: [['iron_plate', 2]], time: 14 },
  copper_wire:  { machine: 'assembler', inputs: [['copper_plate', 1]], out: 2, time: 12 },
  magnet:       { machine: 'assembler', inputs: [['iron_plate', 1], ['copper_wire', 1]], time: 16 },
  bolts:        { machine: 'assembler', inputs: [['iron_plate', 1]], out: 4, time: 12 },
  steel_beam:   { machine: 'assembler', inputs: [['steel', 2]], time: 16 },
  plastic_panel:{ machine: 'assembler', inputs: [['plastic', 2]], time: 16 },
  tire:         { machine: 'assembler', inputs: [['rubber', 2]], time: 16 },
  rim:          { machine: 'assembler', inputs: [['steel', 1]], time: 14 },
  piston:       { machine: 'assembler', inputs: [['steel', 1], ['iron_gear', 1]], time: 18 },
  cable:        { machine: 'assembler', inputs: [['copper_wire', 1], ['rubber', 1]], time: 16 },
  claw:         { machine: 'assembler', inputs: [['steel', 2]], time: 16 },
  windshield:   { machine: 'assembler', inputs: [['glass', 2]], time: 16 },
  // Assembler — car parts
  wheel:        { machine: 'assembler', inputs: [['tire', 1], ['rim', 1]], time: 18 },
  wheel_set:    { machine: 'assembler', inputs: [['wheel', 4]], time: 24 },
  motor:        { machine: 'assembler', inputs: [['iron_gear', 2], ['copper_wire', 2], ['magnet', 1], ['piston', 1]], time: 30 },
  chassis:      { machine: 'assembler', inputs: [['steel_beam', 2], ['plastic_panel', 2], ['windshield', 1], ['bolts', 4]], time: 32 },
  spoiler:      { machine: 'assembler', inputs: [['plastic_panel', 2], ['steel_beam', 1]], time: 22 },
  grappler:     { machine: 'assembler', inputs: [['claw', 1], ['cable', 2], ['magnet', 1], ['iron_gear', 1]], time: 30 },
  // Car Factory — final assembly. Optional parts handled by chosen recipe variant.
  car_basic:    { machine: 'car_factory', out: 'car', inputs: [['chassis', 1], ['motor', 1], ['wheel_set', 1], ['paint', 1]], time: 40, carKind: 'basic' },
  car_sporty:   { machine: 'car_factory', out: 'car', inputs: [['chassis', 1], ['motor', 1], ['wheel_set', 1], ['paint', 1], ['spoiler', 1]], time: 46, carKind: 'sporty' },
  car_super:    { machine: 'car_factory', out: 'car', inputs: [['chassis', 1], ['motor', 1], ['wheel_set', 1], ['paint', 1], ['spoiler', 1], ['grappler', 1]], time: 54, carKind: 'super' }
};

// recipes available for a given machine type
FAB.recipesFor = function (machineType) {
  var out = [];
  for (var id in FAB.RECIPES) if (FAB.RECIPES[id].machine === machineType) out.push(id);
  return out;
};

// --------------------------------------------------------------------------
// MACHINES.  kind drives simulation behaviour.
//   miner    — sits on a resource node, outputs onto belt in front.
//   crafter  — input buffer -> recipe -> output buffer (furnace/assembler/...)
//   refinery — like crafter but pulls oil from pipe network.
//   pump     — sits on oil, feeds pipe network.
//   belt/pipe/arm/box/parking — special handling.
// inputs = max ingredient slots (1..6) used for the recipe picker UI hints.
// --------------------------------------------------------------------------
FAB.MACHINES = {
  drill:       { name: 'Drill',        icon: '⛏️', kind: 'miner',   color: '#6d7a89', rotates: true,  unlock: 1 },
  furnace:     { name: 'Furnace',      icon: '🔥', kind: 'crafter', color: '#b5532e', inputs: 3, unlock: 1 },
  belt:        { name: 'Belt',         icon: '➡️', kind: 'belt',    color: '#42454d', rotates: true,  unlock: 2 },
  grabber:     { name: 'Grabber Arm',  icon: '🦾', kind: 'arm',     color: '#c9a13b', rotates: true,  unlock: 2 },
  box:         { name: 'Storage Box',  icon: '📦', kind: 'box',     color: '#9a7b46', unlock: 2 },
  assembler:   { name: 'Assembler',    icon: '🔧', kind: 'crafter', color: '#3b6ea5', inputs: 5, unlock: 3 },
  crusher:     { name: 'Crusher',      icon: '🪨', kind: 'crafter', color: '#7a7066', inputs: 1, unlock: 3 },
  sawmill:     { name: 'Sawmill',      icon: '🪚', kind: 'crafter', color: '#9c6b35', inputs: 1, unlock: 3 },
  pump:        { name: 'Oil Pump',     icon: '⛽', kind: 'pump',    color: '#445', rotates: true, unlock: 4 },
  pipe:        { name: 'Pipe',         icon: '🟢', kind: 'pipe',    color: '#3a7d44', unlock: 4 },
  refinery:    { name: 'Refinery',     icon: '🛢️', kind: 'refinery',color: '#5a4a6a', inputs: 1, unlock: 4 },
  car_factory: { name: 'Car Factory',  icon: '🏭', kind: 'crafter', color: '#b02a7a', inputs: 6, unlock: 7, size: 2 },
  parking:     { name: 'Parking Lot',  icon: '🅿️', kind: 'parking', color: '#3d4756', unlock: 7, size: 2 }
};

// Tiny hand-craft bootstrap recipes (made from the backpack, no machine).
FAB.HANDCRAFT = {
  drill:   [['iron_plate', 2], ['stone', 1]],
  furnace: [['stone', 4]],
  belt:    [['iron_plate', 1]],
  box:     [['wood', 2]]
};

// --------------------------------------------------------------------------
// BIOMES + resource node spawning weights
// --------------------------------------------------------------------------
FAB.BIOMES = {
  meadow:  { name: 'Meadow',      ground: '#7cc36a', accent: '#69b157' },
  forest:  { name: 'Forest',      ground: '#5aa050', accent: '#3f7a38' },
  rocky:   { name: 'Rocky Hills', ground: '#9a978f', accent: '#827e74' },
  quarry:  { name: 'Quarry',      ground: '#d8c89a', accent: '#c4b27e' },
  marsh:   { name: 'Oily Marsh',  ground: '#5b6b55', accent: '#3f4a3a' },
  lake:    { name: 'Lakeshore',   ground: '#4ba3c7', accent: '#3b8fb0', water: true },
  rainbow: { name: 'Rainbow Hills',ground: '#cfa6e6', accent: '#b98fd6' }
};

// which resources spawn in which biome
FAB.BIOME_RES = {
  rocky:  ['iron_ore', 'copper_ore', 'coal'],
  quarry: ['stone'],
  forest: ['wood'],
  marsh:  ['crude_oil']
};

// --------------------------------------------------------------------------
// MILESTONES 1..10  (gated tech).  goal(game)->{have,need} ; unlocks machines.
// --------------------------------------------------------------------------
function produced(g, item) { return g.stats.produced[item] || 0; }
FAB.MILESTONES = [
  { n: 1, title: 'First Sparks', blurb: 'Mine Iron and smelt it in a Furnace.',
    unlock: ['drill', 'furnace'],
    goal: function (g) { return { have: produced(g, 'iron_plate'), need: 10, label: 'Iron Plates' }; } },
  { n: 2, title: 'Belt It Out', blurb: 'Use Belts and Grabber Arms to fill a Box by itself.',
    unlock: ['belt', 'grabber', 'box'],
    goal: function (g) { return { have: g.boxItemCount('iron_plate'), need: 20, label: 'Iron Plates in a Box' }; } },
  { n: 3, title: 'The Workshop', blurb: 'Build an Assembler. Make Gears and Wire.',
    unlock: ['assembler', 'crusher', 'sawmill'],
    goal: function (g) { return { have: Math.min(produced(g, 'iron_gear'), produced(g, 'copper_wire')), need: 10, label: 'Gears & Wire (each)' }; } },
  { n: 4, title: 'Wheels!', blurb: 'Pump Oil, refine Rubber, make a Wheel Set.',
    unlock: ['pump', 'pipe', 'refinery'],
    goal: function (g) { return { have: produced(g, 'wheel_set'), need: 1, label: 'Wheel Set' }; } },
  { n: 5, title: 'Heart of the Machine', blurb: 'Build a Motor.',
    unlock: [],
    goal: function (g) { return { have: produced(g, 'motor'), need: 1, label: 'Motor' }; } },
  { n: 6, title: 'Strong Body', blurb: 'Build a Chassis.',
    unlock: [],
    goal: function (g) { return { have: produced(g, 'chassis'), need: 1, label: 'Chassis' }; } },
  { n: 7, title: 'Paint & Go!', blurb: 'Build a Car Factory and make your first Car. Then drive it!',
    unlock: ['car_factory', 'parking'],
    goal: function (g) { return { have: produced(g, 'car'), need: 1, label: 'Car' }; } },
  { n: 8, title: 'Open for Business', blurb: 'Make cars in 3 different colors.',
    unlock: [],
    goal: function (g) { return { have: g.distinctCarColors(), need: 3, label: 'Car colors made' }; } },
  { n: 9, title: 'Need for Speed', blurb: 'Build a Sporty Car with a Spoiler.',
    unlock: [],
    goal: function (g) { return { have: produced(g, 'spoiler'), need: 1, label: 'Spoiler' }; } },
  { n: 10, title: 'The Grand Grappler', blurb: 'Build the ultimate Super Car with a Grappler!',
    unlock: [],
    goal: function (g) { return { have: produced(g, 'grappler'), need: 1, label: 'Grappler' }; } }
];

// Paint / car colors the child can choose at the Car Factory.
FAB.CAR_COLORS = [
  { id: 'red', name: 'Red', hex: '#e74c3c' },
  { id: 'blue', name: 'Blue', hex: '#3a78d6' },
  { id: 'green', name: 'Green', hex: '#3fb56b' },
  { id: 'yellow', name: 'Yellow', hex: '#f1c40f' },
  { id: 'orange', name: 'Orange', hex: '#e67e22' },
  { id: 'purple', name: 'Purple', hex: '#9b59b6' },
  { id: 'black', name: 'Black', hex: '#2c2c34' },
  { id: 'white', name: 'White', hex: '#ecf0f1' }
];
