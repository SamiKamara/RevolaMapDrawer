// Proper names are source data, shared once by the author, never translated.
const adjectives = ['', 'Blue', 'Amber', 'Crimson', 'Silver', 'Golden', 'Silent', 'Hidden', 'Distant', 'Bright', 'Dark', 'Pale', 'Scarlet', 'Violet', 'Azure', 'Emerald', 'Ancient', 'New', 'Lost', 'Outer', 'Inner', 'Deep', 'Far', 'Cold', 'Frozen', 'Burning', 'Radiant', 'Shimmering', 'Drifting', 'Wandering', 'Rising', 'Falling', 'Solar', 'Lunar', 'Stellar', 'Cosmic', 'Orbital', 'Celestial', 'Quantum', 'Magnetic', 'Electric', 'Crystal', 'Iron', 'Copper', 'Cobalt', 'Neon', 'Sapphire', 'Ruby', 'Ivory', 'Obsidian', 'Midnight', 'Twilight', 'Dawn', 'Evening', 'Endless', 'Infinite', 'Echoing', 'Hollow', 'Secret', 'Remote', 'Northern', 'Southern', 'Eastern', 'Western'];
const cores = ['Starseed', 'Dust', 'Nebula', 'Aurora', 'Comet', 'Meteor', 'Nova', 'Pulsar', 'Quasar', 'Photon', 'Ion', 'Plasma', 'Orbit', 'Eclipse', 'Horizon', 'Zenith', 'Nadir', 'Aphelion', 'Perihelion', 'Solstice', 'Equinox', 'Starlight', 'Moonlight', 'Sunfire', 'Starfall', 'Starwind', 'Sundust', 'Moondust', 'Void', 'Aether', 'Halo', 'Corona', 'Flare', 'Radiance', 'Prism', 'Spectra', 'Parallax', 'Gravity', 'Vector', 'Velocity', 'Meridian', 'Compass', 'Beacon', 'Signal', 'Echo', 'Voyager', 'Pioneer', 'Nomad', 'Pilgrim', 'Sentinel', 'Vanguard', 'Argon', 'Helium', 'Xenon', 'Krypton', 'Titan', 'Atlas', 'Orion', 'Lyra', 'Vega', 'Sirius', 'Polaris', 'Andromeda', 'Cassiopeia'];
const stations = ['Station', 'Outpost', 'Relay', 'Bastion', 'Observatory', 'Starport', 'Spacedock', 'Gateway'];
export const MAP_NAME_VARIANTS = adjectives.length * cores.length * stations.length;
export function mapNameAt(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAP_NAME_VARIANTS) throw new RangeError('Invalid generated map name index.');
  const station = stations[index % stations.length]; index = Math.floor(index / stations.length);
  const core = cores[index % cores.length], adjective = adjectives[Math.floor(index / cores.length)];
  return [adjective, core, station].filter(Boolean).join(' ');
}
export function randomMapName(random = Math.random) { return mapNameAt(Math.min(MAP_NAME_VARIANTS - 1, Math.max(0, Math.floor(random() * MAP_NAME_VARIANTS)))); }
export function assignMapName(project) { if (!project.name?.trim() || project.name === 'Untitled map') project.name = randomMapName(); return project; }
