-- =============================================================================
-- SpeedAdmin AI Log Schema – DATASET1 and DATASET2
-- Schema matches the real datasets exactly (column names, types, nullability,
-- PK direction, and absence of FK constraints on LogChange/LogEntity).
-- Run manually via sqlcmd when datasets.tar is not available.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- DATASET1
-- ---------------------------------------------------------------------------

IF DB_ID(N'DATASET1') IS NULL
    CREATE DATABASE DATASET1;
GO

USE DATASET1;
GO

-- Log (primary event table)
-- Note: Level is INT (not NVARCHAR). PK is clustered DESCENDING.
IF OBJECT_ID(N'dbo.Log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Log]
    (
        [LogId]                     [int]            IDENTITY(1,1) NOT NULL,
        [Category]                  [nvarchar](max)  NULL,
        [Time]                      [datetime2](7)   NULL,
        [Message]                   [nvarchar](max)  NULL,
        [MainEntityId]              [int]            NULL,
        [ImpersonatorMainEntityId]  [int]            NULL,
        [SessionId]                 [nvarchar](100)  NULL,
        [Level]                     [int]            NOT NULL,
        CONSTRAINT [PK_Log_Con] PRIMARY KEY CLUSTERED
        (
            [LogId] DESC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_Log_Time]     ON [dbo].[Log] ([Time] DESC);
    CREATE NONCLUSTERED INDEX [IX_Log_Level]    ON [dbo].[Log] ([Level]);
    CREATE NONCLUSTERED INDEX [IX_Log_Category] ON [dbo].[Log] ([Category]);
END;
GO

-- LogChange (property-change audit rows)
-- Note: LogId is INT NULL with no FK constraint (matches real data).
IF OBJECT_ID(N'dbo.LogChange', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LogChange]
    (
        [LogChangeId]   [int]            IDENTITY(1,1) NOT NULL,
        [LogId]         [int]            NULL,
        [PropertyName]  [nvarchar](100)  NULL,
        [PreviousValue] [nvarchar](max)  NULL,
        [NewValue]      [nvarchar](max)  NULL,
        [Message]       [nvarchar](max)  NULL,
        CONSTRAINT [PK_LogChange] PRIMARY KEY CLUSTERED
        (
            [LogChangeId] ASC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_LogChange_LogId] ON [dbo].[LogChange] ([LogId]);
END;
GO

-- LogEntity (entities involved in a Log entry)
-- Note: EntityType and EntityId are both INT NULL (integer codes, not strings).
IF OBJECT_ID(N'dbo.LogEntity', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LogEntity]
    (
        [LogEntityId]   [int]   IDENTITY(1,1) NOT NULL,
        [LogId]         [int]   NULL,
        [EntityType]    [int]   NULL,
        [EntityId]      [int]   NULL,
        CONSTRAINT [PK__Log__LogEntityId] PRIMARY KEY CLUSTERED
        (
            [LogEntityId] ASC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_LogEntity_LogId] ON [dbo].[LogEntity] ([LogId]);
END;
GO

-- Seed data for DATASET1
-- Level values match the real data: 2 = Information (most rows in real data)
-- SessionId matches the real format: lowercase alphanumeric, 26 chars
IF NOT EXISTS (SELECT 1 FROM [dbo].[Log])
BEGIN
    SET IDENTITY_INSERT [dbo].[Log] ON;

    INSERT INTO [dbo].[Log] ([LogId],[Category],[Time],[Message],[MainEntityId],[ImpersonatorMainEntityId],[SessionId],[Level]) VALUES
        (1,  N'LoginSystem',          CAST(N'2026-01-27T08:14:22.0000000' AS datetime2), N'Niklas SpeedAdmin ApS speedadmin medarbetare har loggat in. (10.200.36.50)',  183, NULL, N'q3pglmbna424vs4mg5m4gpfp', 2),
        (2,  N'StudentProfilePage',   CAST(N'2026-01-27T08:15:01.1000000' AS datetime2), N'Student shown',                                                              183, NULL, N'',                          2),
        (3,  N'LoginService',         CAST(N'2026-01-27T09:02:11.2000000' AS datetime2), N'Henning Primdahl has logged in. Represented by Casper Koch SpeedAdmin ApS',  178, NULL, N'',                          2),
        (4,  N'TeacherProfilePage',   CAST(N'2026-01-27T09:02:45.3000000' AS datetime2), N'Teacher shown',                                                              178, NULL, N'',                          2),
        (5,  N'ManualChargeService',  CAST(N'2026-01-27T12:03:33.9366667' AS datetime2), N'[ManualChargeAdded]',                                                        178, NULL, N'',                          2),
        (6,  N'UpdateWaitingListService', CAST(N'2026-01-27T11:57:55.8100000' AS datetime2), N'Teacher with TeacherId: 529, has been assigned to the Students WaitingList.', 60, NULL, N'', 2);

    SET IDENTITY_INSERT [dbo].[Log] OFF;

    SET IDENTITY_INSERT [dbo].[LogChange] ON;

    INSERT INTO [dbo].[LogChange] ([LogChangeId],[LogId],[PropertyName],[PreviousValue],[NewValue],[Message]) VALUES
        (1,  44, N'First name',              N'Cole',            N'Cole',   N'First name changed from Cole to Cole'),
        (2,  45, N'First name',              N'Cole',            N'Cole',   N'First name changed from Cole to Cole'),
        (3,  45, N'[LastAcceptDate]',        N'01/01/0001 00:00:00', N'',   N'[LastAcceptDate] changed from 01/01/0001 00:00:00 to '),
        (4,  67, N'Title',                   N'',                N'dsf',    N'Title changed from  to dsf'),
        (5,  108,N'[DefaultDurationInSeconds]',N'3600',          N'',       N'[DefaultDurationInSeconds] changed from 3600 to '),
        (6,  108,N'[DefaultNumberOfBookings]', N'1',             N'',       N'[DefaultNumberOfBookings] changed from 1 to ');

    SET IDENTITY_INSERT [dbo].[LogChange] OFF;

    SET IDENTITY_INSERT [dbo].[LogEntity] ON;

    INSERT INTO [dbo].[LogEntity] ([LogEntityId],[LogId],[EntityType],[EntityId]) VALUES
        (1,  1,  1,    1026),
        (2,  2,  1,    1026),
        (3,  3,  1,    1026),
        (4,  4,  2,    527),
        (5,  5,  1,    1026),
        (6,  6,  2,    540);

    SET IDENTITY_INSERT [dbo].[LogEntity] OFF;
END;
GO

-- ---------------------------------------------------------------------------
-- DATASET2
-- ---------------------------------------------------------------------------

IF DB_ID(N'DATASET2') IS NULL
    CREATE DATABASE DATASET2;
GO

USE DATASET2;
GO

-- Log
IF OBJECT_ID(N'dbo.Log', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Log]
    (
        [LogId]                     [int]            IDENTITY(1,1) NOT NULL,
        [Category]                  [nvarchar](max)  NULL,
        [Time]                      [datetime2](7)   NULL,
        [Message]                   [nvarchar](max)  NULL,
        [MainEntityId]              [int]            NULL,
        [ImpersonatorMainEntityId]  [int]            NULL,
        [SessionId]                 [nvarchar](100)  NULL,
        [Level]                     [int]            NOT NULL,
        CONSTRAINT [PK_Log_Con] PRIMARY KEY CLUSTERED
        (
            [LogId] DESC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_Log_Time]     ON [dbo].[Log] ([Time] DESC);
    CREATE NONCLUSTERED INDEX [IX_Log_Level]    ON [dbo].[Log] ([Level]);
    CREATE NONCLUSTERED INDEX [IX_Log_Category] ON [dbo].[Log] ([Category]);
END;
GO

-- LogChange
IF OBJECT_ID(N'dbo.LogChange', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LogChange]
    (
        [LogChangeId]   [int]            IDENTITY(1,1) NOT NULL,
        [LogId]         [int]            NULL,
        [PropertyName]  [nvarchar](100)  NULL,
        [PreviousValue] [nvarchar](max)  NULL,
        [NewValue]      [nvarchar](max)  NULL,
        [Message]       [nvarchar](max)  NULL,
        CONSTRAINT [PK_LogChange] PRIMARY KEY CLUSTERED
        (
            [LogChangeId] ASC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_LogChange_LogId] ON [dbo].[LogChange] ([LogId]);
END;
GO

-- LogEntity
IF OBJECT_ID(N'dbo.LogEntity', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LogEntity]
    (
        [LogEntityId]   [int]   IDENTITY(1,1) NOT NULL,
        [LogId]         [int]   NULL,
        [EntityType]    [int]   NULL,
        [EntityId]      [int]   NULL,
        CONSTRAINT [PK__Log__LogEntityId] PRIMARY KEY CLUSTERED
        (
            [LogEntityId] ASC
        ) WITH (PAD_INDEX = ON, STATISTICS_NORECOMPUTE = OFF,
                IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON,
                ALLOW_PAGE_LOCKS = ON, FILLFACTOR = 80,
                OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY];

    CREATE NONCLUSTERED INDEX [IX_LogEntity_LogId] ON [dbo].[LogEntity] ([LogId]);
END;
GO

-- Seed data for DATASET2
IF NOT EXISTS (SELECT 1 FROM [dbo].[Log])
BEGIN
    SET IDENTITY_INSERT [dbo].[Log] ON;

    INSERT INTO [dbo].[Log] ([LogId],[Category],[Time],[Message],[MainEntityId],[ImpersonatorMainEntityId],[SessionId],[Level]) VALUES
        (3904, N'CourseOfferBaseService', CAST(N'2026-01-29T14:33:06.9700000' AS datetime2), N'Leita á grunnnámsgreinum. Sjá breytingar - Leitartexti : , Virkur: True, Flokkur: ', 381, NULL, N'', 2),
        (3903, N'LoginSystem',            CAST(N'2026-01-29T14:32:38.7600000' AS datetime2), N'Niklas SpeedAdmin ApS speedadmin Employee logged in. (10.200.36.50)',               381, NULL, N'g3g0tiosh0zuxmi4ymemobf', 2),
        (3902, N'LoginSystem',            CAST(N'2026-01-29T12:15:46.8400000' AS datetime2), N'Dagmar SpeedAdmin ApS speedadmin starfsmaður innskráður. (10.200.36.50)',           45,  NULL, N'nawlyyn2tab2m52aguzbc0z0', 2),
        (3901, N'StudentProfilePage',     CAST(N'2026-01-28T14:47:50.2733333' AS datetime2), N'Nemandi skólaður/ur',                                                              70,  45,   N'', 2),
        (3900, N'LoginService',           CAST(N'2026-01-28T14:46:13.2000000' AS datetime2), N'Ari Ingvarsson hefur skráð sig inn. Í umboði frá Dagmar SpeedAdmin ApS',           45,  NULL, N'', 2),
        (3899, N'LoginSystem',            CAST(N'2026-01-28T14:46:02.0266667' AS datetime2), N'Dagmar SpeedAdmin ApS speedadmin starfsmaður innskráður. (10.200.36.50)',           45,  NULL, N'gwx3cmjlzrcflxj4325fbs4', 2);

    SET IDENTITY_INSERT [dbo].[Log] OFF;

    SET IDENTITY_INSERT [dbo].[LogChange] ON;

    INSERT INTO [dbo].[LogChange] ([LogChangeId],[LogId],[PropertyName],[PreviousValue],[NewValue],[Message]) VALUES
        (1,  19, N'[DefaultDurationInSeconds]', N'', N'3600', N'[DefaultDurationInSeconds] breyttist frá  til 3600'),
        (2,  19, N'[DefaultTimeFactor]',        N'', N'1',    N'[DefaultTimeFactor] breyttist frá  til 1'),
        (3,  19, N'[FeeId]',                    N'', N'98',   N'[FeeId] breyttist frá  til 98'),
        (4,  19, N'Er virkur',                  N'', N'Já',   N'Er virkur breyttist frá  til Já'),
        (5,  19, N'[CourseOfferBaseId]',         N'', N'1',    N'[CourseOfferBaseId] breyttist frá  til 1'),
        (6,  19, N'[CourseOfferId]',             N'', N'1',    N'[CourseOfferId] breyttist frá  til 1');

    SET IDENTITY_INSERT [dbo].[LogChange] OFF;

    SET IDENTITY_INSERT [dbo].[LogEntity] ON;

    INSERT INTO [dbo].[LogEntity] ([LogEntityId],[LogId],[EntityType],[EntityId]) VALUES
        (1,  19, 972, 1),
        (2,  20, 972, 2),
        (3,  23, 972, 3),
        (4,  24, 972, 4),
        (5,  25, 972, 5),
        (6,  28, 972, 6);

    SET IDENTITY_INSERT [dbo].[LogEntity] OFF;
END;
GO
