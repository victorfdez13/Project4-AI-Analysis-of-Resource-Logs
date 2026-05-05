-- =============================================================================
-- 002_unified_views.sql
-- Layer 1 : per-database normalized views in DATASET1 and DATASET2
--           (standardized column names; same view names in both databases)
-- Layer 2 : UNIFIED cross-database database with UNION ALL views
--           (adds DatasetName discriminator column)
-- Layer 3 : EntityType lookup table in UNIFIED
--
-- Normalized aliases applied:
--   Postnr  CityName        DS1: CityName (passthrough)  DS2: ByName -> CityName
--   School  OpenForSignup   DS1: OpenForSignup (passthrough)  DS2: OpenForRegistration -> OpenForSignup
--   Teacher BirthDate       DS1: Birthdate -> BirthDate   DS2: BirthDate (passthrough)
--   Teacher PaymentNumber   DS1: PaymentResourceNumber -> PaymentNumber
--                           DS2: PaymentEntityNumber   -> PaymentNumber
--   Parent  BirthDate       DS1: Birthdate -> BirthDate   DS2: BirthDate (passthrough)
--
-- Idempotent: uses CREATE OR ALTER VIEW, IF DB_ID IS NULL, IF OBJECT_ID IS NULL.
-- Must run AFTER both DATASET1 and DATASET2 are fully loaded.
-- =============================================================================


-- =============================================================================
-- LAYER 1-A  DATASET1 normalized views
-- =============================================================================

USE [DATASET1];
GO

-- Tables with no column differences: passthrough views

CREATE OR ALTER VIEW [dbo].[vw_Log] AS
SELECT
    [LogId],
    [Category],
    [Time],
    [Message],
    [MainEntityId],
    [ImpersonatorMainEntityId],
    [SessionId],
    [Level]
FROM [dbo].[Log];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogChange] AS
SELECT
    [LogChangeId],
    [LogId],
    [PropertyName],
    [PreviousValue],
    [NewValue],
    [Message]
FROM [dbo].[LogChange];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogEntity] AS
SELECT
    [LogEntityId],
    [LogId],
    [EntityType],
    [EntityId]
FROM [dbo].[LogEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntity] AS
SELECT
    [MainEntityId],
    [Name],
    [EntityTypeId],
    [EntityId],
    [CreatedUtcTs]
FROM [dbo].[MainEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntityHiddenFields] AS
SELECT
    [MainEntityId],
    [Firstname],
    [Lastname],
    [Address],
    [Address2],
    [Phone1],
    [Phone2],
    [Mobile],
    [Email],
    [SSN],
    [ZipCode]
FROM [dbo].[MainEntityHiddenFields];
GO

CREATE OR ALTER VIEW [dbo].[vw_Room] AS
SELECT
    [RoomID],
    [Room],
    [SchoolID],
    [Active],
    [MainEntityId]
FROM [dbo].[Room];
GO

CREATE OR ALTER VIEW [dbo].[vw_Equipment] AS
SELECT
    [EquipmentID],
    [EquipmentTypeID],
    [EquipmentNr],
    [LaaneEquipment],
    [Kobsdato],
    [RoomID],
    [Udlaant],
    [Name],
    [Maerke],
    [PrisInclRabat],
    [PrisExclRabat],
    [RabatProcent],
    [NedskrivningsProcent],
    [NedskrevetVaerdi],
    [Vurderet],
    [VurderetTil],
    [Solgt],
    [SolgtDato],
    [Salgspris],
    [SerieNr],
    [Bemærkning],
    [Aktiv],
    [Accessories],
    [EquipmentSizeID],
    [ImportId],
    [BlobUniqueId]
FROM [dbo].[Equipment];
GO

CREATE OR ALTER VIEW [dbo].[vw_Pupil] AS
SELECT
    [PupilID],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [CPRnr],
    [Tlf],
    [HemmeligtTlf],
    [Mobil],
    [HemmeligtMobil],
    [Email],
    [Bemaerkning],
    [Kodeord],
    [Soskende],
    [Friplads],
    [Aktiv],
    [OldKlassetrin],
    [OldSchoolID],
    [Oprettet],
    [Stoetteforeningen],
    [Tilladfoto],
    [Onsker_LaneEquipment],
    [Godkendt],
    [BrugMobil],
    [UserMenuID],
    [Billede],
    [Alder],
    [LastBrowserSync],
    [LastPageRequest],
    [Udmeldt],
    [Birthdate],
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [Sex],
    [Hash],
    [Encrypted],
    [LastAcceptDate],
    [AccountNumber],
    [UPN],
    [PupilPremium],
    [SpecialEducationalNeed],
    [CreatedDate],
    [ImportId],
    [HemmeligtAdresse],
    [MainEntityId],
    [Keystage],
    [EmergencyContactNumber],
    [EmailAddrError],
    [CutOffCommentsCheck],
    [AdministrativeRegionId],
    [ValidFrom],
    [ValidTo]
FROM [dbo].[Pupil];
GO

