using System.Globalization;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using Project4_AI_Analysis_of_Resource_Logs.Contracts;
using Project4_AI_Analysis_of_Resource_Logs.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public sealed class SqlLogRepository
{
    private readonly string _connectionString;
    private readonly IReadOnlyDictionary<string, string> _datasets;
    private readonly string _defaultDataset;

    public SqlLogRepository(IConfiguration configuration, IOptions<BackendOptions> options)
    {
        _connectionString = configuration.GetConnectionString("SqlServer")
            ?? throw new InvalidOperationException("Missing SQL Server connection string.");

        _datasets = options.Value.SqlServerDatasets
            .Where(dataset => !string.IsNullOrWhiteSpace(dataset))
            .Select(dataset => dataset.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToDictionary(dataset => dataset, dataset => dataset, StringComparer.OrdinalIgnoreCase);

        if (_datasets.Count == 0)
        {
            throw new InvalidOperationException("At least one SQL dataset must be configured.");
        }

        _defaultDataset = _datasets.Values.First();
    }

    public IReadOnlyList<string> GetConfiguredDatasets() =>
        _datasets.Values.OrderBy(dataset => dataset, StringComparer.OrdinalIgnoreCase).ToArray();

    public async Task<SqlServerHealth> CheckHealthAsync(CancellationToken cancellationToken)
    {
        var datasetResults = new List<DatasetHealth>();

        try
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            foreach (var dataset in _datasets.Values)
            {
                var isAvailable = await DatasetExistsAsync(connection, dataset, cancellationToken);
                datasetResults.Add(new DatasetHealth(
                    dataset,
                    isAvailable,
                    isAvailable ? null : "Expected dbo.Log table was not found."));
            }

            var isHealthy = datasetResults.All(result => result.IsAvailable);
            return new SqlServerHealth(
                isHealthy,
                isHealthy ? "ok" : "unavailable",
                datasetResults,
                null);
        }
        catch (Exception exception)
        {
            datasetResults.AddRange(_datasets.Values.Select(dataset =>
                new DatasetHealth(dataset, false, exception.Message)));

            return new SqlServerHealth(
                false,
                "unavailable",
                datasetResults,
                exception.Message);
        }
    }

    public async Task<LogListResponse> GetLogsAsync(
        string? dataset,
        string? level,
        string? category,
        string? search,
        int skip,
        int take,
        CancellationToken cancellationToken)
    {
        var resolvedDataset = ResolveDataset(dataset);
        var normalizedLevel = NormalizeFilter(level);
        var normalizedCategory = NormalizeFilter(category);
        var normalizedSearch = NormalizeFilter(search);
        var normalizedSkip = Math.Max(0, skip);
        var normalizedTake = Math.Clamp(take == 0 ? 100 : take, 1, 200);

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var countSql = $"""
SELECT COUNT_BIG(1)
FROM [{resolvedDataset}].[dbo].[Log] l
WHERE (@Level IS NULL OR l.Level = @Level)
  AND (@Category IS NULL OR l.Category = @Category)
  AND (
      @Search IS NULL
      OR l.Message LIKE '%' + @Search + '%'
      OR l.Category LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(20), l.Level) LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(100), l.MainEntityId) LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(100), l.SessionId) LIKE '%' + @Search + '%'
  );
""";

        await using var countCommand = new SqlCommand(countSql, connection);
        AddSharedParameters(countCommand, normalizedLevel, normalizedCategory, normalizedSearch);
        var totalCount = Convert.ToInt32(await countCommand.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);

        var itemsSql = $"""
SELECT
    l.LogId,
    l.Category,
    l.[Time],
    l.Message,
    l.Level,
    l.MainEntityId,
    l.ImpersonatorMainEntityId,
    l.SessionId
FROM [{resolvedDataset}].[dbo].[Log] l
WHERE (@Level IS NULL OR l.Level = @Level)
  AND (@Category IS NULL OR l.Category = @Category)
  AND (
      @Search IS NULL
      OR l.Message LIKE '%' + @Search + '%'
      OR l.Category LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(20), l.Level) LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(100), l.MainEntityId) LIKE '%' + @Search + '%'
      OR CONVERT(NVARCHAR(100), l.SessionId) LIKE '%' + @Search + '%'
  )
ORDER BY l.[Time] DESC, l.LogId DESC
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
""";

        await using var itemsCommand = new SqlCommand(itemsSql, connection);
        AddSharedParameters(itemsCommand, normalizedLevel, normalizedCategory, normalizedSearch);
        itemsCommand.Parameters.AddWithValue("@Skip", normalizedSkip);
        itemsCommand.Parameters.AddWithValue("@Take", normalizedTake);

        var items = new List<ResourceLogSummary>();
        await using var reader = await itemsCommand.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new ResourceLogSummary(
                resolvedDataset,
                reader.GetInt32(0),
                ReadRequiredString(reader, 1, "Category"),
                ReadTimestamp(reader, 2),
                ReadRequiredString(reader, 3, "Message"),
                ReadRequiredString(reader, 4, "Level"),
                ReadNullableString(reader, 5),
                ReadNullableString(reader, 6),
                ReadNullableString(reader, 7)));
        }

        return new LogListResponse(
            resolvedDataset,
            normalizedSkip,
            normalizedTake,
            totalCount,
            items);
    }

    public async Task<ResourceLogDetail?> GetLogByIdAsync(
        string? dataset,
        int id,
        CancellationToken cancellationToken)
    {
        var resolvedDataset = ResolveDataset(dataset);

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var logSql = $"""
SELECT
    l.LogId,
    l.Category,
    l.[Time],
    l.Message,
    l.Level,
    l.MainEntityId,
    l.ImpersonatorMainEntityId,
    l.SessionId
FROM [{resolvedDataset}].[dbo].[Log] l
WHERE l.LogId = @LogId;
""";

        int logId;
        string category;
        DateTimeOffset time;
        string message;
        string level;
        string? mainEntityId;
        string? impersonatorMainEntityId;
        string? sessionId;

        await using (var logCommand = new SqlCommand(logSql, connection))
        {
            logCommand.Parameters.AddWithValue("@LogId", id);

            await using var reader = await logCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            logId = reader.GetInt32(0);
            category = ReadRequiredString(reader, 1, "Category");
            time = ReadTimestamp(reader, 2);
            message = ReadRequiredString(reader, 3, "Message");
            level = ReadRequiredString(reader, 4, "Level");
            mainEntityId = ReadNullableString(reader, 5);
            impersonatorMainEntityId = ReadNullableString(reader, 6);
            sessionId = ReadNullableString(reader, 7);
        }

        var changes = await GetChangesAsync(connection, resolvedDataset, id, cancellationToken);
        var entities = await GetEntitiesAsync(connection, resolvedDataset, id, cancellationToken);

        return new ResourceLogDetail(
            resolvedDataset,
            logId,
            category,
            time,
            message,
            level,
            mainEntityId,
            impersonatorMainEntityId,
            sessionId,
            changes,
            entities);
    }

    public async Task<DatasetSummaryResponse> GetDatasetSummaryAsync(
        string? dataset,
        CancellationToken cancellationToken)
    {
        var resolvedDataset = ResolveDataset(dataset);

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var overviewSql = $"""
SELECT
    COUNT_BIG(1) AS TotalCount,
    COUNT(DISTINCT l.Category) AS DistinctCategoryCount,
    SUM(CASE WHEN NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), l.SessionId))), '') IS NULL THEN 0 ELSE 1 END) AS SessionCount,
    SUM(CASE WHEN NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(100), l.ImpersonatorMainEntityId))), '') IS NULL THEN 0 ELSE 1 END) AS ImpersonatedCount,
    MIN(l.[Time]) AS EarliestTime,
    MAX(l.[Time]) AS LatestTime
FROM [{resolvedDataset}].[dbo].[Log] l;
""";

        int totalCount;
        int distinctCategoryCount;
        int sessionCount;
        int impersonatedCount;
        DateTimeOffset? earliestTime;
        DateTimeOffset? latestTime;

        await using (var overviewCommand = new SqlCommand(overviewSql, connection))
        await using (var overviewReader = await overviewCommand.ExecuteReaderAsync(cancellationToken))
        {
            await overviewReader.ReadAsync(cancellationToken);

            totalCount = ReadInt32(overviewReader, 0);
            distinctCategoryCount = ReadInt32(overviewReader, 1);
            sessionCount = ReadInt32(overviewReader, 2);
            impersonatedCount = ReadInt32(overviewReader, 3);
            earliestTime = ReadNullableTimestamp(overviewReader, 4);
            latestTime = ReadNullableTimestamp(overviewReader, 5);
        }

        var topCategorySql = $"""
SELECT TOP (1)
    l.Category
FROM [{resolvedDataset}].[dbo].[Log] l
GROUP BY l.Category
ORDER BY COUNT_BIG(1) DESC, l.Category ASC;
""";

        string? topCategory;
        await using (var topCategoryCommand = new SqlCommand(topCategorySql, connection))
        {
            topCategory = Convert.ToString(
                await topCategoryCommand.ExecuteScalarAsync(cancellationToken),
                CultureInfo.InvariantCulture);
        }

        var levelsSql = $"""
SELECT
    CONVERT(NVARCHAR(20), l.Level) AS [Level],
    COUNT_BIG(1) AS [Count]
FROM [{resolvedDataset}].[dbo].[Log] l
GROUP BY l.Level
ORDER BY l.Level ASC;
""";

        var levels = new List<LogLevelCount>();
        await using (var levelsCommand = new SqlCommand(levelsSql, connection))
        await using (var levelsReader = await levelsCommand.ExecuteReaderAsync(cancellationToken))
        {
            while (await levelsReader.ReadAsync(cancellationToken))
            {
                levels.Add(new LogLevelCount(
                    ReadRequiredString(levelsReader, 0, "Level"),
                    ReadInt32(levelsReader, 1)));
            }
        }

        return new DatasetSummaryResponse(
            resolvedDataset,
            totalCount,
            distinctCategoryCount,
            topCategory,
            sessionCount,
            impersonatedCount,
            earliestTime,
            latestTime,
            levels);
    }

    private static void AddSharedParameters(SqlCommand command, string? level, string? category, string? search)
    {
        command.Parameters.AddWithValue("@Level", (object?)level ?? DBNull.Value);
        command.Parameters.AddWithValue("@Category", (object?)category ?? DBNull.Value);
        command.Parameters.AddWithValue("@Search", (object?)search ?? DBNull.Value);
    }

    private static string? NormalizeFilter(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private string ResolveDataset(string? dataset)
    {
        var requestedDataset = string.IsNullOrWhiteSpace(dataset)
            ? _defaultDataset
            : dataset.Trim();

        if (_datasets.TryGetValue(requestedDataset, out var resolvedDataset))
        {
            return resolvedDataset;
        }

        throw new ArgumentException(
            $"Unsupported dataset '{requestedDataset}'. Allowed values: {string.Join(", ", GetConfiguredDatasets())}.");
    }

    private static async Task<bool> DatasetExistsAsync(
        SqlConnection connection,
        string dataset,
        CancellationToken cancellationToken)
    {
        var datasetSql = $"""
SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM [{dataset}].sys.tables t
    INNER JOIN [{dataset}].sys.schemas s ON s.schema_id = t.schema_id
    WHERE s.name = 'dbo' AND t.name = 'Log'
) THEN 1 ELSE 0 END;
""";

        await using var command = new SqlCommand(datasetSql, connection);
        var result = await command.ExecuteScalarAsync(cancellationToken);

        return Convert.ToInt32(result, CultureInfo.InvariantCulture) == 1;
    }

    private static async Task<IReadOnlyList<LogChangeDetail>> GetChangesAsync(
        SqlConnection connection,
        string dataset,
        int logId,
        CancellationToken cancellationToken)
    {
        var changesSql = $"""
SELECT
    lc.LogChangeId,
    lc.PropertyName,
    lc.PreviousValue,
    lc.NewValue,
    lc.Message
FROM [{dataset}].[dbo].[LogChange] lc
WHERE lc.LogId = @LogId
ORDER BY lc.LogChangeId;
""";

        await using var command = new SqlCommand(changesSql, connection);
        command.Parameters.AddWithValue("@LogId", logId);

        var changes = new List<LogChangeDetail>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            changes.Add(new LogChangeDetail(
                ReadNullableString(reader, 0),
                ReadNullableString(reader, 1),
                ReadNullableString(reader, 2),
                ReadNullableString(reader, 3),
                ReadNullableString(reader, 4)));
        }

        return changes;
    }

    private static async Task<IReadOnlyList<LogEntityDetail>> GetEntitiesAsync(
        SqlConnection connection,
        string dataset,
        int logId,
        CancellationToken cancellationToken)
    {
        var entitiesSql = $"""
SELECT
    le.LogEntityId,
    le.EntityType,
    le.EntityId
FROM [{dataset}].[dbo].[LogEntity] le
WHERE le.LogId = @LogId
ORDER BY le.LogEntityId;
""";

        await using var command = new SqlCommand(entitiesSql, connection);
        command.Parameters.AddWithValue("@LogId", logId);

        var entities = new List<LogEntityDetail>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            entities.Add(new LogEntityDetail(
                ReadNullableString(reader, 0),
                ReadNullableString(reader, 1),
                ReadNullableString(reader, 2)));
        }

        return entities;
    }

    private static string ReadRequiredString(SqlDataReader reader, int ordinal, string fieldName)
    {
        var value = ReadNullableString(reader, ordinal);
        return value ?? throw new InvalidOperationException($"{fieldName} cannot be null.");
    }

    private static string? ReadNullableString(SqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        return Convert.ToString(reader.GetValue(ordinal), CultureInfo.InvariantCulture);
    }

    private static int ReadInt32(SqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return 0;
        }

        return Convert.ToInt32(reader.GetValue(ordinal), CultureInfo.InvariantCulture);
    }

    private static DateTimeOffset ReadTimestamp(SqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            throw new InvalidOperationException("Timestamp cannot be null.");
        }

        var value = reader.GetValue(ordinal);
        return value switch
        {
            DateTimeOffset dateTimeOffset => dateTimeOffset,
            DateTime dateTime => dateTime.Kind == DateTimeKind.Unspecified
                ? new DateTimeOffset(DateTime.SpecifyKind(dateTime, DateTimeKind.Utc))
                : new DateTimeOffset(dateTime.ToUniversalTime()),
            _ => DateTimeOffset.Parse(
                Convert.ToString(value, CultureInfo.InvariantCulture)
                    ?? throw new InvalidOperationException("Invalid timestamp value."),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal)
        };
    }

    private static DateTimeOffset? ReadNullableTimestamp(SqlDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        return ReadTimestamp(reader, ordinal);
    }
}
