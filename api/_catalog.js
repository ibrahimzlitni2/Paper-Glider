// Single source of truth for prices and cosmetics. The client receives this from /api/me,
// and the server uses it to validate every purchase.

export const SKINS = [
  { id: "classic",  name: "Classic White",   price: 0,    body: "#ffffff", edge: "#555566", trail: "#e23a3a", laser: "#ff9a3c" },
  { id: "crimson",  name: "Crimson Fold",    price: 120,  body: "#ff6b6b", edge: "#6b2230", trail: "#ff2e4d", laser: "#ff3b5c" },
  { id: "ocean",    name: "Ocean Breeze",    price: 120,  body: "#6fc3ff", edge: "#1f4f78", trail: "#1e90ff", laser: "#4db8ff" },
  { id: "mint",     name: "Mint Leaf",       price: 200,  body: "#8ff0b5", edge: "#2d6a47", trail: "#2ecc71", laser: "#6dff9a" },
  { id: "kraft",    name: "Kraft Paper",     price: 250,  body: "#d9b98a", edge: "#6b4f2a", trail: "#8d6e3f", laser: "#ffcf70" },
  { id: "sunset",   name: "Sunset Wings",    price: 300,  body: "#ffb36b", wing: "#ff6f91", edge: "#7a3b2e", trail: "#ff5e62", laser: "#ffd166" },
  { id: "violet",   name: "Violet Storm",    price: 400,  body: "#b794ff", wing: "#7fd6ff", edge: "#3d2a73", trail: "#7c4dff", laser: "#c77dff" },
  { id: "midnight", name: "Midnight Ink",    price: 600,  body: "#46506e", edge: "#aab4ff", trail: "#5b6cff", laser: "#7aa2ff" },
  { id: "gold",     name: "Golden Ticket",   price: 1000, body: "#ffd54a", wing: "#fff0a0", edge: "#8a6500", trail: "#ffb300", laser: "#ffe066" },
  { id: "neon",     name: "Neon Wireframe",  price: 1500, body: "#10142a", edge: "#00ffd5", trail: "#00ffd5", laser: "#00ffd5" },
];

// costs[i] = price of going from level i to level i+1
export const UPGRADES = {
  speed:   { group: "plane",  name: "Top speed",     desc: "+4% top speed and +8% boost thrust per level", costs: [150, 300, 500, 800, 1200] },
  agility: { group: "plane",  name: "Agility",       desc: "+7% pitch and bank response per level",         costs: [150, 300, 500, 800, 1200] },
  armor:   { group: "plane",  name: "Armor",         desc: "+15 max HP per level",                          costs: [200, 400, 650, 950, 1400] },
  damage:  { group: "weapon", name: "Laser damage",  desc: "+15% damage per level",                         costs: [200, 400, 650, 950, 1400] },
  rate:    { group: "weapon", name: "Fire rate",     desc: "-6% time between volleys per level",            costs: [200, 400, 650, 950, 1400] },
  cooling: { group: "weapon", name: "Cooling",       desc: "-7% heat per shot and +12% cooldown per level", costs: [150, 300, 500, 800, 1200] },
  bspeed:  { group: "weapon", name: "Bolt velocity", desc: "+8% bolt speed per level",                      costs: [150, 300, 500, 800, 1200] },
};

export const LIMITS = {
  killBase: 20,          // coins for a kill
  streakStep: 5,         // +5 per consecutive kill (up to 5 steps)
  bountyStep: 5,         // +5 per victim streak kill (up to 25)
  perMinute: 300,        // max coins a single player can earn per rolling minute
  pairCooldownSec: 8,    // same killer -> same victim pays out at most once per 8 s
  maxLevel: 5,
};
