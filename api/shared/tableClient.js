const { TableClient } = require("@azure/data-tables");

const connectionString = process.env.STORAGE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error("STORAGE_CONNECTION_STRING manquant dans les variables d'environnement.");
}

const rolesClient         = TableClient.fromConnectionString(connectionString, "Roles");
const classificationsClient = TableClient.fromConnectionString(connectionString, "Classifications");
const requestsClient      = TableClient.fromConnectionString(connectionString, "Requests");
const tagsClient          = TableClient.fromConnectionString(connectionString, "Tags");
const locksClient         = TableClient.fromConnectionString(connectionString, "Locks");
// Entrées légères des process internes (le contenu markdown + images vivent dans Blob Storage).
const processesClient     = TableClient.fromConnectionString(connectionString, "Processes");

module.exports = {
  rolesClient,
  classificationsClient,
  requestsClient,
  tagsClient,
  locksClient,
  processesClient
};
