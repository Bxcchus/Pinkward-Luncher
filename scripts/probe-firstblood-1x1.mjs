import { LcuHttpClient, LcuHttpError } from '../dist-electron/league/LcuHttpClient.js';

const LEGACY_QUEUE_ID = 72;
const LEGACY_QUEUE_TYPE = 'FIRSTBLOOD_1x1';

function summary(queue) {
  return {
    id: queue?.id ?? null,
    type: queue?.type ?? queue?.queueType ?? null,
    name: queue?.name ?? null,
    mapId: queue?.mapId ?? null,
    gameMode: queue?.gameMode ?? null,
    numPlayersPerTeam: queue?.numPlayersPerTeam ?? null,
    availability: queue?.availability ?? null,
  };
}

function isFirstBloodQueue(queue) {
  const type = String(queue?.type ?? queue?.queueType ?? '').toUpperCase();
  return queue?.id === LEGACY_QUEUE_ID || type === LEGACY_QUEUE_TYPE.toUpperCase();
}

async function optionalGet(client, path) {
  try {
    return await client.get(path);
  } catch (error) {
    if (error instanceof LcuHttpError && error.statusCode === 404) return null;
    throw error;
  }
}

async function main() {
  const client = await LcuHttpClient.connect();
  const byId = await optionalGet(client, `/lol-game-queues/v1/queues/${LEGACY_QUEUE_ID}`);
  const byType = await optionalGet(
    client,
    `/lol-game-queues/v1/queues/type/${encodeURIComponent(LEGACY_QUEUE_TYPE)}`,
  );
  const queues = await client.get('/lol-game-queues/v1/queues');
  const discovered = [byId, byType, ...queues].filter(Boolean).find(isFirstBloodQueue) ?? null;

  console.log(JSON.stringify({
    probe: LEGACY_QUEUE_TYPE,
    legacyQueueId: LEGACY_QUEUE_ID,
    exposedById: Boolean(byId),
    exposedByType: Boolean(byType),
    queueCount: queues.length,
    discovered: discovered ? summary(discovered) : null,
  }, null, 2));

  if (!discovered) {
    console.error(
      'UNAVAILABLE: this League Client does not expose FIRSTBLOOD_1x1. Pinkward must keep using its custom ARAM Showdown rules.',
    );
    process.exitCode = 2;
    return;
  }

  const compatible = discovered.mapId === 12 && discovered.numPlayersPerTeam === 1;
  if (!compatible) {
    console.error('INCOMPATIBLE: FIRSTBLOOD_1x1 exists, but its current contract is not a 1v1 on Howling Abyss.');
    process.exitCode = 3;
    return;
  }

  console.log('SUPPORTED: FIRSTBLOOD_1x1 is exposed as a 1v1 Howling Abyss queue.');
}

main().catch((error) => {
  if (error instanceof LcuHttpError) {
    console.error(`${error.diagnosticCode}: unable to query the local League Client.`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
});
