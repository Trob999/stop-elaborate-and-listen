# Load .env variables manually if needed
$envVars = Get-Content ../.env | ForEach-Object {
    $parts = $_ -split '=', 2
    if ($parts.Length -eq 2) {
        [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1])
    }
}

# Run the backend
go run ../cmd/server/main.go
