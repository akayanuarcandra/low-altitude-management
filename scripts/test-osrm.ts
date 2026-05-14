import { osrmNearest } from '../src/lib/osrm';

async function main() {
  try {
    const pt = { lat: 37.7749, lon: -122.4194 };
    console.log('Querying OSRM nearest for', pt);
    const r = await osrmNearest(pt as any);
    console.log('OSRM nearest result:', r);
  } catch (err) {
    console.error('OSRM test failed', err);
    process.exit(1);
  }
}

main();
