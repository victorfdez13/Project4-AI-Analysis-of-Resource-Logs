// =============================================================================
// SpeedAdmin AI Log – MongoDB initialisation
// Mirrors the structure produced by setup-datasets.ps1 when it exports SQL
// Server logs and imports them into dataset1_logs / dataset2_logs.
// Schema matches the real datasets:
//   - level is an integer (2 = Information in the real data)
//   - entityType and entityId are integers (numeric codes, not strings)
//   - sessionId is a lowercase alphanumeric string (or empty string)
// =============================================================================

const resourceLogsDb = db.getSiblingDB("resource_logs");

// ---------------------------------------------------------------------------
// dataset1_logs
// ---------------------------------------------------------------------------

resourceLogsDb.dataset1_logs.drop();
resourceLogsDb.createCollection("dataset1_logs");

resourceLogsDb.dataset1_logs.createIndex({ logId: 1 }, { unique: true });
resourceLogsDb.dataset1_logs.createIndex({ time: -1 });
resourceLogsDb.dataset1_logs.createIndex({ level: 1 });
resourceLogsDb.dataset1_logs.createIndex({ category: 1 });

resourceLogsDb.dataset1_logs.insertMany([
  {
    datasetName: "DATASET1",
    logId: 1,
    category: "LoginSystem",
    time: new Date("2026-01-27T08:14:22.000Z"),
    message: "Niklas SpeedAdmin ApS speedadmin medarbetare har loggat in. (10.200.36.50)",
    mainEntityId: 183,
    impersonatorMainEntityId: null,
    sessionId: "q3pglmbna424vs4mg5m4gpfp",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 1, entityType: 1, entityId: 1026 }
    ]
  },
  {
    datasetName: "DATASET1",
    logId: 2,
    category: "StudentProfilePage",
    time: new Date("2026-01-27T08:15:01.100Z"),
    message: "Student shown",
    mainEntityId: 183,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 2, entityType: 1, entityId: 1026 }
    ]
  },
  {
    datasetName: "DATASET1",
    logId: 3,
    category: "LoginService",
    time: new Date("2026-01-27T09:02:11.200Z"),
    message: "Henning Primdahl has logged in. Represented by Casper Koch SpeedAdmin ApS",
    mainEntityId: 178,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 3, entityType: 1, entityId: 1026 }
    ]
  },
  {
    datasetName: "DATASET1",
    logId: 4,
    category: "TeacherProfilePage",
    time: new Date("2026-01-27T09:02:45.300Z"),
    message: "Teacher shown",
    mainEntityId: 178,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 4, entityType: 2, entityId: 527 }
    ]
  },
  {
    datasetName: "DATASET1",
    logId: 5,
    category: "ManualChargeService",
    time: new Date("2026-01-27T12:03:33.937Z"),
    message: "[ManualChargeAdded]",
    mainEntityId: 178,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 5, entityType: 1, entityId: 1026 }
    ]
  },
  {
    datasetName: "DATASET1",
    logId: 6,
    category: "UpdateWaitingListService",
    time: new Date("2026-01-27T11:57:55.810Z"),
    message: "Teacher with TeacherId: 529, has been assigned to the Students WaitingList.",
    mainEntityId: 60,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 6, entityType: 2, entityId: 540 }
    ]
  }
]);

// ---------------------------------------------------------------------------
// dataset2_logs
// ---------------------------------------------------------------------------

resourceLogsDb.dataset2_logs.drop();
resourceLogsDb.createCollection("dataset2_logs");

resourceLogsDb.dataset2_logs.createIndex({ logId: 1 }, { unique: true });
resourceLogsDb.dataset2_logs.createIndex({ time: -1 });
resourceLogsDb.dataset2_logs.createIndex({ level: 1 });
resourceLogsDb.dataset2_logs.createIndex({ category: 1 });

resourceLogsDb.dataset2_logs.insertMany([
  {
    datasetName: "DATASET2",
    logId: 3904,
    category: "CourseOfferBaseService",
    time: new Date("2026-01-29T14:33:06.970Z"),
    message: "Leita á grunnnámsgreinum. Sjá breytingar - Leitartexti : , Virkur: True, Flokkur: ",
    mainEntityId: 381,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: [
      { logEntityId: 1, entityType: 972, entityId: 1 }
    ]
  },
  {
    datasetName: "DATASET2",
    logId: 3903,
    category: "LoginSystem",
    time: new Date("2026-01-29T14:32:38.760Z"),
    message: "Niklas SpeedAdmin ApS speedadmin Employee logged in. (10.200.36.50)",
    mainEntityId: 381,
    impersonatorMainEntityId: null,
    sessionId: "g3g0tiosh0zuxmi4ymemobf",
    level: 2,
    changes: [],
    entities: []
  },
  {
    datasetName: "DATASET2",
    logId: 3902,
    category: "LoginSystem",
    time: new Date("2026-01-29T12:15:46.840Z"),
    message: "Dagmar SpeedAdmin ApS speedadmin starfsmaður innskráður. (10.200.36.50)",
    mainEntityId: 45,
    impersonatorMainEntityId: null,
    sessionId: "nawlyyn2tab2m52aguzbc0z0",
    level: 2,
    changes: [],
    entities: []
  },
  {
    datasetName: "DATASET2",
    logId: 3901,
    category: "StudentProfilePage",
    time: new Date("2026-01-28T14:47:50.273Z"),
    message: "Nemandi skólaður/ur",
    mainEntityId: 70,
    impersonatorMainEntityId: 45,
    sessionId: "",
    level: 2,
    changes: [],
    entities: []
  },
  {
    datasetName: "DATASET2",
    logId: 3900,
    category: "LoginService",
    time: new Date("2026-01-28T14:46:13.200Z"),
    message: "Ari Ingvarsson hefur skráð sig inn. Í umboði frá Dagmar SpeedAdmin ApS",
    mainEntityId: 45,
    impersonatorMainEntityId: null,
    sessionId: "",
    level: 2,
    changes: [],
    entities: []
  },
  {
    datasetName: "DATASET2",
    logId: 3899,
    category: "LoginSystem",
    time: new Date("2026-01-28T14:46:02.027Z"),
    message: "Dagmar SpeedAdmin ApS speedadmin starfsmaður innskráður. (10.200.36.50)",
    mainEntityId: 45,
    impersonatorMainEntityId: null,
    sessionId: "gwx3cmjlzrcflxj4325fbs4",
    level: 2,
    changes: [
      { logChangeId: 1, propertyName: "[DefaultDurationInSeconds]", previousValue: "", newValue: "3600", message: "[DefaultDurationInSeconds] breyttist frá  til 3600" },
      { logChangeId: 2, propertyName: "[DefaultTimeFactor]",        previousValue: "", newValue: "1",    message: "[DefaultTimeFactor] breyttist frá  til 1" }
    ],
    entities: [
      { logEntityId: 6, entityType: 972, entityId: 6 }
    ]
  }
]);
