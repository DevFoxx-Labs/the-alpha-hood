// Initialises the local dev MongoDB replica set (rs0 on 127.0.0.1:27018) once. Local only: refuses any other host.
import { MongoClient } from "mongodb";

const uri = process.argv[2] ?? "mongodb://127.0.0.1:27018/?directConnection=true";
const host = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error("Refusing: this script only initialises a LOCAL replica set.");
  process.exit(1);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const admin = client.db("admin");
  try {
    const s = await admin.command({ replSetGetStatus: 1 });
    console.log(`Replica set already initialised: ${s.set}, members: ${s.members.length}`);
  } catch (e) {
    if (e.codeName !== "NotYetInitialized") throw e;
    const port = new URL(uri.replace(/^mongodb:/, "http:")).port || "27017";
    await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    console.log("Replica set rs0 initialised.");
  }
} finally {
  await client.close();
}