CREATE OR ALTER VIEW [dbo].[vw_PupilHistory] AS
SELECT
    [PupilID],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [CPRnr],
    [Tlf],
    [HemmeligtTlf],
    [Mobil],
    [HemmeligtMobil],
    [Email],
    [Bemaerkning],
    [Kodeord],
    [Soskende],
    [Friplads],
    [Aktiv],
    [OldKlassetrin],
    [OldSchoolID],
    [Oprettet],
    [Stoetteforeningen],
    [Tilladfoto],
    [Onsker_LaneEquipment],
    [Godkendt],
    [BrugMobil],
    [UserMenuID],
    [Billede],
    [Alder],
    [LastBrowserSync],
    [LastPageRequest],
    [Udmeldt],
    [Birthdate],
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [Sex],
    [Hash],
    [Encrypted],
    [LastAcceptDate],
    [AccountNumber],
    [UPN],
    [PupilPremium],
    [SpecialEducationalNeed],
    [CreatedDate],
    [ImportId],
    [HemmeligtAdresse],
    [MainEntityId],
    [Keystage],
    [EmergencyContactNumber],
    [EmailAddrError],
    [CutOffCommentsCheck],
    [AdministrativeRegionId],
    [ValidFrom],
    [ValidTo]
FROM [dbo].[PupilHistory];
GO

CREATE OR ALTER VIEW [dbo].[vw_Booking] AS
SELECT
    [BookingId],
    [Title],
    [LegacyBookingTypeId],
    [CourseSchoolId],
    [EndAt],
    [PublishStartAt],
    [PublishEndAt],
    [OwnerMasterResourceId],
    [PublishType],
    [PipelineStateId],
    [Interval],
    [IsOngoing],
    [BookingTypeId],
    [TeachingPlanId]
FROM [dbo].[Booking];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlot] AS
SELECT
    [BookingSlotId],
    [BookingId],
    [Date],
    [StartTime],
    [EndTime],
    [CancellationId],
    [RescheduledBookingSlotId],
    [RescheduledOverride],
    [DurationInSeconds],
    [IsRescheduledSlot]
FROM [dbo].[BookingSlot];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingEntity] AS
SELECT
    [BookingEntityId],
    [Role],
    [RegistrationId],
    [MainEntityId]
FROM [dbo].[BookingEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingTeacher] AS
SELECT
    [BookingEntityId],
    [IsPrimaryTeacher],
    [SalaryRateId],
    [HourCalculationType],
    [BreakInSeconds],
    [NumberOfSeconds],
    [TimeFactor],
    [ExtraSeconds],
    [ExtraTimeFactor],
    [DepartmentId],
    [ShowInActivity]
FROM [dbo].[BookingTeacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Registration] AS
SELECT
    [RegistrationId],
    [DiscontinueReasonId],
    [DiscontinueDate],
    [SubCategory],
    [WaitinglistId],
    [CreatedAt],
    [CourseOfferId],
    [SchoolId],
    [DiscontinueRequestDate],
    [DiscontinueComment],
    [DiscontinueRequestReason],
    [AssignmentMethod],
    [StudentMainEntityId],
    [IsDeleted],
    [IsBookingOfferActive],
    [OfferDeadline],
    [IsPrepaidCardExpired],
    [PrepaidAssignedTeacherMainEntityId]
FROM [dbo].[Registration];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlotEntity] AS
SELECT
    [BookingSlotEntityId],
    [BookingSlotId],
    [BookingEntityId],
    [AttendanceReasonId],
    [AttendanceComment],
    [ReimbursementGenericOrderLineRef]
FROM [dbo].[BookingSlotEntity];
GO

-- Tables WITH column differences: normalizing aliases

CREATE OR ALTER VIEW [dbo].[vw_Postnr] AS
SELECT
    [PostnrID],
    [Postnr],
    [CityName],                                   -- DS1 native; already standard
    [County],
    [Community],
    [CommunityNumber],
    [District]
FROM [dbo].[Postnr];
GO

CREATE OR ALTER VIEW [dbo].[vw_School] AS
SELECT
    [SchoolID],
    [School],
    [Telefon],
    [Email],
    [PedelEmail],
    [PedelTlf],
    [PedelMobil],
    [Adresse],
    [Postnr],
    [PedelName],
    [SFOEmail],
    [Public],                                     -- reserved word; must stay bracketed
    [Comment],
    [ContactSchool],
    [AccountNumber],
    [District],
    [SchoolNr],
    [EAN],
    [CVR],
    [EmptySchool],
    [CreatedDateTime],
    [TeachingType],
    [Active],
    [OpenForSignup],                              -- DS1 native; already standard
    [ImportId],
    [AdresseLinje2],
    [MainEntityId],
    [EmailAddrError],
    [IsHomeSchool],
    [IsTeachingVenue],
    [DistrictId],
    [SchoolCategoryId]
FROM [dbo].[School];
GO

CREATE OR ALTER VIEW [dbo].[vw_Teacher] AS
SELECT
    [TeacherID],
    [CPR],
    [FirstName],
    [LastName],
    [Initialer],
    [Kodeord],
    [Adresse],
    [Sted],
    [PostNr],
    [Tlf],
    [Mobil],
    [EMail],
    [KontoNr],
    [Bemaerkning],
    [UserMenuID],
    [Billede],
    [Alder],
    [BrugerTypeID],
    [LastBrowserSync],
    [LastPageRequest],
    [Aktiv],
    [LastPasswordChange],
    [Speedadmin],
    [Birthdate]                AS [BirthDate],    -- normalize casing (DS1: lowercase d)
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [KontoID],
    [HemmeligTlf],
    [HemmeligMobil],
    [HemmeligEmail],
    [Sex],
    [Seniority],
    [CaseSensitiv],
    [HireDate],
    [EducationID],
    [AccountNumber],
    [LastAcceptDate],
    [PaymentResourceNumber]    AS [PaymentNumber], -- generic alias
    [EAN],
    [CVR],
    [ImportId],
    [FullWorkTime],
    [MainEntityId],
    [UserTitleID],
    [EmailAddrError],
    [DBS_IssuedUtc],
    [DBS_UpdatedUtc],
    [DBS_UpdateServiceDueUtc],
    [DBS_SafeGuardTrainingUtc],
    [DBS_Number],
    [SalaryStepId]
