using System.Text.Json;
using Project4_AI_Analysis_of_Resource_Logs.Options;
using Microsoft.Extensions.Options;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

/// <summary>
/// In-memory store of configured SQL Server dataset names.
///
/// Seeds from <c>SqlServerDatasets</c> in appsettings on first run, then
/// persists every change to <c>datasets.json</c> so admins can register
/// additional datasets at runtime without editing config or restarting.
///
/// The store only tracks the registration list. Creating the underlying
/// SQL Server database / schema is out of scope and must be done before
/// the dataset is registered here.
/// </summary>
public sealed class DatasetStore
{
    private readonly string _persistencePath;
    private readonly object _gate = new();
    private List<string> _datasets;

    public DatasetStore(IOptions<BackendOptions> options, IWebHostEnvironment env)
    {
        _persistencePath = Path.Combine(env.ContentRootPath, "datasets.json");
        _datasets = LoadOrSeed(options.Value.SqlServerDatasets);
    }

    public IReadOnlyList<string> All()
    {
        lock (_gate)
        {
            return _datasets
                .OrderBy(d => d, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
    }

    public bool Contains(string name)
    {
        lock (_gate)
        {
            return _datasets.Contains(name, StringComparer.OrdinalIgnoreCase);
        }
    }

    public string? ResolveCanonical(string name)
    {
        lock (_gate)
        {
            return _datasets.FirstOrDefault(d =>
                string.Equals(d, name, StringComparison.OrdinalIgnoreCase));
        }
    }

    /// <summary>Add a dataset registration. Returns null on success or a user-facing error.</summary>
    public string? Add(string name)
    {
        var error = Validate(name);
        if (error is not null) return error;

        var trimmed = name.Trim();

        lock (_gate)
        {
            if (_datasets.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
                return $"Dataset '{trimmed}' is already registered.";

            _datasets.Add(trimmed);
            Save();
        }

        return null;
    }

    private static string? Validate(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "Dataset name is required.";

        var trimmed = name.Trim();
        if (trimmed.Length > 64)
            return "Dataset name must be 64 characters or fewer.";

        // SQL Server identifier-friendly: letters, digits, underscore.
        foreach (var ch in trimmed)
        {
            if (!char.IsLetterOrDigit(ch) && ch != '_')
                return "Dataset name may only contain letters, digits and underscores.";
        }

        return null;
    }

    private List<string> LoadOrSeed(IEnumerable<string> seedDatasets)
    {
        if (File.Exists(_persistencePath))
        {
            try
            {
                var json = File.ReadAllText(_persistencePath);
                var loaded = JsonSerializer.Deserialize<List<string>>(json, JsonOptions);
                if (loaded is not null) return loaded.Where(d => !string.IsNullOrWhiteSpace(d)).ToList();
            }
            catch
            {
                // Fall through to seed
            }
        }

        var seeded = seedDatasets
            .Where(d => !string.IsNullOrWhiteSpace(d))
            .Select(d => d.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        Persist(seeded);
        return seeded;
    }

    private void Save() => Persist(_datasets);

    private void Persist(List<string> datasets)
    {
        try
        {
            var json = JsonSerializer.Serialize(datasets, JsonOptions);
            File.WriteAllText(_persistencePath, json);
        }
        catch
        {
            // Best-effort persistence.
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
    };
}
