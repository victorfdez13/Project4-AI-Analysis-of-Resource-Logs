using System.Text.Json;

namespace Project4_AI_Analysis_of_Resource_Logs.Services;

public static class UserRoles
{
    public const string Admin = "admin";
    public const string SupportAgent = "support_agent";
    public const string Customer = "customer";

    public static readonly string[] All = { Admin, SupportAgent, Customer };

    public static bool IsValid(string role) =>
        All.Contains(role, StringComparer.OrdinalIgnoreCase);
}

public class UserRecord
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Role { get; set; } = UserRoles.Customer;
    public List<string> AllowedDatasets { get; set; } = new();
}

/// <summary>
/// In-memory user store with simple JSON persistence.
///
/// On startup it loads from <c>users.json</c> if present, otherwise it seeds
/// from the <c>Users</c> section in appsettings and writes the file.
///
/// Mutations are persisted immediately. Plenty good enough for an internal
/// support-team tool that does not need a relational user database.
/// </summary>
public sealed class UserStore
{
    private readonly string _persistencePath;
    private readonly object _gate = new();
    private List<UserRecord> _users;

    public UserStore(IConfiguration configuration, IWebHostEnvironment env)
    {
        _persistencePath = Path.Combine(env.ContentRootPath, "users.json");
        _users = LoadOrSeed(configuration);
    }

    public IReadOnlyList<UserRecord> All()
    {
        lock (_gate)
        {
            return _users.Select(Clone).ToList();
        }
    }

    public UserRecord? FindByApiKey(string apiKey)
    {
        lock (_gate)
        {
            var match = _users.FirstOrDefault(u =>
                string.Equals(u.ApiKey, apiKey, StringComparison.Ordinal));
            return match is null ? null : Clone(match);
        }
    }

    public UserRecord? FindByUsername(string username)
    {
        lock (_gate)
        {
            var match = _users.FirstOrDefault(u =>
                string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
            return match is null ? null : Clone(match);
        }
    }

    public UserRecord? Authenticate(string username, string password)
    {
        lock (_gate)
        {
            var match = _users.FirstOrDefault(u =>
                string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(u.Password, password, StringComparison.Ordinal));
            return match is null ? null : Clone(match);
        }
    }

    public (UserRecord? user, string? error) Create(UserRecord input)
    {
        var validationError = Validate(input);
        if (validationError is not null)
            return (null, validationError);

        lock (_gate)
        {
            if (_users.Any(u => string.Equals(u.Username, input.Username, StringComparison.OrdinalIgnoreCase)))
                return (null, $"User '{input.Username}' already exists.");

            var record = Clone(input);
            if (string.IsNullOrWhiteSpace(record.ApiKey))
                record.ApiKey = Guid.NewGuid().ToString();

            _users.Add(record);
            Save();
            return (Clone(record), null);
        }
    }

    public (UserRecord? user, string? error) Update(string username, UserRecord input)
    {
        lock (_gate)
        {
            var existing = _users.FirstOrDefault(u =>
                string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
            if (existing is null)
                return (null, $"User '{username}' not found.");

            if (!string.IsNullOrWhiteSpace(input.Role) && !UserRoles.IsValid(input.Role))
                return (null, $"Unknown role '{input.Role}'.");

            if (!string.IsNullOrWhiteSpace(input.Role))
                existing.Role = input.Role.ToLowerInvariant();

            if (input.AllowedDatasets is not null)
                existing.AllowedDatasets = input.AllowedDatasets.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            if (!string.IsNullOrWhiteSpace(input.Password))
                existing.Password = input.Password;

            // Customer scope rule: exactly one dataset.
            if (string.Equals(existing.Role, UserRoles.Customer, StringComparison.OrdinalIgnoreCase) &&
                existing.AllowedDatasets.Count != 1)
            {
                return (null, "A customer must have exactly one assigned dataset.");
            }

            Save();
            return (Clone(existing), null);
        }
    }

    public bool Delete(string username)
    {
        lock (_gate)
        {
            var removed = _users.RemoveAll(u =>
                string.Equals(u.Username, username, StringComparison.OrdinalIgnoreCase));
            if (removed == 0) return false;
            Save();
            return true;
        }
    }

    private static string? Validate(UserRecord input)
    {
        if (string.IsNullOrWhiteSpace(input.Username)) return "Username is required.";
        if (string.IsNullOrWhiteSpace(input.Password)) return "Password is required.";
        if (!UserRoles.IsValid(input.Role)) return $"Unknown role '{input.Role}'.";
        if (input.AllowedDatasets is null || input.AllowedDatasets.Count == 0)
            return "At least one allowed dataset is required.";
        if (string.Equals(input.Role, UserRoles.Customer, StringComparison.OrdinalIgnoreCase) &&
            input.AllowedDatasets.Count != 1)
            return "A customer must have exactly one assigned dataset.";
        return null;
    }

    private List<UserRecord> LoadOrSeed(IConfiguration configuration)
    {
        if (File.Exists(_persistencePath))
        {
            try
            {
                var json = File.ReadAllText(_persistencePath);
                var loaded = JsonSerializer.Deserialize<List<UserRecord>>(json, JsonOptions);
                if (loaded is not null) return loaded;
            }
            catch
            {
                // Fall through to seed from configuration.
            }
        }

        var seeded = configuration
            .GetSection("Users")
            .Get<List<UserRecord>>() ?? new List<UserRecord>();

        foreach (var user in seeded)
        {
            if (string.IsNullOrWhiteSpace(user.Role) || !UserRoles.IsValid(user.Role))
                user.Role = UserRoles.Customer;
            if (string.IsNullOrWhiteSpace(user.ApiKey))
                user.ApiKey = Guid.NewGuid().ToString();
        }

        Persist(seeded);
        return seeded;
    }

    private void Save() => Persist(_users);

    private void Persist(List<UserRecord> users)
    {
        try
        {
            var json = JsonSerializer.Serialize(users, JsonOptions);
            File.WriteAllText(_persistencePath, json);
        }
        catch
        {
            // Persistence is best-effort; the in-memory copy stays authoritative.
        }
    }

    private static UserRecord Clone(UserRecord source) => new()
    {
        Username = source.Username,
        Password = source.Password,
        ApiKey = source.ApiKey,
        Role = source.Role,
        AllowedDatasets = new List<string>(source.AllowedDatasets ?? new()),
    };

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };
}