FROM [dbo].[Teacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Parent] AS
SELECT
    [ParentID],
    [CPRNr],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [Tlf_Privat],
    [Tlf_Arbejde],
    [Mobil],
    [Email],
    [Birthdate]                AS [BirthDate],    -- normalize casing (DS1: lowercase d)
    [Sex],
    [Hash],
    [Encrypted],
    [AccountNumber],
    [LastAcceptDate],
    [ImportId],
    [MainEntityId],
    [UserTitleID],
    [EmailAddrError],
    [Invitation],
    [CreatedAt]
FROM [dbo].[Parent];
GO


-- =============================================================================
-- LAYER 1-B  DATASET2 normalized views
-- =============================================================================

USE [DATASET2];
GO

CREATE OR ALTER VIEW [dbo].[vw_Log] AS
SELECT
    [LogId],
    [Category],
    [Time],
    [Message],
    [MainEntityId],
    [ImpersonatorMainEntityId],
    [SessionId],
    [Level]
FROM [dbo].[Log];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogChange] AS
SELECT
    [LogChangeId],
    [LogId],
    [PropertyName],
    [PreviousValue],
    [NewValue],
    [Message]
FROM [dbo].[LogChange];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogEntity] AS
SELECT
    [LogEntityId],
    [LogId],
    [EntityType],
    [EntityId]
FROM [dbo].[LogEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntity] AS
SELECT
    [MainEntityId],
    [Name],
    [EntityTypeId],
    [EntityId],
    [CreatedUtcTs]
FROM [dbo].[MainEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntityHiddenFields] AS
SELECT
    [MainEntityId],
    [Firstname],
    [Lastname],
    [Address],
    [Address2],
    [Phone1],
    [Phone2],
    [Mobile],
    [Email],
    [SSN],
    [ZipCode]
FROM [dbo].[MainEntityHiddenFields];
GO

CREATE OR ALTER VIEW [dbo].[vw_Room] AS
SELECT
    [RoomID],
    [Room],
    [SchoolID],
    [Active],
    [MainEntityId]
FROM [dbo].[Room];
GO

CREATE OR ALTER VIEW [dbo].[vw_Equipment] AS
SELECT
    [EquipmentID],
    [EquipmentTypeID],
    [EquipmentNr],
    [LaaneEquipment],
    [Kobsdato],
    [RoomID],
    [Udlaant],
    [Name],
    [Maerke],
    [PrisInclRabat],
    [PrisExclRabat],
    [RabatProcent],
    [NedskrivningsProcent],
    [NedskrevetVaerdi],
    [Vurderet],
    [VurderetTil],
    [Solgt],
    [SolgtDato],
    [Salgspris],
    [SerieNr],
    [Bemærkning],
    [Aktiv],
    [Accessories],
    [EquipmentSizeID],
    [ImportId],
    [BlobUniqueId]
FROM [dbo].[Equipment];
GO

CREATE OR ALTER VIEW [dbo].[vw_Pupil] AS
SELECT
    [PupilID],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [CPRnr],
    [Tlf],
    [HemmeligtTlf],
    [Mobil],
    [HemmeligtMobil],
    [Email],
    [Bemaerkning],
    [Kodeord],
    [Soskende],
    [Friplads],
    [Aktiv],
    [OldKlassetrin],
    [OldSchoolID],
    [Oprettet],
    [Stoetteforeningen],
    [Tilladfoto],
    [Onsker_LaneEquipment],
    [Godkendt],
    [BrugMobil],
    [UserMenuID],
    [Billede],
    [Alder],
    [LastBrowserSync],
    [LastPageRequest],
    [Udmeldt],
    [Birthdate],
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [Sex],
    [Hash],
    [Encrypted],
    [LastAcceptDate],
    [AccountNumber],
    [UPN],
    [PupilPremium],
    [SpecialEducationalNeed],
    [CreatedDate],
    [ImportId],
    [HemmeligtAdresse],
    [MainEntityId],
    [Keystage],
    [EmergencyContactNumber],
    [EmailAddrError],
    [CutOffCommentsCheck],
    [AdministrativeRegionId],
    [ValidFrom],
    [ValidTo]
FROM [dbo].[Pupil];
GO

CREATE OR ALTER VIEW [dbo].[vw_PupilHistory] AS
SELECT
    [PupilID],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [CPRnr],
    [Tlf],
    [HemmeligtTlf],
    [Mobil],
    [HemmeligtMobil],
    [Email],
    [Bemaerkning],
    [Kodeord],
    [Soskende],
    [Friplads],
    [Aktiv],
    [OldKlassetrin],
    [OldSchoolID],
    [Oprettet],
    [Stoetteforeningen],
    [Tilladfoto],
    [Onsker_LaneEquipment],
    [Godkendt],
    [BrugMobil],
    [UserMenuID],
    [Billede],
    [Alder],
    [LastBrowserSync],
    [LastPageRequest],
    [Udmeldt],
    [Birthdate],
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [Sex],
    [Hash],
    [Encrypted],
    [LastAcceptDate],
    [AccountNumber],
    [UPN],
    [PupilPremium],
    [SpecialEducationalNeed],
    [CreatedDate],
    [ImportId],
    [HemmeligtAdresse],
    [MainEntityId],
    [Keystage],
    [EmergencyContactNumber],
    [EmailAddrError],
    [CutOffCommentsCheck],
    [AdministrativeRegionId],
    [ValidFrom],
    [ValidTo]
