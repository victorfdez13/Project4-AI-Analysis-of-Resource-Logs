db = db.getSiblingDB("resource_logs");

db.createCollection("resource_events");

db.resource_events.updateOne(
  { resourceName: "CPU" },
  {
    $setOnInsert: {
      resourceName: "CPU",
      logLevel: "Info",
      message: "MongoDB seed document created.",
      createdAt: new Date()
    }
  },
  { upsert: true }
);
