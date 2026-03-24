IF DB_ID(N'ResourceLogsDb') IS NULL
BEGIN
    CREATE DATABASE ResourceLogsDb;
END;
GO

USE ResourceLogsDb;
GO

IF OBJECT_ID(N'dbo.ResourceLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ResourceLogs
    (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ResourceName NVARCHAR(150) NOT NULL,
        LogLevel NVARCHAR(50) NOT NULL,
        Message NVARCHAR(1000) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.ResourceLogs)
BEGIN
    INSERT INTO dbo.ResourceLogs (ResourceName, LogLevel, Message)
    VALUES
        (N'CPU', N'Info', N'CPU usage baseline registered.'),
        (N'Memory', N'Warning', N'Memory threshold exceeded during sample run.');
END;
GO