FROM [dbo].[PupilHistory];
GO

CREATE OR ALTER VIEW [dbo].[vw_Booking] AS
SELECT
    [BookingId],
    [Title],
    [LegacyBookingTypeId],
    [CourseSchoolId],
    [EndAt],
    [PublishStartAt],
    [PublishEndAt],
    [OwnerMasterResourceId],
    [PublishType],
    [PipelineStateId],
    [Interval],
    [IsOngoing],
    [BookingTypeId],
    [TeachingPlanId]
FROM [dbo].[Booking];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlot] AS
SELECT
    [BookingSlotId],
    [BookingId],
    [Date],
    [StartTime],
    [EndTime],
    [CancellationId],
    [RescheduledBookingSlotId],
    [RescheduledOverride],
    [DurationInSeconds],
    [IsRescheduledSlot]
FROM [dbo].[BookingSlot];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingEntity] AS
SELECT
    [BookingEntityId],
    [Role],
    [RegistrationId],
    [MainEntityId]
FROM [dbo].[BookingEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingTeacher] AS
SELECT
    [BookingEntityId],
    [IsPrimaryTeacher],
    [SalaryRateId],
    [HourCalculationType],
    [BreakInSeconds],
    [NumberOfSeconds],
    [TimeFactor],
    [ExtraSeconds],
    [ExtraTimeFactor],
    [DepartmentId],
    [ShowInActivity]
FROM [dbo].[BookingTeacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Registration] AS
SELECT
    [RegistrationId],
    [DiscontinueReasonId],
    [DiscontinueDate],
    [SubCategory],
    [WaitinglistId],
    [CreatedAt],
    [CourseOfferId],
    [SchoolId],
    [DiscontinueRequestDate],
    [DiscontinueComment],
    [DiscontinueRequestReason],
    [AssignmentMethod],
    [StudentMainEntityId],
    [IsDeleted],
    [IsBookingOfferActive],
    [OfferDeadline],
    [IsPrepaidCardExpired],
    [PrepaidAssignedTeacherMainEntityId]
FROM [dbo].[Registration];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlotEntity] AS
SELECT
    [BookingSlotEntityId],
    [BookingSlotId],
    [BookingEntityId],
    [AttendanceReasonId],
    [AttendanceComment],
    [ReimbursementGenericOrderLineRef]
FROM [dbo].[BookingSlotEntity];
GO

-- Tables WITH column differences: normalizing aliases

CREATE OR ALTER VIEW [dbo].[vw_Postnr] AS
SELECT
    [PostnrID],
    [Postnr],
    [ByName]                   AS [CityName],     -- DS2: ByName -> standard CityName
    [County],
    [Community],
    [CommunityNumber],
    [District]
FROM [dbo].[Postnr];
GO

CREATE OR ALTER VIEW [dbo].[vw_School] AS
SELECT
    [SchoolID],
    [School],
    [Telefon],
    [Email],
    [PedelEmail],
    [PedelTlf],
    [PedelMobil],
    [Adresse],
    [Postnr],
    [PedelName],
    [SFOEmail],
    [Public],
    [Comment],
    [ContactSchool],
    [AccountNumber],
    [District],
    [SchoolNr],
    [EAN],
    [CVR],
    [EmptySchool],
    [CreatedDateTime],
    [TeachingType],
    [Active],
    [OpenForRegistration]      AS [OpenForSignup], -- DS2: OpenForRegistration -> standard OpenForSignup
    [ImportId],
    [AdresseLinje2],
    [MainEntityId],
    [EmailAddrError],
    [IsHomeSchool],
    [IsTeachingVenue],
    [DistrictId],
    [SchoolCategoryId]
FROM [dbo].[School];
GO

CREATE OR ALTER VIEW [dbo].[vw_Teacher] AS
SELECT
    [TeacherID],
    [CPR],
    [FirstName],
    [LastName],
    [Initialer],
    [Kodeord],
    [Adresse],
    [Sted],
    [PostNr],
    [Tlf],
    [Mobil],
    [EMail],
    [KontoNr],
    [Bemaerkning],
    [UserMenuID],
    [Billede],
    [Alder],
    [BrugerTypeID],
    [LastBrowserSync],
    [LastPageRequest],
    [Aktiv],
    [LastPasswordChange],
    [Speedadmin],
    [BirthDate],                                   -- DS2 native; already standard casing
    [Locked],
    [FailedLoginAttempts],
    [PasswordHistory],
    [KontoID],
    [HemmeligTlf],
    [HemmeligMobil],
    [HemmeligEmail],
    [Sex],
    [Seniority],
    [CaseSensitiv],
    [HireDate],
    [EducationID],
    [AccountNumber],
    [LastAcceptDate],
    [PaymentEntityNumber]      AS [PaymentNumber], -- DS2: PaymentEntityNumber -> generic alias
    [EAN],
    [CVR],
    [ImportId],
    [FullWorkTime],
    [MainEntityId],
    [UserTitleID],
    [EmailAddrError],
    [DBS_IssuedUtc],
    [DBS_UpdatedUtc],
    [DBS_UpdateServiceDueUtc],
    [DBS_SafeGuardTrainingUtc],
    [DBS_Number],
    [SalaryStepId]
