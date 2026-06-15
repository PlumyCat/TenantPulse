const { BlobServiceClient } = require("@azure/storage-blob");

const connectionString = process.env.STORAGE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error("STORAGE_CONNECTION_STRING manquant dans les variables d'environnement.");
}

// Même compte de stockage que les tables (un seul compte = moindre coût).
const blobService = BlobServiceClient.fromConnectionString(connectionString);

// Container privé : aucun accès public. Les blobs sont servis par les Functions
// (derrière l'authentification Entra ID), jamais via une URL publique directe.
const processesContainer = blobService.getContainerClient("processes");

let ensured = false;

/**
 * Crée le container "processes" au premier appel s'il n'existe pas.
 * Idempotent et mémoïsé pour éviter un appel réseau à chaque requête.
 */
async function ensureContainer() {
  if (ensured) return;
  await processesContainer.createIfNotExists();
  ensured = true;
}

module.exports = { processesContainer, ensureContainer };