FROM [dbo].[Teacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Parent] AS
SELECT
    [ParentID],
    [CPRNr],
    [FirstName],
    [LastName],
    [Adresse],
    [Sted],
    [Postnr],
    [Tlf_Privat],
    [Tlf_Arbejde],
    [Mobil],
    [Email],
    [BirthDate],                                   -- DS2 native; already standard casing
    [Sex],
    [Hash],
    [Encrypted],
    [AccountNumber],
    [LastAcceptDate],
    [ImportId],
    [MainEntityId],
    [UserTitleID],
    [EmailAddrError],
    [Invitation],
    [CreatedAt]
FROM [dbo].[Parent];
GO


-- =============================================================================
-- LAYER 2  UNIFIED cross-database database and UNION ALL views
-- =============================================================================

USE [master];
GO

IF DB_ID(N'UNIFIED') IS NULL
    CREATE DATABASE [UNIFIED];
GO

USE [UNIFIED];
GO

CREATE OR ALTER VIEW [dbo].[vw_Log] AS
SELECT N'DATASET1' AS [DatasetName],
    [LogId], [Category], [Time], [Message],
    [MainEntityId], [ImpersonatorMainEntityId], [SessionId], [Level]
FROM [DATASET1].[dbo].[vw_Log]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [LogId], [Category], [Time], [Message],
    [MainEntityId], [ImpersonatorMainEntityId], [SessionId], [Level]
FROM [DATASET2].[dbo].[vw_Log];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogChange] AS
SELECT N'DATASET1' AS [DatasetName],
    [LogChangeId], [LogId], [PropertyName], [PreviousValue], [NewValue], [Message]
FROM [DATASET1].[dbo].[vw_LogChange]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [LogChangeId], [LogId], [PropertyName], [PreviousValue], [NewValue], [Message]
FROM [DATASET2].[dbo].[vw_LogChange];
GO

CREATE OR ALTER VIEW [dbo].[vw_LogEntity] AS
SELECT N'DATASET1' AS [DatasetName],
    [LogEntityId], [LogId], [EntityType], [EntityId]
FROM [DATASET1].[dbo].[vw_LogEntity]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [LogEntityId], [LogId], [EntityType], [EntityId]
FROM [DATASET2].[dbo].[vw_LogEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntity] AS
SELECT N'DATASET1' AS [DatasetName],
    [MainEntityId], [Name], [EntityTypeId], [EntityId], [CreatedUtcTs]
FROM [DATASET1].[dbo].[vw_MainEntity]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [MainEntityId], [Name], [EntityTypeId], [EntityId], [CreatedUtcTs]
FROM [DATASET2].[dbo].[vw_MainEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_MainEntityHiddenFields] AS
SELECT N'DATASET1' AS [DatasetName],
    [MainEntityId], [Firstname], [Lastname], [Address], [Address2],
    [Phone1], [Phone2], [Mobile], [Email], [SSN], [ZipCode]
FROM [DATASET1].[dbo].[vw_MainEntityHiddenFields]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [MainEntityId], [Firstname], [Lastname], [Address], [Address2],
    [Phone1], [Phone2], [Mobile], [Email], [SSN], [ZipCode]
FROM [DATASET2].[dbo].[vw_MainEntityHiddenFields];
GO

CREATE OR ALTER VIEW [dbo].[vw_Postnr] AS
SELECT N'DATASET1' AS [DatasetName],
    [PostnrID], [Postnr], [CityName], [County], [Community], [CommunityNumber], [District]
FROM [DATASET1].[dbo].[vw_Postnr]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [PostnrID], [Postnr], [CityName], [County], [Community], [CommunityNumber], [District]
FROM [DATASET2].[dbo].[vw_Postnr];
GO

CREATE OR ALTER VIEW [dbo].[vw_School] AS
SELECT N'DATASET1' AS [DatasetName],
    [SchoolID], [School], [Telefon], [Email], [PedelEmail], [PedelTlf], [PedelMobil],
    [Adresse], [Postnr], [PedelName], [SFOEmail], [Public], [Comment], [ContactSchool],
    [AccountNumber], [District], [SchoolNr], [EAN], [CVR], [EmptySchool],
    [CreatedDateTime], [TeachingType], [Active], [OpenForSignup],
    [ImportId], [AdresseLinje2], [MainEntityId], [EmailAddrError],
    [IsHomeSchool], [IsTeachingVenue], [DistrictId], [SchoolCategoryId]
FROM [DATASET1].[dbo].[vw_School]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [SchoolID], [School], [Telefon], [Email], [PedelEmail], [PedelTlf], [PedelMobil],
    [Adresse], [Postnr], [PedelName], [SFOEmail], [Public], [Comment], [ContactSchool],
    [AccountNumber], [District], [SchoolNr], [EAN], [CVR], [EmptySchool],
    [CreatedDateTime], [TeachingType], [Active], [OpenForSignup],
    [ImportId], [AdresseLinje2], [MainEntityId], [EmailAddrError],
    [IsHomeSchool], [IsTeachingVenue], [DistrictId], [SchoolCategoryId]
FROM [DATASET2].[dbo].[vw_School];
GO

CREATE OR ALTER VIEW [dbo].[vw_Teacher] AS
SELECT N'DATASET1' AS [DatasetName],
    [TeacherID], [CPR], [FirstName], [LastName], [Initialer], [Kodeord],
    [Adresse], [Sted], [PostNr], [Tlf], [Mobil], [EMail], [KontoNr], [Bemaerkning],
    [UserMenuID], [Billede], [Alder], [BrugerTypeID], [LastBrowserSync], [LastPageRequest],
    [Aktiv], [LastPasswordChange], [Speedadmin], [BirthDate], [Locked],
    [FailedLoginAttempts], [PasswordHistory], [KontoID], [HemmeligTlf], [HemmeligMobil],
    [HemmeligEmail], [Sex], [Seniority], [CaseSensitiv], [HireDate], [EducationID],
    [AccountNumber], [LastAcceptDate], [PaymentNumber], [EAN], [CVR], [ImportId],
    [FullWorkTime], [MainEntityId], [UserTitleID], [EmailAddrError],
    [DBS_IssuedUtc], [DBS_UpdatedUtc], [DBS_UpdateServiceDueUtc],
    [DBS_SafeGuardTrainingUtc], [DBS_Number], [SalaryStepId]
FROM [DATASET1].[dbo].[vw_Teacher]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [TeacherID], [CPR], [FirstName], [LastName], [Initialer], [Kodeord],
    [Adresse], [Sted], [PostNr], [Tlf], [Mobil], [EMail], [KontoNr], [Bemaerkning],
    [UserMenuID], [Billede], [Alder], [BrugerTypeID], [LastBrowserSync], [LastPageRequest],
    [Aktiv], [LastPasswordChange], [Speedadmin], [BirthDate], [Locked],
    [FailedLoginAttempts], [PasswordHistory], [KontoID], [HemmeligTlf], [HemmeligMobil],
    [HemmeligEmail], [Sex], [Seniority], [CaseSensitiv], [HireDate], [EducationID],
    [AccountNumber], [LastAcceptDate], [PaymentNumber], [EAN], [CVR], [ImportId],
    [FullWorkTime], [MainEntityId], [UserTitleID], [EmailAddrError],
    [DBS_IssuedUtc], [DBS_UpdatedUtc], [DBS_UpdateServiceDueUtc],
    [DBS_SafeGuardTrainingUtc], [DBS_Number], [SalaryStepId]
FROM [DATASET2].[dbo].[vw_Teacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Parent] AS
SELECT N'DATASET1' AS [DatasetName],
    [ParentID], [CPRNr], [FirstName], [LastName], [Adresse], [Sted], [Postnr],
    [Tlf_Privat], [Tlf_Arbejde], [Mobil], [Email], [BirthDate], [Sex],
    [Hash], [Encrypted], [AccountNumber], [LastAcceptDate], [ImportId],
    [MainEntityId], [UserTitleID], [EmailAddrError], [Invitation], [CreatedAt]
FROM [DATASET1].[dbo].[vw_Parent]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [ParentID], [CPRNr], [FirstName], [LastName], [Adresse], [Sted], [Postnr],
    [Tlf_Privat], [Tlf_Arbejde], [Mobil], [Email], [BirthDate], [Sex],
    [Hash], [Encrypted], [AccountNumber], [LastAcceptDate], [ImportId],
    [MainEntityId], [UserTitleID], [EmailAddrError], [Invitation], [CreatedAt]
FROM [DATASET2].[dbo].[vw_Parent];
GO

CREATE OR ALTER VIEW [dbo].[vw_Room] AS
SELECT N'DATASET1' AS [DatasetName],
    [RoomID], [Room], [SchoolID], [Active], [MainEntityId]
FROM [DATASET1].[dbo].[vw_Room]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [RoomID], [Room], [SchoolID], [Active], [MainEntityId]
FROM [DATASET2].[dbo].[vw_Room];
GO

CREATE OR ALTER VIEW [dbo].[vw_Equipment] AS
SELECT N'DATASET1' AS [DatasetName],
    [EquipmentID], [EquipmentTypeID], [EquipmentNr], [LaaneEquipment], [Kobsdato],
    [RoomID], [Udlaant], [Name], [Maerke], [PrisInclRabat], [PrisExclRabat],
    [RabatProcent], [NedskrivningsProcent], [NedskrevetVaerdi], [Vurderet],
    [VurderetTil], [Solgt], [SolgtDato], [Salgspris], [SerieNr], [Bemærkning],
    [Aktiv], [Accessories], [EquipmentSizeID], [ImportId], [BlobUniqueId]
FROM [DATASET1].[dbo].[vw_Equipment]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [EquipmentID], [EquipmentTypeID], [EquipmentNr], [LaaneEquipment], [Kobsdato],
    [RoomID], [Udlaant], [Name], [Maerke], [PrisInclRabat], [PrisExclRabat],
    [RabatProcent], [NedskrivningsProcent], [NedskrevetVaerdi], [Vurderet],
    [VurderetTil], [Solgt], [SolgtDato], [Salgspris], [SerieNr], [Bemærkning],
    [Aktiv], [Accessories], [EquipmentSizeID], [ImportId], [BlobUniqueId]
FROM [DATASET2].[dbo].[vw_Equipment];
GO

CREATE OR ALTER VIEW [dbo].[vw_Pupil] AS
SELECT N'DATASET1' AS [DatasetName],
    [PupilID], [FirstName], [LastName], [Adresse], [Sted], [Postnr], [CPRnr],
    [Tlf], [HemmeligtTlf], [Mobil], [HemmeligtMobil], [Email], [Bemaerkning],
    [Kodeord], [Soskende], [Friplads], [Aktiv], [OldKlassetrin], [OldSchoolID],
    [Oprettet], [Stoetteforeningen], [Tilladfoto], [Onsker_LaneEquipment],
    [Godkendt], [BrugMobil], [UserMenuID], [Billede], [Alder], [LastBrowserSync],
    [LastPageRequest], [Udmeldt], [Birthdate], [Locked], [FailedLoginAttempts],
    [PasswordHistory], [Sex], [Hash], [Encrypted], [LastAcceptDate], [AccountNumber],
    [UPN], [PupilPremium], [SpecialEducationalNeed], [CreatedDate], [ImportId],
    [HemmeligtAdresse], [MainEntityId], [Keystage], [EmergencyContactNumber],
    [EmailAddrError], [CutOffCommentsCheck], [AdministrativeRegionId], [ValidFrom], [ValidTo]
FROM [DATASET1].[dbo].[vw_Pupil]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [PupilID], [FirstName], [LastName], [Adresse], [Sted], [Postnr], [CPRnr],
    [Tlf], [HemmeligtTlf], [Mobil], [HemmeligtMobil], [Email], [Bemaerkning],
    [Kodeord], [Soskende], [Friplads], [Aktiv], [OldKlassetrin], [OldSchoolID],
    [Oprettet], [Stoetteforeningen], [Tilladfoto], [Onsker_LaneEquipment],
    [Godkendt], [BrugMobil], [UserMenuID], [Billede], [Alder], [LastBrowserSync],
    [LastPageRequest], [Udmeldt], [Birthdate], [Locked], [FailedLoginAttempts],
    [PasswordHistory], [Sex], [Hash], [Encrypted], [LastAcceptDate], [AccountNumber],
    [UPN], [PupilPremium], [SpecialEducationalNeed], [CreatedDate], [ImportId],
    [HemmeligtAdresse], [MainEntityId], [Keystage], [EmergencyContactNumber],
    [EmailAddrError], [CutOffCommentsCheck], [AdministrativeRegionId], [ValidFrom], [ValidTo]
FROM [DATASET2].[dbo].[vw_Pupil];
GO

CREATE OR ALTER VIEW [dbo].[vw_PupilHistory] AS
SELECT N'DATASET1' AS [DatasetName],
    [PupilID], [FirstName], [LastName], [Adresse], [Sted], [Postnr], [CPRnr],
    [Tlf], [HemmeligtTlf], [Mobil], [HemmeligtMobil], [Email], [Bemaerkning],
    [Kodeord], [Soskende], [Friplads], [Aktiv], [OldKlassetrin], [OldSchoolID],
    [Oprettet], [Stoetteforeningen], [Tilladfoto], [Onsker_LaneEquipment],
    [Godkendt], [BrugMobil], [UserMenuID], [Billede], [Alder], [LastBrowserSync],
    [LastPageRequest], [Udmeldt], [Birthdate], [Locked], [FailedLoginAttempts],
    [PasswordHistory], [Sex], [Hash], [Encrypted], [LastAcceptDate], [AccountNumber],
    [UPN], [PupilPremium], [SpecialEducationalNeed], [CreatedDate], [ImportId],
    [HemmeligtAdresse], [MainEntityId], [Keystage], [EmergencyContactNumber],
    [EmailAddrError], [CutOffCommentsCheck], [AdministrativeRegionId], [ValidFrom], [ValidTo]
FROM [DATASET1].[dbo].[vw_PupilHistory]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [PupilID], [FirstName], [LastName], [Adresse], [Sted], [Postnr], [CPRnr],
    [Tlf], [HemmeligtTlf], [Mobil], [HemmeligtMobil], [Email], [Bemaerkning],
    [Kodeord], [Soskende], [Friplads], [Aktiv], [OldKlassetrin], [OldSchoolID],
    [Oprettet], [Stoetteforeningen], [Tilladfoto], [Onsker_LaneEquipment],
    [Godkendt], [BrugMobil], [UserMenuID], [Billede], [Alder], [LastBrowserSync],
    [LastPageRequest], [Udmeldt], [Birthdate], [Locked], [FailedLoginAttempts],
    [PasswordHistory], [Sex], [Hash], [Encrypted], [LastAcceptDate], [AccountNumber],
    [UPN], [PupilPremium], [SpecialEducationalNeed], [CreatedDate], [ImportId],
    [HemmeligtAdresse], [MainEntityId], [Keystage], [EmergencyContactNumber],
    [EmailAddrError], [CutOffCommentsCheck], [AdministrativeRegionId], [ValidFrom], [ValidTo]
FROM [DATASET2].[dbo].[vw_PupilHistory];
GO

CREATE OR ALTER VIEW [dbo].[vw_Booking] AS
SELECT N'DATASET1' AS [DatasetName],
    [BookingId], [Title], [LegacyBookingTypeId], [CourseSchoolId], [EndAt],
    [PublishStartAt], [PublishEndAt], [OwnerMasterResourceId], [PublishType],
    [PipelineStateId], [Interval], [IsOngoing], [BookingTypeId], [TeachingPlanId]
FROM [DATASET1].[dbo].[vw_Booking]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [BookingId], [Title], [LegacyBookingTypeId], [CourseSchoolId], [EndAt],
    [PublishStartAt], [PublishEndAt], [OwnerMasterResourceId], [PublishType],
    [PipelineStateId], [Interval], [IsOngoing], [BookingTypeId], [TeachingPlanId]
FROM [DATASET2].[dbo].[vw_Booking];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlot] AS
SELECT N'DATASET1' AS [DatasetName],
    [BookingSlotId], [BookingId], [Date], [StartTime], [EndTime],
    [CancellationId], [RescheduledBookingSlotId], [RescheduledOverride],
    [DurationInSeconds], [IsRescheduledSlot]
FROM [DATASET1].[dbo].[vw_BookingSlot]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [BookingSlotId], [BookingId], [Date], [StartTime], [EndTime],
    [CancellationId], [RescheduledBookingSlotId], [RescheduledOverride],
    [DurationInSeconds], [IsRescheduledSlot]
FROM [DATASET2].[dbo].[vw_BookingSlot];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingEntity] AS
SELECT N'DATASET1' AS [DatasetName],
    [BookingEntityId], [Role], [RegistrationId], [MainEntityId]
FROM [DATASET1].[dbo].[vw_BookingEntity]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [BookingEntityId], [Role], [RegistrationId], [MainEntityId]
FROM [DATASET2].[dbo].[vw_BookingEntity];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingTeacher] AS
SELECT N'DATASET1' AS [DatasetName],
    [BookingEntityId], [IsPrimaryTeacher], [SalaryRateId], [HourCalculationType],
    [BreakInSeconds], [NumberOfSeconds], [TimeFactor], [ExtraSeconds],
    [ExtraTimeFactor], [DepartmentId], [ShowInActivity]
FROM [DATASET1].[dbo].[vw_BookingTeacher]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [BookingEntityId], [IsPrimaryTeacher], [SalaryRateId], [HourCalculationType],
    [BreakInSeconds], [NumberOfSeconds], [TimeFactor], [ExtraSeconds],
    [ExtraTimeFactor], [DepartmentId], [ShowInActivity]
FROM [DATASET2].[dbo].[vw_BookingTeacher];
GO

CREATE OR ALTER VIEW [dbo].[vw_Registration] AS
SELECT N'DATASET1' AS [DatasetName],
    [RegistrationId], [DiscontinueReasonId], [DiscontinueDate], [SubCategory],
    [WaitinglistId], [CreatedAt], [CourseOfferId], [SchoolId],
    [DiscontinueRequestDate], [DiscontinueComment], [DiscontinueRequestReason],
    [AssignmentMethod], [StudentMainEntityId], [IsDeleted],
    [IsBookingOfferActive], [OfferDeadline], [IsPrepaidCardExpired],
    [PrepaidAssignedTeacherMainEntityId]
FROM [DATASET1].[dbo].[vw_Registration]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [RegistrationId], [DiscontinueReasonId], [DiscontinueDate], [SubCategory],
    [WaitinglistId], [CreatedAt], [CourseOfferId], [SchoolId],
    [DiscontinueRequestDate], [DiscontinueComment], [DiscontinueRequestReason],
    [AssignmentMethod], [StudentMainEntityId], [IsDeleted],
    [IsBookingOfferActive], [OfferDeadline], [IsPrepaidCardExpired],
    [PrepaidAssignedTeacherMainEntityId]
FROM [DATASET2].[dbo].[vw_Registration];
GO

CREATE OR ALTER VIEW [dbo].[vw_BookingSlotEntity] AS
SELECT N'DATASET1' AS [DatasetName],
    [BookingSlotEntityId], [BookingSlotId], [BookingEntityId],
    [AttendanceReasonId], [AttendanceComment], [ReimbursementGenericOrderLineRef]
FROM [DATASET1].[dbo].[vw_BookingSlotEntity]
UNION ALL
SELECT N'DATASET2' AS [DatasetName],
    [BookingSlotEntityId], [BookingSlotId], [BookingEntityId],
    [AttendanceReasonId], [AttendanceComment], [ReimbursementGenericOrderLineRef]
FROM [DATASET2].[dbo].[vw_BookingSlotEntity];
GO


-- =============================================================================
-- LAYER 3  EntityType lookup table
-- =============================================================================

IF OBJECT_ID(N'dbo.EntityType', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EntityType]
    (
        [EntityTypeId]   [int]          NOT NULL,
        [EntityTypeName] [nvarchar](50) NOT NULL,
        CONSTRAINT [PK_EntityType] PRIMARY KEY CLUSTERED ([EntityTypeId] ASC)
    );

    INSERT INTO [dbo].[EntityType] ([EntityTypeId], [EntityTypeName]) VALUES
        (0,   N'None'),
        (1,   N'Student'),
        (2,   N'Teacher'),
        (3,   N'Room'),
        (4,   N'Equipment'),
        (10,  N'Parent'),
        (13,  N'School'),
        (14,  N'User'),
        (972, N'Course'),
        (973, N'Booking'),
        (975, N'BaseCourse'),
        (978, N'BookingLegacy');
END;
GO
